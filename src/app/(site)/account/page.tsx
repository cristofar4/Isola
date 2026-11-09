import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountPanel } from "@/components/auth/account-panel";
import { ButtonLink } from "@/components/ui/button";
import { AuthUnavailableError, requireUser } from "@/server/auth";
import { billingConfigured } from "@/server/billing";

export const metadata: Metadata = {
  title: "Account",
  description: "Manage your ISOLA account.",
};

async function AccountContent() {
  let user;
  try {
    user = await requireUser("/account");
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      return (
        <p role="alert" className="rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 text-sm text-warn">
          Accounts aren&apos;t configured on this deployment yet. ({error.message})
        </p>
      );
    }
    throw error;
  }
  return (
    <>
      <p className="mb-6 text-[17px] text-ink-3">
        Signed in as <span className="font-semibold text-ink">{user.name || user.email}</span>.
      </p>
      <AccountPanel user={user} billingAvailable={billingConfigured()} />
    </>
  );
}

function AccountSkeleton() {
  return (
    <div className="grid gap-5" aria-busy="true" aria-label="Loading your account">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-[18px] bg-paper-2" />
      ))}
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-12 sm:px-6 sm:py-16">
      <p className="eyebrow text-muted">Account</p>
      <h1 className="display mt-2 text-[40px] sm:text-[48px]">Your account</h1>
      <div className="mt-6">
        <Suspense fallback={<AccountSkeleton />}>
          <AccountContent />
        </Suspense>
      </div>
      <div className="mt-8 rounded-[18px] border border-line bg-paper-2/60 p-5 text-sm leading-relaxed text-muted">
        In the app, your images are processed on your device and aren&apos;t stored in your account. Projects live in the
        browser tab, so export your work before closing it.
        <div className="mt-3">
          <ButtonLink href="/editor" size="sm">
            Open the editor
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
