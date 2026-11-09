import "server-only";

import type { InferenceSession } from "onnxruntime-node";
import sharp, { type Sharp } from "sharp";
import { uploadLimits } from "@/lib/config";
import { applyPolicySize, type ExportPolicy } from "@/lib/plan-policy";
import { MODELS } from "@/lib/processing/models";
import { resizeMaskBilinear } from "@/lib/processing/onnx/resize";
import { normalisePixels, outputToMask } from "@/lib/processing/segmentation";
import { autoDownloadEnabled, downloadModel, localModelPath } from "./models";

/**
 * Server-side background removal for the public API: the Standard model
 * (IS-Net) on ONNX Runtime for Node, with the same normalisation, output
 * conversion and mask upscaling as the in-browser engine. One image is
 * processed at a time; others wait in a short queue.
 */

export const API_MODEL = MODELS["isnet-general-use"];

export class SegmenterError extends Error {
  constructor(
    public code: "model_unavailable" | "server_busy" | "decode_failed" | "image_too_large" | "internal_error",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

let sessionPromise: Promise<InferenceSession> | null = null;

async function loadSession(): Promise<InferenceSession> {
  let path = localModelPath(API_MODEL);
  if (!path) {
    if (!autoDownloadEnabled()) throw new SegmenterError("model_unavailable", "The background removal model isn't installed on this server.", 503);
    try {
      path = await downloadModel(API_MODEL);
    } catch {
      throw new SegmenterError("model_unavailable", "The server couldn't download the background removal model.", 503);
    }
  }
  const ort = await import("onnxruntime-node");
  const threads = Number(process.env.ISOLA_API_THREADS || 0);
  return ort.InferenceSession.create(path, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
    ...(threads > 0 ? { intraOpNumThreads: threads } : {}),
  });
}

function session(): Promise<InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = loadSession();
    // A failed load (no model, no network) can be retried by the next request.
    sessionPromise.catch(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

/* Inference runs one image at a time; a few more may wait their turn. */
const MAX_WAITING = Math.max(0, Number(process.env.ISOLA_API_MAX_QUEUE || 8));
let waiting = 0;
let tail: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (waiting >= MAX_WAITING + 1) {
    return Promise.reject(new SegmenterError("server_busy", "The server is busy with other images. Retry in a few seconds.", 503));
  }
  waiting++;
  const run = tail.then(fn, fn);
  tail = run.catch(() => undefined);
  return run.finally(() => {
    waiting--;
  });
}

export interface DecodedInput {
  rgba: Buffer;
  width: number;
  height: number;
}

/** Decode with EXIF orientation applied; refuse images over the configured pixel limit. */
export async function decodeInput(bytes: Uint8Array): Promise<DecodedInput> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: Math.round(uploadLimits.maxMegapixels * 1e6) + 1 })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { rgba: data, width: info.width, height: info.height };
  } catch (error) {
    const message = String(error);
    if (/pixel limit/i.test(message)) throw new SegmenterError("image_too_large", `Images can be at most ${uploadLimits.maxMegapixels} MP.`, 422);
    throw new SegmenterError("decode_failed", "The image couldn't be decoded. It may be damaged.", 422);
  }
}

