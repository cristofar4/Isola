"use client";

import { Zip, ZipPassThrough } from "fflate";
import { create } from "zustand";
import { uploadLimits } from "@/lib/config";
import { downloadBlob } from "@/lib/editor/export";
import { drawWatermark } from "@/lib/editor/watermark";
import { canvasToBlob, createCanvas, get2d, makeThumbnail } from "@/lib/image/decode";
import { validateImageFile } from "@/lib/image/validate";
import { applyPolicySize, exportPolicy } from "@/lib/plan-policy";
import { getEngine } from "@/lib/processing/registry";
import type { JobPhase } from "@/lib/processing/types";
import { useProject } from "@/lib/project/store";
import { sessionAccess } from "@/lib/session-gate";
import { DUPLICATE_DISTANCE, differenceHash, hashDistance, palette, smartTags, transparency, type Swatch } from "./asset-analysis";
import { recordExport } from "./export-history";
import * as store from "./library-db";
import type { Project } from "./project-model";

/**
 * The studio's asset library: originals, cutouts, backgrounds and logos kept
 * in this browser (IndexedDB), with tags (yours and ones worked out from the
 * pixels), collections, stars and a trash that empties itself after 30 days.
 */

export type AssetKind = "original" | "cutout" | "background" | "logo";

export const KIND_LABEL: Record<AssetKind, string> = { original: "Original", cutout: "Cutout", background: "Background", logo: "Logo" };

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  hasAlpha: boolean;
  /** Tags you added. */
  tags: string[];
  /** Tags worked out from the pixels (orientation, colours, resolution). */
  autoTags: string[];
  swatches: Swatch[];
  /** Perceptual fingerprint, for finding duplicates. */
  hash: string;
  collectionIds: string[];
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
  /** "isola": made here (a cutout); its downloads follow the plan's export rules. */
  origin: "upload" | "isola";
  /** The original a cutout was made from. */
  sourceId: string | null;
}

export interface Collection {
  id: string;
  name: string;
  createdAt: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

interface LibraryState {
  status: "idle" | "loading" | "ready" | "unavailable";
  assets: Asset[];
  collections: Collection[];
  folders: Folder[];
  projects: Project[];
}

export const useLibrary = create<LibraryState>(() => ({ status: "idle", assets: [], collections: [], folders: [], projects: [] }));

export const TRASH_DAYS = 30;
const uid = () => crypto.randomUUID();
export const assetKey = (id: string) => `asset:${id}`;
export const thumbKey = (id: string) => `thumb:${id}`;

let loading: Promise<void> | null = null;

/** Read the library once per page load, and empty trash older than 30 days. */
export function loadLibrary(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    useLibrary.setState({ status: "loading" });
    if (!(await store.openLibrary())) {
      useLibrary.setState({ status: "unavailable" });
      return;
    }
    const [assets, collections, folders, projects] = await Promise.all([
      store.getAll<Asset>("assets"),
      store.getAll<Collection>("collections"),
      store.getAll<Folder>("folders"),
      store.getAll<Project>("projects"),
    ]);
    useLibrary.setState({ status: "ready", assets, collections, folders, projects });
    const cutoff = Date.now() - TRASH_DAYS * 86_400_000;
    const oldAssets = assets.filter((a) => a.trashedAt && a.trashedAt < cutoff).map((a) => a.id);
    const oldProjects = projects.filter((p) => p.trashedAt && p.trashedAt < cutoff).map((p) => p.id);
    // Emptying old trash is housekeeping: if it fails, the library is still loaded and it's tried next time.
    try {
      if (oldProjects.length) await (await import("./projects")).deleteProjectsForever(oldProjects);
      if (oldAssets.length) await deleteAssetsForever(oldAssets);
    } catch {
      /* try again on the next load */
    }
  })().catch((error) => {
    loading = null;
    useLibrary.setState({ status: "unavailable" });
    throw error;
  });
  return loading;
}

export function getAsset(id: string) {
  return useLibrary.getState().assets.find((a) => a.id === id) ?? null;
}

function setAssets(fn: (assets: Asset[]) => Asset[]) {
  useLibrary.setState((s) => ({ assets: fn(s.assets) }));
}

/* ----------------------------------------------------------- decoding --- */

const isSvg = (file: Blob & { name?: string }) => file.type === "image/svg+xml" || /\.svg$/i.test(file.name ?? "");

/** Any supported image (raster or SVG) drawn onto a canvas, at most `maxSide` across (null = full size). */
export async function decodeToCanvas(blob: Blob, maxSide: number | null = null) {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release = () => {};
  if (isSvg(blob)) {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      throw new Error("This SVG couldn't be read.");
    }
    width = img.naturalWidth || 1200;
    height = img.naturalHeight || 1200;
    source = img;
    release = () => URL.revokeObjectURL(url);
  } else {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
    release = () => bitmap.close();
  }
  try {
    const scale = maxSide ? Math.min(1, maxSide / Math.max(width, height)) : 1;
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = createCanvas(w, h);
    const ctx = get2d(canvas, { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, w, h);
    return { canvas, ctx, width, height, w, h };
  } finally {
    release();
  }
}

