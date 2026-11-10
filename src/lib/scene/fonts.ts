"use client";

import { creativeCondensed, creativeSerif } from "@/lib/creative-fonts";
import type { FontFamilies } from "./draw";
import { FONT_WEIGHTS, type FontId } from "./model";

/** The CSS font-family list for each font id, as loaded on this page. */
export function fontFamilies(): FontFamilies {
  const css = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const inter = css?.getPropertyValue("--font-inter").trim() || "Inter, ui-sans-serif, system-ui, sans-serif";
  const tight = css?.getPropertyValue("--font-inter-tight").trim() || inter;
  return {
    family: {
      sans: `${inter}, ui-sans-serif, system-ui, sans-serif`,
      display: `${tight}, ${inter}, ui-sans-serif, sans-serif`,
      serif: `${creativeSerif.style.fontFamily}, Georgia, serif`,
      condensed: `${creativeCondensed.style.fontFamily}, Impact, sans-serif`,
    },
  };
}

/**
 * Waits until the fonts (and weights) a render needs are loaded, so canvas
 * text never draws in a fallback font first. Resolves false if a font could
 * not be loaded (the render then uses the fallback in the family list).
 */
export async function ensureFonts(used: Array<{ font: FontId; weight: number }>): Promise<boolean> {
  if (typeof document === "undefined" || !document.fonts) return false;
  const fonts = fontFamilies();
  const seen = new Set<string>();
  const loads: Array<Promise<unknown>> = [];
  for (const { font, weight } of used) {
    const w = FONT_WEIGHTS[font].includes(weight) ? weight : FONT_WEIGHTS[font][0];
    const spec = `${w} 48px ${fonts.family[font]}`;
    if (seen.has(spec)) continue;
    seen.add(spec);
    loads.push(document.fonts.load(spec));
  }
  try {
    const results = await Promise.all(loads);
    return results.every((r) => Array.isArray(r) && r.length > 0);
  } catch {
    return false;
  }
}

/** Class names that declare the creative fonts' CSS variables (put on a wrapper so the @font-face rules are in use). */
export const creativeFontClasses = `${creativeSerif.variable} ${creativeCondensed.variable}`;
