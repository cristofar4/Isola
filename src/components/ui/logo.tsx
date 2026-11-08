import { cn } from "@/lib/cn";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="7" fill="#4163F4" />
      <rect x="8" y="8" width="16" height="16" rx="2" fill="none" stroke="#fff" strokeWidth="3" />
      <rect x="13.5" y="13.5" width="5" height="5" rx="1" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, tone = "ink" }: { className?: string; tone?: "ink" | "white" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span
        className={cn(
          "font-display text-[21px] font-extrabold tracking-[0.06em]",
          tone === "ink" ? "text-ink" : "text-white",
        )}
      >
        ISOLA
      </span>
    </span>
  );
}
