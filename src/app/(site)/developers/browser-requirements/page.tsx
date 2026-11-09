import type { Metadata } from "next";
import { BrowserCheck } from "@/components/docs/browser-check";
import { CodeBlock } from "@/components/docs/code-block";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";
import { exportLimits } from "@/lib/config";

export const metadata: Metadata = {
  title: "Browser requirements · Developer docs",
  description: "What a browser needs to run ISOLA's on-device background removal, with a live check of your browser.",
};

const headers = `Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
`;

export default function BrowserRequirementsPage() {
  return (
    <>
      <DocHeader
        href="/developers/browser-requirements"
        title="Browser requirements."
        lead="On-device processing uses features every current browser has, plus a few optional ones that make it faster."
        badge="On-device processing"
      />
      <DocBody>
        <H2 id="check">Check this browser</H2>
        <p>This runs the same feature tests the engine relies on. Nothing is uploaded.</p>
        <BrowserCheck />

        <H2 id="required">Required features</H2>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Used for</th>
              <th>Without it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>WebAssembly</td>
              <td>Running the model on the CPU</td>
              <td>&quot;Engine unavailable&quot; with an unsupported-browser message</td>
            </tr>
            <tr>
              <td>Module Web Workers</td>
              <td>Running inference off the main thread</td>
              <td>&quot;Engine unavailable&quot;</td>
            </tr>
            <tr>
              <td>
                <code>createImageBitmap</code> and canvas
              </td>
              <td>Decoding, compositing and encoding exports</td>
              <td>Images can&apos;t be opened or exported</td>
            </tr>
          </tbody>
        </table>

        <H2 id="optional">Optional features</H2>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>What it adds</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>WebGPU</td>
              <td>GPU inference (much faster), and the High detail model, which needs it.</td>
            </tr>
            <tr>
              <td>Cross-origin isolation</td>
              <td>Multi-threaded WebAssembly (up to 4 threads) via SharedArrayBuffer.</td>
            </tr>
            <tr>
              <td>OffscreenCanvas</td>
              <td>Off-screen compositing; a regular canvas is used otherwise.</td>
            </tr>
            <tr>
              <td>Cache Storage</td>
              <td>Keeps the downloaded model between visits.</td>
            </tr>
            <tr>
              <td>IndexedDB</td>
              <td>Keeps a Batch Studio batch across reloads, sign-in and checkout.</td>
            </tr>
          </tbody>
        </table>

        <H2 id="headers">Required response headers</H2>
        <p>
          Threads need the page to be cross-origin isolated. <code>next.config.ts</code> sends these headers on every route;
          keep them if you put a proxy or CDN in front of the app:
        </p>
        <CodeBlock title="Response headers" code={headers} lang="http" lineNumbers={false} />
        <p>
          With <code>require-corp</code>, anything loaded from another origin must allow it. If you host the model files on a
          CDN, it has to send CORS headers and <code>Cross-Origin-Resource-Policy: cross-origin</code>, or the browser will
          refuse the download.
        </p>

        <H2 id="memory">Memory and image size</H2>
        <ul>
          <li>WebAssembly memory is capped at 4 GB, which is why High detail runs only on WebGPU.</li>
          <li>
            Exports are limited to {exportLimits.maxMegapixels} MP and {exportLimits.maxDimension.toLocaleString("en-US")}px per
            side. iOS Safari caps canvases at about 16.7 MP, so very large exports may need a smaller size on iPhones and iPads.
          </li>
          <li>If a device runs out of memory, the image fails with an out-of-memory error and stays available to retry.</li>
        </ul>

        <H2 id="tested">What has been tested</H2>
        <DocCallout tone="warn" title="Verified in Chromium only">
          <p>
            The automated suites run in Chromium (WebAssembly, 3 threads). Safari, Firefox, WebGPU hardware and real phones
            haven&apos;t been verified yet. Use the check above to see what your browser supports.
          </p>
        </DocCallout>

        <DocFooter href="/developers/browser-requirements" />
      </DocBody>
    </>
  );
}
