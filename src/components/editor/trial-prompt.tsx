"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { Check, Sparkles, X } from "lucide-react";
import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { planConfig } from "@/lib/config";
import { useProject } from "@/lib/project/store";
import { TRIAL_SIGN_IN, TRIAL_SIGN_UP, dismissTrialEnded, loadTrial, useTrial } from "@/lib/trial";

function useGuest() {
  const { data, isPending } = authClient.useSession();
  const trial = useTrial();
  const guest = !isPending && !data;
  useEffect(() => {
    if (guest) void loadTrial();
  }, [guest]);
  return { guest, trial, active: guest && trial.status === "ready" && trial.enabled };
}

/** In the editor's top bar, for guests: how many free tries are left, and the way to keep going. */
export function GuestTriesChip() {
  const { active, trial } = useGuest();
  if (!active) return null;
  return (
    <Link
      href={TRIAL_SIGN_UP}
      title={trial.remaining > 0 ? "Free tries need no account. Create one (free) for unlimited removals." : "Create a free account to keep going"}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold",
        trial.remaining > 0 ? "border-blue-100 bg-blue-50 text-blue-700 hover:border-blue/40" : "border-blue bg-blue text-white hover:bg-blue-600",
      )}
      data-guest-tries={trial.remaining}
    >
      {trial.remaining > 0 ? (
        <>
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: trial.limit }, (_, i) => (
              <span key={i} className={cn("size-1.5 rounded-full", i < trial.remaining ? "bg-blue" : "bg-blue/25")} />
            ))}
          </span>
          <span className="hidden md:inline">
            {trial.remaining} of {trial.limit} free tries left
          </span>
          <span className="md:hidden">{trial.remaining} left</span>
        </>
      ) : (
        <>
          <Sparkles className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Create free account</span>
          <span className="sm:hidden">Sign up</span>
        </>
      )}
    </Link>
  );
}

/**
 * "Want to make more?": opens when a guest finishes their last free try, and
 * again if they ask for more after that. Their cutouts stay in the editor.
 */
export function TrialEndedDialog() {
  const { guest, trial } = useGuest();
  const images = useProject((s) => s.images);
  const made = images.filter((i) => i.resultThumbUrl).slice(-3);
  const open = guest && trial.endedAt !== null;
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && dismissTrialEnded()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in overflow-hidden rounded-[22px] bg-surface shadow-[var(--shadow-float)] focus:outline-none" aria-describedby="trial-ended-desc" data-trial-ended>
          <div className="relative bg-[linear-gradient(135deg,#e7eefd,#dde7fb)] px-6 pb-5 pt-6">
            <Dialog.Close aria-label="Close" className="absolute right-3 top-3 rounded-lg p-2 text-ink-3 hover:bg-white/60 hover:text-ink">
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
            {made.length > 0 && (
              <ul className="mb-4 flex gap-2" aria-label="What you made">
                {made.map((i) => (
                  <li key={i.id} className="checkerboard size-16 overflow-hidden rounded-[12px] border border-white shadow-[var(--shadow-card)]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                    <img src={i.resultThumbUrl!} alt={`Cutout of ${i.name}`} className="size-full object-contain" />
                  </li>
                ))}
              </ul>
            )}
            <Dialog.Title className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">Want to make more?</Dialog.Title>
            <p id="trial-ended-desc" className="mt-1.5 text-[15px] leading-relaxed text-ink-3">
              You&apos;ve used your {trial.limit} free tries. Create a free account to keep removing backgrounds.
            </p>
          </div>
          <div className="px-6 pb-6 pt-5">
            <ul className="grid gap-2 text-[14px] text-ink-3">
              {[
                "No image limit on the free plan",
                "Still processed on this device: your images aren't uploaded",
                `What you made stays here: refine and download it, with no watermark (free downloads are up to ${planConfig.freeMaxExportSide.toLocaleString("en-US")}px)`,
              ].map((line) => (
                <li key={line} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-2">
              <ButtonLink href={TRIAL_SIGN_UP} size="lg" className="w-full">
                Create free account
              </ButtonLink>
              <div className="flex items-center justify-between gap-3 text-[14px]">
                <span className="text-muted">
                  Have an account?{" "}
                  <Link href={TRIAL_SIGN_IN} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                    Sign in
                  </Link>
                </span>
                <Dialog.Close className="rounded-lg px-2 py-1 font-semibold text-ink-3 hover:bg-paper hover:text-ink">Not now</Dialog.Close>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
