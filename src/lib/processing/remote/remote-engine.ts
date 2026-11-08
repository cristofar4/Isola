import { canvasToBlob, createCanvas, get2d } from "@/lib/image/decode";
import { decodeMask } from "@/lib/image/mask-codec";
import { resizeMaskBilinear } from "../onnx/resize";
import {
  EngineError,
  summariseMask,
  type BackgroundRemovalEngine,
  type EngineDescriptor,
  type EngineState,
  type MaskResult,
  type RemoveOptions,
} from "../types";

export interface RemoteCapabilities {
  configured: boolean;
  provider: string | null;
  providerLabel: string | null;
  maxUploadBytes: number;
}

let capabilitiesPromise: Promise<RemoteCapabilities> | null = null;

export function fetchRemoteCapabilities(): Promise<RemoteCapabilities> {
  capabilitiesPromise ??= fetch("/api/engines", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: { remote: RemoteCapabilities }) => json.remote)
    .catch(() => ({ configured: false, provider: null, providerLabel: null, maxUploadBytes: 0 }));
  return capabilitiesPromise;
}

/**
 * Server-side engine. The image is sent to this app's own /api/remove-background
 * route, which forwards it to the configured provider using credentials that
 * stay on the server. Only offered when the server reports it is configured.
 */
export class RemoteEngine implements BackgroundRemovalEngine {
  readonly descriptor: EngineDescriptor = {
    id: "server:remote",
    label: "Server",
    description: "Processed by the provider configured on this deployment. Your image is uploaded.",
    location: "server",
    provenance: "Server-side provider",
  };
  private state: EngineState = { kind: "idle" };
  private listeners = new Set<(state: EngineState) => void>();

  getState() {
    return this.state;
  }
  subscribe(listener: (state: EngineState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private setState(state: EngineState) {
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  async load() {
    const caps = await fetchRemoteCapabilities();
    if (!caps.configured) {
      this.setState({
        kind: "unavailable",
        reason: "not-configured",
        message: "Server processing isn't configured on this deployment.",
        detail: "Set ISOLA_REMOTE_PROVIDER and its API key on the server.",
      });
      throw new EngineError("not-configured", "Server processing isn't configured on this deployment.");
    }
    if (caps.providerLabel) this.descriptor.provenance = caps.providerLabel;
    this.setState({ kind: "ready", backend: caps.provider ?? "server" });
  }

  async removeBackground(bitmap: ImageBitmap, options: RemoveOptions = {}): Promise<MaskResult> {
    const started = performance.now();
    options.onPhase?.({ kind: "loading-engine" });
    await this.load();
    const caps = await fetchRemoteCapabilities();
    // Re-encode from the decoded bitmap so EXIF orientation matches what the editor shows.
    const canvas = createCanvas(bitmap.width, bitmap.height);
    get2d(canvas).drawImage(bitmap, 0, 0);
    const body = await canvasToBlob(canvas, "image/png");
    if (caps.maxUploadBytes && body.size > caps.maxUploadBytes) {
      throw new EngineError("provider-error", "This image is too large for server processing.");
    }
    const form = new FormData();
    form.append("image", body, "image.png");
    options.onPhase?.({ kind: "uploading" });
    let response: Response;
    try {
      response = await fetch("/api/remove-background", { method: "POST", body: form, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted) throw new EngineError("cancelled", "Cancelled.");
      throw new EngineError("network", "Couldn't reach the server.", String(error));
    }
    if (!response.ok) {
      let message = "The server couldn't process this image.";
      let code: EngineError["code"] = "provider-error";
      try {
        const json = (await response.json()) as { error?: string; message?: string };
        if (json.message) message = json.message;
        if (json.error === "not-configured") code = "not-configured";
        if (json.error === "auth-required") code = "auth-required";
      } catch {
        /* ignore */
      }
      throw new EngineError(code, message, `HTTP ${response.status}`);
    }
    options.onPhase?.({ kind: "finalising" });
    const decoded = await decodeMask(await response.blob());
    const mask =
      decoded.width === bitmap.width && decoded.height === bitmap.height
        ? decoded.mask
        : resizeMaskBilinear(decoded.mask, decoded.width, decoded.height, bitmap.width, bitmap.height);
    const summary = summariseMask(mask);
    return {
      mask,
      width: bitmap.width,
      height: bitmap.height,
      coverage: summary.coverage,
      peak: summary.peak,
      backend: caps.provider ?? "server",
      engineId: this.descriptor.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  dispose() {}
}
