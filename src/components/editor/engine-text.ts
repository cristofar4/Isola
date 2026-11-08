import { formatBytes } from "@/lib/config";
import type { EngineState, JobPhase } from "@/lib/processing/types";

/** Plain-language description of what the engine is really doing. */
export function phaseText(phase: JobPhase | null, engine: EngineState, location: "device" | "server"): string {
  if (engine.kind === "downloading" && phase?.kind !== "inferring") {
    return engine.total
      ? `Downloading the model · ${formatBytes(engine.loaded)} of ${formatBytes(engine.total)}`
      : `Downloading the model · ${formatBytes(engine.loaded)}`;
  }
  if (engine.kind === "initialising") return "Starting the engine…";
  switch (phase?.kind) {
    case "waiting":
      return "Waiting for the engine…";
    case "loading-engine":
      return location === "server" ? "Connecting to the server…" : "Preparing the engine…";
    case "uploading":
      return "Uploading to the server…";
    case "inferring":
      return location === "server" ? "Removing background on the server…" : "Removing background on this device…";
    case "finalising":
      return "Building the full-resolution mask…";
    default:
      return "Queued";
  }
}

export function engineSummary(engine: EngineState): string {
  switch (engine.kind) {
    case "idle":
      return "Engine not loaded";
    case "downloading":
      return engine.total ? `Downloading model ${Math.floor((engine.loaded / engine.total) * 100)}%` : "Downloading model";
    case "initialising":
      return "Starting engine";
    case "ready":
      return engine.backend === "webgpu" ? "Ready · WebGPU" : `Ready · WebAssembly${engine.threads && engine.threads > 1 ? ` · ${engine.threads} threads` : ""}`;
    case "unavailable":
      return "Engine unavailable";
    case "error":
      return "Engine error";
  }
}
