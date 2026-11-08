/**
 * Pure mask operations. Masks are single-channel Uint8Arrays (0 = background,
 * 255 = subject) at the original image resolution.
 */

import { expandRect, type Rect } from "./geometry";

export interface Refinement {
  /** Grow (+) or shrink (−) the mask edge, in image pixels. */
  shift: number;
  /** Edge softness, approximately the Gaussian sigma in image pixels. */
  feather: number;
}

/** How far outside a region the refinement can read. */
export function refinementReach(refine: Refinement): number {
  return Math.abs(Math.round(refine.shift)) + 3 * Math.round(refine.feather);
}

/* ---------------------------------------------------------------- blur ---- */

function boxBlurHorizontal(src: Uint8Array, dst: Uint8Array, w: number, h: number, r: number) {
  const inv = 1 / (2 * r + 1);
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = (r + 1) * src[row];
    for (let k = 1; k <= r; k++) sum += src[row + Math.min(k, last)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = (sum * inv + 0.5) | 0;
      sum += src[row + Math.min(x + r + 1, last)] - src[row + Math.max(x - r, 0)];
    }
  }
}

function boxBlurVertical(
  src: Uint8Array,
  dst: Uint8Array,
  w: number,
  h: number,
  r: number,
  sums: Int32Array,
) {
  const inv = 1 / (2 * r + 1);
  const last = h - 1;
  for (let x = 0; x < w; x++) {
    let s = (r + 1) * src[x];
    for (let k = 1; k <= r; k++) s += src[Math.min(k, last) * w + x];
    sums[x] = s;
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const add = Math.min(y + r + 1, last) * w;
    const sub = Math.max(y - r, 0) * w;
    for (let x = 0; x < w; x++) {
      dst[row + x] = (sums[x] * inv + 0.5) | 0;
      sums[x] += src[add + x] - src[sub + x];
    }
  }
}

/** Three box-blur passes approximate a Gaussian with sigma ≈ radius. In place. */
export function blurInPlace(data: Uint8Array, w: number, h: number, radius: number) {
  const r = Math.round(radius);
  if (r <= 0 || w === 0 || h === 0) return;
  const tmp = new Uint8Array(data.length);
  const sums = new Int32Array(w);
  for (let pass = 0; pass < 3; pass++) {
    boxBlurHorizontal(data, tmp, w, h, r);
    boxBlurVertical(tmp, data, w, h, r, sums);
  }
}

/* ---------------------------------------------------------- morphology ---- */

/**
 * Sliding-window max/min over a line with edge replication, using the
 * van Herk/Gil-Werman algorithm (O(n) regardless of radius).
 */
function slidingExtreme(
  line: Uint8Array,
  n: number,
  r: number,
  out: Uint8Array,
  isMax: boolean,
  padded: Uint8Array,
  g: Uint8Array,
  hArr: Uint8Array,
) {
  const k = 2 * r + 1;
  const len = n + 2 * r;
  for (let i = 0; i < len; i++) padded[i] = line[Math.min(n - 1, Math.max(0, i - r))];
  for (let i = 0; i < len; i++) {
    if (i % k === 0) g[i] = padded[i];
    else g[i] = isMax ? Math.max(g[i - 1], padded[i]) : Math.min(g[i - 1], padded[i]);
  }
  for (let i = len - 1; i >= 0; i--) {
    if (i === len - 1 || i % k === k - 1) hArr[i] = padded[i];
    else hArr[i] = isMax ? Math.max(hArr[i + 1], padded[i]) : Math.min(hArr[i + 1], padded[i]);
  }
  for (let i = 0; i < n; i++) {
    const a = hArr[i];
    const b = g[i + 2 * r];
    out[i] = isMax ? (a > b ? a : b) : a < b ? a : b;
  }
}

/** Grow (amount > 0) or shrink (amount < 0) the mask with a square element. In place. */
export function morphInPlace(data: Uint8Array, w: number, h: number, amount: number) {
  const r = Math.abs(Math.round(amount));
  if (r === 0) return;
  const isMax = amount > 0;
  const maxLen = Math.max(w, h);
  const line = new Uint8Array(maxLen);
  const out = new Uint8Array(maxLen);
  const padded = new Uint8Array(maxLen + 2 * r);
  const g = new Uint8Array(maxLen + 2 * r);
  const hh = new Uint8Array(maxLen + 2 * r);
  for (let y = 0; y < h; y++) {
    const row = data.subarray(y * w, y * w + w);
    slidingExtreme(row, w, r, out, isMax, padded, g, hh);
    row.set(out.subarray(0, w));
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) line[y] = data[y * w + x];
    slidingExtreme(line, h, r, out, isMax, padded, g, hh);
    for (let y = 0; y < h; y++) data[y * w + x] = out[y];
  }
}

/* ---------------------------------------------------------- refinement ---- */

/**
 * Compute the refined mask for `rect`. Reads a window large enough that the
 * result is identical to refining the whole mask and cropping, so brush
 * strokes can update small regions exactly.
 */
export function refineRegion(
  mask: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  refine: Refinement,
): Uint8Array {
  const reach = refinementReach(refine);
  const out = new Uint8Array(rect.w * rect.h);
  if (reach === 0) {
    for (let y = 0; y < rect.h; y++) {
      const start = (rect.y + y) * width + rect.x;
      out.set(mask.subarray(start, start + rect.w), y * rect.w);
    }
    return out;
  }
  const win = expandRect(rect, reach, width, height);
  const buf = new Uint8Array(win.w * win.h);
  for (let y = 0; y < win.h; y++) {
    const start = (win.y + y) * width + win.x;
    buf.set(mask.subarray(start, start + win.w), y * win.w);
  }
  if (Math.round(refine.shift) !== 0) morphInPlace(buf, win.w, win.h, refine.shift);
  if (Math.round(refine.feather) > 0) blurInPlace(buf, win.w, win.h, refine.feather);
  const ox = rect.x - win.x;
  const oy = rect.y - win.y;
  for (let y = 0; y < rect.h; y++) {
    const start = (oy + y) * win.w + ox;
    out.set(buf.subarray(start, start + rect.w), y * rect.w);
  }
  return out;
}

