import type { Metadata } from "next";
import { DocBody, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";
import { exportLimits, formatBytes, planConfig, uploadLimits } from "@/lib/config";

export const metadata: Metadata = {
  title: "Errors & limits · Developer docs",
  description: "Supported formats, size limits, every upload and engine error, and fixes for common problems.",
};

const validation: Array<[string, string, string]> = [
  ["empty-file", "The file has no bytes.", "This file is empty."],
  ["too-large", `Over ${formatBytes(uploadLimits.maxFileBytes)}, or the batch already has ${uploadLimits.maxBatchFiles} images.`, `This file is 41 MB. The limit is ${formatBytes(uploadLimits.maxFileBytes)}.`],
  ["unsupported-type", "Not PNG, JPEG or WebP by content (HEIC, GIF, TIFF, text…).", "HEIC files aren't supported yet. Use PNG, JPG, WEBP."],
  ["corrupt", "The header can't be read.", "The image header is damaged or incomplete."],
  ["dimension-too-large", `A side over ${uploadLimits.maxDimension.toLocaleString("en-US")}px.`, `This image is 9,000 × 9,000px. The longest side can be ${uploadLimits.maxDimension.toLocaleString("en-US")}px.`],
  ["too-many-pixels", `Over ${uploadLimits.maxMegapixels} MP.`, `This image is 40.0 MP. The limit is ${uploadLimits.maxMegapixels} MP.`],
  ["too-small", `A side under ${uploadLimits.minDimension}px.`, `This image is 20 × 20px. Each side must be at least ${uploadLimits.minDimension}px.`],
  ["decode-failed", "The header is fine but the pixels can't be decoded (a damaged file).", "The browser couldn't decode this image. It may be damaged."],
];

const engine: Array<[string, string, string]> = [
  ["auth-required", "Not signed in, so the model or server engine refused the request.", "Sign in; waiting images start on their own."],
  ["model-missing", "The server has no model file and can't fetch one (404).", "Run npm run models:fetch, or set NEXT_PUBLIC_ISOLA_MODEL_BASE_URL."],
  ["model-download-failed", "The download failed or the server answered with an error.", "Check the connection and the model route; retry."],
  ["model-integrity", "The downloaded bytes don't match the expected size or SHA-256.", "Retry; if it repeats, the file on the server or CDN is wrong."],
  ["unsupported-browser", "No WebAssembly or workers, or High detail without WebGPU.", "Use a current browser, or the Standard model."],
  ["engine-init-failed", "ONNX Runtime couldn't load or create a session.", "Check that /ort/ is served and COOP/COEP headers are intact."],
  ["inference-failed", "The model failed while running.", "Retry; try the Standard model or a smaller image."],
  ["out-of-memory", "The device ran out of memory.", "Close other tabs, or use a smaller image."],
  ["not-configured", "Server engine chosen but no provider configured.", "Set ISOLA_REMOTE_PROVIDER and its key, or use on-device."],
  ["provider-error", "The provider failed, found no subject, or the upload is too large.", "Retry, or switch to on-device processing."],
  ["network", "The browser couldn't reach this server.", "Check the connection; retry."],
  ["cancelled", "You cancelled the image.", "Retry it whenever you like; other images keep going."],
];

const fixes: Array<{ problem: string; cause: string; fix: string }> = [
  {
    problem: "\"Engine unavailable\" or \"The model couldn't be downloaded\" on every image",
    cause: "The model route can't stream the ~170 MB file. Common on serverless hosts with response-size or time limits, or when the server can't reach the model mirror.",
    fix: "Run on a long-running Node host, run npm run models:fetch during deployment, or serve the files from a CORS-enabled CDN via NEXT_PUBLIC_ISOLA_MODEL_BASE_URL.",
  },
  {
    problem: "Images wait with \"Sign in required\" or \"Pro required\"",
    cause: "Background removal needs an account, and Batch Studio needs Pro.",
    fix: "Sign in or upgrade; the waiting images start automatically, and the batch is kept in the browser meanwhile.",
  },
  {
    problem: "Processing is slow and uses one thread",
    cause: "The page isn't cross-origin isolated, usually because a proxy, CDN or iframe stripped COOP/COEP.",
    fix: "Keep Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy on every response; check with Browser requirements.",
  },
  {
    problem: "High detail isn't offered",
    cause: "The browser doesn't expose a WebGPU adapter.",
    fix: "Use a browser and device with WebGPU, or the Standard model.",
  },
  {
    problem: "\"This device ran out of memory\"",
    cause: "Very large images, many open tabs, or a phone with little memory.",
    fix: "Retry after closing tabs, or downscale the image first. In Batch Studio, keep concurrency at 1.",
  },
  {
    problem: "A batch disappears after a reload",
    cause: "The browser refused IndexedDB (some private modes) or storage is full; Batch Studio says so under the batch name.",
    fix: "Use a normal window, free some space, or export finished images before leaving.",
  },
  {
    problem: "Free downloads are 1,000px with a watermark",
    cause: `That's the Free plan (${planConfig.freeMaxExportSide.toLocaleString("en-US")}px, watermarked).`,
    fix: "Upgrade to Pro for full resolution without a watermark.",
  },
];

function CodeTable({ rows, headers }: { rows: Array<[string, string, string]>; headers: [string, string, string] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[640px]">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([code, when, text]) => (
            <tr key={code} id={`code-${code}`}>
              <td>
                <code>{code}</code>
              </td>
              <td>{when}</td>
              <td>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ErrorsLimitsPage() {
  return (
    <>
      <DocHeader
        href="/developers/errors-limits"
        title="Errors & limits."
        lead="What ISOLA accepts, what every error means, and how to fix the problems people actually run into."
        badge="Reference"
      />
      <DocBody>
        <H2 id="formats">File formats and limits</H2>
        <p>
          Images are recognised by their content, not their file name. Every limit can be changed with an environment
          variable (see the README).
        </p>
        <table>
          <thead>
            <tr>
              <th>Limit</th>
              <th>Default</th>
              <th>Variable</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Formats</td>
              <td>PNG, JPEG, WebP</td>
              <td>—</td>
            </tr>
            <tr>
              <td>File size</td>
              <td>{formatBytes(uploadLimits.maxFileBytes)}</td>
              <td>
                <code>NEXT_PUBLIC_ISOLA_MAX_FILE_MB</code>
              </td>
            </tr>
            <tr>
              <td>Longest side</td>
              <td>{uploadLimits.maxDimension.toLocaleString("en-US")}px</td>
              <td>
                <code>NEXT_PUBLIC_ISOLA_MAX_DIMENSION</code>
              </td>
            </tr>
            <tr>
              <td>Shortest side</td>
              <td>{uploadLimits.minDimension}px</td>
              <td>
                <code>NEXT_PUBLIC_ISOLA_MIN_DIMENSION</code>
              </td>
            </tr>
            <tr>
              <td>Pixels</td>
              <td>{uploadLimits.maxMegapixels} MP</td>
              <td>
                <code>NEXT_PUBLIC_ISOLA_MAX_MEGAPIXELS</code>
              </td>
            </tr>
            <tr>
              <td>Images per batch</td>
              <td>{uploadLimits.maxBatchFiles}</td>
              <td>
                <code>NEXT_PUBLIC_ISOLA_MAX_BATCH_FILES</code>
              </td>
            </tr>
            <tr>
              <td>Export size</td>
              <td>
                {exportLimits.maxMegapixels} MP, {exportLimits.maxDimension.toLocaleString("en-US")}px per side
              </td>
              <td>
                <code>NEXT_PUBLIC_ISOLA_MAX_EXPORT_MEGAPIXELS</code>
              </td>
            </tr>
            <tr>
              <td>Free plan exports</td>
              <td>{planConfig.freeMaxExportSide.toLocaleString("en-US")}px, watermarked</td>
              <td>
                <code>NEXT_PUBLIC_ISOLA_FREE_MAX_EXPORT_SIDE</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p>Transparency in PNG and WebP uploads is kept: areas that were already transparent stay transparent in the cutout.</p>

        <H2 id="validation-errors">Upload errors</H2>
        <p>Checked before decoding. A rejected file is reported on its own; the rest of a batch is still added.</p>
        <CodeTable rows={validation} headers={["Code", "When", "Message shown"]} />

        <H2 id="engine-errors">Engine errors</H2>
        <p>
          Engines throw <code>EngineError</code> with one of these codes. The original stays in memory, so every image can be
          retried.
        </p>
        <CodeTable rows={engine} headers={["Code", "Meaning", "What to do"]} />

        <H2 id="troubleshooting">Troubleshooting</H2>
        <div className="not-prose grid gap-3">
          {fixes.map((f) => (
            <details key={f.problem} className="group rounded-[12px] border border-line bg-surface px-4 py-3 open:shadow-[var(--shadow-card)]">
              <summary className="cursor-pointer list-none text-[15px] font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="mr-2 inline-block text-blue transition-transform group-open:rotate-90" aria-hidden="true">
                  ›
                </span>
                {f.problem}
              </summary>
              <div className="mt-2 grid gap-1.5 pl-5 text-[14px] leading-relaxed text-ink-3">
                <p>
                  <span className="font-semibold text-ink">Why: </span>
                  {f.cause}
                </p>
                <p>
                  <span className="font-semibold text-ink">Fix: </span>
                  {f.fix}
                </p>
              </div>
            </details>
          ))}
        </div>

        <DocFooter href="/developers/errors-limits" />
      </DocBody>
    </>
  );
}
