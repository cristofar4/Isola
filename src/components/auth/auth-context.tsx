"use client";

import Link from "next/link";
import { Upload } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/auth-client";

/** Query string that carries where to go afterwards (and why) between sign-in and sign-up. */
function useCarry() {
  const params = useSearchParams();
  const next = params.get("next");
  const reason = params.get("reason");
  const query = new URLSearchParams();
  if (next) query.set("next", safeNext(next));
  if (reason) query.set("reason", reason);
  const qs = query.toString();
  return { reason, qs: qs ? `?${qs}` : "" };
}

/** "Create an account" ↔ "Sign in", keeping the return address. */
export function AuthSwitchLink({ to, children }: { to: "/sign-in" | "/sign-up"; children: React.ReactNode }) {
  const { qs } = useCarry();
  return (
    <Link href={`${to}${qs}`} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

/** Explains why the visitor is here when they came from an upload button. */
export function AuthReason({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { reason, qs } = useCarry();
  if (reason !== "upload") return null;
  return (
    <div role="status" className="mb-5 flex gap-3 rounded-[12px] border border-blue-100 bg-blue-50 px-3.5 py-3 text-[14px] leading-relaxed text-ink-3">
      <Upload className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />
      <p>
        <span className="font-semibold text-ink">{mode === "sign-in" ? "Sign in to upload your images." : "Create a free account to upload your images."}</span>{" "}
        You&apos;ll go straight to the editor afterwards.{" "}
        {mode === "sign-in" ? (
          <>
            New here?{" "}
            <Link href={`/sign-up${qs}`} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Create a free account
            </Link>
            .
          </>
        ) : (
          <>
            Have an account?{" "}
            <Link href={`/sign-in${qs}`} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Sign in
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}