async function analyse(file: File) {
  const { canvas, ctx, width, height, w, h } = await decodeToCanvas(file, 256);
  const { data } = ctx.getImageData(0, 0, w, h);
  const hasAlpha = file.type !== "image/jpeg" && transparency(data) > 0.003;
  const swatches = palette(data, w, h);
  const thumbSource = (await decodeToCanvas(file, 480)).canvas;
  const thumb = await makeThumbnail(thumbSource as HTMLCanvasElement, 480, hasAlpha ? "image/png" : "image/jpeg");
  void canvas;
  return { width, height, hasAlpha, swatches, hash: differenceHash(data, w, h), autoTags: smartTags({ width, height, hasAlpha, swatches }), thumb };
}

/* ------------------------------------------------------------- adding --- */

export interface AddResult {
  added: Asset[];
  duplicates: Array<{ asset: Asset; of: Asset }>;
  rejected: Array<{ name: string; reason: string }>;
}

/**
 * Add files to the library. The kind is worked out from the file (SVG → logo,
 * transparency → cutout, otherwise original) unless one is given. Likely
 * duplicates are still added, and reported so they can be removed in one go.
 */
export async function addAssets(files: File[], options: { kind?: AssetKind; collectionId?: string } = {}): Promise<AddResult> {
  await loadLibrary();
  const result: AddResult = { added: [], duplicates: [], rejected: [] };
  for (const file of files) {
    if (isSvg(file)) {
      if (file.size > 5 * 1024 * 1024) {
        result.rejected.push({ name: file.name, reason: "SVG files can be up to 5 MB." });
        continue;
      }
    } else {
      const check = await validateImageFile(file, uploadLimits);
      if (!check.ok) {
        result.rejected.push({ name: file.name, reason: check.error.message });
        continue;
      }
    }
    let info: Awaited<ReturnType<typeof analyse>>;
    try {
      info = await analyse(file);
    } catch {
      result.rejected.push({ name: file.name, reason: "The browser couldn't read this image." });
      continue;
    }
    const now = Date.now();
    const asset: Asset = {
      id: uid(),
      name: file.name,
      kind: options.kind ?? (isSvg(file) ? "logo" : info.hasAlpha ? "cutout" : "original"),
      mime: isSvg(file) ? "image/svg+xml" : file.type || "image/png",
      width: info.width,
      height: info.height,
      bytes: file.size,
      hasAlpha: info.hasAlpha || isSvg(file),
      tags: [],
      autoTags: info.autoTags,
      swatches: info.swatches,
      hash: info.hash,
      collectionIds: options.collectionId ? [options.collectionId] : [],
      starred: false,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
      origin: "upload",
      sourceId: null,
    };
    await store.write({
      put: [["assets", asset]],
      blobs: [
        [assetKey(asset.id), file],
        [thumbKey(asset.id), info.thumb],
      ],
    });
    const same = useLibrary
      .getState()
      .assets.find((a) => !a.trashedAt && hashDistance(a.hash, asset.hash) <= DUPLICATE_DISTANCE && Math.abs(a.width / a.height - asset.width / asset.height) < 0.03);
    if (same) result.duplicates.push({ asset, of: same });
    setAssets((list) => [asset, ...list]);
    result.added.push(asset);
  }
  return result;
}

/* ------------------------------------------------------------ editing --- */

export async function updateAssets(ids: string[], fn: (a: Asset) => Partial<Asset>) {
  const wanted = new Set(ids);
  const changed: Asset[] = [];
  const next = useLibrary.getState().assets.map((a) => {
    if (!wanted.has(a.id)) return a;
    const updated = { ...a, ...fn(a), updatedAt: Date.now() };
    changed.push(updated);
    return updated;
  });
  await store.write({ put: changed.map((a) => ["assets", a] as ["assets", Asset]) });
  useLibrary.setState({ assets: next });
}

export const cleanTag = (tag: string) => tag.replace(/\s+/g, " ").trim().slice(0, 32);

export function addTag(ids: string[], tag: string) {
  const t = cleanTag(tag);
  if (!t) return Promise.resolve();
  return updateAssets(ids, (a) => ({ tags: a.tags.some((x) => x.toLowerCase() === t.toLowerCase()) ? a.tags : [...a.tags, t] }));
}

export function removeTag(id: string, tag: string) {
  return updateAssets([id], (a) => ({ tags: a.tags.filter((t) => t !== tag) }));
}

export function trashAssets(ids: string[]) {
  return updateAssets(ids, () => ({ trashedAt: Date.now() }));
}

