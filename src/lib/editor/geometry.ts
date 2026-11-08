export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clampRect(rect: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function expandRect(rect: Rect, pad: number, width: number, height: number): Rect {
  return clampRect({ x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 }, width, height)!;
}

export function readRect(src: Uint8Array, width: number, rect: Rect): Uint8Array {
  const out = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++) {
    const start = (rect.y + y) * width + rect.x;
    out.set(src.subarray(start, start + rect.w), y * rect.w);
  }
  return out;
}

export function writeRect(dst: Uint8Array, width: number, rect: Rect, data: Uint8Array) {
  for (let y = 0; y < rect.h; y++) {
    dst.set(data.subarray(y * rect.w, (y + 1) * rect.w), (rect.y + y) * width + rect.x);
  }
}
