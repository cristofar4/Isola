"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Minus, PartyPopper, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { IntervalToggle, ProPrice } from "@/components/pricing/billing-interval";
import { PaymentNotice } from "@/components/pricing/payment-notice";
import { formatNaira, planConfig, uploadLimits } from "@/lib/config";
import { cn } from "@/lib/cn";
import { usePlan } from "@/lib/plan";

const cap = planConfig.freeMaxExportSide.toLocaleString("en-US");

function Row({ on = true, children }: { on?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] leading-snug">
      {on ? (
        <Check className="mt-0.5 size-[18px] shrink-0 text-blue" aria-label="Included" />
      ) : (
        <Minus className="mt-0.5 size-[18px] shrink-0 text-line-strong" aria-label="Not included" />
      )}
      <span className={on ? "text-ink" : "text-muted"}>{children}</span>
    </li>
  );
}

function CurrentBadge() {
  return <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white">Your plan</span>;
}

/**
 * Get Pro, inside the studio: the plans side by side, monthly or yearly, and
 * checkout that brings you straight back here. After paying, the Pro badge
 * shows by your name in the studio menu.
 */
export function StudioPlans({
  billingAvailable,
  renewalNote,
  initial,
}: {
  billingAvailable: boolean;
  renewalNote: string | null;
  /** The plan as the server saw it, shown until the live session loads. */
  initial: { pro: boolean; proUntil: string | null; renews: boolean };
}) {
  const live = usePlan();
  const plan = live.isPending ? { ...initial, proUntil: initial.proUntil ? new Date(initial.proUntil) : null, isPending: false } : live;
  const params = useSearchParams();
  const upgraded = params.get("upgraded") === "1" && plan.pro;
  const pro = plan.pro;
  const until = plan.proUntil ? plan.proUntil.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null;

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:px-8" data-studio-plans>
      <header className="text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.14em] text-blue-700">
          <Sparkles className="size-3.5" aria-hidden="true" /> Plans
        </p>
        <h1 className="mt-4 font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[46px]">
          {pro ? "You're on Pro" : "Get Pro"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed text-ink-3">
          {pro
            ? `Full resolution, Batch Studio and API masks are on${until ? ` until ${until}` : ""}${plan.renews ? ", renewing automatically" : ""}.`
            : "Everything in your studio, at the full resolution of your photos, plus Batch Studio for whole collections."}
        </p>
      </header>

      <div className="mx-auto mt-6 max-w-2xl">
        {upgraded && (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-[14px] border border-success/25 bg-success-50 px-4 py-3 text-[14px] text-success" data-upgraded>
            <PartyPopper className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-semibold">Payment confirmed. Welcome to Pro.</span> The Pro badge is now by your name in the studio menu.
            </p>
          </div>
        )}
        <PaymentNotice />
      </div>

      {!(pro && plan.renews) && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <IntervalToggle />
          <p className="text-[13px] text-muted">Prices in Nigerian naira</p>
        </div>
      )}

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <article aria-label="Free plan" className="flex flex-col rounded-[20px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-extrabold uppercase tracking-[0.12em] text-ink">Free</h2>
            {!plan.isPending && !pro && <CurrentBadge />}
          </div>
          <p className="mt-3 font-display text-[40px] font-extrabold leading-none tracking-tight">₦0</p>
          <p className="mt-2 text-[14px] text-muted">The essentials, on this device</p>
          <ul className="mt-6 grid gap-3">
            <Row>Background removal in the image editor</Row>
            <Row>Downloads up to {cap}px, no watermark</Row>
            <Row>Scene Studio, Motion Studio and the asset library</Row>
            <Row>API keys: cutouts up to {cap}px</Row>
            <Row on={false}>Full-resolution exports</Row>
            <Row on={false}>Batch Studio</Row>
          </ul>
        </article>

        <article
          aria-label="Pro plan"
          className="relative flex flex-col overflow-hidden rounded-[20px] border-2 border-blue bg-surface p-6 shadow-[var(--shadow-float)] sm:p-7"
          data-pro-card
        >
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[radial-gradient(circle,rgb(79_115_255/0.18),transparent_70%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-[15px] font-extrabold uppercase tracking-[0.12em] text-ink">
              <Sparkles className="size-4 text-blue" aria-hidden="true" /> Pro
            </h2>
            {pro ? <CurrentBadge /> : <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-blue-700">For regular creators</span>}
          </div>
          <div className="relative">
            <ProPrice />
          </div>
          <div className="relative mt-5">
            <UpgradeButton available={billingAvailable} returnTo="/studio/plans" label="Get Pro" />
          </div>
          <ul className="relative mt-6 grid gap-3">
            <Row>Everything in Free</Row>
            <Row>Full-resolution exports, up to the photo&apos;s own size</Row>
            <Row>Batch Studio, up to {uploadLimits.maxBatchFiles} images at a time</Row>
            <Row>API at full resolution, with masks</Row>
          </ul>
          {renewalNote && <p className="relative mt-auto pt-6 text-[12px] text-muted">{renewalNote}</p>}
        </article>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2 text-center text-[13px] text-muted sm:flex-row sm:justify-center sm:gap-5">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" /> Paid through Paystack&apos;s secure checkout
        </span>
        <Link href="/studio/settings#plan" className={cn("font-semibold text-blue-700 hover:underline")}>
          Manage your plan in Settings
        </Link>
      </div>
      <p className="mt-3 text-center text-[12px] text-subtle">
        Pro is {formatNaira(planConfig.proPriceNgn)} a month or {formatNaira(planConfig.proYearlyPriceNgn)} a year, with the same features either way.
      </p>
    </div>
  );
}
