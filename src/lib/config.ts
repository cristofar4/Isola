/**
 * Central, build-time configuration for ISOLA.
 *
 * Every value here can be overridden with an environment variable. Variables
 * prefixed with NEXT_PUBLIC_ are inlined into the client bundle at build time,
 * so changing them requires a rebuild. See README.md → "Environment variables".
 */

function positiveNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Upload limits. Kept deliberately conservative for in-browser processing. */
export const uploadLimits = {
  /** Largest accepted file, in bytes. */
  maxFileBytes:
    positiveNumber(process.env.NEXT_PUBLIC_ISOLA_MAX_FILE_MB, 30) * 1024 * 1024,
  /** Longest accepted side, in pixels. */
  maxDimension: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_MAX_DIMENSION, 8000),
  /** Shortest accepted side, in pixels. */
  minDimension: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_MIN_DIMENSION, 32),
  /** Largest accepted pixel count, in megapixels. */
  maxMegapixels: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_MAX_MEGAPIXELS, 36),
  /** Maximum number of files in one batch. */
  maxBatchFiles: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_MAX_BATCH_FILES, 50),
} as const;

export const batchConfig = {
  /**
   * How many images the batch queue processes at once. Inference runs in one
   * worker, so values above 1 mostly overlap decoding with inference.
   */
  concurrency: Math.min(
    4,
    Math.max(1, Math.round(positiveNumber(process.env.NEXT_PUBLIC_ISOLA_BATCH_CONCURRENCY, 1))),
  ),
} as const;

export const exportLimits = {
  /** Largest export, in megapixels. Browsers cap canvas size; iOS Safari is ~16.7MP. */
  maxMegapixels: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_MAX_EXPORT_MEGAPIXELS, 64),
  maxDimension: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_MAX_EXPORT_DIMENSION, 12000),
} as const;

/**
 * Plans. Free exports are watermarked and limited to `freeMaxExportSide` on the
 * longest side; Pro (monthly or yearly) exports at full resolution without a
 * watermark. The export rules themselves live in src/lib/plan-policy.ts.
 */
export const planConfig = {
  freeMaxExportSide: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_FREE_MAX_EXPORT_SIDE, 1000),
  /** Pro, billed monthly, in naira. */
  proPriceNgn: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_PRO_PRICE_NGN, 14000),
  /** Pro, billed yearly, in naira. */
  proYearlyPriceNgn: positiveNumber(process.env.NEXT_PUBLIC_ISOLA_PRO_YEARLY_PRICE_NGN, 140000),
} as const;

export type BillingInterval = "monthly" | "yearly";

/** Whole-percent saving of the yearly price over twelve monthly payments (0 if none). */
export function yearlySavingPercent() {
  const full = planConfig.proPriceNgn * 12;
  return Math.max(0, Math.round(((full - planConfig.proYearlyPriceNgn) / full) * 100));
}

export function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export const engineConfig = {
  /**
   * Where model files are fetched from. The default route serves them only to
   * signed-in users. A cross-origin host must allow CORS (and then the sign-in
   * requirement is enforced by the app UI only).
   */
  modelBaseUrl: process.env.NEXT_PUBLIC_ISOLA_MODEL_BASE_URL || "/api/models/",
  /** Where the ONNX Runtime Web .mjs/.wasm files are served from. */
  ortBaseUrl: process.env.NEXT_PUBLIC_ISOLA_ORT_BASE_URL || "/ort/",
  /** Model used when the visitor has not chosen one. */
  defaultModel: process.env.NEXT_PUBLIC_ISOLA_DEFAULT_MODEL || "isnet-general-use",
  /** Allow the WebGPU execution provider when the browser exposes it. */
  allowWebGPU: process.env.NEXT_PUBLIC_ISOLA_DISABLE_WEBGPU !== "true",
} as const;

export const ACCEPTED_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
} as const;

export type AcceptedMime = keyof typeof ACCEPTED_TYPES;

export const ACCEPT_ATTRIBUTE = [
  ...Object.keys(ACCEPTED_TYPES),
  ...Object.values(ACCEPTED_TYPES).flat(),
].join(",");

export const FORMAT_LABEL = "PNG, JPG, WEBP";

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function limitsSummary(): string {
  return `Up to ${formatBytes(uploadLimits.maxFileBytes)}, ${uploadLimits.maxDimension.toLocaleString("en-US")}px per side, ${uploadLimits.maxMegapixels} MP`;
}
