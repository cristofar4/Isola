"use client";

import { Switch as RadixSwitch } from "radix-ui";
import { useId } from "react";

export function Switch({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors duration-200 data-[state=checked]:bg-blue"
      >
        <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
      </RadixSwitch.Root>
    </div>
  );
}
