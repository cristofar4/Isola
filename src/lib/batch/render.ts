import { canvasToBlob, createCanvas, get2d } from "@/lib/image/decode";
import { checkExportSize } from "@/lib/editor/export";
import { blurInPlace } from "@/lib/editor/mask-ops";
import { drawWatermark } from "@/lib/editor/watermark";
import type { Rect } from "@/lib/editor/geometry";
import { applyPolicySize, type ExportPolicy } from "@/lib/plan-policy";
import { canvasSize, exportMime, placement, type BatchSettings } from "./settings";

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface BatchSources {
  /** Original image size in pixels. */
  width: number;
  height: number;
  /** Cutout (original RGB with the mask as alpha), at any resolution. */
  cutout: AnyCanvas | ImageBitmap;
  /** Subject bounds in original pixels, or null if nothing was found. */
  bounds: Rect | null;
  backgroundImage: ImageBitmap | null;
}

const SHADOW_COLOR: [number, number, number] = [32, 41, 45];

/** Soft silhouette of the cutout, built at ≤512px (blurred shadows need no detail). */
function shadowCanvas(cutout: AnyCanvas | ImageBitmap, blurFraction: number) {
  const scale = Math.min(1, 512 / Math.max(cutout.width, cutout.height));
  const w = Math.max(1, Math.round(cutout.width * scale));
  const h = Math.max(1, Math.round(cutout.height * scale));
  const radius = Math.max(1, blurFraction * Math.max(w, h));
  const pad = Math.ceil(radius * 3) + 2;
  const canvas = createCanvas(w + pad * 2, h + pad * 2);
  const ctx = get2d(canvas, { willReadFrequently: true });
  ctx.drawImage(cutout, pad, pad, w, h);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3];
  blurInPlace(alpha, canvas.width, canvas.height, radius);
  for (let i = 0; i < alpha.length; i++) {
    image.data[i * 4] = SHADOW_COLOR[0];
    image.data[i * 4 + 1] = SHADOW_COLOR[1];
    image.data[i * 4 + 2] = SHADOW_COLOR[2];
    image.data[i * 4 + 3] = alpha[i];
  }
  ctx.putImageData(image, 0, 0);
  return { canvas, pad, scale };
}

function drawCover(ctx: AnyContext, image: ImageBitmap, w: number, h: number) {
  const s = Math.max(w / image.width, h / image.height);
  ctx.drawImage(image, (w - image.width * s) / 2, (h - image.height * s) / 2, image.width * s, image.height * s);
}

/**
 * Draw one batch result at `k` canvas pixels per output pixel (1 for export,
 * smaller for previews). Previews and exports share this function.
 */
export function drawBatch(ctx: AnyContext, sources: BatchSources, settings: BatchSettings, k: number) {
  const size = canvasSize(settings, sources.width, sources.height);
  const W = size.width * k;
  const H = size.height * k;
  const { s, tx, ty } = placement(settings, sources.width, sources.height, sources.bounds, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const bg = settings.background;
  // JPEG has no alpha channel, so it always starts from the chosen opaque colour.
  if (settings.format === "jpeg") {
    ctx.fillStyle = settings.matte;
    ctx.fillRect(0, 0, W, H);
  }
  if (bg.kind === "color") {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === "image" && sources.backgroundImage) {
    drawCover(ctx, sources.backgroundImage, W, H);
  }

  // Image pixels → output pixels.
  const dx = tx * k;
  const dy = ty * k;
  const dw = sources.width * s * k;
  const dh = sources.height * s * k;

  if (settings.shadow && sources.bounds) {
    const subjectSize = Math.max(sources.bounds.w, sources.bounds.h) * s * k;
    const shadow = shadowCanvas(sources.cutout, 0.045 * (Math.max(sources.bounds.w, sources.bounds.h) / Math.max(sources.width, sources.height)));
    const unit = dw / (sources.cutout.width * shadow.scale);
    ctx.globalAlpha = 0.32;
    ctx.drawImage(shadow.canvas, dx - shadow.pad * unit, dy - shadow.pad * unit + subjectSize * 0.035, shadow.canvas.width * unit, shadow.canvas.height * unit);
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(sources.cutout, dx, dy, dw, dh);
}

export class BatchRenderError extends Error {}

function assertBackground(sources: BatchSources, settings: BatchSettings) {
  if (settings.background.kind === "image" && !sources.backgroundImage) {
    throw new BatchRenderError(`The background image "${settings.background.name}" isn't loaded any more. Choose a background again.`);
  }
}

/**
 * Full-resolution export. The plan policy (watermark, size limit) is applied
 * here, so single downloads and ZIPs follow the same rules.
 */
export async function renderBatchBlob(
  sources: BatchSources,
  settings: BatchSettings,
  policy: ExportPolicy,
): Promise<{ blob: Blob; width: number; height: number }> {
  assertBackground(sources, settings);
  const size = canvasSize(settings, sources.width, sources.height);
  const out = applyPolicySize(size.width, size.height, policy);
  const check = checkExportSize(out.width, out.height);
  if (!check.ok) throw new BatchRenderError(check.message);
  let canvas: AnyCanvas;
  try {
    canvas = createCanvas(out.width, out.height);
  } catch {
    throw new BatchRenderError("This browser can't create an image that large. Try a smaller canvas size.");
  }
  const ctx = get2d(canvas, { alpha: settings.format !== "jpeg" });
  drawBatch(ctx, sources, settings, out.width / size.width);
  if (policy.watermark) drawWatermark(ctx, out.width, out.height);
  let blob: Blob;
  try {
    blob = await canvasToBlob(canvas, exportMime(settings), settings.format === "jpeg" ? 0.92 : undefined);
  } catch {
    throw new BatchRenderError("The browser couldn't encode an image this large. Try a smaller canvas size.");
  }
  return { blob, width: out.width, height: out.height };
}

/**
 * Card preview, drawn by the same function as the export (from a smaller
 * cutout), including the watermark when the plan adds one.
 */
export async function renderBatchPreview(sources: BatchSources, settings: BatchSettings, policy: ExportPolicy, maxSide = 520): Promise<Blob> {
  const size = canvasSize(settings, sources.width, sources.height);
  const k = Math.min(1, maxSide / Math.max(size.width, size.height));
  const w = Math.max(1, Math.round(size.width * k));
  const h = Math.max(1, Math.round(size.height * k));
  const canvas = createCanvas(w, h);
  const ctx = get2d(canvas);
  drawBatch(ctx, sources, settings, k);
  if (policy.watermark) drawWatermark(ctx, w, h);
  return canvasToBlob(canvas, "image/png");
}
