"use client";

import type { Rect } from "@/lib/editor/geometry";
import { downsample } from "@/lib/editor/mask-ops";
import { createCanvas, get2d, makeThumbnail } from "@/lib/image/decode";
import { decodeMask } from "@/lib/image/mask-codec";
import { loadAll, type PersistedStatus } from "@/lib/batch/persist";
import { renderBatchPreview } from "@/lib/batch/render";
import { normaliseSettings, type BatchSettings } from "@/lib/batch/settings";
import type { ExportPolicy } from "@/lib/plan-policy";

/**
 * A read-only view of the batch saved in this browser, for the studio
 * dashboard. Batch Studio itself owns the batch; the dashboard only reads it
 * and links there for anything that changes it.
 */
export interface SnapshotItem {
  id: string;
  name: string;
  status: PersistedStatus;
  review: string | null;
  width: number;
  height: number;
  bounds: Rect | null;
  settings: BatchSettings;
  maskBlob: Blob | null;
  file: File;
  refined: boolean;
}

export interface BatchSnapshot {
  name: string;
  updatedAt: number | null;
  items: SnapshotItem[];
  backgrounds: Map<string, Blob>;
}

/** The saved batch, or null where this browser has no storage for it. */
export async function loadSnapshot(): Promise<BatchSnapshot | null> {
  let data: Awaited<ReturnType<typeof loadAll>>;
  try {
    data = await loadAll();
  } catch {
    return null;
  }
  if (!data) return null;
  return {
    name: data.meta?.name ?? "Untitled batch",
    updatedAt: data.meta?.updatedAt ?? null,
    items: data.items.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      review: r.review,
      width: r.width,
      height: r.height,
      bounds: r.bounds,
      settings: normaliseSettings(r.settings),
      maskBlob: r.maskBlob,
      file: r.file,
      refined: r.refined,
    })),
    backgrounds: new Map(data.backgrounds.map((b) => [b.id, b.blob])),
  };
}

/** A small JPEG of the original photo. */
export async function originalThumb(file: File, maxSide = 320): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      return await makeThumbnail(bitmap, maxSide, "image/jpeg");
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Original colours with the stored mask as alpha, at ≤640px. */
async function smallCutout(item: SnapshotItem): Promise<ImageBitmap | null> {
  if (!item.maskBlob) return null;
  const bitmap = await createImageBitmap(item.file, { imageOrientation: "from-image" });
  try {
    const { mask, width, height } = await decodeMask(item.maskBlob);
    if (width !== bitmap.width || height !== bitmap.height) return null;
    const scale = Math.min(1, 640 / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = createCanvas(w, h);
    const ctx = get2d(canvas);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);
    const small = downsample(mask, width, height, Math.max(1, Math.floor(1 / scale)));
    const maskCanvas = createCanvas(small.width, small.height);
    const mctx = get2d(maskCanvas);
    const data = mctx.createImageData(small.width, small.height);
    for (let i = 0; i < small.data.length; i++) data.data[i * 4 + 3] = small.data[i];
    mctx.putImageData(data, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0, w, h);
    return await createImageBitmap(canvas);
  } finally {
    bitmap.close();
  }
}

const cutouts = new Map<string, Promise<ImageBitmap | null>>();

/**
 * A preview of a finished item with any settings, drawn by the same renderer
 * as downloads (so the dashboard shows what an export would look like).
 */
export async function cutoutPreview(
  item: SnapshotItem,
  settings: BatchSettings,
  policy: ExportPolicy,
  backgrounds: Map<string, Blob>,
  maxSide = 360,
): Promise<Blob | null> {
  if (item.status !== "ready" || !item.maskBlob) return null;
  const key = `${item.id}:${item.maskBlob.size}`;
  if (!cutouts.has(key)) cutouts.set(key, smallCutout(item).catch(() => null));
  const cutout = await cutouts.get(key)!;
  if (!cutout) return null;
  let backgroundImage: ImageBitmap | null = null;
  try {
    if (settings.background.kind === "image") {
      const blob = backgrounds.get(settings.background.assetId);
      if (blob) backgroundImage = await createImageBitmap(blob);
    }
    return await renderBatchPreview({ width: item.width, height: item.height, cutout, bounds: item.bounds, backgroundImage }, settings, policy, maxSide);
  } catch {
    return null;
  } finally {
    backgroundImage?.close();
  }
}
