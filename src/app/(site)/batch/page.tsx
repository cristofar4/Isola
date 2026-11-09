import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { BatchStudio } from "@/components/batch/batch-studio";
import { BatchLanding } from "@/components/batch/landing/batch-landing";
import { Spinner } from "@/components/ui/progress";
import { getAuth } from "@/server/auth";

export const metadata: Metadata = {
  title: "Batch Studio",
  description: "Remove backgrounds from a whole set of images, give them one consistent look and export them together as a ZIP.",
};

/** Signed-in visitors get the workspace; everyone else gets the introduction and sample project. */
async function BatchEntry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const preset = (await searchParams).preset === "catalogue" ? "catalogue" : null;
  const requestHeaders = await headers();
  let signedIn = false;
  try {
    const auth = await getAuth();
    signedIn = Boolean(await auth.api.getSession({ headers: requestHeaders }));
  } catch {
    signedIn = false; // Accounts not configured: show the introduction.
  }
  return signedIn ? <BatchStudio /> : <BatchLanding preset={preset} />;
}

export default function BatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted" role="status">
          <Spinner className="mr-2 text-blue" /> Loading Batch Studio…
        </div>
      }
    >
      <BatchEntry searchParams={searchParams} />
    </Suspense>
  );
}
