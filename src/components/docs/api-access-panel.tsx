"use client";

import Link from "next/link";
import { ArrowRight, KeyRound, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { authClient } from "@/lib/auth-client";
import { planConfig } from "@/lib/config";
import { usePlan } from "@/lib/plan";

const button = "inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-semibold transition-colors";

/**
 * The docs are the same reference for everyone; this panel is the part that
 * depends on who's reading. Signed out: how to get a key. Signed in: your
 * plan, how many keys you have and where to manage them.
 */
export function ApiAccessPanel({ next = "/developers" }: { next?: string }) {
  const { data: session, isPending } = authClient.useSession();
  const plan = usePlan();
  const signedIn = Boolean(session);
  const [keys, setKeys] = useState<number | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetch("/api/keys", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { keys?: unknown[] } | null) => alive && setKeys(json?.keys ? json.keys.length : null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [signedIn]);

  if (isPending) return <div className="not-prose my-6 h-[92px] animate-pulse rounded-[14px] bg-blue-50" aria-hidden="true" />;

  if (!signedIn) {
    return (
      <div data-api-access="signed-out" className="not-prose my-6 flex flex-col gap-4 rounded-[14px] border border-blue-100 bg-blue-50 px-5 py-4 sm:flex-row sm:items-center">
        <KeyRound className="size-7 shrink-0 text-blue" strokeWidth={1.75} aria-hidden="true" />
        <div className="flex-1 text-[15px] leading-relaxed text-ink-3">
          <p className="font-semibold text-ink">The public API is live.</p>
          <p>Create a free account to get an API key and remove backgrounds from your own code. These docs are open to everyone.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/sign-up?next=${encodeURIComponent("/account#api-keys")}`} className={cn(button, "bg-blue text-white shadow-[var(--shadow-blue)] hover:bg-blue-600")}>
            Create account
          </Link>
          <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className={cn(button, "border border-ink bg-surface text-ink hover:bg-ink/5")}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const name = session?.user.name?.split(" ")[0] || "there";
  return (
    <div data-api-access="signed-in" className="not-prose my-6 flex flex-col gap-4 rounded-[14px] border border-line bg-surface px-5 py-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue" aria-hidden="true">
        <KeyRound className="size-5" strokeWidth={1.75} />
      </span>
      <div className="flex-1 text-[15px] leading-relaxed text-ink-3">
        <p className="font-semibold text-ink">Welcome back, {name}.</p>
        <p aria-live="polite">
          <span className={cn("mr-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold", plan.pro ? "bg-blue-50 text-blue-700" : "bg-paper-2 text-ink-3")}>
            {plan.pro && <Sparkles className="size-3" aria-hidden="true" />}
            {plan.pro ? "Pro plan" : "Free plan"}
          </span>
          {keys === null
            ? "Checking your API keys…"
            : keys === 0
              ? "You don't have an API key yet."
              : `You have ${keys} API key${keys === 1 ? "" : "s"}.`}{" "}
          {!plan.pro && `API results are watermarked up to ${planConfig.freeMaxExportSide.toLocaleString("en-US")}px on Free.`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href="/account#api-keys" className={cn(button, "bg-blue text-white shadow-[var(--shadow-blue)] hover:bg-blue-600")}>
          {keys === 0 ? "Create a key" : "Manage API keys"}
        </Link>
        <Link href="/developers/api#playground" className={cn(button, "border border-ink bg-surface text-ink hover:bg-ink/5")}>
          Try it <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
