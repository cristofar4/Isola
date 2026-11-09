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
        Editor projects exist only in the open tab, whether or not you&apos;re signed in; closing or reloading the page
        discards them. The current Batch Studio batch is kept in your browser&apos;s own storage (see below) and is never
        uploaded or stored in your account.
      </p>

      <h2>Accounts</h2>
      <p>
        Removing backgrounds requires a free account. When you create one, ISOLA stores your name and email address, whether
        you&apos;ve confirmed it, and either a
        securely hashed password or a link to the Google or GitHub account you signed in with (including the access tokens
        that provider issues). Images and projects are not stored in your account.
      </p>
      <p>
        To keep you signed in and protect your account, each sign-in creates a session record holding its expiry time, the
        IP address and the browser user agent. Sessions last up to 30 days. You can sign out of other devices, change your
        password or permanently delete your account from the Account page; deleting it removes your profile, sign-in methods
        and sessions.
      </p>

      <h2>Email</h2>
      <p>
        ISOLA sends account emails only: a link to confirm your address when you sign up (valid for 24 hours), a password
        reset link when you ask for one (single use, 60 minutes), and a notice if someone tries to sign up with an address
        that already has an account. They go through the email service this deployment uses, which receives your address
        and the message. ISOLA doesn&apos;t send marketing email.
      </p>

      <h2>Payments</h2>
      <p>
        If you upgrade to Pro, you pay on Paystack&apos;s secure checkout. Paystack handles your card or bank details;
        ISOLA never sees or stores them. ISOLA receives and keeps a record of each payment (its reference, amount,
        currency and date), your Paystack customer and subscription codes, and the date your Pro plan runs until.
        Paystack&apos;s own privacy policy applies to the information you give it.
      </p>

      <h2>Cookies and analytics</h2>
      <p>
        ISOLA sets cookies only when you sign in: a session cookie that keeps you signed in, plus short-lived cookies used
        during Google or GitHub sign-in. They are strictly necessary for accounts and aren&apos;t used for tracking. ISOLA
        includes no analytics or advertising scripts. Your browser also keeps the downloaded model in Cache Storage, which
        you can clear from your browser settings. Batch Studio keeps the images in your current batch (originals, cutout
        masks, settings and any background images you upload) in your browser&apos;s IndexedDB, so the batch survives a
        reload, signing in or paying. It stays on your device until you remove the images or choose{" "}
        <strong>Clear batch</strong>, or clear site data in your browser.
      </p>

      <h2>Documentation feedback</h2>
      <p>
        If you answer &quot;Was this page helpful?&quot; on the developer docs, ISOLA stores the page, your yes/no answer and
        the time. It doesn&apos;t store who answered, your account or your IP address with it.
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
