import { cn } from "@/lib/cn";

/** Determinate bar for work with a real, measurable total (e.g. bytes downloaded). */
export function ProgressBar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-blue/15", className)}
    >
      <div className="h-full rounded-full bg-blue transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Indeterminate bar: work is happening but its duration is unknown. */
export function ActivityBar({ label, className }: { label: string; className?: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-busy="true" className={cn("h-1.5 w-full overflow-hidden rounded-full bg-blue/15", className)}>
      <div className="h-full w-full origin-left animate-indeterminate rounded-full bg-blue" />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("size-4 animate-spin", className)}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
