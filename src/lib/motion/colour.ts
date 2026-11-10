/**
 * Colour adjustments and scopes, computed on real pixels.
 *
 * Adjustments never change source files: they're applied while a frame is
 * drawn, to one layer, to the background layers or to the whole frame. The
 * same function grades the preview and the export, so they match.
 */

import { isNeutral, type ColourAdjust } from "./model";

const toLinear = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLinear[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const LIN_STEPS = 4096;
const fromLinear = new Uint8ClampedArray(LIN_STEPS + 1);
for (let i = 0; i <= LIN_STEPS; i++) {
  const c = i / LIN_STEPS;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  fromLinear[i] = Math.round(s * 255);
}

/**
 * Per-channel lookup tables for the parts that act on each channel alone:
 * exposure (in linear light), white balance (temperature and tint) and
 * contrast (around mid-grey).
 */
function channelTables(a: ColourAdjust) {
  const gain = Math.pow(2, a.exposure);
  const wb = [1 + 0.12 * a.temperature, 1 - 0.1 * a.tint, 1 - 0.12 * a.temperature];
  const k = 1 + a.contrast;
  return wb.map((w) => {
    const t = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const lin = Math.min(1, toLinear[i] * gain * w);
      let s = fromLinear[Math.round(lin * LIN_STEPS)] / 255;
      s = (s - 0.5) * k + 0.5;
      t[i] = Math.round(Math.min(1, Math.max(0, s)) * 255);
    }
    return t;
  });
}

/** Grade RGBA pixels in place. Alpha is left as it is. */
export function applyColour(data: Uint8ClampedArray, a: ColourAdjust) {
  if (isNeutral(a)) return;
  const [tr, tg, tb] = channelTables(a);
  const sat = 1 + a.saturation;
  const hi = a.highlights * 0.35;
  const sh = a.shadows * 0.35;
  const toneOnly = Math.abs(hi) < 1e-4 && Math.abs(sh) < 1e-4 && Math.abs(a.saturation) < 1e-4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = tr[data[i]];
    let g = tg[data[i + 1]];
    let b = tb[data[i + 2]];
    if (!toneOnly) {
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      // Highlights act on bright tones, shadows on dark ones, smoothly.
      const lift = (hi * l * l + sh * (1 - l) * (1 - l)) * 255;
      r += lift;
      g += lift;
      b += lift;
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = L + (r - L) * sat;
      g = L + (g - L) * sat;
      b = L + (b - L) * sat;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

/** Combine two adjustments (layer grade on top of the background grade). */
export function combine(a: ColourAdjust, b: ColourAdjust): ColourAdjust {
  const out = { ...a };
  for (const k of Object.keys(b) as Array<keyof ColourAdjust>) out[k] = Math.max(-2, Math.min(2, a[k] + b[k]));
  return out;
}

/* ----------------------------------------------------------------- scopes --- */

export interface Scopes {
  /** RGB parade: for each channel, columns × 64 levels of pixel counts (normalised 0..1). */
  parade: { width: number; levels: number; r: Float32Array; g: Float32Array; b: Float32Array };
  /** 0..255 luma histogram (normalised 0..1). */
  histogram: Float32Array;
  /** Share of pixels clipped at black (all channels ≤ 2) and white (all ≥ 253). */
  clipped: { black: number; white: number };
}

/** Scopes from a frame's pixels (downscale the frame first; 256 px wide is plenty). */
export function computeScopes(data: Uint8ClampedArray, width: number, height: number, columns = 128, levels = 64): Scopes {
  const r = new Float32Array(columns * levels);
  const g = new Float32Array(columns * levels);
  const b = new Float32Array(columns * levels);
  const hist = new Float32Array(256);
  let black = 0;
  let white = 0;
  const px = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const col = Math.min(columns - 1, Math.floor((x / width) * columns));
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];
      r[col * levels + Math.min(levels - 1, (R * levels) >> 8)]++;
      g[col * levels + Math.min(levels - 1, (G * levels) >> 8)]++;
      b[col * levels + Math.min(levels - 1, (B * levels) >> 8)]++;
      hist[Math.round(0.2126 * R + 0.7152 * G + 0.0722 * B)]++;
      if (R <= 2 && G <= 2 && B <= 2) black++;
      else if (R >= 253 && G >= 253 && B >= 253) white++;
    }
  }
  const norm = (arr: Float32Array) => {
    let max = 0;
    for (const v of arr) max = Math.max(max, v);
    if (max > 0) for (let i = 0; i < arr.length; i++) arr[i] = Math.sqrt(arr[i] / max);
  };
  [r, g, b, hist].forEach(norm);
  return { parade: { width: columns, levels, r, g, b }, histogram: hist, clipped: { black: px ? black / px : 0, white: px ? white / px : 0 } };
}