/* --------------------------------------------------------------- brush ---- */

export type BrushMode = "restore" | "erase";

export interface StrokeBuffers {
  /** Highest coverage applied to each pixel during the current stroke. */
  coverage: Uint8Array;
  /** Mask value before the stroke first touched each pixel. */
  base: Uint8Array;
}

export function createStrokeBuffers(size: number): StrokeBuffers {
  return { coverage: new Uint8Array(size), base: new Uint8Array(size) };
}

/**
 * Stamp one round dab. Coverage within a stroke uses the maximum rather than
 * accumulating, so overlapping dabs don't harden soft edges.
 * Restore pulls the mask towards 255 (bringing back original pixels); erase
 * pulls it towards 0. Returns the touched rectangle.
 */
export function stampDab(
  mask: Uint8Array,
  width: number,
  height: number,
  buffers: StrokeBuffers,
  cx: number,
  cy: number,
  radius: number,
  hardness: number,
  mode: BrushMode,
): Rect | null {
  const r = Math.max(0.5, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(width, Math.ceil(cx + r));
  const y1 = Math.min(height, Math.ceil(cy + r));
  if (x1 <= x0 || y1 <= y0) return null;
  const inner = Math.max(0, Math.min(r * Math.min(1, Math.max(0, hardness)), r - 1));
  const span = r - inner;
  const target = mode === "restore" ? 255 : 0;
  const { coverage, base } = buffers;
  for (let y = y0; y < y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r) continue;
      let a: number;
      if (d <= inner) a = 1;
      else {
        const t = (r - d) / span;
        a = t * t * (3 - 2 * t);
      }
      const cov = (a * 255 + 0.5) | 0;
      const i = y * width + x;
      if (cov <= coverage[i]) continue;
      if (coverage[i] === 0) base[i] = mask[i];
      coverage[i] = cov;
      const b = base[i];
      mask[i] = (b + ((target - b) * cov) / 255 + 0.5) | 0;
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Dabs along a segment, spaced to give a continuous stroke. */
export function stampSegment(
  mask: Uint8Array,
  width: number,
  height: number,
  buffers: StrokeBuffers,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  hardness: number,
  mode: BrushMode,
): Rect | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const spacing = Math.max(0.5, radius * 0.18);
  const steps = Math.max(1, Math.ceil(dist / spacing));
  let dirty: Rect | null = null;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const r = stampDab(mask, width, height, buffers, from.x + dx * t, from.y + dy * t, radius, hardness, mode);
    if (r) {
      if (!dirty) dirty = r;
      else {
        const x = Math.min(dirty.x, r.x);
        const y = Math.min(dirty.y, r.y);
        dirty = { x, y, w: Math.max(dirty.x + dirty.w, r.x + r.w) - x, h: Math.max(dirty.y + dirty.h, r.y + r.h) - y };
      }
    }
  }
  return dirty;
}

/** Collect undo/redo patches for a finished stroke and reset the stroke buffers. */
export function finishStroke(
  mask: Uint8Array,
  width: number,
  buffers: StrokeBuffers,
  rect: Rect,
): { before: Uint8Array; after: Uint8Array; changed: boolean } {
  const before = new Uint8Array(rect.w * rect.h);
  const after = new Uint8Array(rect.w * rect.h);
  let changed = false;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const i = (rect.y + y) * width + rect.x + x;
      const j = y * rect.w + x;
      const now = mask[i];
      const was = buffers.coverage[i] > 0 ? buffers.base[i] : now;
      before[j] = was;
      after[j] = now;
      if (was !== now) changed = true;
      buffers.coverage[i] = 0;
    }
  }
  return { before, after, changed };
}

/* -------------------------------------------------------------- analysis -- */

/** Bounding box of pixels above `threshold`, or null if the mask is empty. */
export function maskBounds(mask: Uint8Array, width: number, height: number, threshold = 10): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let rowMin = -1;
    let rowMax = -1;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] > threshold) {
        if (rowMin < 0) rowMin = x;
        rowMax = x;
      }
    }
    if (rowMin >= 0) {
      if (rowMin < minX) minX = rowMin;
      if (rowMax > maxX) maxX = rowMax;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Area-average downsample by an integer factor. */
export function downsample(mask: Uint8Array, width: number, height: number, factor: number) {
  const f = Math.max(1, Math.floor(factor));
  const w = Math.max(1, Math.ceil(width / f));
  const h = Math.max(1, Math.ceil(height / f));
  if (f === 1) return { data: mask.slice(), width, height };
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy0 = y * f;
    const sy1 = Math.min(height, sy0 + f);
    for (let x = 0; x < w; x++) {
      const sx0 = x * f;
      const sx1 = Math.min(width, sx0 + f);
      let sum = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const row = sy * width;
        for (let sx = sx0; sx < sx1; sx++) sum += mask[row + sx];
      }
      out[y * w + x] = (sum / ((sy1 - sy0) * (sx1 - sx0)) + 0.5) | 0;
    }
  }
  return { data: out, width: w, height: h };
}
