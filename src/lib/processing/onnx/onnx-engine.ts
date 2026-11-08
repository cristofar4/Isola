import { engineConfig } from "@/lib/config";
import type { ModelSpec } from "../models";
import {
  EngineError,
  summariseMask,
  type BackgroundRemovalEngine,
  type EngineDescriptor,
  type EngineState,
  type JobPhase,
  type MaskResult,
  type RemoveOptions,
} from "../types";
import type { WorkerRequest, WorkerResponse } from "./protocol";

interface Job {
  id: number;
  bitmap: ImageBitmap;
  options: RemoveOptions;
  resolve: (result: MaskResult) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  onAbort?: () => void;
}

/**
 * Main-thread side of the on-device engine. Owns one module worker, queues jobs
 * so only one inference runs at a time, and supports real cancellation by
 * terminating the worker (the model is then reloaded from Cache Storage).
 */
export class OnnxEngine implements BackgroundRemovalEngine {
  readonly descriptor: EngineDescriptor;
  private worker: Worker | null = null;
  private state: EngineState = { kind: "idle" };
  private listeners = new Set<(state: EngineState) => void>();
  private loadPromise: Promise<void> | null = null;
  private pendingLoad: { resolve: () => void; reject: (e: unknown) => void } | null = null;
  private queue: Job[] = [];
  private active: Job | null = null;
  private nextId = 1;

