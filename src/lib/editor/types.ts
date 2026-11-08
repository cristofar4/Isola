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
  /** Explicit export size; null keeps the cropped (or original) size. */
  output: OutputSize | null;
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
