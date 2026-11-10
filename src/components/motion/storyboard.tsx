"use client";

import { DropdownMenu } from "radix-ui";
import { ChevronLeft, ChevronRight, Copy, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { askName } from "@/components/studio/name-dialog";
import { cn } from "@/lib/cn";
import { commit, select, setPlayhead, useEditor } from "@/lib/motion/editor";
import { ASPECTS, type Film } from "@/lib/motion/model";
import { addShot, deleteShot, duplicateShot, renameShot, reorderShots } from "@/lib/motion/ops";
import { renderFrame } from "@/lib/motion/render";
import { secs, shotStarts, timecode } from "@/lib/motion/time";
import { onImagesChanged } from "@/lib/scene/resources";
import { previewResources } from "./playback";

function ShotThumb({ film, at, label }: { film: Film; at: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => onImagesChanged(() => setV((x) => x + 1)), []);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const a = ASPECTS[film.aspect];
    const s = 200 / Math.max(a.width, a.height);
    c.width = Math.round(a.width * s);
    c.height = Math.round(a.height * s);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    // Debounced so dragging in the timeline stays smooth.
    const id = setTimeout(() => renderFrame(ctx, film, at, c.width, c.height, previewResources(false)), 120);
    return () => clearTimeout(id);
  }, [film, at, v]);
  return <canvas ref={ref} role="img" aria-label={label} className="block h-[64px] w-full bg-black object-contain" />;
}

/** The film's shots in order. The same data as the timeline: reordering here moves the shots' clips there. */
export function Storyboard() {
  const film = useEditor((s) => s.film)!;
  const selectedShot = useEditor((s) => s.selection.shotId);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const starts = shotStarts(film);
  const item = "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-[#E8EAF0] outline-none data-[highlighted]:bg-white/10";

  return (
    <section aria-label="Shot storyboard" className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#C9CEDA]">Shot storyboard</h2>
        <span className="text-[12px] text-[#8890A2]">({film.shots.length} shot{film.shots.length === 1 ? "" : "s"})</span>
      </div>
      <ol className="flex min-h-0 gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:thin]">
        {film.shots.map((s, i) => {
          const active = selectedShot === s.id;
          return (
            <li
              key={s.id}
              data-shot={s.name}
              draggable
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) commit(reorderShots(film, dragFrom, i));
                setDragFrom(null);
              }}
              className={cn("w-[176px] shrink-0 overflow-hidden rounded-[10px] border bg-[#1D222B]", active ? "border-[#8B9BFF] ring-1 ring-[#8B9BFF]/50" : "border-white/[0.08]")}
            >
              <button
                type="button"
                className="block w-full text-left"
                aria-pressed={active}
                onClick={() => {
                  select({ shotId: s.id, clipIds: [], keyframe: null });
                  setPlayhead(starts[i]);
                }}
              >
                <ShotThumb film={film} at={starts[i] + Math.min(s.duration * 0.6, Math.max(0, s.duration - 0.05))} label={`${s.name} preview`} />
              </button>
              <div className="flex items-start gap-1 px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-[#E8EAF0]">
                    {String(i + 1).padStart(2, "0")} {s.name}
                  </p>
                  <p className="font-mono text-[10px] tabular-nums text-[#8890A2]">
                    {timecode(starts[i], film.fps).slice(0, -3)} – {timecode(starts[i] + s.duration, film.fps).slice(0, -3)} ({secs(s.duration)})
                  </p>
                </div>
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger aria-label={`Actions for ${s.name}`} className="inline-flex size-6 items-center justify-center rounded text-[#9AA1B2] hover:bg-white/10 hover:text-white">
                    <Ellipsis className="size-4" aria-hidden="true" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-[180px] rounded-lg border border-white/10 bg-[#1D222B] p-1 shadow-xl">
                      <DropdownMenu.Item className={item} onSelect={() => void askName("Rename shot", { label: "Shot name", initial: s.name, action: "Rename" }).then((n) => n && commit(renameShot(film, s.id, n)))}>
                        <Pencil className="size-3.5" aria-hidden="true" /> Rename
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={item} onSelect={() => commit(duplicateShot(film, s.id))}>
                        <Copy className="size-3.5" aria-hidden="true" /> Duplicate
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={item} disabled={i === 0} onSelect={() => commit(reorderShots(film, i, i - 1))}>
                        <ChevronLeft className="size-3.5" aria-hidden="true" /> Move earlier
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={item} disabled={i === film.shots.length - 1} onSelect={() => commit(reorderShots(film, i, i + 1))}>
                        <ChevronRight className="size-3.5" aria-hidden="true" /> Move later
                      </DropdownMenu.Item>
                      <DropdownMenu.Item className={cn(item, "text-[#FFB4AD]")} disabled={film.shots.length <= 1} onSelect={() => commit(deleteShot(film, s.id))}>
                        <Trash2 className="size-3.5" aria-hidden="true" /> Delete shot
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </li>
          );
        })}
        <li className="shrink-0">
          <button type="button" onClick={() => commit(addShot(film, film.shots.findIndex((s) => s.id === selectedShot) >= 0 ? film.shots.findIndex((s) => s.id === selectedShot) : film.shots.length - 1, 3))} className="grid h-full min-h-[104px] w-[120px] place-items-center rounded-[10px] border border-dashed border-white/15 text-[12px] font-semibold text-[#9AA1B2] hover:border-[#8B9BFF]/60 hover:text-white">
            <span className="grid place-items-center gap-1">
              <Plus className="size-4" aria-hidden="true" /> Add shot
            </span>
          </button>
        </li>
      </ol>
    </section>
  );
}
