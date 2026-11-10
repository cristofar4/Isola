"use client";

import { Lock } from "lucide-react";
import { useEffect } from "react";
import type { CurrentUser } from "@/server/auth";
import { useAccountData } from "./account-data";
import { AccountNav } from "./account-nav";
import { ApiKeysSection } from "./api-keys-section";
import { DeleteSection } from "./delete-section";
import { DevicesSection } from "./devices-section";
import { AccountOverview } from "./overview";
import { PlanSection } from "./plan-section";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";

function PrivacyNote({ className }: { className?: string }) {
  return (
    <p className={className}>
      <Lock className="mb-1.5 size-4 text-subtle" aria-hidden="true" />
      Images you edit are processed on your device and aren&apos;t stored in your account. Projects live in the browser tab, so
      export your work before closing it.
    </p>
  );
}

/** The account page below the header: overview, section links and every setting. */
export function AccountView({ user, billingAvailable }: { user: CurrentUser; billingAvailable: boolean }) {
  const loadKeys = useAccountData((s) => s.loadKeys);
  const loadDevices = useAccountData((s) => s.loadDevices);
  useEffect(() => {
    void loadKeys();
    void loadDevices();
  }, [loadKeys, loadDevices]);

  return (
    <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      {/* Phones: this bar sticks under the site header. Wide screens: a column whose list sticks as you scroll. */}
      <aside className="sticky top-16 z-20 min-w-0 self-start lg:static lg:self-stretch">
        <AccountNav />
        <PrivacyNote className="mt-8 hidden px-3 text-[13px] leading-relaxed text-muted lg:block" />
      </aside>
      <div className="grid min-w-0 gap-6">
        <AccountOverview user={user} />
        <PlanSection user={user} billingAvailable={billingAvailable} />
        <ApiKeysSection pro={user.plan.pro} />
        <ProfileSection user={user} />
        <SecuritySection user={user} />
        <DevicesSection />
        <DeleteSection user={user} />
        <PrivacyNote className="rounded-[16px] border border-line bg-paper-2/60 p-4 text-[13px] leading-relaxed text-muted lg:hidden" />
      </div>
    </div>
  );
}
