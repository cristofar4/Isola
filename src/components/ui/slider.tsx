"use client";

import { Slider as RadixSlider } from "radix-ui";
import { useId } from "react";
import { cn } from "@/lib/cn";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Fired once when the user finishes a drag or keyboard change. */
  onCommit?: (value: number) => void;
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
  tone?: "light" | "dark";
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  format = (v) => String(v),
  disabled,
  className,
  tone = "light",
}: SliderProps) {
  const id = useId();
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex items-center justify-between text-[13px]">
        <label id={id} className={cn("font-medium", tone === "light" ? "text-ink" : "text-white")}>
          {label}
        </label>
        <output aria-hidden="true" className={cn("tabular-nums", tone === "light" ? "text-muted" : "text-white/70")}>
          {format(value)}
        </output>
      </div>
      <RadixSlider.Root
        className="relative flex h-5 touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={([v]) => onCommit?.(v)}
        aria-labelledby={id}
      >
        <RadixSlider.Track
          className={cn("relative h-1 grow overflow-hidden rounded-full", tone === "light" ? "bg-line" : "bg-white/20")}
        >
          <RadixSlider.Range className="absolute h-full rounded-full bg-blue" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-labelledby={id}
          aria-valuetext={format(value)}
          className="block size-4 rounded-full border-2 border-blue bg-white shadow-sm transition-transform duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue data-[disabled]:opacity-50"
        />
      </RadixSlider.Root>
    </div>
  );
}
