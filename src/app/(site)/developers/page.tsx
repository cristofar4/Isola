import type { Metadata } from "next";
import { Callout, PageShell } from "@/components/site/page-shell";
import { formatBytes, uploadLimits } from "@/lib/config";
import { MODELS } from "@/lib/processing/models";

export const metadata: Metadata = {
  title: "Developer docs",
  description: "How ISOLA processes images, the engine adapter interface, and the server endpoints that exist today.",
};

const adapter = `export interface BackgroundRemovalEngine {
  readonly descriptor: EngineDescriptor;      // id, label, location: "device" | "server"
  getState(): EngineState;                    // idle | downloading | initialising | ready | unavailable | error
  subscribe(listener: (state: EngineState) => void): () => void;
  load(): Promise<void>;                      // download model / check provider
  removeBackground(image: ImageBitmap, options?: {
    signal?: AbortSignal;                     // real cancellation
    onPhase?: (phase: JobPhase) => void;      // waiting | loading-engine | uploading | inferring | finalising
  }): Promise<MaskResult>;                    // 0–255 alpha mask at the original resolution
  dispose(): void;
}`;

const curl = `curl -X POST https://your-deployment.example/api/remove-background \\
  -F "image=@photo.jpg" \\
  -o mask.png`;

export default function DevelopersPage() {
  return (
    <PageShell
      eyebrow="Developers"
      title="Developer docs"
      intro={
        <p>
          How ISOLA turns an image into a cutout, where that happens, and how to swap the engine. This page only describes
          interfaces and endpoints that exist in this codebase today.
        </p>
      }
    >
      <Callout>
        ISOLA doesn&apos;t offer a hosted public API, API keys or usage plans yet. The server route below is part of each
        deployment and is disabled unless its operator configures a provider.
      </Callout>

      <h2 id="architecture">How processing works</h2>
      <ol>
        <li>The browser validates the file by its content (PNG, JPEG or WebP), size and dimensions before decoding it.</li>
        <li>The decoded original is kept unchanged in memory for retries, the restore brush and export.</li>
        <li>
          An engine produces an alpha mask at the original resolution. By default this runs on the device with ONNX Runtime Web
          in a Web Worker (WebGPU when available, otherwise multi-threaded WebAssembly).
        </li>
        <li>
          The editor keeps the original, the editable mask, edge settings, background and shadow separate. The preview and
          the exporter share one compositing function, so downloads match what you see, minus the transparency checkerboard.
        </li>
      </ol>

      <h2 id="models">On-device models</h2>
      <table>
        <thead>
          <tr>
            <th>Engine id</th>
            <th>Model</th>
            <th>Licence</th>
            <th>Download</th>
            <th>Runs on</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(MODELS).map((m) => (
            <tr key={m.id}>
              <td>
                <code>device:{m.id}</code>
              </td>
              <td>
                <a href={m.sourceUrl}>{m.provenance}</a>
              </td>
              <td>{m.license}</td>
              <td>{formatBytes(m.bytes)}</td>
              <td>{m.requiresWebGPU ? "WebGPU only" : "WebGPU or WebAssembly"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Model files aren&apos;t committed to the repository. Install them into <code>public/models</code> with{" "}
        <code>npm run models:fetch</code> (add <code>-- --all</code> for every model), or host them elsewhere and set{" "}
        <code>NEXT_PUBLIC_ISOLA_MODEL_BASE_URL</code>. Each download is checked against a SHA-256 checksum in the browser and
        cached in Cache Storage. If a model is missing, the editor says so instead of pretending to work.
      </p>
      <p>
        The High detail model needs more memory than WebAssembly&apos;s 4 GB limit allows, so it is only offered when the
        browser exposes WebGPU.
      </p>

      <h2 id="adapter">Engine adapter</h2>
      <p>
        The editor and batch studio only talk to this interface (<code>src/lib/processing/types.ts</code>). Add an engine by
        implementing it and registering it in <code>src/lib/processing/registry.ts</code>.
      </p>
      <pre>
        <code>{adapter}</code>
      </pre>
      <p>Implementations in this codebase:</p>
      <ul>
        <li>
          <code>OnnxEngine</code> — on-device inference in a module worker, with download progress measured in real bytes and
          cancellation by terminating the worker.
        </li>
        <li>
          <code>RemoteEngine</code> — uploads to this deployment&apos;s <code>/api/remove-background</code> route. Offered only
          when <code>GET /api/engines</code> reports a configured provider.
        </li>
      </ul>

      <h2 id="endpoints">Server endpoints</h2>
      <h3>GET /api/engines</h3>
      <p>Reports which engines the deployment can offer. It never returns credentials.</p>
      <pre>
        <code>{`{
  "device": { "available": true, "note": "On-device models run in the visitor's browser." },
  "remote": { "configured": false, "provider": null, "providerLabel": null, "maxUploadBytes": 0 }
}`}</code>
      </pre>

      <h3>POST /api/remove-background</h3>
      <p>
        Multipart form data with one <code>image</code> field (PNG, JPEG or WebP). Responds with a greyscale PNG alpha mask
        (white keeps the subject). The image is forwarded to the configured provider and isn&apos;t stored or logged by the
        route.
      </p>
      <pre>
        <code>{curl}</code>
      </pre>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>200</td><td>PNG mask in the body.</td></tr>
          <tr><td>400 / 415</td><td>Missing <code>image</code> field, or not a PNG, JPEG or WebP file.</td></tr>
          <tr><td>403</td><td>Cross-origin browser request (unless explicitly allowed).</td></tr>
          <tr><td>413</td><td>Larger than <code>ISOLA_REMOTE_MAX_UPLOAD_MB</code> (default 12 MB).</td></tr>
          <tr><td>422</td><td>The provider found no subject.</td></tr>
          <tr><td>429</td><td>Per-client limit reached (<code>ISOLA_REMOTE_RATE_LIMIT_PER_HOUR</code>, default 30). See <code>Retry-After</code>.</td></tr>
          <tr><td>502 / 504</td><td>The provider failed or timed out.</td></tr>
          <tr><td>503</td><td>No provider configured on this deployment.</td></tr>
        </tbody>
      </table>
      <p>
        The only provider implemented is remove.bg (<code>ISOLA_REMOTE_PROVIDER=removebg</code> with{" "}
        <code>REMOVE_BG_API_KEY</code>). Keys stay on the server. The rate limiter is in memory and per instance; replace it
        with a shared store before relying on it in production.
      </p>

      <h2 id="accounts">Accounts</h2>
      <p>
        Accounts use <a href="https://www.better-auth.com">Better Auth</a>, mounted at <code>/api/auth/*</code> for the
        site&apos;s own sign-in pages. These routes are an implementation detail, not a public API. Email and password
        sign-in is always on; Google and GitHub appear only when their OAuth credentials are set. Accounts are stored in
        Postgres when <code>DATABASE_URL</code> is set, otherwise in a local SQLite file. When signed in, the server
        engine&apos;s rate limit applies per account instead of per IP address.
      </p>

      <h2 id="limits">Limits</h2>
      <p>
        Uploads: {formatBytes(uploadLimits.maxFileBytes)}, {uploadLimits.maxDimension.toLocaleString("en-US")}px per side and{" "}
        {uploadLimits.maxMegapixels} MP by default. Every limit is configurable through environment variables listed in the
        README.
      </p>
    </PageShell>
  );
}
