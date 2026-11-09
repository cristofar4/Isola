import type { ModelSpec } from "./models";

/**
 * The model-facing maths shared by the in-browser worker and the server API,
 * so both turn the same pixels into the same mask.
 */

/**
 * Pixels (already resized to the model's input and composited onto white)
 * → normalised planar float tensor data [R…, G…, B…].
 */
export function normalisePixels(pixels: ArrayLike<number>, channels: 3 | 4, model: Pick<ModelSpec, "inputSize" | "mean" | "std">): Float32Array {
  const n = model.inputSize * model.inputSize;
  const input = new Float32Array(3 * n);
  const [m0, m1, m2] = model.mean;
  const [s0, s1, s2] = model.std;
  for (let i = 0, j = 0; i < n; i++, j += channels) {
    input[i] = (pixels[j] / 255 - m0) / s0;
    input[n + i] = (pixels[j + 1] / 255 - m1) / s1;
    input[2 * n + i] = (pixels[j + 2] / 255 - m2) / s2;
  }
  return input;
}

/** Raw model output → 0–255 mask at the model's input size. */
export function outputToMask(values: ArrayLike<number>, count: number, activation: ModelSpec["activation"]): Uint8Array {
  const mask = new Uint8Array(count);
  const sigmoid = activation === "sigmoid";
  for (let i = 0; i < count; i++) {
    let v = values[i];
    if (sigmoid) v = 1 / (1 + Math.exp(-v));
    mask[i] = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
  }
  return mask;
}
