import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";
import { formatBytes, planConfig, uploadLimits } from "@/lib/config";

export const metadata: Metadata = {
  title: "API reference · Developer docs",
  description: "Endpoints, parameters, response headers, errors, rate limits and plan rules for ISOLA's public API.",
};

/** The default; a deployment can change it, and GET /api/v1/me reports the live value. */
const RATE = 60;

const auth = `Authorization: Bearer isola_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# or
X-Api-Key: isola_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
`;

const response = `HTTP/1.1 200 OK
Content-Type: image/png
X-Isola-Width: 1600
X-Isola-Height: 1280
X-Isola-Original-Width: 1600
X-Isola-Original-Height: 1280
X-Isola-Plan: pro
X-Isola-Watermark: false
X-Isola-Model: isnet-general-use
X-Isola-Duration-Ms: 830
X-RateLimit-Limit: ${RATE}
X-RateLimit-Remaining: ${RATE - 1}
X-RateLimit-Reset: 1794256660
`;

const meBody = `{
  "key": { "name": "Shop backend", "preview": "isola_sk_Pw18…sYm7", "createdAt": "…", "lastUsedAt": "…", "requestCount": 12 },
  "plan": { "name": "free", "proUntil": null },
  "output": { "watermark": true, "maxSide": ${planConfig.freeMaxExportSide}, "masks": false, "note": "…" },
  "rateLimit": { "limit": ${RATE}, "remaining": ${RATE - 12}, "resetAt": "…" },
  "limits": { "maxFileBytes": ${uploadLimits.maxFileBytes}, "maxDimension": ${uploadLimits.maxDimension}, "minDimension": ${uploadLimits.minDimension}, "maxMegapixels": ${uploadLimits.maxMegapixels}, "formats": ["image/png", "image/jpeg", "image/webp"] },
  "model": { "id": "isnet-general-use", "name": "Standard", "license": "Apache-2.0" }
}
`;

const errorBody = `{
  "error": {
    "code": "invalid_api_key",
    "message": "This API key isn't valid. It may have been deleted."
  }
}
`;

const errors: Array<[number, string, string]> = [
  [400, "invalid_request", "Missing `image` field, empty body, or an unknown option value."],
  [401, "missing_api_key", "No key in Authorization or X-Api-Key."],
  [401, "invalid_api_key", "The key doesn't exist or was deleted."],
  [403, "pro_required", "`output=mask` with a Free key."],
  [413, "payload_too_large", `Over ${formatBytes(uploadLimits.maxFileBytes)}.`],
  [415, "unsupported_media_type", "Not PNG, JPEG or WebP (checked by content), or an unsupported Content-Type."],
  [422, "image_too_large", `A side over ${uploadLimits.maxDimension.toLocaleString("en-US")}px, or more than ${uploadLimits.maxMegapixels} MP.`],
  [422, "image_too_small", `A side under ${uploadLimits.minDimension}px.`],
  [422, "decode_failed", "The header is fine but the image can't be decoded (damaged file)."],
  [429, "rate_limited", "The key's hourly limit is used up. See Retry-After."],
  [500, "internal_error", "The engine failed. Retrying is safe."],
  [503, "model_unavailable", "The server has no model and couldn't download one."],
  [503, "server_busy", "Too many images queued on the server. Retry after Retry-After seconds."],
];

function Param({ name, type, def, children }: { name: string; type: string; def?: string; children: React.ReactNode }) {
  return (
    <tr>
      <td>
        <code>{name}</code>
      </td>
      <td className="whitespace-nowrap">{type}</td>
      <td>{def ? <code>{def}</code> : "—"}</td>
      <td>{children}</td>
    </tr>
  );
}

