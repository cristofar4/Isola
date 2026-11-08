"use client";

import { Zip, ZipPassThrough } from "fflate";
import { create } from "zustand";
import { batchConfig, uploadLimits } from "@/lib/config";
import { canvasToBlob, createCanvas, decodeImage, get2d, makeThumbnail } from "@/lib/image/decode";
import { decodeMask, encodeMask } from "@/lib/image/mask-codec";
import { validateImageFile, type ValidationError } from "@/lib/image/validate";
import { ImageLayers } from "@/lib/editor/layers";
import { downsample } from "@/lib/editor/mask-ops";
import { getEngine } from "@/lib/processing/registry";
import { EngineError, isCancellation, looksEmpty, type JobPhase } from "@/lib/processing/types";
import { useProject } from "@/lib/project/store";

export type BatchStatus = "queued" | "processing" | "done" | "error" | "cancelled";

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
  notice: string | null;
  thumbUrl: string | null;
  resultUrl: string | null;
  /** Mask stored as a compressed greyscale PNG to keep memory low. */
  maskBlob: Blob | null;
  result: { engineId: string; backend: string; durationMs: number } | null;
}

interface BatchState {
  items: BatchItem[];
  zipping: { done: number; total: number } | null;
  add: (files: File[]) => Promise<Array<{ name: string; error: ValidationError }>>;
  retry: (id: string) => void;
  retryFailed: () => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const controllers = new Map<string, AbortController>();
let running = 0;

function uid() {
  return crypto.randomUUID();
}

function patch(id: string, p: Partial<BatchItem>) {
  useBatch.setState((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));
}

function get(id: string) {
  return useBatch.getState().items.find((i) => i.id === id);
}

/** Start queued items until the concurrency limit is reached. */
function pump() {
  while (running < batchConfig.concurrency) {
    const next = useBatch.getState().items.find((i) => i.status === "queued" && !controllers.has(i.id));
    if (!next) return;
    running++;
    void run(next.id).finally(() => {
      running--;
      pump();
    });
  }
}

async function cutoutThumbnail(bitmap: ImageBitmap, mask: Uint8Array): Promise<Blob> {
  const maxSide = 320;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
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
  return canvasToBlob(canvas, "image/png");
}

async function run(id: string) {
  const item = get(id);
  if (!item) return;
  const controller = new AbortController();
  controllers.set(id, controller);
  patch(id, { status: "processing", phase: { kind: "waiting" }, error: null, notice: null });
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
    if (!item.thumbUrl) {
      const thumb = await makeThumbnail(bitmap, 320, "image/jpeg");
      patch(id, { thumbUrl: URL.createObjectURL(thumb), width: bitmap.width, height: bitmap.height });
    }
    const engine = getEngine(useProject.getState().engineId);
    const result = await engine.removeBackground(bitmap, {
      signal: controller.signal,
      onPhase: (phase) => patch(id, { phase }),
    });
    const [maskBlob, cutout] = await Promise.all([
      encodeMask(result.mask, result.width, result.height),
      cutoutThumbnail(bitmap, result.mask),
    ]);
    if (!get(id)) return;
    patch(id, {
      status: "done",
      phase: null,
      maskBlob,
      resultUrl: URL.createObjectURL(cutout),
      result: { engineId: result.engineId, backend: result.backend, durationMs: result.durationMs },
      notice: looksEmpty(result) ? "No clear subject found" : null,
    });
  } catch (error) {
    if (!get(id)) return;
    if (isCancellation(error)) {
      patch(id, { status: "cancelled", phase: null });
    } else {
      patch(id, {
        status: "error",
        phase: null,
        error:
          error instanceof EngineError
            ? { message: error.message, detail: error.detail }
            : { message: "This image couldn't be processed.", detail: String(error) },
      });
    }
  } finally {
    bitmap?.close();
    controllers.delete(id);
  }
}

/** Original thumbnails, one at a time so a large batch never decodes everything at once. */
async function makeThumbnails(ids: string[]) {
  for (const id of ids) {
    const item = get(id);
    if (!item || item.thumbUrl) continue;
    try {
      const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
      const thumb = await makeThumbnail(bitmap, 320, "image/jpeg");
      bitmap.close();
      if (get(id) && !get(id)!.thumbUrl) patch(id, { thumbUrl: URL.createObjectURL(thumb) });
    } catch {
      // Decoding problems surface when the item is processed.
    }
  }
}

/** Full-resolution transparent PNG for one finished item. */
export async function renderItemPng(item: BatchItem): Promise<Blob> {
  if (!item.maskBlob) throw new Error("This image hasn't been processed yet.");
  const decoded = await decodeImage(item.file);
  try {
    const { mask, width, height } = await decodeMask(item.maskBlob);
    if (width !== decoded.width || height !== decoded.height) throw new Error("Mask size mismatch.");
    const layers = new ImageLayers(decoded.pixels, decoded.width, decoded.height, mask, { shift: 0, feather: 0 });
    return await canvasToBlob(layers.cutout, "image/png");
  } finally {
    decoded.bitmap.close();
  }
}

export function outputName(name: string, used: Set<string>) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "").trim() || "image";
  let candidate = `${base}-isola.png`;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-isola-${n}.png`;
  used.add(candidate);
  return candidate;
}

/** Build a ZIP of every finished item, one image at a time to bound memory. */
export async function zipFinished(): Promise<Blob> {
  const items = useBatch.getState().items.filter((i) => i.status === "done");
  const chunks: Uint8Array[] = [];
  const zip = new Zip((err, chunk) => {
    if (err) throw err;
    chunks.push(chunk);
  });
  const used = new Set<string>();
  useBatch.setState({ zipping: { done: 0, total: items.length } });
  try {
    for (let i = 0; i < items.length; i++) {
      const png = new Uint8Array(await (await renderItemPng(items[i])).arrayBuffer());
      // PNG data is already compressed, so store it without deflating again.
      const entry = new ZipPassThrough(outputName(items[i].name, used));
      zip.add(entry);
      entry.push(png, true);
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
  if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
}

export const useBatch = create<BatchState>((set, getState) => ({
  items: [],
  zipping: null,
  async add(files) {
    const rejected: Array<{ name: string; error: ValidationError }> = [];
    const room = uploadLimits.maxBatchFiles - getState().items.length;
    const accepted: BatchItem[] = [];
    for (const file of files) {
      if (accepted.length >= room) {
        rejected.push({
          name: file.name,
          error: { code: "too-large", message: `A batch can hold up to ${uploadLimits.maxBatchFiles} images.` },
        });
        continue;
      }
      const validation = await validateImageFile(file);
      if (!validation.ok) {
        rejected.push({ name: file.name, error: validation.error });
        continue;
      }
      accepted.push({
        id: uid(),
        file,
        name: file.name,
        size: file.size,
        width: validation.info.width,
        height: validation.info.height,
        status: "queued",
        phase: null,
        error: null,
        notice: null,
        thumbUrl: null,
        resultUrl: null,
        maskBlob: null,
        result: null,
      });
    }
    set((s) => ({ items: [...s.items, ...accepted] }));
    pump();
    void makeThumbnails(accepted.map((i) => i.id));
    return rejected;
  },
  retry(id) {
    patch(id, { status: "queued", error: null, phase: null });
    pump();
  },
  retryFailed() {
    set((s) => ({
      items: s.items.map((i) => (i.status === "error" || i.status === "cancelled" ? { ...i, status: "queued", error: null } : i)),
    }));
    pump();
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
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
  clear() {
    for (const c of controllers.values()) c.abort();
    for (const item of getState().items) revoke(item);
    set({ items: [] });
  },
}));
