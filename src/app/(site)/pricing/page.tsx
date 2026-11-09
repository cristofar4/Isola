import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Check, Minus } from "lucide-react";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { IntervalToggle, ProPrice } from "@/components/pricing/billing-interval";
import { PaymentNotice } from "@/components/pricing/payment-notice";
import { PricingCta } from "@/components/pricing/pricing-cta";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { ButtonLink } from "@/components/ui/button";
import { formatNaira, planConfig, uploadLimits } from "@/lib/config";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";
import { billingConfigured, renewsAutomatically } from "@/server/billing";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free background removal with watermarked previews, or Pro for ${formatNaira(planConfig.proPriceNgn)} a month or ${formatNaira(planConfig.proYearlyPriceNgn)} a year.`,
};

const price = formatNaira(planConfig.proPriceNgn);
const yearlyPrice = formatNaira(planConfig.proYearlyPriceNgn);
const cap = planConfig.freeMaxExportSide.toLocaleString("en-US");

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[15px] text-ink">
      <Check className="mt-0.5 size-[18px] shrink-0 text-blue" aria-hidden="true" />
      {children}
    </li>
  );
}

function PlanCard({ highlight, children, label }: { highlight?: boolean; children: React.ReactNode; label: string }) {
  return (
    <article
      aria-label={label}
      className={cn(
        "flex flex-col rounded-[18px] border bg-surface p-7 shadow-[var(--shadow-card)]",
        highlight ? "border-2 border-blue shadow-[var(--shadow-float)]" : "border-line",
      )}
    >
      {children}
    </article>
  );
}

/** Reads payment configuration at request time so it can change without a rebuild. */
async function ProAction() {
  await connection();
  return <UpgradeButton available={billingConfigured()} />;
}

async function RenewalNote() {
  await connection();
  if (!billingConfigured()) return null;
  return (
    <p className="mt-3 text-xs text-muted">
      {renewsAutomatically("monthly") || renewsAutomatically("yearly")
        ? "Paid through Paystack and renewed automatically. Cancel any time."
        : "Paid through Paystack. Each payment adds a month (or a year) of Pro; it doesn't renew on its own."}
    </p>
  );
}

const faq = [
  {
    q: "Can I try ISOLA before upgrading?",
    a: `Yes. Create a free account to remove backgrounds and download previews up to ${cap}px with an ISOLA watermark. Upgrade when you need full resolution, no watermark or Batch Studio.`,
  },
  {
    q: "What counts as a processed image?",
    a: "There's no per-image count on either plan. Free and Pro both remove backgrounds without a monthly image limit; the differences are the watermark, export size and Batch Studio.",
  },
  {
    q: "Can I change my plan?",
    a: `Pro is paid through Paystack, either ${price} a month or ${yearlyPrice} a year. Both include exactly the same Pro features. Subscribers can update their card or cancel from Manage subscription on the Account page; Pro stays active until the end of the period you've paid for, then your account returns to Free.`,
  },
  {
    q: "What do I get on Pro?",
    a: "Every export at the full resolution of your photo (or the size you choose), with no watermark, plus Batch Studio. Monthly and yearly Pro are the same plan; yearly just costs less over twelve months.",
  },
  {
    q: "What happens to my uploaded images?",
    a: "They stay on your device. Background removal runs in your browser, so your images aren't uploaded to ISOLA or stored in your account.",
  },
];

const rows: Array<{ feature: string; free: boolean; pro: boolean; studio: boolean | "planned" }> = [
  { feature: "Background removal", free: true, pro: true, studio: true },
  { feature: "Single image editor", free: true, pro: true, studio: true },
  { feature: "Full-resolution (HD) export", free: false, pro: true, studio: true },
  { feature: "No watermark", free: false, pro: true, studio: true },
  { feature: `Batch Studio (up to ${uploadLimits.maxBatchFiles} images)`, free: false, pro: true, studio: true },
  { feature: "Team workspace", free: false, pro: false, studio: "planned" },
];

function Cell({ value }: { value: boolean | "planned" }) {
  if (value === "planned") return <span className="text-xs font-medium text-muted">Planned</span>;
  return value ? (
    <Check className="mx-auto size-5 text-blue" aria-label="Included" />
  ) : (
    <Minus className="mx-auto size-5 text-line-strong" aria-label="Not included" />
  );
}

