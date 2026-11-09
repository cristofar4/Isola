"use client";

import { Zip, ZipPassThrough } from "fflate";
import { create } from "zustand";
import { batchConfig, uploadLimits } from "@/lib/config";
import { createCanvas, decodeImage, get2d, makeThumbnail } from "@/lib/image/decode";
import { decodeMask, encodeMask } from "@/lib/image/mask-codec";
import { validateImageFile, type ValidationError } from "@/lib/image/validate";
import { downloadBlob } from "@/lib/editor/export";
import type { Rect } from "@/lib/editor/geometry";
import { ImageLayers } from "@/lib/editor/layers";
import { downsample, maskBounds } from "@/lib/editor/mask-ops";
import { exportPolicy, type ExportPolicy } from "@/lib/plan-policy";
import { getEngine } from "@/lib/processing/registry";
import { EngineError, isCancellation, type JobPhase } from "@/lib/processing/types";
import { addBackgroundImage, importWithMask } from "@/lib/project/actions";
import { backgroundAssets, imageAssets } from "@/lib/project/assets";
import { useProject } from "@/lib/project/store";
import { sessionAccess } from "@/lib/session-gate";
import * as storage from "./persist";
import { renderBatchBlob, renderBatchPreview, type BatchSources } from "./render";
import { reviewMask } from "./review";
import { DEFAULT_BATCH_SETTINGS, exportName, normaliseSettings, safeFileStem, sameSettings, type BatchSettings } from "./settings";

/**
 * Batch Studio state. Every image has its own id, original file, status,
 * mask and applied settings. Selection is separate from status. Counters in
 * the UI are derived from this state; nothing here is simulated.
 *
 *   queued → processing → ready
 *                       ↘ failed / cancelled (retry puts it back in the queue)
 *   needs-auth / needs-pro: waiting for sign-in or Pro before it can start
 */
export type BatchStatus = "queued" | "processing" | "ready" | "failed" | "cancelled" | "needs-auth" | "needs-pro";

export interface BatchError {
  message: string;
  detail?: string;
  code?: string;
}

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
  /** Decoded size of the original, in pixels. */
  width: number;
  height: number;
  status: BatchStatus;
  phase: JobPhase | null;
  error: BatchError | null;
  /** Why a finished result should be checked, or null when it looks fine. */
  review: string | null;
  /** Thumbnail of the original photo. */
  thumbUrl: string | null;
  /** Preview of the result with this item's applied settings. */
  previewUrl: string | null;
  /** Mask as a compressed greyscale PNG (kept apart from the original). */
  maskBlob: Blob | null;
  bounds: Rect | null;
  /** Settings this item exports with. The side panel edits a draft until applied. */
  settings: BatchSettings;
  result: { engineId: string; backend: string; durationMs: number } | null;
  /** The cutout was edited in the detailed editor. */
  refined: boolean;
}

export type BatchView = "compact" | "grid" | "list";

export type StorageState =
  | { state: "loading" }
  | { state: "ok" }
  | { state: "unavailable" }
  | { state: "full" }
  | { state: "error"; message: string };

export interface ExportJob {
  label: string;
  done: number;
  total: number;
}

export interface ExportReport {
  tone: "ok" | "warn" | "error";
  message: string;
  excluded: Array<{ name: string; reason: string }>;
}

interface BatchState {
  name: string;
  items: BatchItem[];
  selected: string[];
  view: BatchView;
  query: string;
  /** Settings being edited in the side panel. Not used for exports until applied. */
  draft: BatchSettings;
  /** The draft was changed in the panel since it was last applied or loaded. */
  draftEdited: boolean;
  exporting: ExportJob | null;
  report: ExportReport | null;
  storage: StorageState;
  /** The plan used for previews (exports re-check the session). */
  pro: boolean;
  setName: (name: string) => void;
  setView: (view: BatchView) => void;
  setQuery: (query: string) => void;
  setDraft: (draft: BatchSettings) => void;
  setPro: (pro: boolean) => void;
  dismissReport: () => void;
}

const DEFAULT_NAME = "Untitled batch";

