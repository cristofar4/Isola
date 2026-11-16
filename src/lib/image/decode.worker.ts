/// <reference lib="webworker" />

/**
 * Decodes a photo off the main thread: the browser decode, the full-size
 * pixel read-back (about 48 MB for a 12 MP phone photo) and the thumbnail.
 * Doing this on the page's thread made phones stall for a moment every time
 * a photo was chosen.
 */

export type DecodeRequest = { id: number; file: Blob; thumbSide: number };
export type DecodeResponse =
  | { id: number; ok: true; bitmap: ImageBitmap; width: number; height: number; pixels: Uint8ClampedArray; hasAlpha: boolean; thumb: Blob }
  | { id: number; ok: false; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<DecodeRequest>) => {
  const { id, file, thumbSide } = event.data;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image", premultiplyAlpha: "none", colorSpaceConversion: "default" });
  } catch {
    scope.postMessage({ id, ok: false, message: "The browser couldn't decode this image. It may be damaged." } satisfies DecodeResponse);
    return;
  }
  try {
    const { width, height } = bitmap;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("This browser could not create a 2D canvas of that size.");
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height).data;
    let hasAlpha = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] !== 255) {
        hasAlpha = true;
        break;
      }
    }
    const scale = Math.min(1, thumbSide / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * scale));
    const th = Math.max(1, Math.round(height * scale));
    const small = new OffscreenCanvas(tw, th);
    const sctx = small.getContext("2d");
    if (!sctx) throw new Error("This browser could not create a 2D canvas.");
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(bitmap, 0, 0, tw, th);
    const thumb = await small.convertToBlob({ type: "image/jpeg", quality: 0.85 });
    // The pixels and the bitmap move to the page without being copied.
    scope.postMessage({ id, ok: true, bitmap, width, height, pixels, hasAlpha, thumb } satisfies DecodeResponse, [pixels.buffer, bitmap]);
  } catch (error) {
    bitmap.close();
    scope.postMessage({ id, ok: false, message: error instanceof Error ? error.message : "The image couldn't be read." } satisfies DecodeResponse);
  }
};
