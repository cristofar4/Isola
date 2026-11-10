"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Modal dialog that becomes a bottom sheet on small screens. Radix handles
 * focus trapping, focus return, Escape and aria-modal.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  side = "auto",
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  side?: "auto" | "bottom" | "right";
  /** Width of the centred dialog on larger screens. */
  size?: "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "fixed z-50 flex max-h-[88dvh] flex-col bg-surface shadow-[var(--shadow-float)] focus:outline-none",
            side === "right"
              ? "inset-y-0 right-0 w-[min(92vw,380px)] animate-fade-in"
              : side === "bottom"
                ? "inset-x-0 bottom-0 animate-sheet-up rounded-t-[20px] pb-[env(safe-area-inset-bottom)]"
                : cn(
                    "inset-x-0 bottom-0 animate-sheet-up rounded-t-[20px] pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:animate-scale-in sm:rounded-[18px] sm:pb-0",
                    size === "lg" ? "sm:w-[min(94vw,760px)]" : "sm:w-[min(92vw,520px)]",
                  ),
            className,
          )}
        >
          {side !== "right" && (
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
          )}
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
            <div>
              <Dialog.Title className="font-display text-lg font-bold tracking-tight text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-[13px] text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Close"
              className="-mr-1 inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
          {footer && <div className="border-t border-line px-5 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