export const useBatch = create<BatchState>((set) => ({
  name: DEFAULT_NAME,
  items: [],
  selected: [],
  view: "grid",
  query: "",
  draft: DEFAULT_BATCH_SETTINGS,
  draftEdited: false,
  exporting: null,
  report: null,
  storage: { state: "loading" },
  pro: false,
  setName: (name) => set({ name }),
  setView: (view) => set({ view }),
  setQuery: (query) => set({ query }),
  setDraft: (draft) => set({ draft, draftEdited: true }),
  setPro: (pro) => {
    if (useBatch.getState().pro === pro) return;
    set({ pro });
    // Previews show the watermark exactly when downloads would carry one.
    void refreshPreviews(useBatch.getState().items.map((i) => i.id));
  },
  dismissReport: () => set({ report: null }),
}));

/* --------------------------------------------------------------- helpers -- */

const get = (id: string) => useBatch.getState().items.find((i) => i.id === id);

function patch(id: string, p: Partial<BatchItem>) {
  useBatch.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
}

function swapUrl(id: string, key: "thumbUrl" | "previewUrl", blob: Blob) {
  const old = get(id)?.[key];
  patch(id, { [key]: URL.createObjectURL(blob) });
  if (old) URL.revokeObjectURL(old);
}

export function isReady(item: BatchItem) {
  return item.status === "ready" && item.maskBlob !== null;
}

export function isBusy(item: BatchItem) {
  return item.status === "queued" || item.status === "processing";
}

/** Why an item can't be exported, in words. */
export function exclusionReason(item: BatchItem): string {
  switch (item.status) {
    case "queued":
      return "still waiting to be processed";
    case "processing":
      return "still processing";
    case "failed":
      return "processing failed";
    case "cancelled":
      return "processing was cancelled";
    case "needs-auth":
      return "waiting for you to sign in";
    case "needs-pro":
      return "waiting for Pro";
    case "ready":
      return item.maskBlob ? "" : "result missing";
  }
}

/* ---------------------------------------------------------------- queue --- */

const controllers = new Map<string, AbortController>();
/** Items handed to run() but not finished yet (claimed synchronously to avoid double starts). */
const claimed = new Set<string>();
/** Low-resolution cutouts used to redraw previews when settings change. */
const smallCutouts = new Map<string, ImageBitmap>();
let running = 0;

function pump() {
  while (running < batchConfig.concurrency) {
    const next = useBatch.getState().items.find((i) => i.status === "queued" && !claimed.has(i.id));
    if (!next) return;
    running++;
    claimed.add(next.id);
    void run(next.id).finally(() => {
      claimed.delete(next.id);
      running--;
      pump();
    });
  }
}

