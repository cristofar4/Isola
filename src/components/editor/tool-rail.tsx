"use client";

import { Brush, Crop, Eraser, Hand } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";
import { useEditorUI, type Tool } from "./editor-ui-store";

export const TOOLS: Array<{ id: Tool; label: string; shortcut: string; icon: React.ElementType }> = [
  { id: "move", label: "Move", shortcut: "V", icon: Hand },
  { id: "restore", label: "Restore brush", shortcut: "R", icon: Brush },
  { id: "erase", label: "Erase brush", shortcut: "E", icon: Eraser },
  { id: "crop", label: "Crop", shortcut: "C", icon: Crop },
];

export function ToolRail({ disabled, orientation = "vertical", className }: { disabled?: boolean; orientation?: "vertical" | "horizontal"; className?: string }) {
  const tool = useEditorUI((s) => s.tool);
  const setTool = useEditorUI((s) => s.setTool);
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      aria-orientation={orientation}
      className={cn("flex gap-1.5", orientation === "vertical" ? "flex-col items-center" : "items-center", className)}
      onKeyDown={(e) => {
        const keys = orientation === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
        if (!keys.includes(e.key)) return;
        e.preventDefault();
        const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = buttons[(i + (e.key === keys[1] ? 1 : -1) + buttons.length) % buttons.length];
        next?.focus();
      }}
    >
      {TOOLS.map((t) => (
        <IconButton
          key={t.id}
          label={t.label}
          shortcut={t.shortcut}
          icon={<t.icon className="size-[18px]" />}
          active={tool === t.id}
          aria-pressed={tool === t.id}
          disabled={disabled && t.id !== "move"}
          tooltipSide={orientation === "vertical" ? "right" : "top"}
          size="md"
          className={cn("ring-1", tool === t.id ? "ring-blue" : "ring-line")}
          onClick={() => setTool(t.id)}
        />
      ))}
    </div>
  );
}
