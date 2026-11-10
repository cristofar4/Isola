"use client";

import { Zip, ZipPassThrough } from "fflate";
import { create } from "zustand";
import { normaliseSettings, safeFileStem, exportExtension, type BatchSettings } from "@/lib/batch/settings";
import { renderBatchBlob, renderBatchPreview, type BatchSources } from "@/lib/batch/render";
import { reviewMask } from "@/lib/batch/review";
import { downloadBlob } from "@/lib/editor/export";
import { maskBounds } from "@/lib/editor/mask-ops";
import { destinationById, folderFor, type DestinationId } from "@/lib/export-sets";
import { createCanvas, get2d } from "@/lib/image/decode";
import { decodeMask, encodeMask } from "@/lib/image/mask-codec";
import { exportPolicy, type ExportPolicy } from "@/lib/plan-policy";
import { getEngine } from "@/lib/processing/registry";
import { importWithMask } from "@/lib/project/actions";
import { imageAssets } from "@/lib/project/assets";
import { useProject } from "@/lib/project/store";
import { sessionAccess } from "@/lib/session-gate";
import { recordExport } from "./export-history";
import { assetFile, decodeToCanvas, getAsset, loadLibrary, useLibrary } from "./library";
import * as store from "./library-db";
import { DEFAULT_LOOK, DEFAULT_VERSIONS, describeChange, versionSettings, type Project, type ProjectState, type ProjectVersion, type Snapshot } from "./project-model";

/**
 * Projects in the studio: a master cutout and its linked versions, with
 * version history (every change is a snapshot you can restore), undo/redo,
 * rendering through the same renderer as every other download, and a link to
 * the editor so refined masks come back to the project.
 */

const uid = () => crypto.randomUUID();
const MAX_SNAPSHOTS = 40;
const maskBlobKey = () => `mask:${uid()}`;

/** Version history per project, loaded when a project is opened, plus where undo/redo stands. */
export const useHistory = create<{ snapshots: Record<string, Snapshot[]>; cursor: Record<string, string | null>; busy: Record<string, string | null> }>(() => ({
  snapshots: {},
  cursor: {},
  busy: {},
}));

export function getProject(id: string) {
  return useLibrary.getState().projects.find((p) => p.id === id) ?? null;
}

const stateOf = (p: ProjectState): ProjectState => ({ name: p.name, look: p.look, versions: p.versions, maskKey: p.maskKey, bounds: p.bounds, review: p.review });

async function saveProject(next: Project) {
  await store.write({ put: [["projects", next]] });
  useLibrary.setState((s) => ({ projects: s.projects.some((p) => p.id === next.id) ? s.projects.map((p) => (p.id === next.id ? next : p)) : [next, ...s.projects] }));
}

function setBusy(id: string, label: string | null) {
  useHistory.setState((h) => ({ busy: { ...h.busy, [id]: label } }));
}

export async function loadHistory(projectId: string): Promise<Snapshot[]> {
  const list = (await store.getByProject<Snapshot>(projectId)).sort((a, b) => a.createdAt - b.createdAt);
  useHistory.setState((h) => ({ snapshots: { ...h.snapshots, [projectId]: list } }));
  return list;
}

/** Delete mask files that no project or snapshot refers to any more. */
async function collectMasks() {
  const [projects, snapshots, keys] = await Promise.all([store.getAll<Project>("projects"), store.getAll<Snapshot>("snapshots"), store.blobKeys()]);
  const used = new Set<string>();
  projects.forEach((p) => p.maskKey && used.add(p.maskKey));
  snapshots.forEach((s) => s.state.maskKey && used.add(s.state.maskKey));
  const stale = keys.filter((k) => k.startsWith("mask:") && !used.has(k));
  if (stale.length) await store.write({ remove: stale.map((k) => ["blobs", k] as ["blobs", string]) });
}

async function pushSnapshot(projectId: string, label: string, state: ProjectState) {
  const history = useHistory.getState();
  let list = history.snapshots[projectId] ?? (await loadHistory(projectId));
  const remove: Array<[store.StoreName, string]> = [];
  // A change after undo discards the snapshots that were undone.
  const cursor = history.cursor[projectId];
  if (cursor) {
    const at = list.findIndex((s) => s.id === cursor);
    if (at >= 0) {
      list.slice(at + 1).forEach((s) => remove.push(["snapshots", s.id]));
      list = list.slice(0, at + 1);
    }
  }
  const snap: Snapshot = { id: uid(), projectId, label, createdAt: Date.now(), state };
  list = [...list, snap];
  while (list.length > MAX_SNAPSHOTS) remove.push(["snapshots", list.shift()!.id]);
  await store.write({ put: [["snapshots", snap]], remove });
  useHistory.setState((h) => ({ snapshots: { ...h.snapshots, [projectId]: list }, cursor: { ...h.cursor, [projectId]: null } }));
  if (remove.length) void collectMasks();
}