/** Original RGB with a downsampled mask as alpha, at ≤640px, for previews. */
async function makeSmallCutout(bitmap: ImageBitmap, mask: Uint8Array): Promise<ImageBitmap> {
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = get2d(canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  const small = downsample(mask, bitmap.width, bitmap.height, Math.max(1, Math.floor(1 / scale)));
  const maskCanvas = createCanvas(small.width, small.height);
  const mctx = get2d(maskCanvas);
  const data = mctx.createImageData(small.width, small.height);
  for (let i = 0; i < small.data.length; i++) data.data[i * 4 + 3] = small.data[i];
  mctx.putImageData(data, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0, w, h);
  return createImageBitmap(canvas);
}

function backgroundFor(settings: BatchSettings) {
  return settings.background.kind === "image" ? (backgroundAssets.get(settings.background.assetId)?.bitmap ?? null) : null;
}

async function refreshPreview(id: string) {
  const item = get(id);
  const cutout = smallCutouts.get(id);
  if (!item || !cutout) return;
  const sources: BatchSources = {
    width: item.width,
    height: item.height,
    cutout,
    bounds: item.bounds,
    backgroundImage: backgroundFor(item.settings),
  };
  try {
    swapUrl(id, "previewUrl", await renderBatchPreview(sources, item.settings, exportPolicy(useBatch.getState().pro)));
  } catch {
    // A preview that can't be drawn leaves the previous one; downloads report their own errors.
  }
}

async function refreshPreviews(ids: string[]) {
  for (const id of ids) await refreshPreview(id);
}

function errorFrom(error: unknown): BatchError {
  if (error instanceof EngineError) return { code: error.code, message: error.message, detail: error.detail };
  if (error instanceof Error && error.name === "DecodeError") return { code: "decode-failed", message: error.message };
  return { code: "inference-failed", message: "This image couldn't be processed.", detail: String(error) };
}

class DecodeError extends Error {
  name = "DecodeError";
}

async function run(id: string) {
  const item = get(id);
  if (!item || item.status !== "queued") return;
  // Removing backgrounds needs an account, and Batch Studio is part of Pro.
  const access = await sessionAccess();
  if (get(id)?.status !== "queued") return;
  if (!access.signedIn || !access.pro) {
    patch(id, { status: access.signedIn ? "needs-pro" : "needs-auth", phase: null });
    return;
  }
  const controller = new AbortController();
  controllers.set(id, controller);
  patch(id, { status: "processing", phase: { kind: "waiting" }, error: null });
  let bitmap: ImageBitmap | null = null;
  try {
    try {
      bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
    } catch {
      throw new DecodeError("The browser couldn't decode this image. It may be damaged or in an unsupported format.");
    }
    if (!get(id)?.thumbUrl) swapUrl(id, "thumbUrl", await makeThumbnail(bitmap, 520, "image/jpeg"));
    patch(id, { width: bitmap.width, height: bitmap.height });
    const engine = getEngine(useProject.getState().engineId);
    const result = await engine.removeBackground(bitmap, {
      signal: controller.signal,
      onPhase: (phase) => {
        if (!controller.signal.aborted) patch(id, { phase });
      },
    });
    if (!get(id)) return;
    if (controller.signal.aborted) throw new EngineError("cancelled", "Cancelled.");
    if (result.width !== bitmap.width || result.height !== bitmap.height || result.mask.length !== bitmap.width * bitmap.height) {
      throw new EngineError("inference-failed", "The engine returned a mask that doesn't match the image.", `${result.width}×${result.height} for ${bitmap.width}×${bitmap.height}`);
    }
    patch(id, { phase: { kind: "finalising" } });
    const { reason } = reviewMask(result.mask);
    const bounds = maskBounds(result.mask, result.width, result.height, 12);
    const [maskBlob, cutout] = await Promise.all([encodeMask(result.mask, result.width, result.height), makeSmallCutout(bitmap, result.mask)]);
    if (!get(id) || controller.signal.aborted) {
      cutout.close();
      if (get(id)) throw new EngineError("cancelled", "Cancelled.");
      return;
    }
    smallCutouts.get(id)?.close();
    smallCutouts.set(id, cutout);
    patch(id, {
      maskBlob,
      bounds,
      review: reason,
      refined: false,
      result: { engineId: result.engineId, backend: result.backend, durationMs: result.durationMs },
    });
    await refreshPreview(id);
    // Only now, with a mask and preview in hand, is the item ready.
    if (get(id)) patch(id, { status: "ready", phase: null });
  } catch (error) {
    if (!get(id)) return;
    if (isCancellation(error) || controller.signal.aborted) patch(id, { status: "cancelled", phase: null });
    else if (error instanceof EngineError && error.code === "auth-required") patch(id, { status: "needs-auth", phase: null });
    else patch(id, { status: "failed", phase: null, error: errorFrom(error) });
  } finally {
    bitmap?.close();
    if (controllers.get(id) === controller) controllers.delete(id);
  }
}

async function makeThumbnails(ids: string[]) {
  for (const id of ids) {
    const item = get(id);
    if (!item || item.thumbUrl) continue;
    try {
      const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
      const thumb = await makeThumbnail(bitmap, 520, "image/jpeg");
      bitmap.close();
      if (get(id) && !get(id)!.thumbUrl) swapUrl(id, "thumbUrl", thumb);
    } catch {
      // Decoding problems surface when the item is processed.
    }
  }
}

/** Rebuild the preview cutout for a restored item from its original and stored mask. */
async function rebuildCutout(id: string) {
  const item = get(id);
  if (!item?.maskBlob || smallCutouts.has(id)) return;
  try {
    const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
    try {
      const { mask, width, height } = await decodeMask(item.maskBlob);
      if (width !== bitmap.width || height !== bitmap.height) throw new Error("Mask size mismatch.");
      smallCutouts.set(id, await makeSmallCutout(bitmap, mask));
    } finally {
      bitmap.close();
    }
    await refreshPreview(id);
  } catch {
    patch(id, { status: "failed", maskBlob: null, error: { message: "The saved result couldn't be restored. Run background removal again." } });
  }
}

/* -------------------------------------------------------------- actions --- */

const recentlyAdded = new WeakSet<File>();

/** New images match the rest of the batch when it all shares one set of applied settings. */
function settingsForNewItems(): BatchSettings {
  const items = useBatch.getState().items;
  if (items.length && items.every((i) => sameSettings(i.settings, items[0].settings))) return items[0].settings;
  return DEFAULT_BATCH_SETTINGS;
}

/** Validate and add files. Each rejected file is reported on its own; the rest are added. */
export async function addFiles(files: File[]): Promise<Array<{ name: string; error: ValidationError }>> {
  const rejected: Array<{ name: string; error: ValidationError }> = [];
  const accepted: BatchItem[] = [];
  for (const file of files) {
    // The same File can arrive twice from overlapping drop/change events.
    if (recentlyAdded.has(file)) continue;
    recentlyAdded.add(file);
    if (useBatch.getState().items.length + accepted.length >= uploadLimits.maxBatchFiles) {
      rejected.push({ name: file.name, error: { code: "too-large", message: `A batch can hold up to ${uploadLimits.maxBatchFiles} images.` } });
      continue;
    }
    const validation = await validateImageFile(file);
    if (!validation.ok) {
      rejected.push({ name: file.name, error: validation.error });
      continue;
    }
    // Keep our own copy of the original: a File picked from disk stops being
    // readable if the file is moved or overwritten while the batch is open.
    let original: File;
    try {
      original = new File([await file.arrayBuffer()], file.name || "image", { type: file.type, lastModified: file.lastModified });
    } catch {
      rejected.push({ name: file.name, error: { code: "decode-failed", message: "This file couldn't be read." } });
      continue;
    }
    accepted.push({
      id: crypto.randomUUID(),
      file: original,
      name: file.name || "image",
      size: file.size,
      width: validation.info.width,
      height: validation.info.height,
      status: "queued",
      phase: null,
      error: null,
      review: null,
      thumbUrl: null,
      previewUrl: null,
      maskBlob: null,
      bounds: null,
      settings: settingsForNewItems(),
      result: null,
      refined: false,
    });
  }
  if (accepted.length) useBatch.setState((s) => ({ items: [...s.items, ...accepted] }));
  pump();
  void makeThumbnails(accepted.map((i) => i.id));
  return rejected;
}

/** Queue images that haven't got a result (failed, cancelled or waiting). With `again`, ready ones are re-run too. */
export function processItems(ids: string[], options: { again?: boolean } = {}) {
  const wanted = new Set(ids);
  useBatch.setState((s) => ({
    items: s.items.map((i) =>
      wanted.has(i.id) && !isBusy(i) && (i.status !== "ready" || options.again) ? { ...i, status: "queued", error: null, phase: null } : i,
    ),
  }));
  pump();
}

/** Re-check items waiting for sign-in or Pro (after signing in or upgrading). */
export function resumeWaiting() {
  processItems(useBatch.getState().items.filter((i) => i.status === "needs-auth" || i.status === "needs-pro").map((i) => i.id));
}

/** Cancel queued items and stop processing ones. Other items keep going. */
export function cancelItems(ids: string[]) {
  for (const id of ids) {
    const item = get(id);
    if (!item) continue;
    if (item.status === "queued" && !claimed.has(id)) patch(id, { status: "cancelled", phase: null });
    else if (item.status === "queued" || item.status === "processing") {
      const controller = controllers.get(id);
      if (controller) controller.abort();
      else patch(id, { status: "cancelled", phase: null });
    }
  }
}

function release(item: BatchItem) {
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  smallCutouts.get(item.id)?.close();
  smallCutouts.delete(item.id);
}

export function removeItems(ids: string[]) {
  const gone = new Set(ids);
  for (const id of ids) {
    controllers.get(id)?.abort();
    const item = get(id);
    if (item) release(item);
  }
  useBatch.setState((s) => ({ items: s.items.filter((i) => !gone.has(i.id)), selected: s.selected.filter((x) => !gone.has(x)) }));
}

export async function clearBatch() {
  for (const c of controllers.values()) c.abort();
  for (const item of useBatch.getState().items) release(item);
  useBatch.setState({ items: [], selected: [], report: null, name: DEFAULT_NAME });
  persisted.clear();
  try {
    await storage.clearAll();
  } catch {
    /* Reported by the next save. */
  }
}

/* ------------------------------------------------------------ selection --- */

/** The images the settings panel applies to: the selection, or every image when nothing is selected. */
export function targetIds(state: Pick<BatchState, "items" | "selected"> = useBatch.getState()) {
  return state.selected.length ? state.selected : state.items.map((i) => i.id);
}

/** Whether the draft matches the applied settings of every target. */
export function draftIsApplied(state: Pick<BatchState, "items" | "selected" | "draft"> = useBatch.getState()) {
  const ids = new Set(targetIds(state));
  return state.items.filter((i) => ids.has(i.id)).every((i) => sameSettings(i.settings, state.draft));
}

/** Whether the targets have different applied settings from each other. */
export function targetsMixed(state: Pick<BatchState, "items" | "selected"> = useBatch.getState()) {
  const ids = new Set(targetIds(state));
  const targets = state.items.filter((i) => ids.has(i.id));
  return targets.some((t) => !sameSettings(t.settings, targets[0].settings));
}

/** The panel has edits that aren't applied to the images it targets. */
export function hasUnappliedEdits(state: Pick<BatchState, "items" | "selected" | "draft" | "draftEdited"> = useBatch.getState()) {
  return state.draftEdited && !draftIsApplied(state);
}

/**
 * Change the selection. When the panel has no unapplied edits and the new
 * targets share one set of settings, the panel shows those settings, so
 * selecting an image shows how it's set up. Unapplied edits are never lost.
 */
export function setSelection(next: string[]) {
  const state = useBatch.getState();
  const clean = !hasUnappliedEdits(state);
  const ids = new Set(next.length ? next : state.items.map((i) => i.id));
  const targets = state.items.filter((i) => ids.has(i.id));
  const shared = targets.length > 0 && targets.every((t) => sameSettings(t.settings, targets[0].settings)) ? targets[0].settings : null;
  useBatch.setState({ selected: next, ...(clean && shared ? { draft: shared, draftEdited: false } : {}) });
}

export function toggleSelected(id: string) {
  const selected = useBatch.getState().selected;
  setSelection(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
}

/* ------------------------------------------------------------- settings --- */

/** Apply settings to the given items. Masks are reused: nothing is reprocessed. */
export async function applySettings(ids: string[], settings: BatchSettings) {
  const wanted = new Set(ids);
  const value = normaliseSettings(settings);
  useBatch.setState((s) => ({ items: s.items.map((i) => (wanted.has(i.id) ? { ...i, settings: value } : i)), draftEdited: false }));
  await refreshPreviews(ids);
}

/** Keep an uploaded background so a restored batch can still use it. */
export async function addBatchBackground(file: File): Promise<{ id: string } | { error: string }> {
  const result = await addBackgroundImage(file);
  if ("id" in result) {
    try {
      await storage.saveBackground({ id: result.id, name: file.name, blob: file });
    } catch {
      /* The background still works until the page is closed. */
    }
  }
  return result;
}

/* -------------------------------------------------------------- exports --- */

async function currentPolicy(): Promise<ExportPolicy> {
  return exportPolicy((await sessionAccess()).pro);
}

/** Full-resolution render of one finished item with its applied settings. */
export async function renderItem(item: BatchItem, policy: ExportPolicy): Promise<Blob> {
  if (!item.maskBlob) throw new Error("This image hasn't been processed yet.");
  let decoded: Awaited<ReturnType<typeof decodeImage>>;
  try {
    decoded = await decodeImage(item.file);
  } catch {
    throw new Error("The original image can't be read any more. Remove it and add it again.");
  }
  try {
    const { mask, width, height } = await decodeMask(item.maskBlob);
    if (width !== decoded.width || height !== decoded.height) throw new Error("The saved mask doesn't match this image. Run background removal again.");
    // The editor's own layer code builds the cutout, so batch and editor exports agree.
    const layers = new ImageLayers(decoded.pixels, decoded.width, decoded.height, mask, { shift: 0, feather: 0 });
    const { blob } = await renderBatchBlob(
      { width, height, cutout: layers.cutout, bounds: item.bounds, backgroundImage: backgroundFor(item.settings) },
      item.settings,
      policy,
    );
    return blob;
  } finally {
    decoded.bitmap.close();
  }
}

function nameContext(id: string) {
  const { items, name } = useBatch.getState();
  return { index: items.findIndex((i) => i.id === id) + 1, total: items.length, project: name };
}

export function fileNameFor(item: BatchItem, used = new Set<string>()) {
  return exportName(item.name, item.settings, used, nameContext(item.id));
}

function startJob(job: ExportJob): boolean {
  if (useBatch.getState().exporting) return false;
  useBatch.setState({ exporting: job, report: null });
  return true;
}

function describeExcluded(excluded: ExportReport["excluded"]) {
  if (!excluded.length) return "";
  const shown = excluded.slice(0, 4).map((e) => `${e.name} (${e.reason})`);
  return ` Left out: ${shown.join(", ")}${excluded.length > 4 ? ` and ${excluded.length - 4} more` : ""}.`;
}

/** Download one finished image. */
export async function downloadItem(id: string): Promise<void> {
  const item = get(id);
  if (!item || !isReady(item)) return;
  if (!startJob({ label: `Preparing ${item.name}`, done: 0, total: 1 })) return;
  try {
    const blob = await renderItem(item, await currentPolicy());
    const fileName = fileNameFor(item);
    downloadBlob(blob, fileName);
    useBatch.setState({ report: { tone: "ok", message: `Downloaded ${fileName}.`, excluded: [] } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The download couldn't be created.";
    useBatch.setState({ report: { tone: "error", message: `${item.name}: ${message}`, excluded: [] } });
  } finally {
    useBatch.setState({ exporting: null });
  }
}

/**
 * Export the finished images among `ids`: a single file for one image, a ZIP
 * for several. Unfinished images, and any that fail to render, are left out
 * and listed; they never block the others.
 */
export async function exportItems(ids: string[], scope: "selected" | "all"): Promise<void> {
  const { items, name } = useBatch.getState();
  const wanted = new Set(ids);
  const chosen = items.filter((i) => wanted.has(i.id));
  const ready = chosen.filter(isReady);
  const excluded = chosen.filter((i) => !isReady(i)).map((i) => ({ name: i.name, reason: exclusionReason(i) }));
  if (ready.length === 0) {
    useBatch.setState({
      report: { tone: "error", message: `There are no finished images to export.${describeExcluded(excluded)}`, excluded },
    });
    return;
  }
  if (ready.length === 1 && scope === "selected") {
    await downloadItem(ready[0].id);
    if (excluded.length) {
      const report = useBatch.getState().report;
      if (report?.tone === "ok") useBatch.setState({ report: { tone: "warn", message: report.message + describeExcluded(excluded), excluded } });
    }
    return;
  }
  if (!startJob({ label: "Packing", done: 0, total: ready.length })) return;
  try {
    const policy = await currentPolicy();
    const chunks: Uint8Array[] = [];
    let zipError: unknown = null;
    const zip = new Zip((err, chunk) => {
      if (err) zipError = err;
      else chunks.push(chunk);
    });
    const used = new Set<string>();
    let added = 0;
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      try {
        const data = new Uint8Array(await (await renderItem(item, policy)).arrayBuffer());
        // PNG and JPEG are already compressed, so they're stored without deflating again.
        const entry = new ZipPassThrough(fileNameFor(item, used));
        zip.add(entry);
        entry.push(data, true);
        added++;
      } catch (error) {
        excluded.push({ name: item.name, reason: error instanceof Error ? error.message : "couldn't be rendered" });
      }
      useBatch.setState({ exporting: { label: "Packing", done: i + 1, total: ready.length } });
    }
    zip.end();
    if (zipError) throw zipError;
    if (added === 0) throw new Error(`None of the images could be rendered.${describeExcluded(excluded)}`);
    const zipName = `${safeFileStem(name, "isola-batch")}${scope === "selected" ? "-selected" : ""}.zip`;
    downloadBlob(new Blob(chunks as BlobPart[], { type: "application/zip" }), zipName);
    useBatch.setState({
      report: {
        tone: excluded.length ? "warn" : "ok",
        message: `Downloaded ${added} image${added === 1 ? "" : "s"} in ${zipName}.${describeExcluded(excluded)}`,
        excluded,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The ZIP file couldn't be created.";
    useBatch.setState({
      report: {
        tone: "error",
        message: /memory|allocation/i.test(message) ? "The browser ran out of memory building the ZIP. Select fewer images and export them in smaller groups." : message,
        excluded,
      },
    });
  } finally {
    useBatch.setState({ exporting: null });
  }
}

/* --------------------------------------------------------------- editor --- */

/** Editor revision last copied back, per batch item. */
const syncedRevision = new Map<string, number>();
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncing = false;

/**
 * Open a finished item in the detailed editor. Reuses the editor image if it's
 * already open, so repeated clicks don't create copies.
 */
export async function openInEditor(id: string): Promise<boolean> {
  const item = get(id);
  if (!item || !isReady(item) || !item.maskBlob) return false;
  const project = useProject.getState();
  const existing = project.images.find((img) => img.batchItemId === id);
  if (existing) {
    project.setActive(existing.id);
    return true;
  }
  const { mask } = await decodeMask(item.maskBlob);
  const editorId = await importWithMask(item.file, mask, item.result ?? { engineId: "batch", backend: "", durationMs: 0 }, {
    batchItemId: id,
    background: item.settings.background,
  });
  const image = useProject.getState().images.find((i) => i.id === editorId);
  if (image) syncedRevision.set(id, image.revision);
  return true;
}

/**
 * Copy edits made in the editor back to their batch items: the refined cutout
 * (brush work plus edge refinement, as the editor shows it) and the
 * background. Each item is updated on its own; others are untouched.
 */
async function syncFromEditor() {
  if (syncing) return;
  syncing = true;
  try {
    for (const image of useProject.getState().images) {
      const itemId = image.batchItemId;
      if (!itemId || image.status !== "ready") continue;
      const last = syncedRevision.get(itemId);
      if (last === undefined) {
        syncedRevision.set(itemId, image.revision);
        continue;
      }
      if (image.revision === last) continue;
      const item = get(itemId);
      const assets = imageAssets.get(image.id);
      if (!item || !assets?.layers || !assets.decoded) continue;
      syncedRevision.set(itemId, image.revision);
      const { width, height } = assets.decoded;
      const refined = assets.layers.refined.slice();
      const [maskBlob, cutout] = await Promise.all([encodeMask(refined, width, height), makeSmallCutout(assets.decoded.bitmap, refined)]);
      if (!get(itemId)) {
        cutout.close();
        continue;
      }
      smallCutouts.get(itemId)?.close();
      smallCutouts.set(itemId, cutout);
      const background = image.settings.background;
      patch(itemId, {
        maskBlob,
        bounds: maskBounds(refined, width, height, 12),
        review: null,
        refined: true,
        settings: { ...get(itemId)!.settings, background },
      });
      await refreshPreview(itemId);
    }
  } finally {
    syncing = false;
  }
}

if (typeof window !== "undefined") {
  useProject.subscribe(() => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncFromEditor(), 400);
  });
}

/* ---------------------------------------------------------- persistence --- */

const persisted = new Map<string, storage.PersistedItem>();
let persistReady = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let restorePromise: Promise<void> | null = null;

function toRecord(item: BatchItem, order: number): storage.PersistedItem {
  const status: storage.PersistedStatus =
    item.status === "ready" && item.maskBlob ? "ready" : item.status === "failed" || item.status === "cancelled" ? item.status : "queued";
  return {
    id: item.id,
    order,
    name: item.name,
    size: item.size,
    width: item.width,
    height: item.height,
    status,
    error: status === "failed" ? item.error : null,
    review: item.review,
    maskBlob: status === "ready" ? item.maskBlob : null,
    bounds: item.bounds,
    settings: item.settings,
    result: item.result,
    refined: item.refined,
  };
}

function sameRecord(a: storage.PersistedItem, b: storage.PersistedItem) {
  return (
    a.order === b.order &&
    a.status === b.status &&
    a.name === b.name &&
    a.width === b.width &&
    a.height === b.height &&
    a.maskBlob === b.maskBlob &&
    a.review === b.review &&
    a.refined === b.refined &&
    JSON.stringify([a.error, a.bounds, a.settings, a.result]) === JSON.stringify([b.error, b.bounds, b.settings, b.result])
  );
}

function schedulePersist() {
  if (!persistReady) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void flushPersist(), 250);
}

let flushing: Promise<void> | null = null;
async function flushPersist() {
  if (flushing) {
    await flushing;
    schedulePersist();
    return;
  }
  flushing = (async () => {
    const { items, name } = useBatch.getState();
    const ids = new Set(items.map((i) => i.id));
    let full = false;
    try {
      for (const id of [...persisted.keys()]) {
        if (ids.has(id)) continue;
        await storage.deleteItem(id);
        persisted.delete(id);
      }
      for (const [order, item] of items.entries()) {
        const record = toRecord(item, order);
        const previous = persisted.get(item.id);
        if (previous && sameRecord(previous, record)) continue;
        try {
          if (!previous) await storage.saveFile(item.id, item.file);
          await storage.saveItem(record);
          persisted.set(item.id, record);
        } catch (error) {
          if (error instanceof storage.StorageFullError) full = true;
          else throw error;
        }
      }
      await storage.saveMeta({ name });
      useBatch.setState({ storage: full ? { state: "full" } : { state: "ok" } });
    } catch (error) {
      useBatch.setState({ storage: { state: "error", message: error instanceof Error ? error.message : String(error) } });
    }
  })();
  try {
    await flushing;
  } finally {
    flushing = null;
  }
}

/** Load the batch saved in this browser (once per page load) and start keeping it in sync. */
export function restoreBatch(): Promise<void> {
  if (restorePromise) return restorePromise;
  restorePromise = (async () => {
    let data: Awaited<ReturnType<typeof storage.loadAll>> = null;
    try {
      data = await storage.loadAll();
    } catch {
      data = null;
    }
    if (!data) {
      // Private browsing or blocked storage: the batch works, but only until the page closes.
      useBatch.setState({ storage: { state: "unavailable" } });
      return;
    }
    const restored: BatchItem[] = [];
    try {
      for (const bg of data.backgrounds) {
        const file = bg.blob instanceof File ? bg.blob : new File([bg.blob], bg.name, { type: bg.blob.type });
        await addBackgroundImage(file, { id: bg.id });
      }
      for (const r of data.items) {
        const settings = normaliseSettings(r.settings);
        persisted.set(r.id, { ...r, settings });
        restored.push({
          id: r.id,
          file: r.file,
          name: r.name,
          size: r.size,
          width: r.width,
          height: r.height,
          status: r.status === "ready" && !r.maskBlob ? "queued" : r.status,
          phase: null,
          error: r.error,
          review: r.review,
          thumbUrl: null,
          previewUrl: null,
          maskBlob: r.maskBlob,
          bounds: r.bounds,
          settings,
          result: r.result,
          refined: r.refined,
        });
      }
      useBatch.setState((s) => {
        const known = new Set(restored.map((i) => i.id));
        return {
          items: [...restored, ...s.items.filter((i) => !known.has(i.id))],
          name: s.name === DEFAULT_NAME && data!.meta?.name ? data!.meta.name : s.name,
          storage: { state: "ok" },
        };
      });
    } catch (error) {
      useBatch.setState({ storage: { state: "error", message: error instanceof Error ? error.message : String(error) } });
    }
    persistReady = true;
    schedulePersist();
    pump();
    await makeThumbnails(restored.map((i) => i.id));
    for (const item of restored) if (item.status === "ready") await rebuildCutout(item.id);
  })();
  return restorePromise;
}

if (typeof window !== "undefined") {
  useBatch.subscribe((state, previous) => {
    if (state.items !== previous.items || state.name !== previous.name) schedulePersist();
  });
}
