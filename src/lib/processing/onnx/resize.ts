/**
 * Bilinear resampling of a single-channel 8-bit mask, sampling at pixel
 * centres so the upscaled mask stays aligned with the original image.
 */
export function resizeMaskBilinear(
  src: Uint8Array,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
): Uint8Array {
  const dst = new Uint8Array(dw * dh);
  if (sw === dw && sh === dh) {
    dst.set(src);
    return dst;
  }
  const x0 = new Int32Array(dw);
  const x1 = new Int32Array(dw);
  const fx = new Float32Array(dw);
  const scaleX = sw / dw;
  for (let x = 0; x < dw; x++) {
    let s = (x + 0.5) * scaleX - 0.5;
    if (s < 0) s = 0;
    const i = Math.min(sw - 1, Math.floor(s));
    x0[x] = i;
    x1[x] = Math.min(sw - 1, i + 1);
    fx[x] = Math.min(1, s - i);
  }
  const scaleY = sh / dh;
  for (let y = 0; y < dh; y++) {
    let s = (y + 0.5) * scaleY - 0.5;
    if (s < 0) s = 0;
    const j = Math.min(sh - 1, Math.floor(s));
    const j1 = Math.min(sh - 1, j + 1);
    const fy = Math.min(1, s - j);
    const r0 = j * sw;
    const r1 = j1 * sw;
    const out = y * dw;
    for (let x = 0; x < dw; x++) {
      const a = src[r0 + x0[x]];
      const b = src[r0 + x1[x]];
      const c = src[r1 + x0[x]];
      const d = src[r1 + x1[x]];
      const t = fx[x];
      const top = a + (b - a) * t;
      const bottom = c + (d - c) * t;
      dst[out + x] = (top + (bottom - top) * fy + 0.5) | 0;
    }
  }
  return dst;
}
