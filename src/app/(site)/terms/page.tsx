import type { Metadata } from "next";
import { Callout, PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for using ISOLA.",
};

export default function TermsPage() {
  return (
    <PageShell eyebrow="Legal" title="Terms of use" intro={<p>The basic terms for using this ISOLA website.</p>}>
      <Callout tone="warn">
        These terms are a starting point shipped with the ISOLA codebase. The operator of this deployment should have them
        reviewed and adapted before relying on them.
      </Callout>
      <h2>Using ISOLA</h2>
      <p>
        You may use ISOLA to edit images you own or have permission to edit. Don&apos;t use it to process content that is
        unlawful, infringes someone else&apos;s rights, or is intended to deceive or harm others.
      </p>
      <h2>Your content</h2>
      <p>
        You keep all rights to the images you edit. With on-device processing your images never reach our servers. If you
        choose server processing where it&apos;s offered, you allow the image to be sent to the configured provider solely to
        produce your result.
      </p>
      <h2>Pro subscriptions</h2>
      <p>
        Pro is billed in naira through Paystack, either monthly or yearly; both give the same features. It gives
        full-resolution exports without a watermark and access to Batch Studio for as long as it&apos;s active. You can cancel at any time; Pro then remains active until the end of
        the period you&apos;ve paid for. Prices may change in future, and you&apos;ll be told before a new price applies to
        you.
      </p>
      <h2>No warranty</h2>
      <p>
        Automatic background removal can make mistakes, especially with low-contrast subjects, fine detail or unusual
        images. Check your results before using them. ISOLA is provided &quot;as is&quot;, without warranties of any kind, to the
        extent permitted by law.
      </p>
      <h2>Changes</h2>
      <p>These terms may change as ISOLA develops. Material changes will be reflected on this page.</p>
    </PageShell>
  );
}
