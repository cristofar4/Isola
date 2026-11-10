/**
 * Measurements of an image's pixels, used by the asset library: its colour
 * palette (with plain colour names), a perceptual fingerprint for finding
 * duplicates, and the "smart tags" derived from them. Pure functions on RGBA
 * data, so they can be tested without a browser.
 */

export interface Swatch {
  hex: string;
  /** Share of the measured (opaque) pixels, 0–1. */
  share: number;
  name: string;
}

type RGB = [number, number, number];

/** Plain names people use for product colours. */
export const NAMED_COLOURS: Array<[string, RGB]> = [
  ["White", [246, 246, 244]],
  ["Ivory", [238, 232, 213]],
  ["Beige", [213, 195, 162]],
  ["Tan", [190, 150, 105]],
  ["Brown", [115, 75, 45]],
  ["Black", [24, 24, 26]],
  ["Grey", [128, 130, 132]],
  ["Silver", [192, 194, 198]],
  ["Red", [200, 40, 45]],
  ["Orange", [236, 125, 45]],
  ["Gold", [205, 165, 70]],
  ["Yellow", [238, 210, 60]],
  ["Green", [60, 145, 75]],
  ["Sage", [158, 172, 138]],
  ["Olive", [110, 115, 55]],
  ["Teal", [35, 135, 135]],
  ["Blue", [50, 95, 205]],
  ["Navy", [26, 38, 88]],
  ["Purple", [120, 70, 170]],
  ["Pink", [232, 145, 175]],
];

export function toHex([r, g, b]: RGB) {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function fromHex(hex: string): RGB {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Perceptual ("redmean") distance between two colours. */
export function colourDistance(a: RGB, b: RGB) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function colourName(rgb: RGB): string {
  let best = NAMED_COLOURS[0];
  let bestD = Infinity;
  for (const entry of NAMED_COLOURS) {
    const d = colourDistance(rgb, entry[1]);
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  return best[0];
}

/**
 * The main colours of an image (transparent pixels ignored): pixels are
 * grouped into coarse buckets, the busiest buckets win, and near-identical
 * winners are merged.
 */
export function palette(data: Uint8ClampedArray | Uint8Array, width: number, height: number, max = 5): Swatch[] {
  const total = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 40_000)));
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  let counted = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
      counted++;
    }
  }
  if (!counted) return [];
  const merged: Array<{ rgb: RGB; n: number }> = [];
  for (const b of [...buckets.values()].sort((a, c) => c.n - a.n)) {
    const rgb: RGB = [b.r / b.n, b.g / b.n, b.b / b.n];
    const near = merged.find((m) => colourDistance(m.rgb, rgb) < 60);
    if (near) {
      const n = near.n + b.n;
      near.rgb = [(near.rgb[0] * near.n + rgb[0] * b.n) / n, (near.rgb[1] * near.n + rgb[1] * b.n) / n, (near.rgb[2] * near.n + rgb[2] * b.n) / n];
      near.n = n;
    } else merged.push({ rgb, n: b.n });
  }
  return merged
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((m) => ({ hex: toHex(m.rgb), share: m.n / counted, name: colourName(m.rgb) }));
}

/** Share of pixels that are clearly see-through. */
export function transparency(data: Uint8ClampedArray | Uint8Array) {
  let clear = 0;
  const n = data.length / 4;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) clear++;
  return n ? clear / n : 0;
}

/**
 * 64-bit difference hash of an RGBA image (as 16 hex digits): the image is
 * reduced to 9×8 greys and each bit says whether a pixel is brighter than its
 * right-hand neighbour. Resized, re-compressed or re-saved copies of a photo
 * keep nearly the same hash. Transparent pixels count as white.
 */
export function differenceHash(data: Uint8ClampedArray | Uint8Array, width: number, height: number): string {
  const W = 9;
  const H = 8;
  const grey = new Float64Array(W * H);
  for (let gy = 0; gy < H; gy++) {
    const y0 = Math.floor((gy * height) / H);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / H));
    for (let gx = 0; gx < W; gx++) {
      const x0 = Math.floor((gx * width) / W);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / W));
      let sum = 0;
      let n = 0;
      const sy = Math.max(1, Math.floor((y1 - y0) / 8));
      const sx = Math.max(1, Math.floor((x1 - x0) / 8));
      for (let y = y0; y < y1; y += sy) {
        for (let x = x0; x < x1; x += sx) {
          const i = (y * width + x) * 4;
          const a = data[i + 3] / 255;
          const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += l * a + 255 * (1 - a);
          n++;
        }
      }
      grey[gy * W + gx] = sum / Math.max(1, n);
    }
  }
  let hex = "";
  for (let gy = 0; gy < H; gy++) {
    let byte = 0;
    for (let gx = 0; gx < 8; gx++) byte = (byte << 1) | (grey[gy * W + gx] > grey[gy * W + gx + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Number of differing bits between two hashes (0 = same picture). */
export function hashDistance(a: string, b: string) {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Hashes this close are treated as the same picture. */
export const DUPLICATE_DISTANCE = 6;

/** Tags worked out from the pixels: orientation, transparency, main colours and resolution. */
export function smartTags(info: { width: number; height: number; hasAlpha: boolean; swatches: Swatch[] }): string[] {
  const tags: string[] = [];
  const ratio = info.width / info.height;
  tags.push(ratio > 1.1 ? "Landscape" : ratio < 0.9 ? "Portrait" : "Square");
  if (info.hasAlpha) tags.push("Transparent");
  const names: string[] = [];
  for (const s of info.swatches) {
    if (s.share < 0.12 || names.includes(s.name)) continue;
    names.push(s.name);
    if (names.length === 2) break;
  }
  tags.push(...names);
  const long = Math.max(info.width, info.height);
  if (long >= 2000) tags.push("High resolution");
  else if (long < 800) tags.push("Low resolution");
  return tags;
}
