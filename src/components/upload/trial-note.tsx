"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { TRIAL_SIGN_UP } from "@/lib/trial";

/**
 * Under the landing page's upload buttons: how many free tries a guest has
 * left (no account needed), and once they're used, the way to keep going.
 */
export function TrialNote({ tries, signedIn, className }: { tries: { left: number; limit: number } | null; signedIn: boolean; className?: string }) {
  if (tries && tries.left > 0) {
    return (
      <div className={cn("grid justify-items-center gap-1.5", className)} data-trial-note={tries.left}>
        <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[13px] font-semibold text-blue-700">
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: tries.limit }, (_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full", i < tries.left ? "bg-blue" : "bg-blue/25")} />
            ))}
          </span>
          {tries.left === tries.limit ? `${tries.limit} free tries, no account needed` : `${tries.left} of ${tries.limit} free tries left`}
        </p>
        <p className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" aria-hidden="true" />
          Processed in your browser; your image isn&apos;t uploaded. Examples are free.
        </p>
      </div>
    );
  }
  if (tries) {
    return (
      <div className={cn("grid justify-items-center gap-1.5", className)} data-trial-note="0">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
          <Sparkles className="size-4 text-blue" aria-hidden="true" />
          You&apos;ve used your {tries.limit} free tries.
        </p>
        <p className="max-w-[340px] text-xs leading-relaxed text-muted">
          <Link href={TRIAL_SIGN_UP} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
            Create a free account
          </Link>{" "}
          to keep going: no image limit, still processed in your browser.
        </p>
      </div>
    );
  }
  return (
    <p className={cn("inline-flex items-center gap-1.5 text-xs text-muted", className)}>
      <Lock className="size-3.5" aria-hidden="true" />
      {signedIn ? "Processed in your browser; your image isn't uploaded." : "Free to try. Processed in your browser; your image isn't uploaded."}
    </p>
  );
}
