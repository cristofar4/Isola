import type { Metadata } from "next";
import { PageShell } from "@/components/site/page-shell";
import { exportLimits, formatBytes, uploadLimits } from "@/lib/config";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Formats, limits, editing tools, shortcuts and troubleshooting for ISOLA.",
};

const shortcuts: Array<[string, string]> = [
  ["V", "Move / pan"],
  ["R", "Restore brush"],
  ["E", "Erase brush"],
  ["C", "Crop"],
  ["\\", "Compare with the original"],
  ["[ and ]", "Smaller / larger brush"],
  ["Space + drag", "Pan while using any tool"],
  ["Ctrl/⌘ + scroll, pinch", "Zoom"],
  ["0 / 1 / 2", "Fit, 100%, 200%"],
  ["Ctrl/⌘ + Z", "Undo"],
  ["Ctrl/⌘ + Shift + Z, Ctrl + Y", "Redo"],
  ["Ctrl/⌘ + E", "Export"],
];

export default function SupportPage() {
  return (
    <PageShell eyebrow="Support" title="Help centre" intro={<p>Everything you need to get a clean cutout and export it.</p>}>
      <h2 id="formats">Formats and limits</h2>
      <ul>
        <li>Upload PNG, JPEG or WebP. Files are checked by their contents, not their extension.</li>
        <li>
          Up to {formatBytes(uploadLimits.maxFileBytes)} per file, {uploadLimits.maxDimension.toLocaleString("en-US")}px on the
          longest side and {uploadLimits.maxMegapixels} megapixels.
        </li>
        <li>Batch studio holds up to {uploadLimits.maxBatchFiles} images at a time.</li>
        <li>
          Export as a transparent PNG, a PNG with a background, or a JPEG (always opaque). Exports can be up to{" "}
          {exportLimits.maxMegapixels} megapixels; some phones allow less.
        </li>
        <li>Exports keep the original dimensions unless you crop or choose a different size.</li>
      </ul>

      <h2 id="editing">Refining a cutout</h2>
      <h3>Restore and erase</h3>
      <p>
        Choose the <strong>Restore brush</strong> to paint back parts of the original the model removed, or the{" "}
        <strong>Erase brush</strong> to remove what it kept. Brushes edit the mask only, so the original pixels are never
        changed. Adjust size and softness in the Brush panel, and zoom in for precise work.
      </p>
      <h3>Edges</h3>
      <p>
        <strong>Edge shift</strong> moves the boundary in or out, which helps remove a thin halo of old background.{" "}
        <strong>Feather</strong> softens hard edges.
      </p>
      <h3>Backgrounds and shadows</h3>
      <p>
        Pick a colour or upload your own background image; it fills the frame. Turn on <strong>Drop shadow</strong> to cast a
        soft shadow from the subject&apos;s outline, with control over opacity, softness, distance and angle.
      </p>
      <h3>Keyboard shortcuts</h3>
      <table>
        <tbody>
          {shortcuts.map(([key, action]) => (
            <tr key={key}>
              <td className="w-1/2">
                <kbd>{key}</kbd>
              </td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="accounts">Accounts</h2>
      <p>
        An account is optional. Create one with your email and a password, or with Google or GitHub where this site offers
        them. From the Account page you can change your name and password, sign out of other devices and delete the
        account. Projects aren&apos;t saved to accounts yet, so export your work before closing the tab.
      </p>
      <p>
        Password reset by email isn&apos;t available yet. If you can&apos;t sign in, create a new account or contact
        support{site.supportEmail ? "" : " through the site operator"}.
      </p>

      <h2 id="troubleshooting">Troubleshooting</h2>
      <h3>The first image takes a while</h3>
      <p>
        The first time, your browser downloads the model (about 170 MB for Standard). The editor shows real download
        progress. After that it&apos;s cached and processing starts much sooner.
      </p>
      <h3>High detail is greyed out</h3>
      <p>
        The High detail model needs WebGPU. Recent desktop versions of Chrome and Edge provide it; other browsers may not yet.
        Standard works everywhere WebAssembly does.
      </p>
      <h3>&quot;Ran out of memory&quot; or very large images</h3>
      <p>Close other heavy tabs, or resize the image before uploading. Phones have less memory than desktops.</p>
      <h3>The model isn&apos;t installed</h3>
      <p>
        This means the site you&apos;re using hasn&apos;t published the model files. If you run the deployment, see the{" "}
        <a href="/developers#models">developer docs</a>.
      </p>
      <h3>The cutout missed something</h3>
      <p>
        Use the Restore brush to bring it back. Low-contrast subjects, transparent objects and busy backgrounds are the
        hardest cases for automatic removal.
      </p>

      {site.supportEmail && (
        <>
          <h2 id="contact">Contact</h2>
          <p>
            Email <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>.
          </p>
        </>
      )}
    </PageShell>
  );
}
