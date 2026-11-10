"use client";

import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Motion Studio's dark graphite surfaces with restrained periwinkle accents. */
export const M = {
  bg: "bg-[#101318]",
  panel: "bg-[#161A21]",
  raised: "bg-[#1D222B]",
  border: "border-white/[0.08]",
  text: "text-[#E8EAF0]",
  muted: "text-[#9AA1B2]",
  accent: "text-[#A4B1FF]",
  accentBg: "bg-[#6F7FF7]",
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
        tone === "primary" && "bg-[#6F7FF7] text-white hover:bg-[#7F8EFF]",
        tone === "plain" && "border border-white/10 bg-white/[0.04] text-[#E8EAF0] hover:bg-white/[0.08]",
        tone === "ghost" && "text-[#C9CEDA] hover:bg-white/[0.07] hover:text-white",
        tone === "danger" && "border border-[#F07167]/30 text-[#FFB4AD] hover:bg-[#F07167]/10",
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
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[#C9CEDA] hover:bg-white/[0.08] hover:text-white disabled:opacity-35", active && "bg-[#6F7FF7]/20 text-[#C3CBFF]", className)}
    >
      {children}
    </button>
  );
}

/** Keyframe toggle: filled when there's a keyframe at the playhead. */
export function Diamond({ on, animated, label, onClick, disabled }: { on: boolean; animated: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={on} title={label} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-white/[0.08] disabled:opacity-30">
      <span className={cn("block size-2.5 rotate-45 border", on ? "border-[#F5B942] bg-[#F5B942]" : animated ? "border-[#F5B942]" : "border-white/35")} />
    </button>
  );
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#C9CEDA]">{children}</h2>
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2 text-[12px] text-[#9AA1B2]">{label}</div>
      {children}
      {hint && <p className="text-[11px] leading-snug text-[#8890A2]">{hint}</p>}
    </div>
  );
}

export const darkSelectBase = "h-8 rounded-[8px] border border-white/10 bg-[#1D222B] px-2 text-[13px] text-[#E8EAF0] outline-none focus:border-[#8B9BFF]";
export const darkSelect = `${darkSelectBase} w-full`;
export const darkInput = "h-8 w-full rounded-[8px] border border-white/10 bg-[#1D222B] px-2.5 text-[13px] text-[#E8EAF0] outline-none focus:border-[#8B9BFF]";
