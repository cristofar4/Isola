/// <reference lib="webworker" />
/**
 * On-device inference worker. Loads ONNX Runtime Web from self-hosted files,
 * downloads (and caches) the model, and turns images into full-resolution
 * alpha masks. Image data never leaves this browser.
 */

import type * as OrtTypes from "onnxruntime-web";
import { MODELS, type ModelId, type ModelSpec } from "../models";
import type { EngineErrorCode } from "../types";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { resizeMaskBilinear } from "./resize";
import { normalisePixels, outputToMask } from "../segmentation";

type Ort = typeof OrtTypes;

const scope = self as unknown as DedicatedWorkerGlobalScope;
const CACHE_NAME = "isola-models-v1";

let ort: Ort | null = null;
let session: OrtTypes.InferenceSession | null = null;
let spec: ModelSpec | null = null;
let modelBytes: Uint8Array | null = null;
let backend = "wasm";
let threads = 1;

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

class WorkerFailure extends Error {
  constructor(
    public code: EngineErrorCode,
    message: string,
    public detail?: string,
  ) {
    super(message);
  }
}

async function hasWebGPU(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function loadRuntime(ortBaseUrl: string, webgpu: boolean): Promise<Ort> {
  if (ort) return ort;
  if (typeof WebAssembly !== "object") {
    throw new WorkerFailure("unsupported-browser", "This browser doesn't support WebAssembly, which on-device processing needs.");
  }
  const base = new URL(ortBaseUrl, scope.location.origin).href;
  const entry = new URL(webgpu ? "ort.webgpu.min.mjs" : "ort.wasm.min.mjs", base).href;
  let mod: Ort;
  try {
    mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ entry)) as Ort;
  } catch (error) {
    throw new WorkerFailure(
      "engine-init-failed",
      "The processing runtime couldn't be loaded.",
      `Failed to import ${entry}: ${String(error)}`,
    );
  }
  mod.env.wasm.wasmPaths = base;
  threads = scope.crossOriginIsolated
    ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))
    : 1;
  mod.env.wasm.numThreads = threads;
  mod.env.logLevel = "error";
  ort = mod;
  return mod;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchModel(url: string, model: ModelSpec): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const bytes = new Uint8Array(await hit.arrayBuffer());
      if (bytes.byteLength === model.bytes) {
        post({ type: "download-progress", loaded: bytes.byteLength, total: bytes.byteLength });
        return bytes;
      }
      await cache.delete(url);
    }
  } catch {
    cache = null; // Cache Storage unavailable (private mode, insecure context): download every time.
  }

  let response: Response;
  try {
    // Same-origin requests carry the session cookie the model route checks.
    response = await fetch(url, { credentials: "same-origin" });
  } catch (error) {
    throw new WorkerFailure("model-download-failed", "The model couldn't be downloaded. Check your connection.", String(error));
  }
  if (!response.ok || !response.body) {
    let serverMessage = "";
    try {
      serverMessage = ((await response.json()) as { message?: string }).message ?? "";
    } catch {
      /* not JSON */
    }
    if (response.status === 401 || response.status === 403) {
      throw new WorkerFailure("auth-required", serverMessage || "Sign in to remove backgrounds.");
    }
    if (response.status === 404) {
      throw new WorkerFailure(
        "model-missing",
        "The background removal model isn't installed on this deployment.",
        `GET ${url} returned 404. Run "npm run models:fetch" or set NEXT_PUBLIC_ISOLA_MODEL_BASE_URL.`,
      );
    }
    throw new WorkerFailure(
      "model-download-failed",
      serverMessage || "The model couldn't be downloaded.",
      `GET ${url} returned ${response.status}.`,
    );
  }

  const total = model.bytes;
  const reader = response.body.getReader();
  const buffer = new Uint8Array(total);
  let overflow: Uint8Array[] | null = null;
  let loaded = 0;
  let lastPost = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (loaded + value.byteLength <= total && !overflow) {
      buffer.set(value, loaded);
    } else {
      overflow ??= [buffer.subarray(0, loaded)];
      overflow.push(value);
    }
    loaded += value.byteLength;
    const now = performance.now();
    if (now - lastPost > 120) {
      lastPost = now;
      post({ type: "download-progress", loaded: Math.min(loaded, total), total });
    }
  }
  if (loaded !== total || overflow) {
    throw new WorkerFailure(
      "model-integrity",
      "The downloaded model doesn't match the expected file.",
      `Expected ${total} bytes, received ${loaded}.`,
    );
  }
  post({ type: "download-progress", loaded, total });
  // Verifying 170+ MB takes a moment; report it as engine start-up, not as a stalled download.
  post({ type: "initialising" });
  const digest = await sha256Hex(buffer);
  if (digest !== model.sha256) {
    throw new WorkerFailure("model-integrity", "The downloaded model failed its integrity check.", `SHA-256 ${digest}`);
  }
  if (cache) {
    try {
      await cache.put(url, new Response(buffer as unknown as BodyInit, { headers: { "content-type": "application/octet-stream" } }));
    } catch {
      // Quota exceeded: the model still works for this session.
    }
  }
  return buffer;
}

async function createSession(runtime: Ort, bytes: Uint8Array, provider: "webgpu" | "wasm") {
  return runtime.InferenceSession.create(bytes, {
    executionProviders: [provider],
    graphOptimizationLevel: "all",
    // WebAssembly memory is capped at 4 GB; skipping the arena and memory
    // pattern pre-allocation lowers peak usage for large models.
    enableCpuMemArena: provider === "webgpu",
    enableMemPattern: provider === "webgpu",
  });
}

