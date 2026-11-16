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

/** Pieces of 4 MB: small enough for serverless hosts, and a dropped connection only costs one piece. */
const PIECE = 4 * 1024 * 1024;
/** Pieces downloading at once. */
const LANES = 4;

/** One request for the model (or a piece of it), with the server's reasons turned into clear failures. */
async function request(url: string, model: ModelSpec, range: string): Promise<Response> {
  let response: Response;
  try {
    // Same-origin requests carry the session (or guest trial) cookie the model route checks.
    response = await fetch(url, { credentials: "same-origin", headers: { Range: range } });
  } catch (error) {
    throw new WorkerFailure("model-download-failed", "The model couldn't be downloaded. Check your connection.", String(error));
  }
  if (response.ok && response.body) return response;
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
  throw new WorkerFailure("model-download-failed", serverMessage || "The model couldn't be downloaded.", `GET ${url} (${range}) returned ${response.status}. (${model.file})`);
}

/** Read a response into `buffer` at `offset`. Returns the bytes read; a piece must be exactly `length`. */
async function readInto(response: Response, buffer: Uint8Array, offset: number, length: number, progress: (delta: number) => void, whole = false): Promise<number> {
  const reader = response.body!.getReader();
  let got = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (got + value.byteLength > length) {
        if (!whole) throw new Error(`piece at ${offset} is longer than ${length} bytes`);
        await reader.cancel();
        return got + value.byteLength; // Larger than the expected file.
      }
      buffer.set(value, offset + got);
      got += value.byteLength;
      progress(value.byteLength);
    }
  } catch (error) {
    progress(-got);
    throw error;
  }
  if (!whole && got !== length) {
    progress(-got);
    throw new Error(`piece at ${offset}: ${got} of ${length} bytes`);
  }
  return got;
}

/** Where a downloaded piece waits in Cache Storage until the whole model has arrived. */
function pieceKey(url: string, offset: number) {
  const key = new URL(url);
  key.searchParams.set("isola-piece", String(offset));
  return key.href;
}

/**
 * Keep a downloaded piece, so an interrupted download (a dropped connection,
 * a closed tab, a reload) carries on from where it stopped instead of
 * starting again. Best effort: without space, pieces simply aren't kept.
 */
function keepPiece(cache: Cache | null, url: string, buffer: Uint8Array, offset: number, length: number) {
  if (!cache) return;
  void cache.put(pieceKey(url, offset), new Response(buffer.slice(offset, offset + length) as unknown as BodyInit)).catch(() => undefined);
}

async function dropPieces(cache: Cache | null, url: string, starts: number[]) {
  if (!cache) return;
  await Promise.all(starts.map((at) => cache.delete(pieceKey(url, at)).catch(() => false)));
}

/** One piece, retried a few times on a flaky connection before giving up. */
async function piece(url: string, model: ModelSpec, buffer: Uint8Array, offset: number, length: number, progress: (delta: number) => void) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)));
    try {
      const response = await request(url, model, `bytes=${offset}-${offset + length - 1}`);
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new Error(`expected a piece, got HTTP ${response.status}`);
      }
      await readInto(response, buffer, offset, length, progress);
      return;
    } catch (error) {
      // Signed out or the model is gone: retrying won't help.
      if (error instanceof WorkerFailure && error.code !== "model-download-failed") throw error;
      lastError = error;
    }
  }
  throw new WorkerFailure("model-download-failed", "The download was interrupted. Check your connection and try again.", String(lastError));
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

  const total = model.bytes;
  const buffer = new Uint8Array(total);
  let loaded = 0;
  let lastPost = 0;
  const progress = (delta: number) => {
    loaded += delta;
    const now = performance.now();
    if (now - lastPost > 120) {
      lastPost = now;
      post({ type: "download-progress", loaded: Math.min(loaded, total), total });
    }
  };

  const starts: number[] = [];
  for (let at = 0; at < total; at += PIECE) starts.push(at);
  const sizeOf = (at: number) => Math.min(PIECE, total - at);

  // Pieces kept from an earlier download that didn't finish.
  const kept = new Set<number>();
  if (cache) {
    for (const at of starts) {
      try {
        const hit = await cache.match(pieceKey(url, at));
        if (!hit) continue;
        const bytes = new Uint8Array(await hit.arrayBuffer());
        if (bytes.byteLength !== sizeOf(at)) continue;
        buffer.set(bytes, at);
        kept.add(at);
        progress(bytes.byteLength);
      } catch {
        /* unreadable piece: download it again */
      }
    }
  }

  const downloadRest = async (todo: number[]) => {
    let next = 0;
    const lane = async () => {
      while (next < todo.length) {
        const at = todo[next++];
        await piece(url, model, buffer, at, sizeOf(at), progress);
        keepPiece(cache, url, buffer, at, sizeOf(at));
      }
    };
    await Promise.all(Array.from({ length: Math.min(LANES, todo.length) }, lane));
  };

  if (kept.size > 0) {
    // Pieces were kept, so this server sends pieces: fetch only what's missing.
    await downloadRest(starts.filter((at) => !kept.has(at)));
  } else {
    // The first piece also tells us whether the server sends pieces (Range) or only the whole file.
    const first = await request(url, model, `bytes=0-${sizeOf(0) - 1}`);
    if (first.status === 206) {
      await readInto(first, buffer, 0, sizeOf(0), progress);
      keepPiece(cache, url, buffer, 0, sizeOf(0));
      await downloadRest(starts.slice(1));
    } else {
      // A server or CDN without Range support: the whole file in one response.
      const got = await readInto(first, buffer, 0, total, progress, true);
      if (got !== total) {
        throw new WorkerFailure("model-integrity", "The downloaded model doesn't match the expected file.", `Expected ${total} bytes, received ${got}.`);
      }
    }
  }
  post({ type: "download-progress", loaded, total });
  // Verifying 170+ MB takes a moment; report it as engine start-up, not as a stalled download.
  post({ type: "initialising" });
  const digest = await sha256Hex(buffer);
  if (digest !== model.sha256) {
    // A bad piece can't be told apart from good ones, so start clean next time.
    await dropPieces(cache, url, starts);
    throw new WorkerFailure("model-integrity", "The downloaded model failed its integrity check.", `SHA-256 ${digest}`);
  }
  if (cache) {
    try {
      await cache.put(url, new Response(buffer as unknown as BodyInit, { headers: { "content-type": "application/octet-stream" } }));
      // The whole model is kept now; the pieces aren't needed any more.
      await dropPieces(cache, url, starts);
    } catch {
      // Quota exceeded: the model still works for this session (and the kept pieces still save the next download).
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
