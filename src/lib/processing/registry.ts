"use client";

import { useSyncExternalStore } from "react";
import { engineConfig } from "@/lib/config";
import { MODELS, MODEL_IDS, isModelId } from "./models";
import { OnnxEngine } from "./onnx/onnx-engine";
import { RemoteEngine } from "./remote/remote-engine";
import type { BackgroundRemovalEngine, EngineDescriptor, EngineState } from "./types";

export type EngineId = `device:${(typeof MODEL_IDS)[number]}` | "server:remote";

const engines = new Map<EngineId, BackgroundRemovalEngine>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export const DEFAULT_ENGINE_ID: EngineId = `device:${
  isModelId(engineConfig.defaultModel) ? engineConfig.defaultModel : "isnet-general-use"
}`;

export function deviceEngineDescriptors(): EngineDescriptor[] {
  return MODEL_IDS.map((id) => ({
    id: `device:${id}`,
    label: MODELS[id].label,
    description: MODELS[id].description,
    location: "device" as const,
    provenance: `${MODELS[id].provenance} · ${MODELS[id].license}`,
    downloadBytes: MODELS[id].bytes,
  }));
}

export function isEngineId(value: unknown): value is EngineId {
  if (value === "server:remote") return true;
  return typeof value === "string" && value.startsWith("device:") && isModelId(value.slice(7));
}

export function getEngine(id: EngineId): BackgroundRemovalEngine {
  let engine = engines.get(id);
  if (!engine) {
    engine = id === "server:remote" ? new RemoteEngine() : new OnnxEngine(MODELS[id.slice(7) as keyof typeof MODELS]);
    engines.set(id, engine);
    engine.subscribe(emit);
    queueMicrotask(emit);
  }
  // Keep only one on-device model resident to limit memory use.
  if (id.startsWith("device:")) {
    for (const [otherId, other] of engines) {
      if (otherId !== id && other instanceof OnnxEngine && !other.busy) {
        other.dispose();
        engines.delete(otherId);
        queueMicrotask(emit);
      }
    }
  }
  return engine;
}

const idleState: EngineState = { kind: "idle" };

/** Subscribe a component to an engine's live state without creating a worker. */
export function useEngineState(id: EngineId | null): EngineState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => (id ? (engines.get(id)?.getState() ?? idleState) : idleState),
    () => idleState,
  );
}
