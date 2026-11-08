"use client";

import { Zip, ZipPassThrough } from "fflate";
import { create } from "zustand";
import { batchConfig, uploadLimits } from "@/lib/config";
import { createCanvas, decodeImage, get2d, makeThumbnail } from "@/lib/image/decode";
import { decodeMask, encodeMask } from "@/lib/image/mask-codec";
import { validateImageFile, type ValidationError } from "@/lib/image/validate";
import type { Rect } from "@/lib/editor/geometry";
import { ImageLayers } from "@/lib/editor/layers";
import { downsample, maskBounds } from "@/lib/editor/mask-ops";
import { getEngine } from "@/lib/processing/registry";
import { EngineError, isCancellation, type JobPhase } from "@/lib/processing/types";
import { backgroundAssets } from "@/lib/project/assets";
import { useProject } from "@/lib/project/store";
import { isSignedIn } from "@/lib/session-gate";
import { renderBatchBlob, renderBatchPreview, type BatchSources } from "./render";
import { reviewMask } from "./review";
import { DEFAULT_BATCH_SETTINGS, exportName, type BatchSettings } from "./settings";

export type BatchStatus = "queued" | "needs-auth" | "processing" | "done" | "error" | "cancelled";

export interface BatchItem {
  id: string;
  file: File;
  name: string;
  size: number;
  width: number;
  height: number;
  status: BatchStatus;
  phase: JobPhase | null;
  error: { message: string; detail?: string } | null;
  /** Why a finished result should be checked, or null when it looks fine. */
  review: string | null;
  /** Thumbnail of the original photo. */
  thumbUrl: string | null;
  /** Thumbnail of the result with this item's settings applied. */
  previewUrl: string | null;
  /** Mask stored as a compressed greyscale PNG to keep memory low. */
  maskBlob: Blob | null;
  bounds: Rect | null;
  settings: BatchSettings;
  result: { engineId: string; backend: string; durationMs: number } | null;
}

export type BatchView = "grid" | "list";

interface BatchState {
  name: string;
  items: BatchItem[];
  selected: string[];
  view: BatchView;
  /** Minimum card width in the grid, in px. */
  cardSize: number;
  /** Settings being edited in the side panel, applied with "Apply to …". */
  draft: BatchSettings;
  zipping: { done: number; total: number } | null;
  setName: (name: string) => void;
  setView: (view: BatchView) => void;
  setCardSize: (size: number) => void;
  setDraft: (draft: BatchSettings) => void;
  toggle: (id: string) => void;
  selectAll: (on: boolean) => void;
  add: (files: File[]) => Promise<Array<{ name: string; error: ValidationError }>>;
  process: (ids: string[]) => void;
  retryFailed: () => void;
  resumeAfterSignIn: () => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  apply: (ids: string[], settings: BatchSettings) => Promise<void>;
}

const controllers = new Map<string, AbortController>();
/** Items handed to run() but not finished yet (claimed synchronously to avoid double starts). */
const claimed = new Set<string>();
/** Low-resolution cutouts used to redraw previews when settings change. */
const smallCutouts = new Map<string, ImageBitmap>();
let running = 0;

const get = (id: string) => useBatch.getState().items.find((i) => i.id === id);
function patch(id: string, p: Partial<BatchItem>) {
  useBatch.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
}
function swapUrl(id: string, key: "thumbUrl" | "previewUrl", blob: Blob) {
  const old = get(id)?.[key];
  patch(id, { [key]: URL.createObjectURL(blob) });
  if (old) URL.revokeObjectURL(old);
}

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

/** Original RGB with a downsampled mask as alpha, at ≤640px. */
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
  swapUrl(id, "previewUrl", await renderBatchPreview(sources, item.settings));
}

async function run(id: string) {
  const item = get(id);
  if (!item) return;
  // Removing backgrounds needs an account: park the item until the visitor signs in.
  if (!(await isSignedIn())) {
    patch(id, { status: "needs-auth", phase: null });
    return;
  }
  const controller = new AbortController();
  controllers.set(id, controller);
  patch(id, { status: "processing", phase: { kind: "waiting" }, error: null });
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
    if (!get(id)?.thumbUrl) swapUrl(id, "thumbUrl", await makeThumbnail(bitmap, 480, "image/jpeg"));
    patch(id, { width: bitmap.width, height: bitmap.height });
    const engine = getEngine(useProject.getState().engineId);
    const result = await engine.removeBackground(bitmap, {
      signal: controller.signal,
      onPhase: (phase) => patch(id, { phase }),
    });
    if (!get(id)) return;
    const { reason } = reviewMask(result.mask);
    const bounds = maskBounds(result.mask, result.width, result.height, 12);
    const [maskBlob, cutout] = await Promise.all([
      encodeMask(result.mask, result.width, result.height),
      makeSmallCutout(bitmap, result.mask),
    ]);
    if (!get(id)) return;
    smallCutouts.get(id)?.close();
    smallCutouts.set(id, cutout);
    patch(id, {
      maskBlob,
      bounds,
      review: reason,
      result: { engineId: result.engineId, backend: result.backend, durationMs: result.durationMs },
    });
    await refreshPreview(id);
    patch(id, { status: "done", phase: null });
  } catch (error) {
    if (!get(id)) return;
    if (isCancellation(error)) patch(id, { status: "cancelled", phase: null });
    else if (error instanceof EngineError && error.code === "auth-required") patch(id, { status: "needs-auth", phase: null });
    else
      patch(id, {
        status: "error",
        phase: null,
        error:
          error instanceof EngineError
            ? { message: error.message, detail: error.detail }
            : { message: "This image couldn't be processed.", detail: String(error) },
      });
  } finally {
    bitmap?.close();
    controllers.delete(id);
  }
}

