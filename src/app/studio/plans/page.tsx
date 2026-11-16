import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioPlans } from "@/components/studio/studio-plans";
import { Spinner } from "@/components/ui/progress";
import { AuthUnavailableError, requireUser } from "@/server/auth";
import { billingConfigured, renewsAutomatically } from "@/server/billing";

export const metadata: Metadata = { title: "Get Pro · Studio", description: "ISOLA plans: Free and Pro, monthly or yearly.", robots: { index: false } };

async function PlansContent() {
  let user;
  try {
    user = await requireUser("/studio/plans");
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      return (
        <p role="alert" className="m-8 rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 text-sm text-warn">
          Accounts aren&apos;t configured on this deployment yet. ({error.message})
        </p>
      );
    }
    throw error;
  }
  // Payment settings are read at request time, so they can change without a rebuild.
  const available = billingConfigured();
  const renewalNote = !available
    ? null
    : renewsAutomatically("monthly") || renewsAutomatically("yearly")
      ? "Paid through Paystack and renewed automatically. Cancel any time from Settings."
      : "Paid through Paystack. Each payment adds a month (or a year) of Pro; it doesn't renew on its own.";
  return <StudioPlans billingAvailable={available} renewalNote={renewalNote} initial={{ pro: user.plan.pro, proUntil: user.plan.proUntil, renews: user.plan.renews }} />;
}

/** Get Pro, inside the studio frame: checkout returns here, never to the public pricing page. */
export default function StudioPlansPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted" role="status">
          <Spinner className="mr-2 text-blue" /> Loading plans…
        </div>
      }
    >
      <PlansContent />
    </Suspense>
  );
}
