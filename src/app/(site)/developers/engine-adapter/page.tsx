import type { Metadata } from "next";
import { CodeBlock } from "@/components/docs/code-block";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Engine adapter · Developer docs",
  description: "The BackgroundRemovalEngine interface that every ISOLA engine implements, its contract, and how to add your own.",
};

const contract = `// src/lib/processing/types.ts
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

export interface RemoveOptions {
  signal?: AbortSignal;
  onPhase?: (phase: JobPhase) => void;
}

export interface MaskResult {
  mask: Uint8Array;   // 0–255, one byte per pixel, row-major
  width: number;      // equals the input image width
  height: number;     // equals the input image height
  coverage: number;   // share of pixels above 50%
  peak: number;       // highest confidence, 0–1
  backend: string;    // e.g. "webgpu", "wasm", "removebg"
  engineId: string;
  durationMs: number;
}

export type EngineState =
  | { kind: "idle" }
  | { kind: "downloading"; loaded: number; total: number | null }
  | { kind: "initialising" }
  | { kind: "ready"; backend: string; threads?: number }
  | { kind: "unavailable"; reason: EngineErrorCode; message: string; detail?: string }
  | { kind: "error"; reason: EngineErrorCode; message: string; detail?: string };
`;

const descriptor = `export interface EngineDescriptor {
  id: string;               // "device:isnet-general-use", "server:remote"
  label: string;            // shown in the engine picker
  description: string;
  location: "device" | "server";
  provenance: string;       // model or provider name and licence
  downloadBytes?: number;   // one-time download for on-device engines
}
`;

const registry = `// src/lib/processing/registry.ts
export type EngineId = \`device:\${ModelId}\` | "server:remote";

export function getEngine(id: EngineId): BackgroundRemovalEngine {
  let engine = engines.get(id);
  if (!engine) {
    engine = id === "server:remote" ? new RemoteEngine() : new OnnxEngine(MODELS[modelIdOf(id)]);
    engines.set(id, engine);
    engine.subscribe(emit);  // components re-render through useEngineState(id)
  }
  // Only one on-device model stays resident; idle ones are disposed.
  return engine;
}
`;

const custom = `// Example: an engine that calls a segmentation service you host yourself.
// Not part of ISOLA; shown to illustrate the contract.
import { EngineError, summariseMask, type BackgroundRemovalEngine, type EngineState, type MaskResult, type RemoveOptions } from "@/lib/processing/types";

export class SelfHostedEngine implements BackgroundRemovalEngine {
  readonly descriptor = {
    id: "server:self-hosted",
    label: "Studio server",
    description: "Processed on our own server. Your image is uploaded.",
    location: "server" as const,
    provenance: "In-house model",
  };
  private state: EngineState = { kind: "idle" };
  private listeners = new Set<(s: EngineState) => void>();

  getState() { return this.state; }
  subscribe(listener: (s: EngineState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private set(state: EngineState) { this.state = state; this.listeners.forEach((l) => l(state)); }

  async load() { this.set({ kind: "ready", backend: "self-hosted" }); }

  async removeBackground(image: ImageBitmap, { signal, onPhase }: RemoveOptions = {}): Promise<MaskResult> {
    const started = performance.now();
    const canvas = new OffscreenCanvas(image.width, image.height);
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    const body = await canvas.convertToBlob({ type: "image/png" });
    onPhase?.({ kind: "uploading" });
    const res = await fetch("/api/my-segmenter", { method: "POST", body, signal });  // AbortSignal cancels the upload
    if (!res.ok) throw new EngineError("provider-error", "The studio server couldn't process this image.", \`HTTP \${res.status}\`);
    onPhase?.({ kind: "finalising" });
    const mask = new Uint8Array(await res.arrayBuffer());  // must be width × height bytes
    if (mask.length !== image.width * image.height) throw new EngineError("inference-failed", "Mask size mismatch.");
    return { mask, width: image.width, height: image.height, ...summariseMask(mask), backend: "self-hosted", engineId: this.descriptor.id, durationMs: performance.now() - started };
  }

  dispose() { this.listeners.clear(); }
}
`;

