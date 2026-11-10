"use client";

import { Check, Minus, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { FormAlert } from "@/components/auth/fields";
import { formatNaira, planConfig, uploadLimits, yearlySavingPercent } from "@/lib/config";
import type { CurrentUser } from "@/server/auth";
import { formatDate } from "./account-data";
import { FooterHint, Section } from "./section";

function Feature({ on = true, children }: { on?: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[14px] leading-snug">
      {on ? (
        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Included" />
      ) : (
        <Minus className="mt-0.5 size-4 shrink-0 text-subtle" aria-label="Not included" />
      )}
      <span className={on ? "text-ink-3" : "text-muted"}>{children}</span>
    </li>
  );
}

const cap = planConfig.freeMaxExportSide.toLocaleString("en-US");

function ProFeatures() {
  return (
    <ul className="grid gap-2">
      <Feature>Full-resolution HD exports</Feature>
      <Feature>No watermark</Feature>
      <Feature>Batch Studio, up to {uploadLimits.maxBatchFiles} images at a time</Feature>
      <Feature>API at full resolution, with masks</Feature>
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-[12px] bg-paper px-4 py-3">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="mt-1 text-[15px] font-semibold text-ink">{children}</dd>
    </div>
  );
}

export function PlanSection({ user, billingAvailable }: { user: CurrentUser; billingAvailable: boolean }) {
  const params = useSearchParams();
  const upgraded = params.get("upgraded") === "1";
  const manage = params.get("manage");
  const { plan } = user;
  const saving = yearlySavingPercent();
  const price = plan.interval === "yearly" ? `${formatNaira(planConfig.proYearlyPriceNgn)}/year` : `${formatNaira(planConfig.proPriceNgn)}/month`;

  const alerts = (
    <>
      {upgraded && plan.pro && <FormAlert tone="success">Payment confirmed. Welcome to Pro.</FormAlert>}
      {manage === "failed" && <FormAlert>Couldn&apos;t open subscription management. Please try again.</FormAlert>}
    </>
  );

  if (plan.pro) {
    return (
      <Section
        id="plan"
        icon={<Sparkles />}
        title="Plan & billing"
        description={`Pro · ${price}`}
        action={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-[12px] font-semibold text-success">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" /> Active
          </span>
        }
        footer={
          <>
            <FooterHint>
              {plan.renews
                ? "Renews automatically. Update your card or cancel any time."
                : "Doesn't renew on its own: pay again before it ends to keep Pro."}
            </FooterHint>
            {plan.hasSubscription ? (
              <a
                href="/api/billing/manage"
                className="inline-flex h-10 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-line-strong hover:bg-paper"
              >
                Manage subscription
              </a>
            ) : (
              !plan.renews && <UpgradeButton available={billingAvailable} size="md" className="w-auto" returnTo="/account" interval={plan.interval ?? "monthly"} />
            )}
          </>
        }
      >
        <div className="grid gap-5">
          {alerts}
          <dl className="grid gap-3 sm:grid-cols-3">
            <Fact label="Billing">{plan.interval === "yearly" ? "Yearly" : "Monthly"}</Fact>
            <Fact label={plan.renews ? "Next renewal" : "Active until"}>{plan.proUntil ? formatDate(plan.proUntil) : "—"}</Fact>
            <Fact label="Renewal">{plan.renews ? "Automatic" : "Manual"}</Fact>
          </dl>
          <div>
            <p className="mb-2.5 text-[13px] font-semibold text-ink">Included in your plan</p>
            <ProFeatures />
          </div>
        </div>
      </Section>
    );
  }

  return (
    <Section id="plan" icon={<Sparkles />} title="Plan & billing" description="Free">
      <div className="grid gap-4">
        {alerts}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[14px] border border-line p-5">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">Current plan</p>
            <p className="mt-1 font-display text-[24px] font-bold text-ink">Free</p>
            <ul className="mt-4 grid gap-2">
              <Feature>Background removal on your device</Feature>
              <Feature>Exports up to {cap}px, with an ISOLA watermark</Feature>
              <Feature>API: watermarked cutouts up to {cap}px</Feature>
              <Feature on={false}>Batch Studio</Feature>
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-[14px] border border-blue/25 bg-gradient-to-br from-blue-50 to-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-blue-700">Upgrade</p>
              {saving > 0 && <span className="rounded-full bg-blue px-2 py-0.5 text-[11px] font-bold text-white">Yearly saves {saving}%</span>}
            </div>
            <p className="mt-1 font-display text-[24px] font-bold text-ink">Pro</p>
            <div className="mt-4">
              <ProFeatures />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <UpgradeButton available={billingAvailable} size="md" returnTo="/account" interval="monthly" label={`Monthly · ${formatNaira(planConfig.proPriceNgn)}`} />
              <UpgradeButton available={billingAvailable} size="md" returnTo="/account" interval="yearly" label={`Yearly · ${formatNaira(planConfig.proYearlyPriceNgn)}`} />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
