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
  /** Space around the subject, as a percentage of the canvas's shorter side. */
  padding: number;
  align: { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 };
  shadow: boolean;
  format: "png" | "jpeg";
  /** JPEG has no transparency: transparent areas are filled with this colour. */
  matte: string;
  keepNames: boolean;
  /** Used when keepNames is off. Tokens: {name}, {n}, {project}. */
  namePattern: string;
}

export const DEFAULT_NAME_PATTERN = "{name}-isola";

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  background: { kind: "transparent" },
  canvas: "framing",
  customSize: { width: 2000, height: 2000 },
  fit: "contain",
  padding: 8,
  align: { x: 0.5, y: 0.5 },
  shadow: false,
  format: "png",
  matte: "#FFFFFF",
  keepNames: true,
  namePattern: DEFAULT_NAME_PATTERN,
};

/** Fill in fields added after a batch was saved, so older saved settings stay valid. */
export function normaliseSettings(value: Partial<BatchSettings> | null | undefined): BatchSettings {
  const s = { ...DEFAULT_BATCH_SETTINGS, ...(value ?? {}) };
  return {
    ...s,
    customSize: { ...DEFAULT_BATCH_SETTINGS.customSize, ...s.customSize },
    align: { ...DEFAULT_BATCH_SETTINGS.align, ...s.align },
    padding: Math.min(MAX_PADDING, Math.max(0, Math.round(Number(s.padding)) || 0)),
  };
}

export function sameSettings(a: BatchSettings, b: BatchSettings) {
  return JSON.stringify(normaliseSettings(a)) === JSON.stringify(normaliseSettings(b));
}

export const BATCH_WHITE = "#FFFFFF";
export const BATCH_SOFT_GREY = "#EEEFEC";
export const MAX_PADDING = 40;

/** "Product images" in the Tools menu: one consistent look for a catalogue. */
export const CATALOGUE_PRESET: BatchSettings = {
  ...DEFAULT_BATCH_SETTINGS,
  background: { kind: "color", color: BATCH_WHITE },
  canvas: "square",
  fit: "contain",
  padding: 10,
  align: { x: 0.5, y: 0.5 },
  shadow: false,
  format: "jpeg",
  matte: BATCH_WHITE,
  keepNames: true,
};

export const CANVAS_LABEL: Record<CanvasPreset, string> = {
  framing: "Original framing",
  original: "Original size, re-centred",
  square: "Square 1:1",
  portrait: "Portrait 4:5",
  landscape: "Landscape 3:2",
  custom: "Custom size",
};

export const MIN_CUSTOM_SIDE = 16;
export const MAX_CUSTOM_SIDE = 8000;

/** Problems with custom dimensions, or null when they're usable. */
export function customSizeError(size: { width: number; height: number }): string | null {
  for (const [label, v] of [["Width", size.width], ["Height", size.height]] as const) {
    if (!Number.isFinite(v) || v < MIN_CUSTOM_SIDE) return `${label} must be at least ${MIN_CUSTOM_SIDE}px.`;
    if (v > MAX_CUSTOM_SIDE) return `${label} can be at most ${MAX_CUSTOM_SIDE.toLocaleString("en-US")}px.`;
  }
  return null;
}

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
      const clamp = (v: number) => Math.min(MAX_CUSTOM_SIDE, Math.max(MIN_CUSTOM_SIDE, Math.round(v) || MIN_CUSTOM_SIDE));
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
  const margin = (Math.min(MAX_PADDING, Math.max(0, settings.padding)) / 100) * Math.min(canvas.width, canvas.height);
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

export function exportMime(settings: BatchSettings) {
  return settings.format === "jpeg" ? "image/jpeg" : "image/png";
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A file name stem that's safe on Windows, macOS and Linux. Keeps non-Latin letters. */
export function safeFileStem(name: string, fallback = "image") {
  const stem = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120)
    .trim();
  if (!stem) return fallback;
  return RESERVED.test(stem) ? `${stem}-${fallback}` : stem;
}

export interface NameContext {
  /** 1-based position of the image in the batch. */
  index: number;
  total: number;
  project: string;
}

/**
 * File name for one export; `used` tracks names already taken in the same
 * download (case-insensitively), and duplicates get a numeric suffix.
 */
export function exportName(original: string, settings: BatchSettings, used: Set<string>, ctx?: NameContext): string {
  const base = original.replace(/\.[^./\\]+$/, "");
  let stem: string;
  if (settings.keepNames) stem = safeFileStem(base);
  else {
    const n = ctx ? String(ctx.index).padStart(String(ctx.total).length, "0") : "1";
    const pattern = settings.namePattern.trim() || DEFAULT_NAME_PATTERN;
    stem = safeFileStem(
      pattern.replace(/\{name\}/g, base).replace(/\{n\}/g, n).replace(/\{project\}/g, ctx?.project ?? "batch"),
    );
  }
  const ext = exportExtension(settings);
  let candidate = `${stem}.${ext}`;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${stem}-${i}.${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

export function formatLabel(settings: BatchSettings) {
  if (settings.format === "jpeg") return "JPEG";
  return settings.background.kind === "transparent" ? "PNG · Transparent" : "PNG · With background";
}

export function sizeLabel(settings: BatchSettings) {
  switch (settings.canvas) {
    case "framing":
      return "Original resolution";
    case "original":
      return "Original size, re-centred";
    case "custom":
      return `${settings.customSize.width} × ${settings.customSize.height} px`;
    default:
      return CANVAS_LABEL[settings.canvas];
  }
}
