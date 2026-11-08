"use client";

import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("grid auto-cols-fr grid-flow-col gap-1 rounded-[10px] bg-paper-2 p-1", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          title={o.title}
          className="flex h-8 items-center justify-center gap-1.5 rounded-[7px] px-2 text-[13px] font-medium text-muted transition-colors duration-150 hover:text-ink disabled:opacity-40 data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-sm"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
