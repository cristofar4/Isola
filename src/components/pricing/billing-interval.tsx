"use client";

import { create } from "zustand";
import { cn } from "@/lib/cn";
import { formatNaira, planConfig, yearlySavingPercent, type BillingInterval } from "@/lib/config";

/** Monthly or yearly, shared by the toggle, the Pro price and the upgrade button. */
export const useBillingInterval = create<{ interval: BillingInterval; setInterval: (interval: BillingInterval) => void }>((set) => ({
  interval: "monthly",
  setInterval: (interval) => set({ interval }),
}));

export function IntervalToggle({ className }: { className?: string }) {
  const interval = useBillingInterval((s) => s.interval);
  const setInterval = useBillingInterval((s) => s.setInterval);
  const saving = yearlySavingPercent();
  const options: Array<{ value: BillingInterval; label: string; note?: string }> = [
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly", note: saving ? `Save ${saving}%` : undefined },
  ];
  return (
    <div role="radiogroup" aria-label="Billing period" className={cn("inline-flex rounded-full border border-line bg-surface p-1", className)}>
      {options.map((o) => {
        const on = interval === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => setInterval(o.value)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors",
              on ? "bg-ink text-white" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
            {o.note && (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", on ? "bg-white/15 text-white" : "bg-success-50 text-success")}>{o.note}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ProPrice() {
  const interval = useBillingInterval((s) => s.interval);
  const yearly = interval === "yearly";
  const perMonth = Math.round(planConfig.proYearlyPriceNgn / 12);
  return (
    <div aria-live="polite">
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="font-display text-[40px] font-extrabold leading-none tracking-tight">
          {formatNaira(yearly ? planConfig.proYearlyPriceNgn : planConfig.proPriceNgn)}
        </span>
        <span className="text-[15px] text-muted">/ {yearly ? "year" : "month"}</span>
      </p>
      <p className="mt-1.5 min-h-5 text-[13px] text-muted">
        {yearly
          ? `About ${formatNaira(perMonth)} a month, paid once a year`
          : `Or ${formatNaira(planConfig.proYearlyPriceNgn)} a year${yearlySavingPercent() ? ` (save ${yearlySavingPercent()}%)` : ""}`}
      </p>
    </div>
  );
}