  constructor(private readonly model: ModelSpec) {
    this.descriptor = {
      id: `device:${model.id}`,
      label: model.label,
      description: model.description,
      location: "device",
      provenance: `${model.provenance} · ${model.license}`,
      downloadBytes: model.bytes,
    };
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (state: EngineState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get busy() {
    return this.active !== null || this.queue.length > 0;
  }

  private setState(state: EngineState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    if (typeof Worker === "undefined") {
      throw new EngineError("unsupported-browser", "This browser doesn't support background workers.");
    }
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
      type: "module",
      name: `isola-${this.model.id}`,
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const error = new EngineError(
        "engine-init-failed",
        "The processing engine stopped unexpectedly.",
        event.message,
      );
      this.failAll(error);
    };
    this.worker = worker;
    return worker;
  }

  load(): Promise<void> {
    if (this.state.kind === "ready") return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    let worker: Worker;
    try {
      worker = this.ensureWorker();
    } catch (error) {
      const e = error as EngineError;
      this.setState({ kind: "unavailable", reason: e.code, message: e.message });
      return Promise.reject(error);
    }
    this.setState({ kind: "downloading", loaded: 0, total: this.model.bytes });
    this.loadPromise = new Promise<void>((resolve, reject) => {
      this.pendingLoad = { resolve, reject };
    });
    this.loadPromise.catch(() => {
      this.loadPromise = null;
    });
    const modelUrl = new URL(this.model.file, new URL(engineConfig.modelBaseUrl, location.origin)).href;
    const request: WorkerRequest = {
      type: "load",
      modelId: this.model.id,
      modelUrl,
      ortBaseUrl: engineConfig.ortBaseUrl,
      allowWebGPU: engineConfig.allowWebGPU,
    };
    worker.postMessage(request);
    return this.loadPromise;
  }

  removeBackground(bitmap: ImageBitmap, options: RemoveOptions = {}): Promise<MaskResult> {
    return new Promise<MaskResult>((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new EngineError("cancelled", "Cancelled."));
        return;
      }
      const job: Job = { id: this.nextId++, bitmap, options, resolve, reject, settled: false };
      if (options.signal) {
        job.onAbort = () => this.cancel(job);
        options.signal.addEventListener("abort", job.onAbort, { once: true });
      }
      this.queue.push(job);
      options.onPhase?.({ kind: "waiting" });
      void this.pump();
    });
  }

  private settle(job: Job, outcome: { result?: MaskResult; error?: unknown }) {
    if (job.settled) return;
    job.settled = true;
    if (job.onAbort) job.options.signal?.removeEventListener("abort", job.onAbort);
    if (outcome.error !== undefined) job.reject(outcome.error);
    else if (outcome.result) job.resolve(outcome.result);
  }

  private phase(job: Job, phase: JobPhase) {
    if (!job.settled) job.options.onPhase?.(phase);
  }

  private async pump() {
    if (this.active || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.active = job;
    try {
      if (this.state.kind !== "ready") this.phase(job, { kind: "loading-engine" });
      await this.load();
      if (job.settled) return;
      const copy = await createImageBitmap(job.bitmap);
      if (job.settled) {
        copy.close();
        return;
      }
      (job as Job & { started: number }).started = performance.now();
      this.ensureWorker().postMessage({ type: "run", jobId: job.id, bitmap: copy } satisfies WorkerRequest, [copy]);
    } catch (error) {
      if (this.active === job) this.active = null;
      this.settle(job, { error });
      void this.pump();
    }
  }

  /** Cancel a queued job, or stop the running one by terminating the worker. */
  private cancel(job: Job) {
    const cancelled = new EngineError("cancelled", "Cancelled.");
    const index = this.queue.indexOf(job);
    if (index >= 0) {
      this.queue.splice(index, 1);
      this.settle(job, { error: cancelled });
      return;
    }
    if (this.active === job) {
      this.terminateWorker();
      this.active = null;
      this.settle(job, { error: cancelled });
      void this.pump();
    }
  }

  private terminateWorker() {
    this.worker?.terminate();
    this.worker = null;
    if (this.pendingLoad) {
      this.pendingLoad.reject(new EngineError("cancelled", "Cancelled."));
      this.pendingLoad = null;
    }
    this.loadPromise = null;
    this.setState({ kind: "idle" });
  }

  private failAll(error: EngineError) {
    this.worker?.terminate();
    this.worker = null;
    this.loadPromise = null;
    if (this.pendingLoad) {
      this.pendingLoad.reject(error);
      this.pendingLoad = null;
    }
    this.setState({ kind: "error", reason: error.code, message: error.message, detail: error.detail });
    if (this.active) {
      this.settle(this.active, { error });
      this.active = null;
    }
    void this.pump();
  }

  private handleMessage(message: WorkerResponse) {
    switch (message.type) {
      case "download-progress":
        this.setState({ kind: "downloading", loaded: message.loaded, total: message.total });
        break;
      case "initialising":
        this.setState({ kind: "initialising" });
        break;
      case "loaded":
        this.setState({ kind: "ready", backend: message.backend, threads: message.threads });
        this.pendingLoad?.resolve();
        this.pendingLoad = null;
        break;
      case "backend-changed":
        if (this.state.kind === "ready") this.setState({ ...this.state, backend: message.backend });
        break;
      case "load-error": {
        const error = new EngineError(message.code, message.message, message.detail);
        const permanent = message.code === "model-missing" || message.code === "unsupported-browser";
        // Signing in fixes auth errors, so leave the engine ready to try again.
        this.setState(
          message.code === "auth-required"
            ? { kind: "idle" }
            : { kind: permanent ? "unavailable" : "error", reason: message.code, message: message.message, detail: message.detail },
        );
        this.worker?.terminate();
        this.worker = null;
        this.pendingLoad?.reject(error);
        this.pendingLoad = null;
        this.loadPromise = null;
        break;
      }
      case "phase":
        if (this.active?.id === message.jobId) this.phase(this.active, message.phase);
        break;
      case "result": {
        const job = this.active;
        if (!job || job.id !== message.jobId) return;
        this.active = null;
        const summary = summariseMask(message.mask);
        this.settle(job, {
          result: {
            mask: message.mask,
            width: message.width,
            height: message.height,
            coverage: summary.coverage,
            peak: summary.peak,
            backend: message.backend,
            engineId: this.descriptor.id,
            durationMs: message.durationMs,
          },
        });
        void this.pump();
        break;
      }
      case "run-error": {
        const job = this.active;
        if (!job || job.id !== message.jobId) return;
        this.active = null;
        this.settle(job, { error: new EngineError(message.code, message.message, message.detail) });
        void this.pump();
        break;
      }
    }
  }

  dispose() {
    for (const job of this.queue) this.settle(job, { error: new EngineError("cancelled", "Cancelled.") });
    this.queue = [];
    if (this.active) this.settle(this.active, { error: new EngineError("cancelled", "Cancelled.") });
    this.active = null;
    this.terminateWorker();
  }
}
