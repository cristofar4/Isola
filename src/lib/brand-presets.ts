import { BATCH_WHITE, DEFAULT_BATCH_SETTINGS, MAX_PADDING, normaliseSettings, type BatchSettings } from "@/lib/batch/settings";

/**
 * Brand presets: a named look for every image (canvas, padding, background,
 * shadow, alignment, format) plus the brand's colours. They're saved to the
 * account, so the same look is available on every device. No images are stored.
 */
export const BRAND_CANVASES = ["square", "portrait", "landscape", "original", "framing"] as const;
export type BrandCanvas = (typeof BRAND_CANVASES)[number];

export const BRAND_CANVAS_LABEL: Record<BrandCanvas, string> = {
  square: "1:1 (Square)",
  portrait: "4:5 (Portrait)",
  landscape: "3:2 (Landscape)",
  original: "Photo size, re-centred",
  framing: "Keep the photo's framing",
};

export interface BrandColor {
  name: string;
  hex: string;
}

export type BrandBackground = { kind: "transparent" } | { kind: "white" } | { kind: "brand"; index: number };

export interface BrandLayout {
  canvas: BrandCanvas;
  padding: number;
  shadow: boolean;
  background: BrandBackground;
  align: { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 };
  format: "png" | "jpeg";
}

export interface BrandPresetInput {
  name: string;
  colors: BrandColor[];
  layout: BrandLayout;
  isDefault?: boolean;
}

export interface BrandPreset extends BrandPresetInput {
  id: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const MAX_PRESETS = 20;
export const MAX_COLORS = 6;

/** Starting point for a new preset; every value can be changed. */
export const STARTER_PRESET: BrandPresetInput = {
  name: "My brand",
  colors: [
    { name: "Ivory", hex: "#F8F6EE" },
    { name: "Midnight", hex: "#17212C" },
    { name: "Periwinkle", hex: "#4F63F5" },
  ],
  layout: { canvas: "square", padding: 12, shadow: true, background: { kind: "brand", index: 0 }, align: { x: 0.5, y: 0.5 }, format: "png" },
};

const HEX = /^#[0-9a-f]{6}$/i;
const ALIGN = new Set([0, 0.5, 1]);

/** Checks untrusted input (from the API) and returns a clean preset or the problems in words. */
export function validatePreset(input: unknown): { ok: true; value: BrandPresetInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const v = (input ?? {}) as Record<string, unknown>;
  const name = typeof v.name === "string" ? v.name.trim().replace(/\s+/g, " ") : "";
  if (!name) errors.push("Give the preset a name.");
  else if (name.length > 60) errors.push("Use at most 60 characters for the name.");

  const rawColors = Array.isArray(v.colors) ? v.colors : [];
  if (!Array.isArray(v.colors)) errors.push("Colours must be a list.");
  if (rawColors.length > MAX_COLORS) errors.push(`Use at most ${MAX_COLORS} colours.`);
  const colors: BrandColor[] = [];
  rawColors.slice(0, MAX_COLORS).forEach((c, i) => {
    const cc = (c ?? {}) as Record<string, unknown>;
    const hex = typeof cc.hex === "string" ? cc.hex.trim() : "";
    const cname = typeof cc.name === "string" ? cc.name.trim().slice(0, 30) : "";
    if (!HEX.test(hex)) errors.push(`Colour ${i + 1} must be a hex colour like #4F63F5.`);
    else colors.push({ name: cname || `Colour ${i + 1}`, hex: hex.toUpperCase() });
  });

  const l = (v.layout ?? {}) as Record<string, unknown>;
  const canvas = BRAND_CANVASES.includes(l.canvas as BrandCanvas) ? (l.canvas as BrandCanvas) : null;
  if (!canvas) errors.push("Choose a canvas.");
  const padding = Number(l.padding);
  if (!Number.isInteger(padding) || padding < 0 || padding > MAX_PADDING) errors.push(`Padding must be a whole number from 0 to ${MAX_PADDING}.`);
  if (typeof l.shadow !== "boolean") errors.push("Shadow must be on or off.");
  const format = l.format === "png" || l.format === "jpeg" ? l.format : null;
  if (!format) errors.push("Format must be PNG or JPEG.");
  const a = (l.align ?? {}) as Record<string, unknown>;
  const align = ALIGN.has(Number(a.x)) && ALIGN.has(Number(a.y)) ? { x: Number(a.x) as 0 | 0.5 | 1, y: Number(a.y) as 0 | 0.5 | 1 } : null;
  if (!align) errors.push("Alignment must be left, centre or right, and top, middle or bottom.");
  const b = (l.background ?? {}) as Record<string, unknown>;
  let background: BrandBackground | null = null;
  if (b.kind === "transparent" || b.kind === "white") background = { kind: b.kind };
  else if (b.kind === "brand") {
    const index = Number(b.index);
    if (Number.isInteger(index) && index >= 0 && index < colors.length) background = { kind: "brand", index };
    else errors.push("The background must be one of the preset's colours.");
  } else errors.push("Choose a background.");
  if (background?.kind === "transparent" && format === "jpeg") errors.push("JPEG can't be transparent: choose PNG or a background colour.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, colors, layout: { canvas: canvas!, padding, shadow: l.shadow as boolean, background: background!, align: align!, format: format! }, isDefault: v.isDefault === true },
  };
}

/** The colour behind the product, or null when it's transparent. */
export function backgroundHex(layout: BrandLayout, colors: BrandColor[]): string | null {
  if (layout.background.kind === "white") return BATCH_WHITE;
  if (layout.background.kind === "brand") return colors[layout.background.index]?.hex ?? BATCH_WHITE;
  return null;
}

/** Batch Studio settings for a preset. Naming stays as it was. */
export function presetToBatchSettings(preset: Pick<BrandPresetInput, "colors" | "layout">, base: BatchSettings = DEFAULT_BATCH_SETTINGS): BatchSettings {
  const hex = backgroundHex(preset.layout, preset.colors);
  return normaliseSettings({
    ...base,
    canvas: preset.layout.canvas,
    fit: "contain",
    padding: preset.layout.padding,
    shadow: preset.layout.shadow,
    align: preset.layout.align,
    format: preset.layout.format,
    background: hex ? { kind: "color", color: hex } : { kind: "transparent" },
    matte: hex ?? BATCH_WHITE,
  });
}

export function describeLayout(layout: BrandLayout, colors: BrandColor[]) {
  const bg = layout.background.kind === "transparent" ? "transparent" : layout.background.kind === "white" ? "white" : (colors[layout.background.index]?.name ?? "brand colour");
  return `${BRAND_CANVAS_LABEL[layout.canvas]}, ${layout.padding}% padding, ${bg} background, ${layout.shadow ? "soft shadow" : "no shadow"}, ${layout.format.toUpperCase()}`;
}