/**
 * Changes to projects run one after another, so quick clicks can't read the
 * same "before" or drop each other's history steps.
 */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Change a project and record it in version history. `label` defaults to a
 * description of what changed. Returns false if nothing changed.
 */
export function updateProject(id: string, recipe: (s: ProjectState) => ProjectState, label?: string, extraBlobs: Array<[string, Blob]> = []): Promise<boolean> {
  return serial(() => applyUpdate(id, recipe, label, extraBlobs));
}

async function applyUpdate(id: string, recipe: (s: ProjectState) => ProjectState, label: string | undefined, extraBlobs: Array<[string, Blob]>): Promise<boolean> {
  const p = getProject(id);
  if (!p) return false;
  const before = stateOf(p);
  const after = stateOf(recipe(before));
  if (JSON.stringify(before) === JSON.stringify(after) && !extraBlobs.length) return false;
  if (extraBlobs.length) await store.write({ blobs: extraBlobs });
  await saveProject({ ...p, ...after, updatedAt: Date.now() });
  await pushSnapshot(id, label ?? describeChange(before, after), after);
  return true;
}

/* ------------------------------------------------------------ creating --- */

const stem = (name: string) => name.replace(/\.[^./\\]+$/, "");

/** Start a project from a library asset. The master is prepared in the background. */
export async function createProject(assetId: string, options: { name?: string; look?: BatchSettings; versions?: DestinationId[]; folderId?: string | null } = {}): Promise<string> {
  await loadLibrary();
  const asset = getAsset(assetId);
  if (!asset) throw new Error("That asset is no longer in the library.");
  const now = Date.now();
  const project: Project = {
    id: uid(),
    name: (options.name ?? stem(asset.name)).slice(0, 80),
    folderId: options.folderId ?? null,
    starred: false,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
    sourceAssetId: asset.id,
    width: asset.width,
    height: asset.height,
    status: "processing",
    error: null,
    look: normaliseSettings(options.look ?? DEFAULT_LOOK),
    versions: (options.versions ?? DEFAULT_VERSIONS).map((d) => ({ id: uid(), destination: d, overrides: {} })),
    maskKey: null,
    bounds: null,
    review: null,
  };
  await saveProject(project);
  void prepareMaster(project.id);
  return project.id;
}

/**
 * Make the master: a transparent source (a cutout or logo) is used as it is;
 * a photo has its background removed on this device.
 */
export async function prepareMaster(id: string): Promise<void> {
  const p = getProject(id);
  if (!p) return;
  const asset = getAsset(p.sourceAssetId);
  await saveProject({ ...p, status: "processing", error: null });
  setBusy(id, "Preparing the master");
  try {
    const file = await assetFile(p.sourceAssetId);
    if (!asset || !file) throw new Error("The source image is no longer in the library.");
    const { canvas, ctx, width, height } = await decodeToCanvas(file);
    let mask: Uint8Array;
    let review: string | null = null;
    if (asset.hasAlpha) {
      const { data } = ctx.getImageData(0, 0, width, height);
      mask = new Uint8Array(width * height);
      for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3];
    } else {
      const bitmap = await createImageBitmap(canvas as HTMLCanvasElement);
      try {
        const result = await getEngine(useProject.getState().engineId).removeBackground(bitmap, {
          onPhase: (phase) => setBusy(id, phase.kind === "loading-engine" ? "Loading the model" : phase.kind === "inferring" ? "Removing the background" : "Preparing the master"),
        });
        if (result.width !== width || result.height !== height) throw new Error("The engine returned a mask that doesn't match the image.");
        mask = result.mask;
      } finally {
        bitmap.close();
      }
      review = reviewMask(mask).reason;
    }
    const key = maskBlobKey();
    const maskBlob = await encodeMask(mask, width, height);
    const current = getProject(id);
    if (!current) return;
    await store.write({ blobs: [[key, maskBlob]] });
    const next: Project = { ...current, status: "ready", width, height, maskKey: key, bounds: maskBounds(mask, width, height, 12), review, updatedAt: Date.now() };
    await saveProject(next);
    await pushSnapshot(id, "Original imported", stateOf(next));
  } catch (error) {
    const current = getProject(id);
    if (current) await saveProject({ ...current, status: "failed", error: error instanceof Error ? error.message : "The master couldn't be prepared." });
  } finally {
    setBusy(id, null);
  }
}

