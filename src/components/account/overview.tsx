"use client";

import { ArrowRight, KeyRound, MonitorSmartphone, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { planConfig } from "@/lib/config";
import type { CurrentUser } from "@/server/auth";
import { formatDate, useAccountData } from "./account-data";

function Tile({ href, icon, label, value, detail }: { href: string; icon: ReactNode; label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <a
      href={href}
      className="group flex flex-col rounded-[16px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)] sm:p-5"
    >
      <span className="flex items-center justify-between text-[13px] font-semibold text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="text-blue [&>svg]:size-4" aria-hidden="true">
            {icon}
          </span>
          {label}
        </span>
        <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-blue" aria-hidden="true" />
      </span>
      <span className="mt-3 font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{value}</span>
      <span className="mt-0.5 text-[13px] text-ink-3">{detail}</span>
    </a>
  );
}

const loading = <span className="inline-block h-6 w-20 animate-pulse rounded-md bg-paper-2 align-middle" aria-label="Loading" />;

/** At-a-glance plan, API and device status; each tile jumps to its section. */
export function AccountOverview({ user }: { user: CurrentUser }) {
  const keys = useAccountData((s) => s.keys);
  const devices = useAccountData((s) => s.devices);
  const { plan } = user;
  const requests = keys.data?.reduce((sum, k) => sum + k.requestCount, 0) ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Overview" role="group">
      <Tile
        href="#plan"
        icon={<Sparkles />}
        label="Plan"
        value={plan.pro ? `Pro · ${plan.interval === "yearly" ? "Yearly" : "Monthly"}` : "Free"}
        detail={
          plan.pro && plan.proUntil
            ? `${plan.renews ? "Renews" : "Active until"} ${formatDate(plan.proUntil, "short")}`
            : `Exports up to ${planConfig.freeMaxExportSide.toLocaleString("en-US")}px, watermarked`
        }
      />
      <Tile
        href="#api-keys"
        icon={<KeyRound />}
        label="API"
        value={keys.data ? `${keys.data.length} ${keys.data.length === 1 ? "key" : "keys"}` : keys.error ? "—" : loading}
        detail={
          keys.data
            ? keys.data.length
              ? `${requests.toLocaleString("en-US")} ${requests === 1 ? "request" : "requests"} so far`
              : "Create a key to use the API"
            : keys.error ?? "Loading…"
        }
      />
      <Tile
        href="#devices"
        icon={<MonitorSmartphone />}
        label="Devices"
        value={devices.data ? `${devices.data.length} signed in` : devices.error ? "—" : loading}
        detail={user.emailVerified ? "Email confirmed" : "Email not confirmed yet"}
      />
    </div>
  );
}
