/**
 * The processing adapter contract. Any background-removal engine (on-device
 * ONNX models, a server-side provider, a future self-hosted service) plugs in
 * by implementing `BackgroundRemovalEngine`. The editor and batch studio only
 * ever talk to this interface.
 */

export type EngineLocation = "device" | "server";

export type EngineState =
  | { kind: "idle" }
  | { kind: "downloading"; loaded: number; total: number | null }
  | { kind: "initialising" }
  | { kind: "ready"; backend: string; threads?: number }
  | { kind: "unavailable"; reason: EngineErrorCode; message: string; detail?: string }
  | { kind: "error"; reason: EngineErrorCode; message: string; detail?: string };

export type EngineErrorCode =
  | "auth-required"
  | "model-missing"
  | "model-download-failed"
  | "model-integrity"
  | "unsupported-browser"
  | "engine-init-failed"
  | "inference-failed"
  | "out-of-memory"
  | "not-configured"
  | "provider-error"
  | "network"
  | "cancelled";

export class EngineError extends Error {
  constructor(
    public code: EngineErrorCode,
    message: string,
    public detail?: string,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export function isCancellation(error: unknown): boolean {
  return (
    (error instanceof EngineError && error.code === "cancelled") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

/** Which stage of real work a job is in. No invented percentages. */
export type JobPhase =
  | { kind: "waiting" }
  | { kind: "loading-engine" }
  | { kind: "uploading" }
  | { kind: "inferring" }
  | { kind: "finalising" };

export interface MaskResult {
  /** Alpha mask at the original image resolution, 0–255, row-major. */
  mask: Uint8Array;
  width: number;
  height: number;
  /** Fraction of pixels the engine judged as foreground (alpha > 50%). */
  coverage: number;
  /** Highest confidence anywhere in the mask, 0–1. */
  peak: number;
  backend: string;
  engineId: string;
  durationMs: number;
}

export interface RemoveOptions {
  signal?: AbortSignal;
  onPhase?: (phase: JobPhase) => void;
}

export interface EngineDescriptor {
  id: string;
  /** Short label, e.g. "Standard". */
  label: string;
  /** One-line explanation for the model picker. */
  description: string;
  location: EngineLocation;
  /** Human-readable model/provider name and licence for transparency. */
  provenance: string;
  /** Approximate one-time download in bytes for on-device engines. */
  downloadBytes?: number;
}

export interface BackgroundRemovalEngine {
  readonly descriptor: EngineDescriptor;
  getState(): EngineState;
  subscribe(listener: (state: EngineState) => void): () => void;
  /** Prepare the engine (download model, create session). Safe to call repeatedly. */
  load(): Promise<void>;
  /** Produce an alpha mask for the image at its original resolution. */
  removeBackground(image: ImageBitmap, options?: RemoveOptions): Promise<MaskResult>;
  dispose(): void;
}

export function summariseMask(mask: Uint8Array): { coverage: number; peak: number } {
  let fg = 0;
  let peak = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    if (v > 127) fg++;
    if (v > peak) peak = v;
  }
  return { coverage: mask.length ? fg / mask.length : 0, peak: peak / 255 };
}

/** Whether a result likely contains no clear subject, so the UI can say so. */
export function looksEmpty(result: Pick<MaskResult, "coverage" | "peak">): boolean {
  return result.peak < 0.5 || result.coverage < 0.002;
}
