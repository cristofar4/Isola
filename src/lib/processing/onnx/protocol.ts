import type { EngineErrorCode, JobPhase } from "../types";
import type { ModelId } from "../models";

export type WorkerRequest =
  | {
      type: "load";
      modelId: ModelId;
      modelUrl: string;
      ortBaseUrl: string;
      allowWebGPU: boolean;
    }
  | {
      type: "run";
      jobId: number;
      bitmap: ImageBitmap;
    };

export type WorkerResponse =
  | { type: "download-progress"; loaded: number; total: number | null }
  | { type: "initialising" }
  | { type: "loaded"; backend: string; threads: number }
  | { type: "load-error"; code: EngineErrorCode; message: string; detail?: string }
  | { type: "phase"; jobId: number; phase: JobPhase }
  | {
      type: "result";
      jobId: number;
      mask: Uint8Array;
      width: number;
      height: number;
      backend: string;
      durationMs: number;
    }
  | { type: "run-error"; jobId: number; code: EngineErrorCode; message: string; detail?: string }
  | { type: "backend-changed"; backend: string };
