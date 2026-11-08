import type { Metadata } from "next";
import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Callout, PageShell } from "@/components/site/page-shell";
import { formatBytes, uploadLimits } from "@/lib/config";

export const metadata: Metadata = {
  title: "Pricing",
  description: "ISOLA has no paid plans yet. On-device processing works without an account.",
};

export default function PricingPage() {
  return (
    <PageShell
      eyebrow="Pricing"
      title="No plans to choose from yet."
      intro={<p>ISOLA hasn&apos;t introduced paid plans. Everything below works today without an account.</p>}
    >
      <ul className="!list-none !pl-0 grid gap-3">
        {[
          "Background removal on your device, with no upload",
          "Restore and erase brushes, feathering and edge shift",
          "Colour and image backgrounds, drop shadows, crop and resize",
          `Full-resolution PNG and JPEG export (files up to ${formatBytes(uploadLimits.maxFileBytes)})`,
          `Batch studio with up to ${uploadLimits.maxBatchFiles} images and ZIP download`,
        ].map((item) => (
          <li key={item} className="flex items-start gap-3">
            <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
      <Callout>When pricing is decided it will be published on this page before anything is charged.</Callout>
      <ButtonLink href="/editor" size="lg">
        Open the editor
      </ButtonLink>
    </PageShell>
  );
}
