import type { Metadata } from "next";
import { Suspense } from "react";
import { PresetsManager } from "@/components/studio/presets-manager";
import { Spinner } from "@/components/ui/progress";
import { AuthUnavailableError, requireUser } from "@/server/auth";

export const metadata: Metadata = {
  title: "Brand presets · Studio",
  description: "Your brand colours and one look for every product photo, applied in Batch Studio with one click.",
  robots: { index: false },
};

async function PresetsContent() {
  try {
    await requireUser("/studio/presets");
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
  return <PresetsManager />;
}

export default function PresetsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted" role="status">
          <Spinner className="mr-2 text-blue" /> Loading brand presets…
        </div>
      }
    >
      <PresetsContent />
    </Suspense>
  );
}