export default function EngineAdapterPage() {
  return (
    <>
      <DocHeader
        href="/developers/engine-adapter"
        title="Engine adapter."
        lead="The editor and Batch Studio never talk to a model directly. They use one small interface, so engines can be swapped without touching the UI."
        badge="Architecture"
      />
      <DocBody>
        <H2 id="interface">The interface</H2>
        <CodeBlock title="BackgroundRemovalEngine" code={contract} />
        <CodeBlock title="EngineDescriptor" code={descriptor} />

        <H2 id="contract">Contract</H2>
        <ul>
          <li>
            <strong>Full resolution.</strong> <code>mask</code> has exactly <code>width × height</code> bytes for the image
            you were given. Batch Studio refuses a result whose size doesn&apos;t match.
          </li>
          <li>
            <strong>Values.</strong> 0 is background, 255 is subject, values in between are partial transparency (hair, soft
            edges). Row-major, top-left first.
          </li>
          <li>
            <strong>Cancellation.</strong> When <code>signal</code> aborts, stop work and reject with{" "}
            <code>EngineError(&quot;cancelled&quot;)</code> or an <code>AbortError</code>. Other images must keep working
            afterwards.
          </li>
          <li>
            <strong>Honest progress.</strong> Report phases with <code>onPhase</code> as they really happen. Use{" "}
            <code>downloading</code> with byte counts only for measured downloads; never invent percentages.
          </li>
          <li>
            <strong>Errors.</strong> Throw <code>EngineError</code> with one of the{" "}
            <a href="/developers/errors-limits#engine-errors">documented codes</a> and a message a person can act on; put
            technical details in <code>detail</code>. <code>auth-required</code> means &quot;sign in and retry&quot;, not
            &quot;broken&quot;.
          </li>
          <li>
            <strong>Reusable.</strong> <code>load()</code> may be called many times and should prepare once. Many images
            are processed with the same engine instance.
          </li>
        </ul>

        <H2 id="registering">Registering an engine</H2>
        <CodeBlock title="registry.ts (abridged)" code={registry} />
        <p>
          Add an id to <code>EngineId</code>, construct your class in <code>getEngine</code>, and offer it in the editor&apos;s
          engine section (<code>src/components/editor/properties-panel.tsx</code>). Components subscribe with{" "}
          <code>useEngineState(id)</code>, which doesn&apos;t create a worker until the engine is actually used.
        </p>

        <H2 id="implementations">Implementations</H2>
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Engine ids</th>
              <th>How it works</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>OnnxEngine</code>
              </td>
              <td>
                <code>device:isnet-general-use</code>, <code>device:birefnet-lite</code>
              </td>
              <td>
                ONNX Runtime Web in a module worker; one inference at a time; download progress in real bytes; cancels the
                running job by terminating the worker.
              </td>
            </tr>
            <tr>
              <td>
                <code>RemoteEngine</code>
              </td>
              <td>
                <code>server:remote</code>
              </td>
              <td>
                Re-encodes the decoded image as PNG and posts it to this deployment&apos;s{" "}
                <a href="/developers/server-endpoints#remove-background">
                  <code>/api/remove-background</code>
                </a>
                . Offered only when <code>GET /api/engines</code> reports a configured provider, and labelled as uploading.
              </td>
            </tr>
          </tbody>
        </table>

        <H2 id="custom-engine">Writing your own</H2>
        <DocCallout title="Example code">
          <p>
            The class below isn&apos;t part of ISOLA. It shows the contract applied to a hypothetical service at{" "}
            <code>/api/my-segmenter</code>. Keep provider keys on the server, behind a route like that, never in the browser.
          </p>
        </DocCallout>
        <CodeBlock title="self-hosted-engine.ts" code={custom} />

        <DocFooter href="/developers/engine-adapter" />
      </DocBody>
    </>
  );
}
