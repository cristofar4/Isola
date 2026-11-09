"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { useBillingInterval } from "@/components/pricing/billing-interval";
import type { BillingInterval } from "@/lib/config";
import { usePlan } from "@/lib/plan";
import { signInHref } from "@/lib/session-gate";
import { cn } from "@/lib/cn";

/** Pages that may ask checkout to bring the payer back to them. */
function checkoutReturn(fallback?: string): string | undefined {
  if (typeof window === "undefined") return fallback;
  const from = new URLSearchParams(window.location.search).get("from");
  return from === "batch" ? "/batch" : from === "editor" ? "/editor" : fallback;
}

/**
 * Starts Paystack checkout. Signed-out visitors are sent to create an account
 * first; when payments aren't configured the button says so instead of
 * pretending to work.
 */
export function UpgradeButton({
  available,
  label = "Upgrade to Pro",
  size = "lg",
  className,
  returnTo = "/pricing",
  interval: fixedInterval,
}: {
  available: boolean;
  label?: string;
  size?: "md" | "lg";
  className?: string;
  /** Where to continue after signing up (signed-out visitors) or paying. */
  returnTo?: string;
  /** Billing period; defaults to the pricing page's monthly/yearly toggle. */
  interval?: BillingInterval;
}) {
  const plan = usePlan();
  const chosen = useBillingInterval((s) => s.interval);
  const interval = fixedInterval ?? chosen;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!plan.isPending && !plan.signedIn) {
    return (
      <ButtonLink href={signInHref(returnTo, "sign-up")} size={size} className={cn("w-full", className)}>
        {label}
      </ButtonLink>
    );
  }
  if (plan.pro && plan.renews) {
    return (
      <ButtonLink href="/account" size={size} variant="outline-blue" className={cn("w-full", className)}>
        You&apos;re on Pro
      </ButtonLink>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interval, returnTo: checkoutReturn(returnTo === "/pricing" ? undefined : returnTo) }),
      });
      const json = (await res.json()) as { url?: string; message?: string };
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      setError(json.message ?? "Couldn't start checkout.");
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    }
    setBusy(false);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Button
        size={size}
        className="w-full"
        disabled={!available || busy || plan.isPending}
        onClick={() => void start()}
        icon={busy ? <Spinner className="size-5" /> : undefined}
      >
        {!available
          ? "Payments open soon"
          : busy
            ? "Opening checkout…"
            : plan.pro
              ? interval === "yearly"
                ? "Add a year"
                : "Add another month"
              : interval === "yearly" && label === "Upgrade to Pro"
                ? "Upgrade to Pro · yearly"
                : label}
      </Button>
      {!available && <p className="text-center text-xs text-muted">Payments aren&apos;t set up on this site yet.</p>}
      {error && (
        <p role="alert" className="text-center text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
