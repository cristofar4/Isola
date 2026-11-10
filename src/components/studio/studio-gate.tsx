import { Suspense, type ReactNode } from "react";
import { Spinner } from "@/components/ui/progress";
import { AuthUnavailableError, requireUser } from "@/server/auth";

async function Gate({ path, children }: { path: string; children: ReactNode }) {
  try {
    await requireUser(path);
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
  return <>{children}</>;
}

/** Studio pages are for signed-in accounts; signed-out visitors are sent to sign in and brought back. */
export function StudioGate({ path, label, children }: { path: string; label: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-muted" role="status">
          <Spinner className="mr-2 text-blue" /> Loading {label}…
        </div>
      }
    >
      <Gate path={path}>{children}</Gate>
    </Suspense>
  );
}