async function makeThumbnails(ids: string[]) {
  for (const id of ids) {
    const item = get(id);
    if (!item || item.thumbUrl) continue;
    try {
      const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
      const thumb = await makeThumbnail(bitmap, 480, "image/jpeg");
      bitmap.close();
      if (get(id) && !get(id)!.thumbUrl) swapUrl(id, "thumbUrl", thumb);
    } catch {
      // Decoding problems surface when the item is processed.
    }
  }
}

/** Full-resolution export for one finished item, with its own settings. */
export async function renderItem(item: BatchItem): Promise<Blob> {
  if (!item.maskBlob) throw new Error("This image hasn't been processed yet.");
  const decoded = await decodeImage(item.file);
  try {
    const { mask, width, height } = await decodeMask(item.maskBlob);
    if (width !== decoded.width || height !== decoded.height) throw new Error("Mask size mismatch.");
    const layers = new ImageLayers(decoded.pixels, decoded.width, decoded.height, mask, { shift: 0, feather: 0 });
    return await renderBatchBlob(
      { width, height, cutout: layers.cutout, bounds: item.bounds, backgroundImage: backgroundFor(item.settings) },
      item.settings,
    );
  } finally {
    decoded.bitmap.close();
  }
}

export function isReady(item: BatchItem) {
  return item.status === "done" && item.maskBlob !== null;
}

/** ZIP of the given finished items, rendered one at a time to bound memory. */
export async function zipItems(ids: string[]): Promise<Blob> {
  const items = useBatch.getState().items.filter((i) => ids.includes(i.id) && isReady(i));
  if (items.length === 0) throw new Error("There are no finished images to export.");
  const chunks: Uint8Array[] = [];
  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    chunks.push(chunk);
  });
  const used = new Set<string>();
  useBatch.setState({ zipping: { done: 0, total: items.length } });
  try {
    for (let i = 0; i < items.length; i++) {
      const data = new Uint8Array(await (await renderItem(items[i])).arrayBuffer());
      // PNG and JPEG are already compressed, so store without deflating again.
      const entry = new ZipPassThrough(exportName(items[i].name, items[i].settings, used));
      zip.add(entry);
      entry.push(data, true);
      useBatch.setState({ zipping: { done: i + 1, total: items.length } });
    }
    zip.end();
    return new Blob(chunks as BlobPart[], { type: "application/zip" });
  } finally {
    useBatch.setState({ zipping: null });
  }
}

function revoke(item: BatchItem) {
  if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  smallCutouts.get(item.id)?.close();
  smallCutouts.delete(item.id);
}

export const useBatch = create<BatchState>((set, getState) => ({
  name: "Untitled batch",
  items: [],
  selected: [],
  view: "grid",
  cardSize: 240,
  draft: DEFAULT_BATCH_SETTINGS,
  zipping: null,
  setName: (name) => set({ name }),
  setView: (view) => set({ view }),
  setCardSize: (cardSize) => set({ cardSize }),
  setDraft: (draft) => set({ draft }),
  toggle: (id) =>
    set((s) => {
      const selected = s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id];
      // With exactly one image selected, show its settings in the panel.
      const only = selected.length === 1 ? s.items.find((i) => i.id === selected[0]) : null;
      return { selected, draft: only ? only.settings : s.draft };
    }),
  selectAll: (on) => set((s) => ({ selected: on ? s.items.map((i) => i.id) : [] })),
  async add(files) {
    const rejected: Array<{ name: string; error: ValidationError }> = [];
    const room = uploadLimits.maxBatchFiles - getState().items.length;
    const accepted: BatchItem[] = [];
    for (const file of files) {
      if (accepted.length >= room) {
        rejected.push({ name: file.name, error: { code: "too-large", message: `A batch can hold up to ${uploadLimits.maxBatchFiles} images.` } });
        continue;
      }
      const validation = await validateImageFile(file);
      if (!validation.ok) {
        rejected.push({ name: file.name, error: validation.error });
        continue;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        name: file.name,
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
        settings: DEFAULT_BATCH_SETTINGS,
        result: null,
      });
    }
    set((s) => ({ items: [...s.items, ...accepted] }));
    pump();
    void makeThumbnails(accepted.map((i) => i.id));
    return rejected;
  },
  process(ids) {
    set((s) => ({
      items: s.items.map((i) =>
        ids.includes(i.id) && i.status !== "processing" && i.status !== "queued" ? { ...i, status: "queued", error: null, phase: null } : i,
      ),
    }));
    pump();
  },
  resumeAfterSignIn() {
    getState().process(getState().items.filter((i) => i.status === "needs-auth").map((i) => i.id));
  },
  retryFailed() {
    getState().process(getState().items.filter((i) => i.status === "error" || i.status === "cancelled").map((i) => i.id));
  },
  cancel(id) {
    const controller = controllers.get(id);
    if (controller) controller.abort();
    else if (get(id)?.status === "queued") patch(id, { status: "cancelled" });
  },
  remove(id) {
    controllers.get(id)?.abort();
    const item = get(id);
    if (item) revoke(item);
    set((s) => ({ items: s.items.filter((i) => i.id !== id), selected: s.selected.filter((x) => x !== id) }));
  },
  clear() {
    for (const c of controllers.values()) c.abort();
    for (const item of getState().items) revoke(item);
    set({ items: [], selected: [] });
  },
  async apply(ids, settings) {
    set((s) => ({ items: s.items.map((i) => (ids.includes(i.id) ? { ...i, settings } : i)) }));
    await Promise.all(ids.map((id) => refreshPreview(id)));
  },
}));
