"use client";

import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Motion Studio's dark graphite surfaces with restrained periwinkle accents. */
export const M = {
  bg: "bg-m-bg",
  panel: "bg-m-panel",
  raised: "bg-m-raised",
  border: "border-m-line",
  text: "text-m-text",
  muted: "text-m-muted",
  accent: "text-m-accent-text",
  accentBg: "bg-m-accent",
};

export const DarkButton = forwardRef<HTMLButtonElement, ComponentProps<"button"> & { tone?: "primary" | "plain" | "ghost" | "danger"; icon?: ReactNode; size?: "sm" | "md" }>(function DarkButton({ tone = "plain", icon, size = "md", className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...props}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[9px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-[14px]",
        tone === "primary" && "bg-m-accent text-white hover:bg-m-accent-hover",
        tone === "plain" && "border border-m-line bg-m-ink/[0.04] text-m-text hover:bg-m-ink/[0.08]",
        tone === "ghost" && "text-m-text-2 hover:bg-m-ink/[0.07] hover:text-m-strong",
        tone === "danger" && "border border-m-danger/30 text-m-danger-text hover:bg-m-danger/10",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, active, className, ...props }: ComponentProps<"button"> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...props}
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] text-m-text-2 hover:bg-m-ink/[0.08] hover:text-m-strong disabled:opacity-35", active && "bg-m-accent/25 text-m-accent-text", className)}
    >
      {children}
    </button>
  );
}

/** Keyframe toggle: filled when there's a keyframe at the playhead. */
export function Diamond({ on, animated, label, onClick, disabled }: { on: boolean; animated: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={on} title={label} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-m-ink/[0.08] disabled:opacity-30">
      <span className={cn("block size-2.5 rotate-45 border", on ? "border-m-key bg-m-key" : animated ? "border-m-key" : "border-m-ink/40")} />
    </button>
  );
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-m-text-2">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-[12px] text-m-muted">{label}</div>
      {children}
      {hint && <p className="text-[11px] leading-snug text-m-subtle">{hint}</p>}
    </div>
  );
}

export const darkSelectBase = "h-8 rounded-[8px] border border-m-line bg-m-raised px-2 text-[13px] text-m-text outline-none focus:border-m-accent-2";
export const darkSelect = `${darkSelectBase} w-full`;
export const darkInput = "h-8 w-full rounded-[8px] border border-m-line bg-m-raised px-2.5 text-[13px] text-m-text outline-none focus:border-m-accent-2";
