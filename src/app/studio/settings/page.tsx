import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountHeader } from "@/components/account/account-header";
import { AccountView } from "@/components/account/account-view";
import { Spinner } from "@/components/ui/progress";
import { AuthUnavailableError, requireUser } from "@/server/auth";
import { billingConfigured } from "@/server/billing";

export const metadata: Metadata = {
  title: "Settings · Studio",
  description: "Your plan, API keys, profile photo, password and devices.",
  robots: { index: false },
};

async function SettingsContent() {
  let user;
  try {
    user = await requireUser("/studio/settings");
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
      <AccountHeader user={user} />
      <AccountView user={user} billingAvailable={billingConfigured()} place="studio" />
    </>
  );
}

/** Your account settings inside the studio frame (the same settings as the site's Account page). */
export default function StudioSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] items-center justify-center text-muted" role="status">
            <Spinner className="mr-2 text-blue" /> Loading your settings…
          </div>
        }
      >
        <SettingsContent />
      </Suspense>
    </div>
  );
}
