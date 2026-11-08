"use client";

import { Tooltip } from "radix-ui";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  label: string;
  /** Keyboard shortcut shown in the tooltip. */
  shortcut?: string;
  icon: ReactNode;
  active?: boolean;
  tone?: "light" | "dark";
  tooltipSide?: "top" | "right" | "bottom" | "left";
  size?: "sm" | "md";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, icon, active, tone = "light", tooltipSide = "bottom", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          ref={ref}
          type={type}
          aria-label={label}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-[9px] transition-[background-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-35",
            size === "md" ? "size-9" : "size-8",
            tone === "light"
              ? active
                ? "bg-blue text-white shadow-[var(--shadow-blue)]"
                : "text-ink hover:bg-ink/[0.06]"
              : active
                ? "bg-white text-ink"
                : "text-white/85 hover:bg-white/10",
            className,
          )}
          {...props}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={tooltipSide}
          sideOffset={8}
          className="z-[60] flex animate-fade-in items-center gap-2 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-[var(--shadow-float)]"
        >
          {label}
          {shortcut && (
            <kbd className="rounded border border-white/20 px-1 font-sans text-[10px] text-white/70">{shortcut}</kbd>
          )}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
});