/* --------------------------------------------------------------- edits --- */

export function setLook(id: string, patch: Partial<BatchSettings>, label?: string) {
  return updateProject(id, (s) => ({ ...s, look: normaliseSettings({ ...s.look, ...patch }) }), label);
}

export function addVersion(id: string, destination: DestinationId) {
  return updateProject(id, (s) => ({ ...s, versions: [...s.versions, { id: uid(), destination, overrides: {} }] }), `${destinationById(destination)?.label ?? "Version"} added`);
}

export function removeVersion(id: string, versionId: string) {
  const v = getProject(id)?.versions.find((x) => x.id === versionId);
  return updateProject(id, (s) => ({ ...s, versions: s.versions.filter((x) => x.id !== versionId) }), `${v ? destinationById(v.destination)?.label : "Version"} removed`);
}

export function setOverrides(id: string, versionId: string, overrides: ProjectVersion["overrides"], label?: string) {
  return updateProject(id, (s) => ({ ...s, versions: s.versions.map((v) => (v.id === versionId ? { ...v, overrides } : v)) }), label);
}

export function matchToMaster(id: string, versionId: string) {
  const v = getProject(id)?.versions.find((x) => x.id === versionId);
  return setOverrides(id, versionId, {}, `${v ? destinationById(v.destination)?.label : "Version"} matched to master`);
}

export function renameProject(id: string, name: string) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return Promise.resolve(false);
  return updateProject(id, (s) => ({ ...s, name: clean }), "Renamed");
}

/** Undo or redo along version history. */
export function stepHistory(id: string, direction: -1 | 1): Promise<boolean> {
  return serial(() => applyStep(id, direction));
}

async function applyStep(id: string, direction: -1 | 1): Promise<boolean> {
  const list = useHistory.getState().snapshots[id] ?? (await loadHistory(id));
  const cursor = useHistory.getState().cursor[id];
  const at = cursor ? list.findIndex((s) => s.id === cursor) : list.length - 1;
  const target = list[at + direction];
  if (!target || at < 0) return false;
  const p = getProject(id);
  if (!p) return false;
  await saveProject({ ...p, ...target.state, updatedAt: Date.now() });
  useHistory.setState((h) => ({ cursor: { ...h.cursor, [id]: target.id === list[list.length - 1].id ? null : target.id } }));
  return true;
}

export function canStep(id: string, direction: -1 | 1, h = useHistory.getState()) {
  const list = h.snapshots[id] ?? [];
  const cursor = h.cursor[id];
  const at = cursor ? list.findIndex((s) => s.id === cursor) : list.length - 1;
  return at >= 0 && at + direction >= 0 && at + direction < list.length;
}

/** Bring back an earlier state. It's recorded as a new change, so it can be undone too. */
export async function restoreSnapshot(id: string, snapshotId: string) {
  const snap = (useHistory.getState().snapshots[id] ?? []).find((s) => s.id === snapshotId);
  if (!snap) return false;
  useHistory.setState((h) => ({ cursor: { ...h.cursor, [id]: null } }));
  return updateProject(id, () => snap.state, `Restored “${snap.label}”`);
}

/* ------------------------------------------------------------- managing --- */

async function patchProjects(ids: string[], patch: (p: Project) => Partial<Project>) {
  for (const id of ids) {
    const p = getProject(id);
    if (p) await saveProject({ ...p, ...patch(p) });
  }
}

export const starProjects = (ids: string[], starred: boolean) => patchProjects(ids, () => ({ starred }));
export const moveProjects = (ids: string[], folderId: string | null) => patchProjects(ids, () => ({ folderId, updatedAt: Date.now() }));
export const trashProjects = (ids: string[]) => patchProjects(ids, () => ({ trashedAt: Date.now() }));
export const restoreProjects = (ids: string[]) => patchProjects(ids, () => ({ trashedAt: null }));

export async function duplicateProject(id: string): Promise<string | null> {
  const p = getProject(id);
  if (!p) return null;
  const copy: Project = { ...p, id: uid(), name: `${p.name} copy`.slice(0, 80), createdAt: Date.now(), updatedAt: Date.now(), starred: false, trashedAt: null, versions: p.versions.map((v) => ({ ...v, id: uid() })) };
  await saveProject(copy);
  await pushSnapshot(copy.id, `Duplicated from “${p.name}”`, stateOf(copy));
  return copy.id;
}

