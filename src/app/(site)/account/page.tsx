import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Spinner } from "@/components/ui/progress";
import { AuthUnavailableError, requireUser } from "@/server/auth";

export const metadata: Metadata = {
  title: "Account",
  description: "Your ISOLA plan, API keys, profile, password and devices live in Settings, inside your studio.",
  robots: { index: false },
};

/**
 * Your account lives in the studio (Studio → Settings). This old address
 * signs you in if needed and sends you there, keeping messages such as
 * ?upgraded=1 or ?manage=failed.
 */
async function ToSettings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  try {
    await requireUser("/studio/settings");
  } catch (error) {
    if (error instanceof AuthUnavailableError) {
      return (
        <p role="alert" className="mx-auto mt-12 max-w-xl rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 text-sm text-warn">
          Accounts aren&apos;t configured on this deployment yet. ({error.message})
        </p>
      );
    }
    throw error;
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v);
  }
  const qs = query.toString();
  redirect(qs ? `/studio/settings?${qs}` : "/studio/settings");
}

export default function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center text-muted" role="status">
          <Spinner className="mr-2 text-blue" /> Opening your settings…
        </div>
      }
    >
      <ToSettings searchParams={searchParams} />
    </Suspense>
  );
}
