import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/docs/code-block";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";
import { planConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Server endpoints · Developer docs",
  description: "The routes each ISOLA deployment serves, who may call them, and how to configure server processing.",
};

const engines = `GET /api/engines

{
  "device": { "available": true, "note": "On-device models run in the visitor's browser." },
  "remote": { "configured": false, "provider": null, "providerLabel": null, "maxUploadBytes": 0 }
}
`;

const curl = `# Run from a browser session's cookie jar, or the request is refused with 401.
curl -X POST https://your-deployment.example/api/remove-background \\
  -b cookies.txt \\
  -F "image=@photo.jpg" \\
  -o mask.png
`;

const errorBody = `{ "error": "rate-limited", "message": "You've reached the processing limit for now. Try again later." }
`;

const checkout = `POST /api/billing/checkout
Content-Type: application/json

{ "interval": "yearly", "returnTo": "/batch" }

→ 200 { "code": "ok", "message": "Redirecting to payment.", "url": "https://checkout.paystack.com/…" }
`;

const env = `# Server processing (optional, off by default)
ISOLA_REMOTE_PROVIDER=removebg
REMOVE_BG_API_KEY=…                     # server only
ISOLA_REMOTE_MAX_UPLOAD_MB=12
ISOLA_REMOTE_RATE_LIMIT_PER_HOUR=30
ISOLA_REMOTE_ALLOW_CROSS_ORIGIN=false

# Public API
ISOLA_API_RATE_LIMIT_PER_HOUR=60       # per key
ISOLA_API_MAX_QUEUE=8                  # images waiting on the server
ISOLA_API_THREADS=0                    # 0 = all CPU cores

# Models
ISOLA_MODEL_DIR=./models               # where the server keeps .onnx files
NEXT_PUBLIC_ISOLA_MODEL_BASE_URL=/api/models/   # or a CORS-enabled CDN
`;

function Endpoint({ method, path, who }: { method: string; path: string; who: string }) {
  return (
    <p className="not-prose -mt-1 mb-3 flex flex-wrap items-center gap-2 text-[13px]">
      <span className="rounded-md bg-ink px-2 py-0.5 font-mono font-semibold text-white">{method}</span>
      <code className="rounded-md bg-paper-2 px-2 py-0.5 font-mono text-ink">{path}</code>
      <span className="rounded-md bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{who}</span>
    </p>
  );
}