export async function deleteProjectsForever(ids: string[]) {
  const remove: Array<[store.StoreName, string]> = [];
  for (const id of ids) {
    remove.push(["projects", id]);
    (await store.getByProject<Snapshot>(id)).forEach((s) => remove.push(["snapshots", s.id]));
  }
  await store.write({ remove });
  const set = new Set(ids);
  useLibrary.setState((s) => ({ projects: s.projects.filter((p) => !set.has(p.id)) }));
  await collectMasks();
}

/* ----------------------------------------------------------- rendering --- */

const smallCutouts = new Map<string, Promise<ImageBitmap | null>>();

/** The master at ≤640px (source colours, mask as alpha), for previews. Cached per mask. */
function previewCutout(p: Project): Promise<ImageBitmap | null> {
  if (!p.maskKey) return Promise.resolve(null);
  const key = `${p.sourceAssetId}:${p.maskKey}`;
  if (!smallCutouts.has(key)) {
    smallCutouts.set(
      key,
      (async () => {
        const [file, maskBlob] = await Promise.all([assetFile(p.sourceAssetId), store.getBlob(p.maskKey!)]);
        if (!file || !maskBlob) return null;
        const { canvas, ctx, w, h } = await decodeToCanvas(file, 640);
        const { mask, width, height } = await decodeMask(maskBlob);
        const maskCanvas = createCanvas(width, height);
        const mctx = get2d(maskCanvas);
        const data = mctx.createImageData(width, height);
        for (let i = 0; i < mask.length; i++) data.data[i * 4 + 3] = mask[i];
        mctx.putImageData(data, 0, 0);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(maskCanvas as HTMLCanvasElement, 0, 0, w, h);
        return createImageBitmap(canvas as HTMLCanvasElement);
      })().catch(() => null),
    );
  }
  return smallCutouts.get(key)!;
}

/** A preview drawn by the export renderer: a version, or the master cutout when `version` is null. */
export async function previewProject(p: Project, version: ProjectVersion | null, maxSide = 520, policy: ExportPolicy = exportPolicy(true)): Promise<Blob | null> {
  const cutout = await previewCutout(p);
  if (!cutout) return null;
  const settings = version ? versionSettings(p.look, version) : normaliseSettings({ ...p.look, canvas: "framing", background: { kind: "transparent" }, shadow: false, format: "png" });
  try {
    return await renderBatchPreview({ width: p.width, height: p.height, cutout, bounds: p.bounds, backgroundImage: null }, settings, policy, maxSide);
  } catch {
    return null;
  }
}

/** Decode the source and mask once at full size, to render several files. */
async function fullSources(p: Project) {
  if (!p.maskKey) throw new Error("The master isn't ready yet.");
  const [file, maskBlob] = await Promise.all([assetFile(p.sourceAssetId), store.getBlob(p.maskKey)]);
  if (!file || !maskBlob) throw new Error("The source image or its mask is no longer stored in this browser.");
  const { canvas, ctx, width, height } = await decodeToCanvas(file);
  const { mask, width: mw, height: mh } = await decodeMask(maskBlob);
  if (mw !== width || mh !== height) throw new Error("The saved mask doesn't match the source image. Prepare the master again.");
  const pixels = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < mask.length; i++) pixels.data[i * 4 + 3] = Math.min(pixels.data[i * 4 + 3], mask[i]);
  ctx.putImageData(pixels, 0, 0);
  // Projects use colour or transparent backgrounds, so there's never a background image to load.
  return (): BatchSources => ({ width, height, cutout: canvas, bounds: p.bounds, backgroundImage: null });
}

function fileName(p: Project, version: ProjectVersion | null, settings: BatchSettings) {
  const dest = version ? destinationById(version.destination) : null;
  return `${safeFileStem(p.name, "isola-project")}${dest ? `-${dest.id}-${dest.width}x${dest.height}` : "-cutout"}.${exportExtension(settings)}`;
}

