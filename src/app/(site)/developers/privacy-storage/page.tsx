import type { Metadata } from "next";
import Link from "next/link";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Privacy & storage · Developer docs",
  description: "What stays on the device, what reaches an ISOLA server, and exactly what is stored in the browser and on the server.",
};

export default function PrivacyStoragePage() {
  return (
    <>
      <DocHeader
        href="/developers/privacy-storage"
        title="Privacy & storage."
        lead="Where images go, and every place ISOLA keeps data, so you can describe it accurately to your own users."
        badge="Data handling"
      />
      <DocBody>
        <H2 id="on-device">What stays on the device</H2>
        <p>
          With the on-device engines (Standard and High detail), images are decoded, processed, edited and exported inside
          the browser. Originals, masks, edits and exports are never sent to the server. The Batch Studio ZIP is assembled in
          the browser too.
        </p>

        <H2 id="server">What reaches the server</H2>
        <ul>
          <li>Requests for the model files and the app&apos;s own pages and scripts.</li>
          <li>Account data: name, email, password hash, linked Google or GitHub accounts, sessions (with IP address and user agent).</li>
          <li>Payments: Paystack references, amounts and dates, plus the Paystack customer and subscription codes. Card details go to Paystack only.</li>
          <li>Answers to &quot;Was this page helpful?&quot; on these docs: page, yes/no and time.</li>
          <li>
            <strong>Only if the server engine is chosen:</strong> the image is uploaded, forwarded to the configured provider
            (remove.bg) and the mask is returned. The route doesn&apos;t store or log image contents; the provider&apos;s own
            policy applies to what it receives. The editor labels this engine as uploading before it&apos;s used.
          </li>
        </ul>

        <H2 id="browser-storage">Browser storage</H2>
        <table>
          <thead>
            <tr>
              <th>Where</th>
              <th>Name</th>
              <th>What</th>
              <th>Kept until</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cache Storage</td>
              <td>
                <code>isola-models-v1</code>
              </td>
              <td>Downloaded model files</td>
              <td>Site data is cleared</td>
            </tr>
            <tr>
              <td>IndexedDB</td>
              <td>
                <code>isola-batch</code>
              </td>
              <td>The current Batch Studio batch: originals, masks, settings, uploaded backgrounds, batch name</td>
              <td>Images are removed, &quot;Clear batch&quot;, or site data is cleared</td>
            </tr>
            <tr>
              <td>Cookies</td>
              <td>
                <code>isola.*</code>
              </td>
              <td>Session (HTTP-only), and short-lived cookies during Google/GitHub sign-in</td>
              <td>Sign-out or 30 days</td>
            </tr>
          </tbody>
        </table>
        <p>
          Editor projects live only in the open tab and are discarded on reload. Nothing is stored in{" "}
          <code>localStorage</code>. There are no analytics or advertising scripts.
        </p>

        <H2 id="server-storage">Server storage</H2>
        <p>
          Accounts, sessions, verification tokens, payments and docs feedback are stored in Postgres when{" "}
          <code>DATABASE_URL</code> is set, otherwise in a SQLite file (<code>.data/isola.db</code>, or <code>ISOLA_SQLITE_PATH</code>).
          Tables are created automatically on start-up. Deleting an account from the Account page removes the account and
          its sessions.
        </p>
        <DocCallout title="Your deployment, your policy">
          <p>
            The site&apos;s own{" "}
            <Link href="/privacy" className="font-semibold text-blue-700 underline">
              privacy policy
            </Link>{" "}
            describes this deployment. If you run ISOLA yourself, review it against your hosting, email and payment providers.
          </p>
        </DocCallout>

        <DocFooter href="/developers/privacy-storage" />
      </DocBody>
    </>
  );
}
