import { exportLimits } from "@/lib/config";
import { canvasToBlob, createCanvas, get2d } from "@/lib/image/decode";
import { drawComposite, type CompositeSources } from "./compose";
import type { BackgroundSpec, EditSettings } from "./types";

export type ExportFormat = "png-transparent" | "png-background" | "jpeg";

export interface ExportRequest {
  format: ExportFormat;
  width: number;
  height: number;
  /** Background for png-background and jpeg. Ignored for png-transparent. */
  background: BackgroundSpec;
  /** JPEG quality, 0–1. */
  quality: number;
}

export interface ExportCheck {
  ok: boolean;
  message?: string;
}

export function checkExportSize(width: number, height: number): ExportCheck {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return { ok: false, message: "Enter a width and height of at least 1px." };
  }
  if (width > exportLimits.maxDimension || height > exportLimits.maxDimension) {
    return { ok: false, message: `Each side can be at most ${exportLimits.maxDimension.toLocaleString("en-US")}px.` };
  }
  if ((width * height) / 1e6 > exportLimits.maxMegapixels) {
    return { ok: false, message: `Exports are limited to ${exportLimits.maxMegapixels} MP.` };
  }
  return { ok: true };
}

export function mimeFor(format: ExportFormat) {
  return format === "jpeg" ? "image/jpeg" : "image/png";
}

export function exportFileName(name: string, format: ExportFormat) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "").trim() || "image";
  return `${base}-isola.${format === "jpeg" ? "jpg" : "png"}`;
}

/**
 * Render the composite at the requested resolution (not the preview size) and
 * encode it. The checkerboard is a preview-only affordance and never appears
 * here: transparent regions stay genuinely transparent in PNGs.
 */
export async function renderExport(
  sources: CompositeSources,
  settings: EditSettings,
  request: ExportRequest,
): Promise<Blob> {
  const width = Math.round(request.width);
  const height = Math.round(request.height);
  const check = checkExportSize(width, height);
  if (!check.ok) throw new Error(check.message);
  if (!sources.layers) throw new Error("Remove the background before exporting.");

  let background: BackgroundSpec;
  if (request.format === "png-transparent") background = { kind: "transparent" };
  else background = request.background;
  if (request.format === "jpeg" && background.kind === "transparent") {
    throw new Error("JPEG can't store transparency. Choose a background colour.");
  }

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  try {
    canvas = createCanvas(width, height);
  } catch {
    throw new Error("This browser can't create an image that large. Try a smaller size.");
  }
  const ctx = get2d(canvas, { alpha: request.format !== "jpeg" });
  if (request.format === "jpeg") {
    // Guarantee an opaque base even if a background image has transparent areas.
    ctx.fillStyle = background.kind === "color" ? background.color : "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  drawComposite(ctx, sources, settings, { x: 0, y: 0, w: width, h: height }, { background });
  try {
    return await canvasToBlob(canvas, mimeFor(request.format), request.format === "jpeg" ? request.quality : undefined);
  } catch {
    throw new Error("The browser couldn't encode an image this large. Try a smaller size.");
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