/** Download one version (or the master cutout) in a chosen format, following the plan's export rules. */
export async function exportVersion(id: string, versionId: string | null, format: "png" | "jpeg" | null = null): Promise<string> {
  const p = getProject(id);
  if (!p) throw new Error("This project is no longer in the library.");
  const version = versionId ? (p.versions.find((v) => v.id === versionId) ?? null) : null;
  setBusy(id, "Rendering");
  try {
    const sources = await fullSources(p);
    let settings = version ? versionSettings(p.look, version) : normaliseSettings({ ...p.look, canvas: "framing", background: { kind: "transparent" }, shadow: false, format: "png" });
    if (format) settings = normaliseSettings({ ...settings, format });
    const { blob } = await renderBatchBlob(sources(), settings, exportPolicy((await sessionAccess()).pro));
    const name = fileName(p, version, settings);
    downloadBlob(blob, name);
    void recordExport({ title: p.name, fileName: name, source: "project", files: 1, format: settings.format === "jpeg" ? "JPEG" : "PNG", blob });
    return name;
  } finally {
    setBusy(id, null);
  }
}

/** Every linked version in one ZIP, a folder per destination. */
export async function exportLinkedSet(id: string, format: "png" | "jpeg" | null = null): Promise<string> {
  const p = getProject(id);
  if (!p) throw new Error("This project is no longer in the library.");
  if (!p.versions.length) throw new Error("Add a version first.");
  setBusy(id, "Building the linked set");
  try {
    const sources = await fullSources(p);
    const policy = exportPolicy((await sessionAccess()).pro);
    const chunks: Uint8Array[] = [];
    const zip = new Zip((err, chunk) => {
      if (!err) chunks.push(chunk);
    });
    let preview: Blob | null = null;
    const formats = new Set<string>();
    for (const v of p.versions) {
      const dest = destinationById(v.destination);
      let settings = versionSettings(p.look, v);
      if (format) settings = normaliseSettings({ ...settings, format });
      const { blob } = await renderBatchBlob(sources(), settings, policy);
      preview ??= blob;
      formats.add(settings.format === "jpeg" ? "JPEG" : "PNG");
      const entry = new ZipPassThrough(`${dest ? folderFor(dest) : "version"}/${fileName(p, v, settings)}`);
      zip.add(entry);
      entry.push(new Uint8Array(await blob.arrayBuffer()), true);
    }
    zip.end();
    const name = `${safeFileStem(p.name, "isola-project")}-linked-set.zip`;
    const zipBlob = new Blob(chunks as BlobPart[], { type: "application/zip" });
    downloadBlob(zipBlob, name);
    void recordExport({
      title: p.name,
      fileName: name,
      source: "project",
      files: p.versions.length,
      format: [...formats].join(" + "),
      blob: zipBlob,
      preview,
      destinations: p.versions.map((v) => destinationById(v.destination)?.label ?? v.destination),
    });
    return name;
  } finally {
    setBusy(id, null);
  }
}

/* -------------------------------------------------------------- editor --- */

const synced = new Map<string, number>();

/** Open the master in the editor. Refined masks come back to the project as a new history step. */
export async function openProjectInEditor(id: string): Promise<boolean> {
  const p = getProject(id);
  if (!p?.maskKey) return false;
  const editor = useProject.getState();
  const existing = editor.images.find((img) => img.libraryProjectId === id);
  if (existing) {
    editor.setActive(existing.id);
    return true;
  }
  const [file, maskBlob] = await Promise.all([assetFile(p.sourceAssetId), store.getBlob(p.maskKey)]);
  if (!file || !maskBlob) return false;
  const { mask } = await decodeMask(maskBlob);
  const editorId = await importWithMask(file, mask, { engineId: "project", backend: "", durationMs: 0 }, { libraryProjectId: id });
  const image = useProject.getState().images.find((i) => i.id === editorId);
  if (image) synced.set(editorId, image.revision);
  return true;
}

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncing = false;

async function syncFromEditor() {
  if (syncing) return;
  syncing = true;
  try {
    for (const image of useProject.getState().images) {
      const projectId = image.libraryProjectId;
      if (!projectId || image.status !== "ready") continue;
      const last = synced.get(image.id);
      if (last === undefined) {
        synced.set(image.id, image.revision);
        continue;
      }
      if (last === image.revision) continue;
      const assets = imageAssets.get(image.id);
      if (!assets?.layers || !assets.decoded || !getProject(projectId)) continue;
      synced.set(image.id, image.revision);
      const { width, height } = assets.decoded;
      const refined = assets.layers.refined.slice();
      const key = maskBlobKey();
      const blob = await encodeMask(refined, width, height);
      await updateProject(projectId, (s) => ({ ...s, maskKey: key, bounds: maskBounds(refined, width, height, 12), review: null }), "Mask refined", [[key, blob]]);
    }
  } finally {
    syncing = false;
  }
}

if (typeof window !== "undefined") {
  useProject.subscribe(() => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncFromEditor(), 500);
  });
}
