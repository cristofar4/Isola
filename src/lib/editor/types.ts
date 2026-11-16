import type { Rect } from "./geometry";

export type BackgroundSpec =
  | { kind: "transparent" }
  | { kind: "color"; color: string }
  | { kind: "image"; assetId: string; name: string };

export interface ShadowSpec {
  enabled: boolean;
  /** 0–1 */
  opacity: number;
  /** 0–100, relative to the output size. */
  softness: number;
  /** 0–100, relative to the output size. */
  distance: number;
  /** Degrees; 90 casts the shadow straight down. */
  angle: number;
  color: string;
}

export interface OutputSize {
  width: number;
  height: number;
}

/**
 * Everything adjustable about an image, kept apart from the original pixels
 * and the mask so edits stay non-destructive and cheap to undo.
 */
export interface EditSettings {
  feather: number;
  shift: number;
  background: BackgroundSpec;
  shadow: ShadowSpec;
  crop: Rect | null;
  /**
   * The ratio the crop is held to. Stored with the crop (not as a separate
   * UI choice) so undo and redo bring back the rectangle and the selected
   * ratio together.
   */
  cropAspect: AspectPreset;
  /** Explicit export size; null keeps the cropped (or original) size. */
  output: OutputSize | null;
}

export type AspectPreset = "free" | "original" | "1:1" | "4:5" | "3:2" | "16:9" | "9:16";

export function aspectRatioOf(aspect: AspectPreset, width: number, height: number): number | null {
  switch (aspect) {
    case "free":
      return null;
    case "original":
      return width / height;
    case "1:1":
      return 1;
    case "4:5":
      return 4 / 5;
    case "3:2":
      return 3 / 2;
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
  }
}

/**
 * A crop with `ratio`, as wide as the current crop where the image allows,
 * centred on the current crop (a 1:1 crop of a whole 1600 × 1200 photo is
 * 1200 × 1200). A crop that already has the ratio is kept as it is.
 */
export function cropForRatio(current: Rect, ratio: number, width: number, height: number): Rect {
  if (Math.abs(current.w / current.h - ratio) < 0.005) return current;
  let w = current.w;
  let h = w / ratio;
  if (h > height) {
    h = height;
    w = h * ratio;
  }
  if (w > width) {
    w = width;
    h = w / ratio;
  }
  w = Math.round(w);
  h = Math.round(h);
  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;
  const x = Math.round(Math.min(width - w, Math.max(0, cx - w / 2)));
  const y = Math.round(Math.min(height - h, Math.max(0, cy - h / 2)));
  return { x, y, w, h };
}

export const DEFAULT_SHADOW: ShadowSpec = {
  enabled: false,
  opacity: 0.35,
  softness: 30,
  distance: 12,
  angle: 90,
  color: "#20292D",
};

export const DEFAULT_SETTINGS: EditSettings = {
  feather: 0,
  shift: 0,
  background: { kind: "transparent" },
  shadow: DEFAULT_SHADOW,
  crop: null,
  cropAspect: "free",
  output: null,
};

export const BACKGROUND_SWATCHES = [
  "#FFFFFF",
  "#F5F6F3",
  "#20292D",
  "#4163F4",
  "#C9D8F2",
  "#F3D9C9",
  "#DCE8D4",
  "#F6E7A8",
] as const;

export function cropOf(settings: EditSettings, width: number, height: number): Rect {
  return settings.crop ?? { x: 0, y: 0, w: width, h: height };
}

export function outputSizeOf(settings: EditSettings, width: number, height: number): OutputSize {
  if (settings.output) return settings.output;
  const crop = cropOf(settings, width, height);
  return { width: Math.round(crop.w), height: Math.round(crop.h) };
}