export default function PricingPage() {
  const contact = site.supportEmail ? `mailto:${site.supportEmail}?subject=${encodeURIComponent("ISOLA Studio")}` : null;
  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <header className="text-center">
        <p className="eyebrow text-blue-700">Plans for every workflow</p>
        <h1 className="display mx-auto mt-3 max-w-2xl text-balance text-[44px] sm:text-[60px]">Make room for your best work.</h1>
        <p className="mt-4 text-[17px] text-ink-3">Start with a single image. Grow into a complete workflow.</p>
        <div className="mt-6 flex flex-col items-center gap-2">
          <IntervalToggle />
          <p className="text-[13px] text-muted">Prices in Nigerian naira</p>
        </div>
      </header>

      <div className="mt-10">
        <Suspense fallback={null}>
          <PaymentNotice />
        </Suspense>
        <div className="grid gap-5 lg:grid-cols-3">
          <PlanCard label="Free plan">
            <h2 className="text-lg font-extrabold tracking-wide text-ink">FREE</h2>
            <p className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-tight">₦0</p>
            <p className="mt-2 text-[15px] text-muted">Try the essentials</p>
            <ButtonLink href="/sign-up?next=/editor" variant="outline-blue" size="lg" className="mt-6 w-full">
              Start free
            </ButtonLink>
            <ul className="mt-6 grid gap-3">
              <Feature>Single image editing</Feature>
              <Feature>Background removal</Feature>
              <Feature>Watermarked previews up to {cap}px</Feature>
            </ul>
            <p className="mt-auto pt-6 text-xs text-muted">A free account is required to remove backgrounds.</p>
          </PlanCard>

          <PlanCard label="Pro plan" highlight>
            <span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
              For regular creators
            </span>
            <h2 className="mt-3 text-lg font-extrabold tracking-wide text-ink">PRO</h2>
            <ProPrice />
            <p className="mt-2 text-[15px] text-muted">For creators and online sellers</p>
            <div className="mt-6">
              <Suspense fallback={<div className="h-12 animate-pulse rounded-[10px] bg-blue-50" />}>
                <ProAction />
              </Suspense>
            </div>
            <ul className="mt-6 grid gap-3">
              <Feature>Full-resolution HD exports, up to the photo&apos;s own size</Feature>
              <Feature>No watermark</Feature>
              <Feature>Batch Studio, up to {uploadLimits.maxBatchFiles} images at a time</Feature>
              <Feature>Custom backgrounds and shadows</Feature>
            </ul>
            <Suspense fallback={null}>
              <RenewalNote />
            </Suspense>
          </PlanCard>

          <PlanCard label="Studio plan">
            <h2 className="text-lg font-extrabold tracking-wide text-ink">STUDIO</h2>
            <p className="mt-2 font-display text-[40px] font-extrabold leading-none tracking-tight">Custom</p>
            <p className="mt-2 text-[15px] text-muted">For teams with larger workflows</p>
            {contact ? (
              <ButtonLink href={contact} variant="secondary" size="lg" className="mt-6 w-full border-ink">
                Contact us
              </ButtonLink>
            ) : (
              <span className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-[10px] border border-line text-[15px] font-semibold text-muted">
                Coming later
              </span>
            )}
            <ul className="mt-6 grid gap-3">
              <Feature>Everything in Pro</Feature>
              <Feature>Shared team workspace (planned)</Feature>
              <Feature>Centralised billing (planned)</Feature>
              <Feature>Priority support</Feature>
            </ul>
          </PlanCard>
        </div>
        <p className="mt-4 text-center text-xs text-muted">
          Free and Pro are available now. Studio is planned; features marked “planned” aren&apos;t built yet.
        </p>
      </div>

      <section aria-labelledby="compare" className="mt-16">
        <h2 id="compare" className="display text-center text-[30px] sm:text-[38px]">
          Choose what fits your workflow.
        </h2>
        <div className="mt-8 overflow-x-auto rounded-[16px] border border-line bg-surface">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <thead className="bg-paper-2/70">
              <tr>
                <th scope="col" className="px-5 py-3.5 font-semibold">Feature</th>
                <th scope="col" className="px-5 py-3.5 text-center font-semibold">Free</th>
                <th scope="col" className="px-5 py-3.5 text-center font-semibold">Pro</th>
                <th scope="col" className="px-5 py-3.5 text-center font-semibold">Studio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-t border-line">
                  <th scope="row" className="px-5 py-3 font-normal text-ink">{row.feature}</th>
                  <td className="px-5 py-3 text-center"><Cell value={row.free} /></td>
                  <td className="px-5 py-3 text-center"><Cell value={row.pro} /></td>
                  <td className="px-5 py-3 text-center"><Cell value={row.studio} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="faq" className="mt-16">
        <h2 id="faq" className="display text-center text-[30px] sm:text-[38px]">
          Questions, answered.
        </h2>
        <div className="mt-8">
          <PricingFaq items={faq} />
        </div>
        <p className="mt-4 text-center text-sm text-muted">
          More in the <Link href="/support" className="font-medium text-blue-700 underline underline-offset-2">help centre</Link>.
        </p>
      </section>

      <div className="mt-16">
        <PricingCta />
      </div>
    </div>
  );
}
