import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioDashboard } from "@/components/studio/dashboard";
import { Spinner } from "@/components/ui/progress";
import { AuthUnavailableError, requireUser } from "@/server/auth";

export const metadata: Metadata = {
  title: "Studio",
  description: "Your ISOLA studio: collections, brand presets, consistency checks and exports.",
  robots: { index: false },
};

async function StudioContent() {
  let user;
  try {
    user = await requireUser("/studio");
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
  return <StudioDashboard user={{ name: user.name, pro: user.plan.pro }} />;
}

export default function StudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted" role="status">
          <Spinner className="mr-2 text-blue" /> Loading your studio…
        </div>
      }
    >
      <StudioContent />
    </Suspense>
  );
}