async function handleLoad(request: Extract<WorkerRequest, { type: "load" }>) {
  const model = MODELS[request.modelId as ModelId];
  if (!model) throw new WorkerFailure("engine-init-failed", "Unknown model.", request.modelId);
  const webgpu = request.allowWebGPU && (await hasWebGPU());
  if (model.requiresWebGPU && !webgpu) {
    throw new WorkerFailure(
      "unsupported-browser",
      `${model.label} needs WebGPU, which this browser doesn't provide. Use Standard instead.`,
    );
  }
  const runtime = await loadRuntime(request.ortBaseUrl, webgpu);
  if (session && spec?.id === model.id) {
    post({ type: "loaded", backend, threads });
    return;
  }
  const bytes = await fetchModel(request.modelUrl, model);
  post({ type: "initialising" });
  spec = model;
  modelBytes = bytes;
  if (webgpu) {
    try {
      session = await createSession(runtime, bytes, "webgpu");
      backend = "webgpu";
      post({ type: "loaded", backend, threads });
      return;
    } catch (error) {
      if (model.requiresWebGPU) {
        throw new WorkerFailure(
          "engine-init-failed",
          `${model.label} couldn't start on this GPU. Use Standard instead.`,
          String(error),
        );
      }
      // Otherwise fall through to WebAssembly.
    }
  }
  try {
    session = await createSession(runtime, bytes, "wasm");
    backend = "wasm";
    modelBytes = null; // Only kept for the WebGPU → WebAssembly fallback.
  } catch (error) {
    const text = String(error);
    throw new WorkerFailure(
      /memory|alloc|OOM/i.test(text) ? "out-of-memory" : "engine-init-failed",
      /memory|alloc|OOM/i.test(text)
        ? "This device ran out of memory while preparing the model."
        : "The model couldn't be started in this browser.",
      text,
    );
  }
  post({ type: "loaded", backend, threads });
}

function preprocess(bitmap: ImageBitmap, model: ModelSpec): Float32Array {
  const size = model.inputSize;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new WorkerFailure("inference-failed", "Couldn't prepare the image for processing.");
  // Transparent regions are composited onto white so the model sees a neutral backdrop.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const input = normalisePixels(data, 4, model);
  return input;
}

async function infer(input: Float32Array, model: ModelSpec): Promise<Uint8Array> {
  if (!ort || !session) throw new WorkerFailure("engine-init-failed", "The engine isn't ready.");
  const size = model.inputSize;
  const tensor = new ort.Tensor("float32", input, [1, 3, size, size]);
  const outputName = session.outputNames[0];
  const outputs = await session.run({ [session.inputNames[0]]: tensor }, [outputName]);
  const output = outputs[outputName];
  const values = (await output.getData()) as Float32Array;
  const small = outputToMask(values, size * size, model.activation);
  output.dispose?.();
  tensor.dispose?.();
  return small;
}

async function handleRun(request: Extract<WorkerRequest, { type: "run" }>) {
  const { jobId, bitmap } = request;
  const model = spec;
  if (!model || !session) {
    bitmap.close();
    throw new WorkerFailure("engine-init-failed", "The engine isn't ready.");
  }
  const width = bitmap.width;
  const height = bitmap.height;
  const started = performance.now();
  const input = preprocess(bitmap, model);
  bitmap.close();
  post({ type: "phase", jobId, phase: { kind: "inferring" } });
  let small: Uint8Array;
  try {
    small = await infer(input, model);
  } catch (error) {
    if (backend === "webgpu" && ort && modelBytes && !model.requiresWebGPU) {
      // Some GPUs fail at run time; retry once on WebAssembly.
      session = await createSession(ort, modelBytes, "wasm");
      backend = "wasm";
      post({ type: "backend-changed", backend });
      small = await infer(input, model);
    } else {
      const text = String(error);
      throw new WorkerFailure(
        /memory|alloc|OOM/i.test(text) ? "out-of-memory" : "inference-failed",
        /memory|alloc|OOM/i.test(text)
          ? "This device ran out of memory while processing the image."
          : "Processing failed in the engine.",
        text,
      );
    }
  }
  post({ type: "phase", jobId, phase: { kind: "finalising" } });
  const mask = resizeMaskBilinear(small, model.inputSize, model.inputSize, width, height);
  post(
    {
      type: "result",
      jobId,
      mask,
      width,
      height,
      backend,
      durationMs: Math.round(performance.now() - started),
    },
    [mask.buffer],
  );
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "load") {
    try {
      await handleLoad(request);
    } catch (error) {
      const failure =
        error instanceof WorkerFailure
          ? error
          : new WorkerFailure("engine-init-failed", "The engine couldn't start.", String(error));
      post({ type: "load-error", code: failure.code, message: failure.message, detail: failure.detail });
    }
    return;
  }
  if (request.type === "run") {
    try {
      await handleRun(request);
    } catch (error) {
      const failure =
        error instanceof WorkerFailure
          ? error
          : new WorkerFailure("inference-failed", "Processing failed.", String(error));
      post({
        type: "run-error",
        jobId: request.jobId,
        code: failure.code,
        message: failure.message,
        detail: failure.detail,
      });
    }
  }
};
