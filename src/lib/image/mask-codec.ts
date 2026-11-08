import { canvasToBlob, createCanvas, get2d } from "./decode";

/**
 * Masks are stored as opaque greyscale PNGs (value in R=G=B, alpha 255).
 * Keeping alpha at 255 avoids premultiplication, so values round-trip exactly,
 * and PNG compresses typical masks to a small fraction of their raw size.
 */
export async function encodeMask(mask: Uint8Array, width: number, height: number): Promise<Blob> {
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas);
  const image = ctx.createImageData(width, height);
  const d = image.data;
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    const v = mask[i];
    d[j] = v;
    d[j + 1] = v;
    d[j + 2] = v;
    d[j + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvasToBlob(canvas, "image/png");
}

export async function decodeMask(blob: Blob): Promise<{ mask: Uint8Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  const { width, height } = bitmap;
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas, { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) mask[i] = data[j];
  return { mask, width, height };
}
