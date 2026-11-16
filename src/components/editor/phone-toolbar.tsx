"use client";

import { Brush, Crop, Eraser, Hand, Images, Palette, SlidersHorizontal } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useEditorUI, type Tool } from "./editor-ui-store";

const TOOLS: Array<{ id: Tool; label: string; name: string; icon: typeof Hand }> = [
  { id: "move", label: "Move", name: "Move", icon: Hand },
  { id: "restore", label: "Restore", name: "Restore brush", icon: Brush },
  { id: "erase", label: "Erase", name: "Erase brush", icon: Eraser },
  { id: "crop", label: "Crop", name: "Crop", icon: Crop },
];

function Item({
  label,
  name,
  icon,
  active,
  disabled,
  onClick,
  pressed,
  badge,
}: {
  label: string;
  name: string;
  icon: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  pressed?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      aria-pressed={pressed}
      aria-haspopup={pressed === undefined ? "dialog" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group relative flex min-w-[46px] flex-1 basis-0 flex-col items-center gap-1 rounded-[12px] pb-1 pt-1.5 text-[10.5px] font-semibold leading-tight transition-colors disabled:opacity-40",
        active ? "text-blue-700" : "text-ink-3 active:bg-ink/5",
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-[11px] transition-colors [&>svg]:size-[19px]",
          active ? "bg-blue text-white shadow-[var(--shadow-blue)]" : "bg-paper-2 text-ink group-hover:bg-ink/10",
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span aria-hidden="true">{label}</span>
      {badge !== undefined && badge > 1 && (
        <span aria-hidden="true" className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-ink px-1 text-[10px] font-bold leading-[18px] text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

/**
 * The editor's tool bar on phones: every tool with its name under it, then
 * Background, Adjust and Images, which open as sheets over the picture.
 */
export function PhoneToolbar({
  disabled,
  noImage,
  imageCount,
  onBackground,
  onAdjust,
  onImages,
}: {
  /** No cutout yet: the brushes, crop and backdrop wait for it. */
  disabled: boolean;
  /** No image selected: nothing to adjust. */
  noImage: boolean;
  imageCount: number;
  onBackground: () => void;
  onAdjust: () => void;
  onImages: () => void;
}) {
  const tool = useEditorUI((s) => s.tool);
  const setTool = useEditorUI((s) => s.setTool);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Tools"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      // Seven tools fit a 360px phone; narrower screens scroll the bar rather than the page.
      className="flex w-full items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-phone-tools
    >
      {TOOLS.map((t) => (
        <Item
          key={t.id}
          label={t.label}
          name={t.name}
          icon={<t.icon />}
          active={tool === t.id}
          pressed={tool === t.id}
          disabled={disabled && t.id !== "move"}
          onClick={() => setTool(t.id)}
        />
      ))}
      <span className="mx-0.5 my-2.5 w-px shrink-0 bg-line" aria-hidden="true" />
      <Item label="Backdrop" name="Backdrop: change the background" icon={<Palette />} disabled={disabled} onClick={onBackground} />
      <Item label="Adjust" name="Adjustments" icon={<SlidersHorizontal />} disabled={noImage} onClick={onAdjust} />
      <Item label="Images" name="Images" icon={<Images />} badge={imageCount} onClick={onImages} />
    </div>
  );
}