export function restoreAssets(ids: string[]) {
  return updateAssets(ids, () => ({ trashedAt: null }));
}

/** Projects (including trashed ones) that use an asset as their source. */
export function projectsUsing(assetId: string) {
  return useLibrary.getState().projects.filter((p) => p.sourceAssetId === assetId);
}

/** Delete for good. Assets a project still uses are kept and returned, so the project doesn't break. */
export async function deleteAssetsForever(ids: string[]): Promise<{ kept: Asset[] }> {
  const kept: Asset[] = [];
  const gone: string[] = [];
  for (const id of ids) {
    const asset = getAsset(id);
    if (!asset) continue;
    if (projectsUsing(id).length) kept.push(asset);
    else gone.push(id);
  }
  await store.write({ remove: gone.flatMap((id) => [["assets", id], ["blobs", assetKey(id)], ["blobs", thumbKey(id)]] as Array<[store.StoreName, string]>) });
  const set = new Set(gone);
  setAssets((list) => list.filter((a) => !set.has(a.id)));
  for (const id of gone) {
    const url = thumbUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    thumbUrls.delete(id);
  }
  return { kept };
}

/* -------------------------------------------------------- collections --- */

export async function createCollection(name: string): Promise<Collection> {
  const c: Collection = { id: uid(), name: name.trim().slice(0, 60) || "New collection", createdAt: Date.now() };
  await store.write({ put: [["collections", c]] });
  useLibrary.setState((s) => ({ collections: [...s.collections, c] }));
  return c;
}

export async function renameCollection(id: string, name: string) {
  const c = useLibrary.getState().collections.find((x) => x.id === id);
  if (!c) return;
  const next = { ...c, name: name.trim().slice(0, 60) || c.name };
  await store.write({ put: [["collections", next]] });
  useLibrary.setState((s) => ({ collections: s.collections.map((x) => (x.id === id ? next : x)) }));
}

/** Delete a collection; its assets stay in the library. */
export async function deleteCollection(id: string) {
  await updateAssets(
    useLibrary
      .getState()
      .assets.filter((a) => a.collectionIds.includes(id))
      .map((a) => a.id),
    (a) => ({ collectionIds: a.collectionIds.filter((c) => c !== id) }),
  );
  await store.write({ remove: [["collections", id]] });
  useLibrary.setState((s) => ({ collections: s.collections.filter((c) => c.id !== id) }));
}

export function addToCollection(ids: string[], collectionId: string) {
  return updateAssets(ids, (a) => ({ collectionIds: a.collectionIds.includes(collectionId) ? a.collectionIds : [...a.collectionIds, collectionId] }));
}

export function removeFromCollection(ids: string[], collectionId: string) {
  return updateAssets(ids, (a) => ({ collectionIds: a.collectionIds.filter((c) => c !== collectionId) }));
}

/* ------------------------------------------------------------ folders --- */

export async function createFolder(name: string): Promise<Folder> {
  const f: Folder = { id: uid(), name: name.trim().slice(0, 60) || "New folder", createdAt: Date.now() };
  await store.write({ put: [["folders", f]] });
  useLibrary.setState((s) => ({ folders: [...s.folders, f] }));
  return f;
}

export async function renameFolder(id: string, name: string) {
  const f = useLibrary.getState().folders.find((x) => x.id === id);
  if (!f) return;
  const next = { ...f, name: name.trim().slice(0, 60) || f.name };
  await store.write({ put: [["folders", next]] });
  useLibrary.setState((s) => ({ folders: s.folders.map((x) => (x.id === id ? next : x)) }));
}

/* -------------------------------------------------------- thumbnails --- */

const thumbUrls = new Map<string, string>();
const thumbLoads = new Map<string, Promise<string | null>>();

/** An object URL for an asset's thumbnail (cached for the page's lifetime). */
export function thumbUrl(id: string): Promise<string | null> {
  const hit = thumbUrls.get(id);
  if (hit) return Promise.resolve(hit);
  if (!thumbLoads.has(id)) {
    thumbLoads.set(
      id,
      store.getBlob(thumbKey(id)).then((b) => {
        thumbLoads.delete(id);
        if (!b) return null;
        const url = URL.createObjectURL(b);
        thumbUrls.set(id, url);
        return url;
      }),
    );
  }
  return thumbLoads.get(id)!;
}

export async function assetFile(id: string): Promise<File | null> {
  const asset = getAsset(id);
  const blob = await store.getBlob(assetKey(id));
  if (!asset || !blob) return null;
  return blob instanceof File ? blob : new File([blob], asset.name, { type: asset.mime });
}

/* ------------------------------------------------------------ cutouts --- */

const stem = (name: string) => name.replace(/\.[^./\\]+$/, "");

/**
 * Make a cutout of an original on this device and add it to the library,
 * linked to its source.
 */
