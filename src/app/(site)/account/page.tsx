import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountHeader } from "@/components/account/account-header";
import { AccountView } from "@/components/account/account-view";
import { AuthUnavailableError, requireUser } from "@/server/auth";
import { billingConfigured } from "@/server/billing";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your ISOLA plan, API keys, profile, password and devices.",
};

async function AccountContent() {
  let user;
  try {
    user = await requireUser("/account");
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      return (
        <>
          <h1 className="font-display text-[32px] font-bold tracking-[-0.025em] text-ink">Your account</h1>
          <p role="alert" className="mt-6 rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 text-sm text-warn">
            Accounts aren&apos;t configured on this deployment yet. ({error.message})
          </p>
        </>
      );
    }
    throw error;
  }
  return (
    <>
      <AccountHeader user={user} />
      <AccountView user={user} billingAvailable={billingConfigured()} />
    </>
  );
}

function AccountSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your account">
      <div className="flex items-center gap-5">
        <div className="size-[72px] animate-pulse rounded-full bg-paper-2" />
        <div className="grid gap-2">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-paper-2" />
          <div className="h-4 w-72 animate-pulse rounded bg-paper-2" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <div className="hidden h-64 animate-pulse rounded-[14px] bg-paper-2 lg:block" />
        <div className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-[16px] bg-paper-2" />
            ))}
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-[18px] bg-paper-2" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <Suspense fallback={<AccountSkeleton />}>
        <AccountContent />
      </Suspense>
    </div>
  );
}
