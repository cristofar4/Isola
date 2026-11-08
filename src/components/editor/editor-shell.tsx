"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { useFileDrop } from "@/components/upload/use-file-drop";
import { cn } from "@/lib/cn";
import { importFiles, redo, resumeAfterSignIn, undo } from "@/lib/project/actions";
import { useOnSignIn } from "@/lib/session-gate";
import { useActiveImage, useProject } from "@/lib/project/store";
import { EditorCanvas } from "./editor-canvas";
import { useEditorUI } from "./editor-ui-store";
import { EmptyState } from "./empty-state";
import { ExportDialog } from "./export-dialog";
import { Filmstrip } from "./filmstrip";
import { ImagesPanel } from "./images-panel";
import { PropertiesPanel } from "./properties-panel";
import { ToolRail } from "./tool-rail";
import { TopBar } from "./top-bar";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function EditorShell() {
  const images = useProject((s) => s.images);
  const image = useActiveImage();
  const [imagesOpen, setImagesOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Images added while signed out start processing as soon as the visitor signs in.
  useOnSignIn(resumeAfterSignIn);
  const drop = useFileDrop(async (files) => {
    const report = await importFiles(files);
    setNotice(report.rejected.length ? report.rejected.map((r) => `${r.name}: ${r.error.message}`).join(" ") : null);
  });

  // Keyboard shortcuts. Effects are cleaned up when the route is hidden.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      const ui = useEditorUI.getState();
      const active = useProject.getState().activeId;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        if (active) (e.shiftKey ? redo : undo)(active);
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        if (active) redo(active);
        return;
      }
      if (mod && (key === "e" || key === "s")) {
        e.preventDefault();
        ui.setExportOpen(true);
        return;
      }
      if (mod || e.altKey) return;
      const actions: Record<string, () => void> = {
        v: () => ui.setTool("move"),
        h: () => ui.setTool("move"),
        r: () => ui.setTool("restore"),
        b: () => ui.setTool("restore"),
        e: () => ui.setTool("erase"),
        c: () => ui.setTool("crop"),
        "\\": () => ui.setCompare(!ui.compare),
        "[": () => ui.setBrushSize(ui.brushSize * 0.85),
        "]": () => ui.setBrushSize(ui.brushSize / 0.85),
        "0": () => ui.view({ type: "fit" }),
        "1": () => ui.view({ type: "zoom-to", scale: 1 }),
        "2": () => ui.view({ type: "zoom-to", scale: 2 }),
        "=": () => ui.view({ type: "zoom-by", factor: 1.25 }),
        "+": () => ui.view({ type: "zoom-by", factor: 1.25 }),
        "-": () => ui.view({ type: "zoom-by", factor: 0.8 }),
        escape: () => ui.tool === "crop" && ui.setTool("move"),
      };
      const run = actions[key];
      if (run) {
        e.preventDefault();
        run();
      }
    };
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      const report = await importFiles(files.map((f, i) => (f.name ? f : new File([f], `pasted-${i + 1}.png`, { type: f.type }))));
      setNotice(report.rejected.length ? report.rejected.map((r) => `${r.name}: ${r.error.message}`).join(" ") : null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  const hasImages = images.length > 0;

  return (
    <div className="flex h-dvh w-full max-w-[100vw] flex-col overflow-hidden bg-paper text-ink" {...drop.bind}>
      <TopBar image={image} onOpenImages={() => setImagesOpen(true)} onOpenAdjust={() => setAdjustOpen(true)} />
      <div className="flex min-h-0 flex-1">
        {hasImages && (
          <>
            <aside aria-label="Tools" className="hidden w-[60px] shrink-0 border-r border-line bg-surface py-3 lg:block">
              <ToolRail disabled={image?.status !== "ready"} />
            </aside>
            <aside aria-label="Images" className="hidden w-[248px] shrink-0 border-r border-line bg-surface lg:block">
              <ImagesPanel />
            </aside>
          </>
        )}
        <main id="main" className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_40%,#eef0eb,#e6e9e3)]">
            {image ? <EditorCanvas key={image.id} image={image} /> : <EmptyState />}
            {drop.dragging && (
              <div className="pointer-events-none absolute inset-3 z-20 flex animate-fade-in items-center justify-center rounded-[18px] border-2 border-dashed border-blue bg-blue-50/85">
                <p className="flex items-center gap-2 text-base font-semibold text-blue-700">
                  <ImagePlus className="size-5" aria-hidden="true" /> Drop to add images
                </p>
              </div>
            )}
            {notice && (
              <div role="alert" className="absolute inset-x-3 top-3 z-10 mx-auto max-w-lg rounded-xl border border-danger/25 bg-danger-50 px-3 py-2 text-[13px] text-danger shadow-[var(--shadow-card)]">
                {notice}
                <button type="button" className="ml-2 font-semibold underline" onClick={() => setNotice(null)}>
                  Dismiss
                </button>
              </div>
            )}
          </div>
          {hasImages && <Filmstrip className={cn(images.length < 2 && "hidden lg:block")} />}
          {hasImages && (
            <div className="flex items-center justify-center border-t border-line bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
              <ToolRail orientation="horizontal" disabled={image?.status !== "ready"} />
            </div>
          )}
        </main>
        {image && (
          <aside aria-label="Properties" className="hidden w-[300px] shrink-0 border-l border-line bg-surface lg:block">
            <PropertiesPanel image={image} />
          </aside>
        )}
      </div>

      <Sheet open={imagesOpen} onOpenChange={setImagesOpen} title="Images" side="bottom" className="lg:hidden">
        <div className="-mx-5 h-[60dvh]">
          <ImagesPanel onSelect={() => setImagesOpen(false)} />
        </div>
      </Sheet>
      {image && (
        <Sheet open={adjustOpen} onOpenChange={setAdjustOpen} title="Adjustments" side="bottom" className="lg:hidden">
          <div className="-mx-5 -mb-5 h-[62dvh] min-w-0">
            <PropertiesPanel image={image} />
          </div>
        </Sheet>
      )}
      {image && image.status === "ready" && <ExportDialog image={image} />}
    </div>
  );
}