export async function makeCutout(id: string, onPhase?: (phase: JobPhase) => void, signal?: AbortSignal): Promise<Asset> {
  const asset = getAsset(id);
  const file = await assetFile(id);
  if (!asset || !file) throw new Error("This asset is no longer in the library.");
  const { canvas, ctx, width, height } = await decodeToCanvas(file);
  const bitmap = await createImageBitmap(canvas as HTMLCanvasElement);
  let result;
  try {
    result = await getEngine(useProject.getState().engineId).removeBackground(bitmap, { signal, onPhase });
  } finally {
    bitmap.close();
  }
  if (result.width !== width || result.height !== height) throw new Error("The engine returned a mask that doesn't match the image.");
  const pixels = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < result.mask.length; i++) pixels.data[i * 4 + 3] = Math.min(pixels.data[i * 4 + 3], result.mask[i]);
  ctx.putImageData(pixels, 0, 0);
  const png = await canvasToBlob(canvas, "image/png");
  const made = await addAssets([new File([png], `${stem(asset.name)}-cutout.png`, { type: "image/png" })], { kind: "cutout" });
  const cutout = made.added[0];
  if (!cutout) throw new Error(made.rejected[0]?.reason ?? "The cutout couldn't be saved.");
  await updateAssets([cutout.id], () => ({ origin: "isola", sourceId: asset.id, tags: [...asset.tags], collectionIds: [...asset.collectionIds] }));
  return getAsset(cutout.id)!;
}

/* ---------------------------------------------------------- downloads --- */

/** The file to download for an asset: your uploads as they are; cutouts made here follow your plan's export rules. */
async function downloadableBlob(asset: Asset, pro: boolean): Promise<{ blob: Blob; name: string }> {
  const file = await assetFile(asset.id);
  if (!file) throw new Error(`${asset.name} is no longer stored in this browser.`);
  if (asset.origin !== "isola" || pro) return { blob: file, name: asset.name };
  const policy = exportPolicy(false);
  const size = applyPolicySize(asset.width, asset.height, policy);
  const { canvas: full } = await decodeToCanvas(file);
  const out = createCanvas(size.width, size.height);
  const ctx = get2d(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full as HTMLCanvasElement, 0, 0, size.width, size.height);
  drawWatermark(ctx, size.width, size.height);
  return { blob: await canvasToBlob(out, "image/png"), name: `${stem(asset.name)}.png` };
}

/** One file, or a ZIP for several. Returns the downloaded file name. */
export async function downloadAssets(ids: string[]): Promise<string> {
  const assets = ids.map(getAsset).filter((a): a is Asset => a !== null);
  if (!assets.length) throw new Error("Nothing to download.");
  const { pro } = await sessionAccess();
  if (assets.length === 1) {
    const { blob, name } = await downloadableBlob(assets[0], pro);
    downloadBlob(blob, name);
    void recordExport({ title: assets[0].name, fileName: name, source: "library", files: 1, format: blob.type === "image/jpeg" ? "JPEG" : blob.type === "image/svg+xml" ? "SVG" : "PNG", blob });
    return name;
  }
  const chunks: Uint8Array[] = [];
  const zip = new Zip((err, chunk) => {
    if (!err) chunks.push(chunk);
  });
  const used = new Set<string>();
  let preview: Blob | null = null;
  for (const a of assets) {
    const { blob, name } = await downloadableBlob(a, pro);
    preview ??= blob;
    let n = name;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = name.replace(/(\.[^.]+)?$/, `-${i}$1`);
    used.add(n.toLowerCase());
    const entry = new ZipPassThrough(n);
    zip.add(entry);
    entry.push(new Uint8Array(await blob.arrayBuffer()), true);
  }
  zip.end();
  const fileName = `isola-assets-${assets.length}.zip`;
  const zipBlob = new Blob(chunks as BlobPart[], { type: "application/zip" });
  downloadBlob(zipBlob, fileName);
  void recordExport({ title: `${assets.length} assets`, fileName, source: "library", files: assets.length, format: "ZIP", blob: zipBlob, preview });
  return fileName;
}

/* ------------------------------------------------------------- search --- */

/** Every tag in use (yours first), for filters and suggestions. */
export function allTags(assets: Asset[]) {
  const mine = new Set<string>();
  const auto = new Set<string>();
  for (const a of assets) {
    a.tags.forEach((t) => mine.add(t));
    a.autoTags.forEach((t) => auto.add(t));
  }
  return [...[...mine].sort(), ...[...auto].filter((t) => !mine.has(t)).sort()];
}

export function matchesQuery(asset: Asset, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${asset.name} ${asset.tags.join(" ")} ${asset.autoTags.join(" ")} ${KIND_LABEL[asset.kind]} ${asset.swatches.map((s) => s.name).join(" ")}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
