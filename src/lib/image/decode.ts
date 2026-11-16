/**
 * Browser-side decoding. Produces the untouched original pixels that every
 * later step (cutout, restore brush, export) reads from.
 */

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Original RGBA pixels, never modified after decode. */
  pixels: Uint8ClampedArray;
  /** True when at least one pixel is not fully opaque. */
  hasAlpha: boolean;
  /** A 240px JPEG preview, when it was made alongside the decode. */
  thumb?: Blob;
}

export function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function get2d(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", options) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("This browser could not create a 2D canvas of that size.");
  return ctx;
}

/* ------------------------------------------------- decoding off the page -- */

let decoder: Worker | null = null;
let decoderBroken = false;
let nextDecode = 1;
const decodes = new Map<number, { resolve: (d: DecodedImage) => void; reject: (e: Error) => void }>();

function decodeWorker(): Worker | null {
  if (decoderBroken || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (decoder) return decoder;
  try {
    decoder = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module", name: "isola-decode" });
  } catch {
    decoderBroken = true;
    return null;
  }
  decoder.onmessage = (event: MessageEvent<import("./decode.worker").DecodeResponse>) => {
    const msg = event.data;
    const pending = decodes.get(msg.id);
    if (!pending) return;
    decodes.delete(msg.id);
    if (msg.ok) pending.resolve({ bitmap: msg.bitmap, width: msg.width, height: msg.height, pixels: msg.pixels, hasAlpha: msg.hasAlpha, thumb: msg.thumb });
    else pending.reject(new Error(msg.message));
  };
  decoder.onerror = () => {
    // The worker couldn't start here: decode on the page from now on, and retry what was waiting.
    decoderBroken = true;
    decoder?.terminate();
    decoder = null;
    const waiting = [...decodes.values()];
    decodes.clear();
    for (const p of waiting) p.reject(new Error("decode-worker-failed"));
  };
  return decoder;
}

/**
 * Decode a photo to its original pixels. Where the browser allows, the work
 * (decode, full-size pixel read-back and a thumbnail) happens in a worker, so
 * choosing a photo doesn't freeze the page on phones.
 */
export async function decodeImage(file: Blob): Promise<DecodedImage> {
  const worker = decodeWorker();
  if (worker) {
    try {
      return await new Promise<DecodedImage>((resolve, reject) => {
        const id = nextDecode++;
        decodes.set(id, { resolve, reject });
        worker.postMessage({ id, file, thumbSide: 240 });
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "decode-worker-failed") throw error;
    }
  }
  return decodeOnPage(file);
}

async function decodeOnPage(file: Blob): Promise<DecodedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      premultiplyAlpha: "none",
      colorSpaceConversion: "default",
    });
  } catch {
    throw new Error("The browser couldn't decode this image. It may be damaged.");
  }
  const { width, height } = bitmap;
  const canvas = createCanvas(width, height);
  const ctx = get2d(canvas, { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let hasAlpha = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 255) {
      hasAlpha = true;
      break;
    }
  }
  return { bitmap, width, height, pixels, hasAlpha };
}

/** Small preview used in lists and the filmstrip. */
export async function makeThumbnail(
  source: CanvasImageSource & { width: number; height: number },
  maxSide = 240,
  type: "image/png" | "image/jpeg" = "image/png",
): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = createCanvas(w, h);
  const ctx = get2d(canvas);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvasToBlob(canvas, type, 0.85);
}

export async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not encode this image."))),
      type,
      quality,
    ),
  );
}