/** Full-resolution 0–255 alpha mask for a decoded image. */
export async function segment(input: DecodedInput): Promise<{ mask: Uint8Array; durationMs: number }> {
  const size = API_MODEL.inputSize;
  // Same as the browser: composite transparency onto white, stretch to the model's square input.
  const small = await sharp(input.rgba, { raw: { width: input.width, height: input.height, channels: 4 } })
    .flatten({ background: "#ffffff" })
    .resize(size, size, { fit: "fill", kernel: "cubic" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const tensorData = normalisePixels(small, 3, API_MODEL);
  return exclusive(async () => {
    const s = await session();
    const ort = await import("onnxruntime-node");
    const started = performance.now();
    const tensor = new ort.Tensor("float32", tensorData, [1, 3, size, size]);
    const outputName = s.outputNames[0];
    let values: Float32Array;
    try {
      const outputs = await s.run({ [s.inputNames[0]]: tensor }, [outputName]);
      values = outputs[outputName].data as Float32Array;
    } catch (error) {
      console.error("[api] inference failed:", error instanceof Error ? error.message : error);
      throw new SegmenterError("internal_error", "Processing failed in the engine.", 500);
    }
    const lowRes = outputToMask(values, size * size, API_MODEL.activation);
    const mask = resizeMaskBilinear(lowRes, size, size, input.width, input.height);
    return { mask, durationMs: Math.round(performance.now() - started) };
  });
}

/* ------------------------------------------------------------- output --- */

export interface RenderOptions {
  output: "cutout" | "mask";
  format: "png" | "jpeg";
  /** "#RRGGBB" to place the subject on a colour; null keeps transparency (PNG) or uses white (JPEG). */
  background: string | null;
  policy: ExportPolicy;
}

const LETTERS: Array<{ w: number; d: string }> = [
  { w: 40, d: "M20 12 V88" },
  { w: 74, d: "M60 22 C52 10 14 10 16 32 C18 52 64 46 64 70 C64 92 22 94 12 78" },
  { w: 84, d: "M42 10 C18 10 8 30 8 50 C8 70 18 90 42 90 C66 90 76 70 76 50 C76 30 66 10 42 10 Z" },
  { w: 66, d: "M14 10 V90 H60" },
  { w: 84, d: "M8 90 L42 10 L76 90 M20 62 H64" },
];

/**
 * Free-plan watermark: "ISOLA" drawn as vector strokes (no fonts needed on
 * the server), tiled diagonally like the browser watermark.
 */
export function watermarkSvg(width: number, height: number): string {
  const size = Math.max(14, Math.round(Math.min(width, height) * 0.07));
  const scale = size / 100;
  let x = 0;
  const word = LETTERS.map((l) => {
    const g = `<path transform="translate(${x} 0)" d="${l.d}"/>`;
    x += l.w + 14;
    return g;
  }).join("");
  const wordWidth = x * scale;
  const stepX = Math.max(wordWidth + size * 1.6, size * 4.6);
  const stepY = size * 2.8;
  const strokes = (color: string, w: number) =>
    `<g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${word}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><pattern id="w" width="${stepX}" height="${stepY}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
<g transform="translate(${(stepX - wordWidth) / 2} ${(stepY - size) / 2}) scale(${scale})">${strokes("rgba(32,41,45,0.32)", 20)}${strokes("rgba(255,255,255,0.5)", 11)}</g>
</pattern></defs><rect width="100%" height="100%" fill="url(#w)"/></svg>`;
}

/** Compose the requested output and encode it, applying the plan policy (size limit, watermark). */
export async function renderOutput(input: DecodedInput, mask: Uint8Array, options: RenderOptions) {
  const { width, height } = input;
  let composed: Sharp;
  if (options.output === "mask") {
    composed = sharp(Buffer.from(mask.buffer, mask.byteOffset, mask.byteLength), { raw: { width, height, channels: 1 } });
  } else {
    // Cutout: original colour, alpha = original alpha × mask, so transparent source areas stay transparent.
    const rgba = Buffer.from(input.rgba);
    for (let i = 0, j = 3; i < mask.length; i++, j += 4) rgba[j] = (rgba[j] * mask[i] + 127) / 255;
    composed = sharp(rgba, { raw: { width, height, channels: 4 } });
    const fill = options.background ?? (options.format === "jpeg" ? "#ffffff" : null);
    if (fill) composed = composed.flatten({ background: fill });
  }
  // Lossless intermediate, then one pipeline: resize (plan limit) → watermark → encode.
  const intermediate = await composed.png({ compressionLevel: 1 }).toBuffer();
  const out = applyPolicySize(width, height, options.policy);
  let image = sharp(intermediate);
  if (out.limited) image = image.resize(out.width, out.height, { fit: "fill", kernel: "lanczos3" });
  if (options.policy.watermark) image = image.composite([{ input: Buffer.from(watermarkSvg(out.width, out.height)), top: 0, left: 0 }]);
  const body =
    options.format === "jpeg"
      ? await image.flatten({ background: options.background ?? "#ffffff" }).jpeg({ quality: 92, mozjpeg: true }).toBuffer()
      : await image.png({ compressionLevel: 6 }).toBuffer();
  return { body, width: out.width, height: out.height, contentType: options.format === "jpeg" ? "image/jpeg" : "image/png" };
}