export default function ServerEndpointsPage() {
  return (
    <>
      <DocHeader
        href="/developers/server-endpoints"
        title="Server endpoints."
        lead="The routes every deployment serves for its own pages. The public API for your code lives under /api/v1 and has its own reference."
        badge="Deployment interfaces"
      />
      <DocBody>
        <H2 id="authentication">Authentication and access</H2>
        <ul>
          <li>
            Accounts use <a href="https://www.better-auth.com">Better Auth</a>, mounted at <code>/api/auth/*</code> for the
            site&apos;s own sign-in, sign-up, verification and password-reset pages. Signing in sets an HTTP-only session
            cookie (prefixed <code>isola</code>) that lasts up to 30 days.
          </li>
          <li>
            Background removal needs an account. The model files and the server engine both check the session and answer{" "}
            <code>401</code> without one.
          </li>
          <li>
            Pro status (for full-resolution exports and Batch Studio) is stored on the account and only changes on the server
            after a payment is verified with Paystack.
          </li>
          <li>
            POST routes on this page refuse browser requests whose <code>Origin</code> isn&apos;t this site.
          </li>
          <li>
            Your own code uses the public API with an API key instead:{" "}
            <Link href="/developers/api-reference">API reference</Link>.
          </li>
        </ul>

        <H2 id="engines">GET /api/engines</H2>
        <Endpoint method="GET" path="/api/engines" who="Public" />
        <p>Which engines this deployment can offer. It reports whether a provider is configured, never its credentials.</p>
        <CodeBlock title="Response" code={engines} lang="http" />

        <H2 id="models">GET /api/models/:file</H2>
        <Endpoint method="GET" path="/api/models/:file" who="Signed-in browsers" />
        <p>
          Streams an ONNX model to the on-device engine with <code>Cache-Control: private, immutable</code>. Answers{" "}
          <code>401</code> without a session and <code>404</code> for unknown files. If the file isn&apos;t on the server, it is
          downloaded once and checked against its SHA-256; if that&apos;s impossible the route answers <code>502</code> and the
          editor shows &quot;The model couldn&apos;t be downloaded&quot;.
        </p>

        <H2 id="remove-background">POST /api/remove-background</H2>
        <Endpoint method="POST" path="/api/remove-background" who="Signed-in, same origin" />
        <p>
          The optional server engine. Send multipart form data with one <code>image</code> field (PNG, JPEG or WebP). The
          response is a greyscale PNG mask at the image&apos;s size (white keeps the subject). The route forwards the image to
          the configured provider and doesn&apos;t store or log it. The only provider implemented is remove.bg.
        </p>
        <CodeBlock title="Example" code={curl} lang="bash" />
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>200</td>
              <td>PNG mask in the body.</td>
            </tr>
            <tr>
              <td>400</td>
              <td>
                Not multipart, or no <code>image</code> file field.
              </td>
            </tr>
            <tr>
              <td>401</td>
              <td>Not signed in.</td>
            </tr>
            <tr>
              <td>403</td>
              <td>
                Cross-origin browser request (unless <code>ISOLA_REMOTE_ALLOW_CROSS_ORIGIN=true</code>).
              </td>
            </tr>
            <tr>
              <td>413</td>
              <td>
                Larger than <code>ISOLA_REMOTE_MAX_UPLOAD_MB</code> (12 MB by default).
              </td>
            </tr>
            <tr>
              <td>415</td>
              <td>Not a PNG, JPEG or WebP file (checked by content).</td>
            </tr>
            <tr>
              <td>422</td>
              <td>The provider found no subject.</td>
            </tr>
            <tr>
              <td>429</td>
              <td>
                Hourly limit reached (<code>ISOLA_REMOTE_RATE_LIMIT_PER_HOUR</code>, 30 by default), per account. See{" "}
                <code>Retry-After</code>.
              </td>
            </tr>
            <tr>
              <td>502 / 504</td>
              <td>The provider failed or timed out.</td>
            </tr>
            <tr>
              <td>503</td>
              <td>No provider configured on this deployment.</td>
            </tr>
          </tbody>
        </table>
        <p>Errors are JSON:</p>
        <CodeBlock title="Error body" code={errorBody} lang="json" lineNumbers={false} />

        <H2 id="billing">Billing routes</H2>
        <p>Used by the pricing and account pages. Prices are in naira: ₦{planConfig.proPriceNgn.toLocaleString("en-NG")} a month or ₦{planConfig.proYearlyPriceNgn.toLocaleString("en-NG")} a year.</p>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Who</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>POST /api/billing/checkout</code>
              </td>
              <td>Signed in, same origin</td>
              <td>
                Starts Paystack checkout for <code>monthly</code> or <code>yearly</code> and returns its URL. 409 if the account
                already has a renewing subscription.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /billing/callback</code>
              </td>
              <td>Paystack redirect</td>
              <td>Verifies the payment with Paystack (amount, currency, account) before granting Pro, then redirects back.</td>
            </tr>
            <tr>
              <td>
                <code>POST /api/billing/webhook</code>
              </td>
              <td>Paystack</td>
              <td>
                Requires a valid <code>x-paystack-signature</code> (HMAC-SHA512 of the body with your secret key). Renewals are
                re-verified with the API and count once.
              </td>
            </tr>
            <tr>
              <td>
                <code>GET /api/billing/manage</code>
              </td>
              <td>Signed in</td>
              <td>Redirects subscribers to Paystack&apos;s page to change their card or cancel.</td>
            </tr>
          </tbody>
        </table>
        <CodeBlock title="Checkout request" code={checkout} lang="http" />

        <H2 id="api-keys">API key management</H2>
        <p>Used by the API keys card on the Account page. Session only; keys can&apos;t manage other keys.</p>
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>What it does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>GET /api/keys</code>
              </td>
              <td>Lists the account&apos;s keys: name, a short preview, created, last used and request count. Never the key or its hash.</td>
            </tr>
            <tr>
              <td>
                <code>POST /api/keys</code>
              </td>
              <td>
                <code>{"{ name }"}</code> → creates a key and returns it once. Up to 10 per account.
              </td>
            </tr>
            <tr>
              <td>
                <code>DELETE /api/keys/:id</code>
              </td>
              <td>Deletes a key; requests with it fail from then on.</td>
            </tr>
          </tbody>
        </table>

        <H2 id="feedback">POST /api/docs/feedback</H2>
        <Endpoint method="POST" path="/api/docs/feedback" who="Same origin" />
        <p>
          Records the answer to &quot;Was this page helpful?&quot; at the bottom of these pages: <code>{"{ page, helpful }"}</code>.
          It stores the page, the yes/no answer and the time, nothing about who answered. Limited to 30 answers an hour per
          address.
        </p>

        <H2 id="configuration">Configuration</H2>
        <CodeBlock title=".env" code={env} lang="bash" />
        <DocCallout tone="warn" title="Rate limits are per server instance">
          <p>
            The server engine&apos;s limiter keeps counts in memory. If you run several instances, replace it with a shared
            store (it&apos;s a small interface in <code>src/server/usage.ts</code>) before relying on it.
          </p>
        </DocCallout>
        <p>
          The model route needs a long-running Node server with about 450 MB of disk for both models. On serverless hosts
          that limit response size or duration, put the <code>.onnx</code> files on a CDN that sends CORS and{" "}
          <code>Cross-Origin-Resource-Policy: cross-origin</code>, and point <code>NEXT_PUBLIC_ISOLA_MODEL_BASE_URL</code> at
          it. The sign-in requirement is then enforced by the app&apos;s pages only.
        </p>

        <DocFooter href="/developers/server-endpoints" />
      </DocBody>
    </>
  );
}
