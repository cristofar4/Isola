import type { Rect } from "@/lib/editor/geometry";

/** Canvas presets. "framing" keeps the photo's own composition untouched. */
export type CanvasPreset = "framing" | "original" | "square" | "portrait" | "landscape" | "custom";

export type BatchBackground =
  | { kind: "transparent" }
  | { kind: "color"; color: string }
  | { kind: "image"; assetId: string; name: string };

export interface BatchSettings {
  background: BatchBackground;
  canvas: CanvasPreset;
  customSize: { width: number; height: number };
  fit: "contain" | "cover";
  /** Margin around the subject, as a percentage of the canvas's shorter side. */
  padding: number;
  align: { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 };
  shadow: boolean;
  format: "png" | "jpeg";
  keepNames: boolean;
}

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  background: { kind: "transparent" },
  canvas: "framing",
  customSize: { width: 2000, height: 2000 },
  fit: "contain",
  padding: 8,
  align: { x: 0.5, y: 0.5 },
  shadow: false,
  format: "png",
  keepNames: true,
};

export const BATCH_WHITE = "#FFFFFF";
export const BATCH_SOFT_GREY = "#EEEFEC";

export const CANVAS_LABEL: Record<CanvasPreset, string> = {
  framing: "Original framing",
  original: "Original size",
  square: "Square 1:1",
  portrait: "Portrait 4:5",
  landscape: "Landscape 3:2",
  custom: "Custom size",
};

export const MAX_CUSTOM_SIDE = 8000;

/** Output size in pixels. Presets keep the photo's longest side so nothing is needlessly downscaled. */
export function canvasSize(settings: BatchSettings, width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height);
  switch (settings.canvas) {
    case "framing":
    case "original":
      return { width, height };
    case "square":
      return { width: long, height: long };
    case "portrait":
      return { width: Math.round((long * 4) / 5), height: long };
    case "landscape":
      return { width: long, height: Math.round((long * 2) / 3) };
    case "custom": {
      const clamp = (v: number) => Math.min(MAX_CUSTOM_SIDE, Math.max(16, Math.round(v) || 16));
      return { width: clamp(settings.customSize.width), height: clamp(settings.customSize.height) };
    }
  }
}

export function usesLayout(settings: BatchSettings) {
  return settings.canvas !== "framing";
}

/**
 * Affine placement from image pixels to canvas pixels: X = tx + x·s, Y = ty + y·s.
 * With a layout preset the subject's bounding box is fitted inside the padded
 * canvas and aligned; with "framing" the photo is drawn as-is.
 */
export function placement(
  settings: BatchSettings,
  width: number,
  height: number,
  bounds: Rect | null,
  canvas: { width: number; height: number } = canvasSize(settings, width, height),
): { s: number; tx: number; ty: number } {
  if (!usesLayout(settings)) return { s: 1, tx: 0, ty: 0 };
  const subject = bounds ?? { x: 0, y: 0, w: width, h: height };
  const margin = (Math.min(40, Math.max(0, settings.padding)) / 100) * Math.min(canvas.width, canvas.height);
  const inner = { x: margin, y: margin, w: Math.max(1, canvas.width - 2 * margin), h: Math.max(1, canvas.height - 2 * margin) };
  const sx = inner.w / subject.w;
  const sy = inner.h / subject.h;
  const s = settings.fit === "contain" ? Math.min(sx, sy) : Math.max(sx, sy);
  const px = inner.x + (inner.w - subject.w * s) * settings.align.x;
  const py = inner.y + (inner.h - subject.h * s) * settings.align.y;
  return { s, tx: px - subject.x * s, ty: py - subject.y * s };
}

export function exportExtension(settings: BatchSettings) {
  return settings.format === "jpeg" ? "jpg" : "png";
}

/** File names for a set of exports; duplicates get a numeric suffix. */
export function exportName(original: string, settings: BatchSettings, used: Set<string>): string {
  const base = original.replace(/\.[^.]+$/, "").replace(/[^\w\- ]+/g, "").trim() || "image";
  const stem = settings.keepNames ? base : `${base}-isola`;
  const ext = exportExtension(settings);
  let candidate = `${stem}.${ext}`;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}.${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function formatLabel(settings: BatchSettings) {
  if (settings.format === "jpeg") return "JPEG";
  return settings.background.kind === "transparent" ? "PNG · Transparent" : "PNG · With background";
}
