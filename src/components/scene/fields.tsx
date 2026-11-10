"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "light" | "dark";

const fieldTone: Record<Tone, string> = {
  light: "border-line bg-surface text-ink focus:border-blue focus:ring-blue/15",
  dark: "border-white/10 bg-white/5 text-white focus:border-[#8B9BFF] focus:ring-[#8B9BFF]/20",
};
const labelTone: Record<Tone, string> = { light: "text-ink-3", dark: "text-white/70" };

/**
 * A number field that edits in display units (px, %, °, s) and commits on
 * Enter, blur or arrow keys. While typing, the field shows your text; it
 * snaps back to the real value if the text isn't a number.
 */
export function NumberField({
  label,
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  decimals = 0,
  tone = "light",
  className,
  hideLabel,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  decimals?: number;
  tone?: Tone;
  className?: string;
  hideLabel?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (Number.isFinite(value) ? value.toFixed(decimals) : "");
  const commit = (raw: string) => {
    const v = Number(raw.replace(",", "."));
    setDraft(null);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className={cn("min-w-0 flex-1 text-[13px]", labelTone[tone], hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          disabled={disabled}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            else if (e.key === "Escape") setDraft(null);
            else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const delta = (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              setDraft(null);
              onChange(Math.min(max, Math.max(min, Number((value + delta).toFixed(Math.max(decimals, 4))))));
            }
          }}
          className={cn("h-8 w-[84px] rounded-[8px] border pl-2.5 pr-7 text-right text-[13px] tabular-nums outline-none focus:ring-3 disabled:opacity-50", fieldTone[tone])}
        />
        {unit && <span className={cn("pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px]", tone === "light" ? "text-muted" : "text-white/50")}>{unit}</span>}
      </div>
    </div>
  );
}

/** A labelled range input with its value shown. */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onCommit,
  tone = "light",
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onCommit?: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={cn("flex items-center justify-between text-[13px]", labelTone[tone])}>
        {label}
        <span className={cn("tabular-nums", tone === "light" ? "text-muted" : "text-white/55")}>{format(value)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className={cn("w-full disabled:opacity-40", tone === "light" ? "accent-blue" : "accent-[#8B9BFF]")}
      />
    </div>
  );
}

export function Section({ title, children, action, tone = "light" }: { title: string; children: ReactNode; action?: ReactNode; tone?: Tone }) {
  return (
    <section className={cn("grid gap-3 border-b py-4 last:border-b-0", tone === "light" ? "border-line" : "border-white/8")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={cn("text-[14px] font-semibold", tone === "light" ? "text-ink" : "text-white")}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
