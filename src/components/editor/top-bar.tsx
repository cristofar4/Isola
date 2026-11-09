"use client";

import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { ArrowLeft, ChevronDown, Columns2, Download, Images, Redo2, SlidersHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LogoMark } from "@/components/ui/logo";
import { redo, undo } from "@/lib/project/actions";
import type { ProjectImage } from "@/lib/project/store";
import { useEditorUI } from "./editor-ui-store";
import { EngineChip } from "./engine-chip";

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar({
  image,
  onOpenImages,
  onOpenAdjust,
}: {
  image: ProjectImage | null;
  onOpenImages: () => void;
  onOpenAdjust: () => void;
}) {
  const projectName = useEditorUI((s) => s.projectName);
  const setProjectName = useEditorUI((s) => s.setProjectName);
  const compare = useEditorUI((s) => s.compare);
  const setCompare = useEditorUI((s) => s.setCompare);
  const zoom = useEditorUI((s) => s.zoom);
  const view = useEditorUI((s) => s.view);
  const setExportOpen = useEditorUI((s) => s.setExportOpen);
  const mod = isMac() ? "⌘" : "Ctrl+";
  const ready = image?.status === "ready";

  return (
    <header className="flex h-14 min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-line bg-surface px-2 sm:gap-2 sm:px-3">
      <h1 className="sr-only">ISOLA editor</h1>
      <Link href="/" aria-label="ISOLA home" className="flex items-center gap-2 rounded-md px-1">
        <LogoMark className="size-6" />
        <span className="hidden font-display text-[17px] font-extrabold tracking-[0.06em] sm:inline">ISOLA</span>
      </Link>
      <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
      {image?.batchItemId && (
        <Link
          href="/batch"
          title="Your edits to this image are kept in Batch Studio"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-blue-50 px-2.5 text-[13px] font-semibold text-blue-700 hover:bg-blue-100"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Back to Batch Studio</span>
          <span className="sm:hidden">Batch</span>
        </Link>
      )}
      <label className="sr-only" htmlFor="project-name">
        Project name
      </label>
      <input
        id="project-name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        onBlur={(e) => !e.target.value.trim() && setProjectName("Untitled project")}
        maxLength={80}
        className="hidden h-8 w-[min(28vw,220px)] truncate rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-ink hover:border-line focus:border-blue focus:outline-none md:block"
      />
      <div className="flex items-center">
        <IconButton
          label={image?.history.undoLabel ? `Undo ${image.history.undoLabel}` : "Undo"}
          shortcut={`${mod}Z`}
          icon={<Undo2 className="size-[18px]" />}
          disabled={!image?.history.canUndo}
          onClick={() => image && undo(image.id)}
        />
        <IconButton
          label={image?.history.redoLabel ? `Redo ${image.history.redoLabel}` : "Redo"}
          shortcut={isMac() ? "⇧⌘Z" : "Ctrl+Y"}
          icon={<Redo2 className="size-[18px]" />}
          disabled={!image?.history.canRedo}
          onClick={() => image && redo(image.id)}
        />
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
        <IconButton
          label={compare ? "Hide comparison" : "Compare with original"}
          shortcut="\"
          icon={<Columns2 className="size-[18px]" />}
          active={compare}
          aria-pressed={compare}
          disabled={!ready}
          onClick={() => setCompare(!compare)}
        />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            disabled={!image}
            className="hidden h-8 items-center gap-1 rounded-lg px-2 text-[13px] font-medium tabular-nums text-ink hover:bg-ink/5 disabled:opacity-40 sm:inline-flex"
            aria-label={`Zoom ${Math.round(zoom * 100)}%`}
          >
            {Math.round(zoom * 100)}%
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[180px] animate-scale-in rounded-xl border border-line bg-surface p-1 text-sm shadow-[var(--shadow-float)]"
            >
              {[
                { label: "Zoom in", key: "+", run: () => view({ type: "zoom-by", factor: 1.25 }) },
                { label: "Zoom out", key: "−", run: () => view({ type: "zoom-by", factor: 0.8 }) },
                { label: "Fit to screen", key: "0", run: () => view({ type: "fit" }) },
                { label: "Actual size (100%)", key: "1", run: () => view({ type: "zoom-to", scale: 1 }) },
                { label: "200%", key: "2", run: () => view({ type: "zoom-to", scale: 2 }) },
              ].map((item) => (
                <DropdownMenu.Item
                  key={item.label}
                  onSelect={item.run}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-paper"
                >
                  {item.label}
                  <kbd className="text-xs text-muted">{item.key}</kbd>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <div className="hidden xl:block">
          <EngineChip />
        </div>
        <IconButton label="Images" icon={<Images className="size-[18px]" />} className="lg:hidden" onClick={onOpenImages} />
        <IconButton
          label="Adjustments"
          icon={<SlidersHorizontal className="size-[18px]" />}
          className="lg:hidden"
          disabled={!image}
          onClick={onOpenAdjust}
        />
        <Button
          size="sm"
          className="h-9"
          disabled={!ready}
          onClick={() => setExportOpen(true)}
          icon={<Download className="size-4" aria-hidden="true" />}
        >
          <span className="hidden sm:inline">Export</span>
          <span className="sr-only sm:hidden">Export</span>
        </Button>
      </div>
    </header>
  );
}