export default function ApiReferencePage() {
  return (
    <>
      <DocHeader
        href="/developers/api-reference"
        title="API reference."
        lead="Version 1 of the ISOLA API: two endpoints, bearer-key authentication and JSON errors."
        badge="Public API"
      />
      <DocBody>
        <H2 id="authentication">Authentication</H2>
        <p>
          Create keys on the <Link href="/account">Account page</Link> (up to 10 per account) and send one with every request.
          Keys start with <code>isola_sk_</code>. Only a SHA-256 hash is stored; deleting a key stops it immediately.
        </p>
        <CodeBlock title="Either header works" code={auth} lang="http" lineNumbers={false} />
        <p>
          The API sends CORS headers for any origin, because keys are bearer tokens rather than cookies. Even so, call it
          from your server: a key in a web page or app can be copied by anyone who opens it.
        </p>

        <H2 id="remove-background">POST /api/v1/remove-background</H2>
        <p>
          Removes the background from one image on the server with the Standard model (IS-Net, the same as the app) and
          returns the result in the response body. The image is processed in memory and not stored.
        </p>
        <h3>Body</h3>
        <ul>
          <li>
            <code>multipart/form-data</code> with the image in an <code>image</code> field, plus any options as fields; or
          </li>
          <li>
            the raw image bytes with <code>Content-Type: image/png</code>, <code>image/jpeg</code> or <code>image/webp</code>,
            and options as query parameters.
          </li>
        </ul>
        <h3>Options</h3>
        <div className="overflow-x-auto">
          <table className="min-w-[620px]">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <Param name="output" type="cutout | mask" def="cutout">
                <code>cutout</code>: the subject with transparency (or on <code>background</code>). <code>mask</code>: greyscale
                PNG alpha mask, white = subject (Pro).
              </Param>
              <Param name="format" type="png | jpeg" def="png">
                JPEG is always opaque: transparent areas become <code>background</code>, or white.
              </Param>
              <Param name="background" type="transparent | #RRGGBB" def="transparent">
                Places the subject on a solid colour.
              </Param>
            </tbody>
          </table>
        </div>
        <h3>Response</h3>
        <p>
          <code>200</code> with the image. The output keeps the input&apos;s dimensions on Pro (after EXIF rotation); on Free
          it&apos;s scaled to fit {planConfig.freeMaxExportSide.toLocaleString("en-US")}px and watermarked.
        </p>
        <CodeBlock title="Response headers" code={response} lang="http" lineNumbers={false} />

        <H2 id="me">GET /api/v1/me</H2>
        <p>Checks a key and reports its plan, output rules, remaining requests and upload limits. It doesn&apos;t count towards the rate limit.</p>
        <CodeBlock title="Response" code={meBody} lang="json" />

        <H2 id="errors">Errors</H2>
        <p>Errors are JSON with a stable <code>code</code> to branch on and a <code>message</code> to show or log:</p>
        <CodeBlock title="Error body" code={errorBody} lang="json" lineNumbers={false} />
        <div className="overflow-x-auto">
          <table className="min-w-[560px]">
            <thead>
              <tr>
                <th>Status</th>
                <th>Code</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {errors.map(([status, code, when]) => (
                <tr key={code} id={`api-${code}`}>
                  <td>{status}</td>
                  <td>
                    <code>{code}</code>
                  </td>
                  <td>{when.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H2 id="rate-limits">Rate limits</H2>
        <ul>
          <li>
            Each key can make {RATE} processing requests per hour by default (operators change this with{" "}
            <code>ISOLA_API_RATE_LIMIT_PER_HOUR</code>; <code>GET /api/v1/me</code> shows the value for your deployment). Every
            response says how many are left in <code>X-RateLimit-Remaining</code> and when the window resets.
          </li>
          <li>
            The server processes one image at a time and queues a few more (<code>ISOLA_API_MAX_QUEUE</code>, default 8). Past
            that it answers <code>503 server_busy</code> with <code>Retry-After</code>.
          </li>
          <li>Requests that fail validation don&apos;t count; requests that reach the model do, whatever their outcome.</li>
        </ul>
        <DocCallout tone="warn" title="Limits are per server instance">
          <p>
            Counts are kept in memory. If you run several instances behind a load balancer, each keeps its own count; swap the
            limiter in <code>src/server/usage.ts</code> for a shared store first.
          </p>
        </DocCallout>

        <H2 id="plans">Plans</H2>
        <table>
          <thead>
            <tr>
              <th>
                <span className="sr-only">Feature</span>
              </th>
              <th>Free key</th>
              <th>Pro key</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cutouts</td>
              <td>Up to {planConfig.freeMaxExportSide.toLocaleString("en-US")}px, watermarked</td>
              <td>Full resolution, no watermark</td>
            </tr>
            <tr>
              <td>Masks</td>
              <td>—</td>
              <td>Yes</td>
            </tr>
            <tr>
              <td>Hourly limit</td>
              <td>{RATE} per key by default</td>
              <td>{RATE} per key by default</td>
            </tr>
          </tbody>
        </table>
        <p>
          The plan is read from the key&apos;s account on every request, so upgrading takes effect immediately, and keys keep
          working (as Free) if Pro lapses. <Link href="/pricing">See pricing</Link>.
        </p>

        <DocFooter href="/developers/api-reference" />
      </DocBody>
    </>
  );
}
