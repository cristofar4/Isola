import type { Metadata } from "next";
import { Callout, PageShell } from "@/components/site/page-shell";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What happens to your images and data when you use ISOLA.",
};

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy"
      title="Your images stay with you."
      intro={<p>This page describes how this version of ISOLA handles your images and data.</p>}
    >
      <h2>Images</h2>
      <p>
        With the default on-device engines (<strong>Standard</strong> and <strong>High detail</strong>), images are decoded and
        processed inside your browser. They are not uploaded to ISOLA&apos;s servers. Your browser downloads the model file
        once and keeps it in Cache Storage so later visits are faster.
      </p>
      <p>
        If a deployment enables the optional <strong>Server</strong> engine, choosing it uploads the image to that
        deployment, which forwards it to the configured provider (for example remove.bg) and returns the result. The editor
        labels this engine clearly before you use it. ISOLA&apos;s server route doesn&apos;t store or log image contents; the
        provider&apos;s own privacy policy applies to what it receives.
      </p>
      <p>
        Projects exist only in the open tab. Closing or reloading the page discards them, and nothing is kept between
        visits.
      </p>

      <h2>Accounts, cookies and analytics</h2>
      <p>
        ISOLA has no accounts. It sets no cookies and includes no analytics or advertising scripts. Your browser stores the
        downloaded model in Cache Storage, which you can clear at any time from your browser settings.
      </p>

      <h2>Server logs</h2>
      <p>
        Like any website, the server that hosts ISOLA may record standard request logs (such as IP address, requested URL,
        time and browser type) for security and operations. The hosting operator controls how long these are kept.
      </p>

      <Callout tone="warn">
        If you run your own deployment, review this page against your hosting setup and any providers you enable before
        publishing it.
      </Callout>

      {site.supportEmail && (
        <>
          <h2>Contact</h2>
          <p>
            Questions about privacy: <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
          </p>
        </>
      )}
    </PageShell>
  );
}
