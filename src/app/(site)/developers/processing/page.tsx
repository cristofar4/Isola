import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";
import { batchConfig, formatBytes, planConfig, uploadLimits } from "@/lib/config";
import { MODELS } from "@/lib/processing/models";

export const metadata: Metadata = {
  title: "How processing works · Developer docs",
  description: "Validation, on-device models, inference in a Web Worker, compositing, Batch Studio and export in ISOLA.",
};

const phases = `type JobPhase =
  | { kind: "waiting" }         // queued behind another image
  | { kind: "loading-engine" }  // downloading or starting the model
  | { kind: "uploading" }       // server engine only
  | { kind: "inferring" }       // the model is running
  | { kind: "finalising" };     // building the full-resolution mask
`;

export default function ProcessingPage() {
  const models = Object.values(MODELS);
  return (
    <>
      <DocHeader
        href="/developers/processing"
        title="How processing works."
        lead="Every step between choosing a file and downloading a cutout, and where each one runs."
        badge="On-device processing"
      />
      <DocBody>
        <H2 id="pipeline">Pipeline</H2>
        <ol>
          <li>
            <strong>Validate.</strong> The first bytes are read to identify PNG, JPEG or WebP by content (not by the file
            name), and the width and height are read from the header, before anything is decoded. Files over{" "}
            {formatBytes(uploadLimits.maxFileBytes)}, {uploadLimits.maxDimension.toLocaleString("en-US")}px per side,{" "}
            {uploadLimits.maxMegapixels} MP, or under {uploadLimits.minDimension}px are refused with a specific message.
          </li>
          <li>
            <strong>Decode.</strong> <code>createImageBitmap</code> decodes the file with its EXIF orientation applied. The
            decoded original is kept unchanged: retries, the restore brush and every export read from it.
          </li>
          <li>
            <strong>Load the engine.</strong> The chosen engine prepares itself once per session (see below) and is reused for
            every image.
          </li>
          <li>
            <strong>Create the mask.</strong> The engine returns an alpha mask at the original resolution: one byte per pixel,
            0 (background) to 255 (subject).
          </li>
          <li>
            <strong>Refine and export.</strong> Brushes, edge settings, background, shadow and crop are applied on top. Nothing
            is baked into the original or the automatic mask.
          </li>
        </ol>

        <H2 id="models">On-device models</H2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Engine id</th>
              <th>Model</th>
              <th>Licence</th>
              <th>Download</th>
              <th>Runs on</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
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
          Both take a {models[0].inputSize}×{models[0].inputSize} input. High detail needs more memory than WebAssembly&apos;s
          4 GB ceiling allows (it fails with an allocation error there), so it&apos;s only offered when the browser exposes
          WebGPU.
        </p>

        <H2 id="model-delivery">Model delivery and caching</H2>
        <ol>
          <li>
            The worker requests <code>/api/models/&lt;file&gt;</code> with the session cookie. The route answers only signed-in
            users (401 otherwise), which is how the account requirement for background removal is enforced.
          </li>
          <li>
            The server streams the file from <code>./models</code> (or <code>ISOLA_MODEL_DIR</code>). If it&apos;s missing,
            the server downloads it once from the mirror, checks its SHA-256 and keeps it; <code>npm run models:fetch</code>{" "}
            does the same ahead of time.
          </li>
          <li>
            The browser reports real byte progress, checks the size and SHA-256 again, and stores the file in Cache Storage (
            <code>isola-models-v1</code>), so later visits skip the download. Without Cache Storage it downloads once per
            session.
          </li>
        </ol>
        <DocCallout tone="warn" title="Hosting">
          <p>
            The route streams a file of about {formatBytes(models[0].bytes)}, so it needs a long-running Node server. On
            serverless platforms with response-size or time limits, host the files on a CDN and set{" "}
            <code>NEXT_PUBLIC_ISOLA_MODEL_BASE_URL</code>; see{" "}
            <Link href="/developers/server-endpoints#configuration" className="font-semibold text-blue-700 underline">
              Configuration
            </Link>
            .
          </p>
        </DocCallout>

        <H2 id="inference">Inference</H2>
        <ul>
          <li>
            ONNX Runtime Web runs in a module Web Worker, loaded from this site&apos;s <code>/ort/</code> folder (no third-party
            CDN).
          </li>
          <li>
            With WebGPU it runs on the GPU; if the GPU fails at run time, the job is retried once on WebAssembly. Otherwise it
            uses WebAssembly with up to 4 threads when the page is cross-origin isolated, or a single thread when it isn&apos;t.
          </li>
          <li>
            The image is resized to the model&apos;s input and normalised; the output is turned into 0–255 values and scaled
            back up to the original size with bilinear interpolation.
          </li>
          <li>
            Progress is reported as phases, never as an invented percentage. Only the model download has a measured
            percentage.
          </li>
          <li>
            Cancelling the image that&apos;s running terminates the worker; the next job starts a fresh one, which reloads the
            model from Cache Storage.
          </li>
        </ul>
        <CodeBlock title="Job phases" code={phases} />

        <H2 id="compositing">Editing and compositing</H2>
        <p>An image in the editor is a set of separate layers, so every edit is non-destructive and undoable:</p>
        <ul>
          <li>the decoded original, never modified;</li>
          <li>the automatic mask, as the engine returned it (used by &quot;Reset to automatic&quot;);</li>
          <li>the editable mask that the restore and erase brushes write to, with undo history stored as changed rectangles;</li>
          <li>edge refinement (shift and feather), applied to a derived copy of the mask;</li>
          <li>background, shadow, crop and output size, stored as settings.</li>
        </ul>
        <p>
          The on-screen preview and the exporter call the same compositing function, so a download matches what you see. The
          transparency checkerboard is drawn by the page behind the canvas and is never part of a file.
        </p>

        <H2 id="batch">Batch Studio pipeline</H2>
        <ul>
          <li>
            Each image has its own id, original, status (queued, processing, ready, failed, cancelled), mask and applied
            settings. Selection is separate from status.
          </li>
          <li>
            The queue runs {batchConfig.concurrency === 1 ? "one image" : `${batchConfig.concurrency} images`} at a time through
            the same shared engine (<code>NEXT_PUBLIC_ISOLA_BATCH_CONCURRENCY</code>, up to 4). One failure doesn&apos;t stop
            the rest.
          </li>
          <li>
            Masks are kept as compressed PNGs. Changing background, canvas, padding, alignment or format reuses the stored
            mask; nothing is reprocessed.
          </li>
          <li>
            Card previews and downloads are drawn by the same function, previews from a smaller cutout. Downloads render at
            full resolution one image at a time, and ZIPs are assembled in the browser.
          </li>
          <li>
            The batch is kept in IndexedDB so it survives reloads, signing in and checkout; see{" "}
            <Link href="/developers/privacy-storage#browser-storage">Privacy &amp; storage</Link>.
          </li>
        </ul>

        <H2 id="export">Export and plans</H2>
        <table>
          <thead>
            <tr>
              <th>Format</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Transparent PNG</td>
              <td>RGBA with a real alpha channel; background pixels are fully transparent.</td>
            </tr>
            <tr>
              <td>PNG with background</td>
              <td>Lossless, with the chosen colour or image behind the subject.</td>
            </tr>
            <tr>
              <td>JPEG</td>
              <td>Always opaque: transparent areas are filled with an explicit colour.</td>
            </tr>
          </tbody>
        </table>
        <p>
          One module, <code>src/lib/plan-policy.ts</code>, decides what each plan exports, for the editor and Batch Studio
          alike. Free exports carry an ISOLA watermark and are limited to{" "}
          {planConfig.freeMaxExportSide.toLocaleString("en-US")}px on the longest side; Pro exports at full resolution with no
          watermark. Pro status comes from the session and only the server changes it, after verifying a payment. The
          watermark itself is drawn in the browser, because that&apos;s where images are processed.
        </p>

        <DocFooter href="/developers/processing" />
      </DocBody>
    </>
  );
}
