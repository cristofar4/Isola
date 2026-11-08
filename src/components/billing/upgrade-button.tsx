"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { usePlan } from "@/lib/plan";
import { signInHref } from "@/lib/session-gate";
import { cn } from "@/lib/cn";

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
}: {
  available: boolean;
  label?: string;
  size?: "md" | "lg";
  className?: string;
  returnTo?: string;
}) {
  const plan = usePlan();
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
      const res = await fetch("/api/billing/checkout", { method: "POST" });
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
        {!available ? "Payments open soon" : plan.pro ? "Add another month" : busy ? "Opening checkout…" : label}
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
