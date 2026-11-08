import type { Rect } from "./geometry";
import type { ImageLayers } from "./layers";
import { cropOf, type BackgroundSpec, type EditSettings } from "./types";

type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CompositeSources {
  width: number;
  height: number;
  original: CanvasImageSource;
  layers: ImageLayers | null;
  backgroundImage: (CanvasImageSource & { width: number; height: number }) | null;
}

export interface CompositeOptions {
  /** Replace the image's background setting (used by export). */
  background?: BackgroundSpec;
  /** Draw the untouched original instead of the result. */
  view?: "result" | "original";
}

/** Shadow geometry in image pixels, relative to the crop so it scales with output. */
export function shadowGeometry(settings: EditSettings, width: number, height: number) {
  const crop = cropOf(settings, width, height);
  const reference = Math.max(crop.w, crop.h);
  const blur = (settings.shadow.softness / 100) * 0.06 * reference;
  const distance = (settings.shadow.distance / 100) * 0.12 * reference;
  const rad = (settings.shadow.angle * Math.PI) / 180;
  return { blur, dx: Math.cos(rad) * distance, dy: Math.sin(rad) * distance };
}

function drawCover(
  ctx: AnyContext,
  image: CanvasImageSource & { width: number; height: number },
  dest: Rect,
) {
  const scale = Math.max(dest.w / image.width, dest.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, dest.x + (dest.w - w) / 2, dest.y + (dest.h - h) / 2, w, h);
}

/**
 * Draw the finished composite so the crop rectangle fills `dest`.
 * Used by both the on-screen preview and export, so what you see is what you
 * download. The transparency checkerboard is never drawn here.
 */
export function drawComposite(
  ctx: AnyContext,
  sources: CompositeSources,
  settings: EditSettings,
  dest: Rect,
  options: CompositeOptions = {},
) {
  const { width, height, layers } = sources;
  const crop = cropOf(settings, width, height);
  const sx = dest.w / crop.w;
  const sy = dest.h / crop.h;
  const toX = (x: number) => dest.x + (x - crop.x) * sx;
  const toY = (y: number) => dest.y + (y - crop.y) * sy;

  ctx.save();
  ctx.beginPath();
  ctx.rect(dest.x, dest.y, dest.w, dest.h);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (options.view === "original" || !layers) {
    ctx.drawImage(sources.original, crop.x, crop.y, crop.w, crop.h, dest.x, dest.y, dest.w, dest.h);
    ctx.restore();
    return;
  }

  const background = options.background ?? settings.background;
  if (background.kind === "color") {
    ctx.fillStyle = background.color;
    ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
  } else if (background.kind === "image" && sources.backgroundImage) {
    drawCover(ctx, sources.backgroundImage, dest);
  }

  if (settings.shadow.enabled && settings.shadow.opacity > 0) {
    const geometry = shadowGeometry(settings, width, height);
    const layer = layers.shadowLayer(geometry.blur, settings.shadow.color);
    const lw = layer.canvas.width;
    const lh = layer.canvas.height;
    const origin = -layer.pad * layer.scale;
    ctx.globalAlpha = settings.shadow.opacity;
    ctx.drawImage(
      layer.canvas,
      0,
      0,
      lw,
      lh,
      toX(origin + geometry.dx),
      toY(origin + geometry.dy),
      lw * layer.scale * sx,
      lh * layer.scale * sy,
    );
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(layers.cutout, crop.x, crop.y, crop.w, crop.h, dest.x, dest.y, dest.w, dest.h);
  ctx.restore();
}
