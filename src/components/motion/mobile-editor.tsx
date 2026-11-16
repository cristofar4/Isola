"use client";

import { Dialog } from "radix-ui";
import {
  ArrowLeft,
  Copy,
  Diamond,
  Images,
  Minus,
  Music,
  Palette,
  Plus,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Video,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { commit, notify, select, setPlayhead, setMotionMode, setWorkspace, useEditor } from "@/lib/motion/editor";
import type { Clip, Track } from "@/lib/motion/model";
import { addCameraKeyframes, addTransformKeyframes, deleteClips, duplicateClip, splitClip, updateClip } from "@/lib/motion/ops";
import { clipRange, filmDuration, shotAt, shotStarts, timecode, toFrame } from "@/lib/motion/time";
import { FONT_CSS, creativeFontClasses } from "@/lib/scene/fonts";
import type { FontId } from "@/lib/scene/model";
import { importFiles } from "./add-media";
import { ColourPanel } from "./colour-panel";
import { DeliverPanel } from "./deliver-panel";
import { LibraryPanel } from "./library-panel";
import { MusicPicker } from "./music-picker";
import { MotionPanel, TextPanel } from "./quick-motion";
import { SoundPanel } from "./sound-panel";
import { KIND_COLOUR, Waveform } from "./timeline";
import { MEDIA_ACCEPT } from "@/lib/motion/media";

/* ------------------------------------------------------------------ sheet --- */

/** A bottom sheet in Motion Studio's own colours (light or dark). */
function MotionSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn("fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] animate-sheet-up flex-col rounded-t-[20px] bg-m-panel text-m-text shadow-[0_-12px_40px_-12px_rgb(0_0_0/0.35)] focus:outline-none", creativeFontClasses)}
          data-motion-sheet={title}
        >
          <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-m-ink/20" />
          <div className="flex items-center justify-between px-4 pb-1 pt-2">
            <Dialog.Title className="text-[17px] font-bold text-m-strong">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="inline-flex size-9 items-center justify-center rounded-lg text-m-muted hover:bg-m-ink/[0.07] hover:text-m-strong">
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-width:thin]">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------- text looks --- */

/** Ready-made title looks (like text templates), from ISOLA's four typefaces. */
const TEXT_LOOKS: Array<{ id: string; name: string; font: FontId; weight: number; uppercase: boolean; letterSpacing: number }> = [
  { id: "bold", name: "Bold", font: "display", weight: 800, uppercase: false, letterSpacing: -0.01 },
  { id: "clean", name: "Clean", font: "sans", weight: 500, uppercase: false, letterSpacing: 0 },
  { id: "elegant", name: "Elegant", font: "serif", weight: 500, uppercase: false, letterSpacing: 0.01 },
  { id: "headline", name: "Headline", font: "condensed", weight: 400, uppercase: true, letterSpacing: 0.03 },
  { id: "spaced", name: "Spaced", font: "sans", weight: 600, uppercase: true, letterSpacing: 0.22 },
  { id: "serif-caps", name: "Serif caps", font: "serif", weight: 600, uppercase: true, letterSpacing: 0.14 },
];

function TextSheetBody() {
  const film = useEditor((s) => s.film)!;
  const selection = useEditor((s) => s.selection);
  const clip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0]) : null;
  const text = clip?.source.kind === "text" ? clip : null;
  const current = text?.source.kind === "text" ? text.source.style : null;
  function applyLook(look: (typeof TEXT_LOOKS)[number]) {
    if (!text) return;
    commit(updateClip(film, text.id, (c) => (c.source.kind === "text" ? { ...c, source: { ...c.source, style: { ...c.source.style, font: look.font, weight: look.weight, uppercase: look.uppercase, letterSpacing: look.letterSpacing } } } : c)));
  }
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <div className="min-w-0 px-4">
        <p className="pb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-m-text-2">{text ? `Look for “${text.name}”` : "Looks"}</p>
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Text looks">
          {TEXT_LOOKS.map((look) => {
            const on = !!current && current.font === look.font && current.weight === look.weight && current.uppercase === look.uppercase && Math.abs(current.letterSpacing - look.letterSpacing) < 1e-3;
            return (
              <li key={look.id} className="shrink-0">
                <button
                  type="button"
                  disabled={!text}
                  aria-pressed={on}
                  onClick={() => applyLook(look)}
                  className={cn("grid h-[76px] w-[104px] content-center gap-1 rounded-[12px] border px-2 text-center disabled:opacity-45", on ? "border-m-accent-2 bg-m-accent/10" : "border-m-line bg-m-raised")}
                  data-text-look={look.id}
                >
                  <span
                    className="block truncate text-[20px] leading-none text-m-strong"
                    style={{ fontFamily: FONT_CSS[look.font], fontWeight: look.weight, letterSpacing: `${look.letterSpacing}em`, textTransform: look.uppercase ? "uppercase" : "none" }}
                  >
                    Aa
                  </span>
                  <span className="text-[11px] font-medium text-m-muted">{look.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {!text && <p className="pt-1 text-[12px] text-m-subtle">Add a title below, or select one on the timeline, to give it a look.</p>}
      </div>
      <TextPanel />
    </div>
  );
}

/* ---------------------------------------------------------------- timeline --- */

const ROW = { visual: 46, audio: 50 } as const;
const RULER = 26;

function clipLabel(c: Clip) {
  if (c.source.kind === "text") return c.source.style.text.split("\n")[0] || c.name;
  return c.name;
}

const KIND_ICON: Partial<Record<Clip["source"]["kind"], LucideIcon>> = { text: Type, audio: Music, video: Video, image: Images, light: Sparkles, backdrop: Images };

/**
 * The phone timeline, like CapCut's: the playhead is fixed in the middle and
 * the film scrolls under it. Scrolling scrubs; playing scrolls the film
 * along. Pinch (or + / −) to zoom; tap a clip to select it.
 */
function PhoneTimeline({ onAddMusic, onAddText }: { onAddMusic: () => void; onAddText: () => void }) {
  const film = useEditor((s) => s.film)!;
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const selection = useEditor((s) => s.selection);
  const scroller = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState(56);
  const [half, setHalf] = useState(180);
  const expected = useRef<number | null>(null);
  const pinch = useRef<{ d: number; pps: number } | null>(null);
  const D = filmDuration(film);
  const width = D * pps;
  const selected = new Set(selection.clipIds);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHalf(Math.round(el.clientWidth / 2)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the playhead under the centre line: playback, the transport and the keyboard move the film.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = Math.round(playhead * pps);
    if (Math.abs(el.scrollLeft - target) < 1) return;
    expected.current = target;
    el.scrollLeft = target;
  }, [playhead, pps, half]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    if (expected.current !== null && Math.abs(el.scrollLeft - expected.current) <= 1) {
      expected.current = null;
      return;
    }
    expected.current = null;
    // Scrolling by hand scrubs (and pauses, like CapCut).
    if (useEditor.getState().playing) useEditor.setState({ playing: false });
    setPlayhead(toFrame(el.scrollLeft / pps, film.fps));
  }

  const zoom = (factor: number) => setPps((p) => Math.min(320, Math.max(14, Math.round(p * factor))));

  const tracks = film.tracks;
  const rows: Array<{ track: Track; clips: Clip[] }> = tracks.map((t) => ({ track: t, clips: film.clips.filter((c) => c.trackId === t.id) }));
  const tickEvery = pps >= 120 ? 0.5 : pps >= 40 ? 1 : pps >= 20 ? 2 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= D + 1e-6; t += tickEvery) ticks.push(Math.round(t * 100) / 100);
  const starts = shotStarts(film);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-m-chrome" data-phone-timeline>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-m-line px-3">
        <span className="font-mono text-[13px] tabular-nums text-m-text" aria-live="off">
          {timecode(playhead, film.fps)}
        </span>
        <span className="font-mono text-[12px] tabular-nums text-m-subtle">/ {timecode(D, film.fps)}</span>
        <span className="ml-auto flex items-center gap-0.5">
          <button type="button" aria-label="Zoom timeline out" onClick={() => zoom(1 / 1.5)} className="inline-flex size-8 items-center justify-center rounded-lg text-m-text-2 hover:bg-m-ink/[0.07]">
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Zoom timeline in" onClick={() => zoom(1.5)} className="inline-flex size-8 items-center justify-center rounded-lg text-m-text-2 hover:bg-m-ink/[0.07]">
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>
      <div
        ref={scroller}
        role="group"
        aria-label="Timeline: scroll to move through the film"
        onScroll={onScroll}
        onTouchStart={(e) => {
          if (e.touches.length === 2) pinch.current = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), pps };
          if (playing) useEditor.setState({ playing: false });
        }}
        onTouchMove={(e) => {
          if (e.touches.length !== 2 || !pinch.current) return;
          const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
          setPps(Math.min(320, Math.max(14, Math.round(pinch.current.pps * (d / pinch.current.d)))));
        }}
        onTouchEnd={() => (pinch.current = null)}
        className="relative min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="relative" style={{ width: width + half * 2, minHeight: "100%" }}>
          {/* Ruler */}
          <div className="sticky top-0 z-[2] bg-m-chrome" style={{ height: RULER }} aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} className="absolute top-0 h-full" style={{ left: half + t * pps }}>
                <span className="absolute bottom-0 h-2 w-px bg-m-ink/25" />
                <span className="absolute left-1 top-1 whitespace-nowrap font-mono text-[10px] tabular-nums text-m-subtle">{Number.isInteger(t) ? `${t}s` : ""}</span>
              </span>
            ))}
          </div>
          {/* Shot boundaries */}
          {starts.slice(1).map((s, i) => (
            <span key={i} className="pointer-events-none absolute bottom-0 w-px bg-m-ink/15" style={{ left: half + s * pps, top: RULER }} aria-hidden="true" />
          ))}
          {rows.map(({ track, clips }) => (
            <div key={track.id} className="relative border-b border-m-line/60" style={{ height: ROW[track.kind] }} role="group" aria-label={track.name} data-track={track.name}>
              {clips.map((c) => {
                const r = clipRange(film, c);
                const w = Math.max(6, c.duration * pps);
                const Icon = KIND_ICON[c.source.kind];
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-clip={c.name}
                    aria-pressed={selected.has(c.id)}
                    aria-label={`${clipLabel(c)}, ${timecode(r.start, film.fps)} to ${timecode(r.end, film.fps)}`}
                    onClick={() => select({ clipIds: selected.has(c.id) ? [] : [c.id], shotId: c.shotId, keyframe: null })}
                    className={cn(
                      "absolute bottom-1 top-1 overflow-hidden rounded-[7px] border text-left text-[11px] font-semibold text-white/95",
                      KIND_COLOUR[c.source.kind],
                      selected.has(c.id) && "ring-2 ring-white ring-offset-1 ring-offset-m-accent",
                    )}
                    style={{ left: half + r.start * pps, width: w }}
                  >
                    {c.source.kind === "audio" && <Waveform film={film} clip={c} width={w} height={ROW.audio - 8} />}
                    <span className="pointer-events-none relative flex items-center gap-1 truncate px-1.5 pt-1">
                      {Icon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
                      <span className="truncate">{clipLabel(c)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {/* Add rows, like CapCut's "+ Add audio" and "+ Add text". */}
          <div className="flex gap-2 py-2" style={{ paddingLeft: half }}>
            <button type="button" onClick={onAddMusic} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-m-ink/[0.07] px-3 text-[13px] font-semibold text-m-text hover:bg-m-ink/[0.12]">
              <Music className="size-4" aria-hidden="true" /> Add music
            </button>
            <button type="button" onClick={onAddText} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-m-ink/[0.07] px-3 text-[13px] font-semibold text-m-text hover:bg-m-ink/[0.12]">
              <Type className="size-4" aria-hidden="true" /> Add text
            </button>
          </div>
        </div>
      </div>
      {/* The fixed playhead line in the middle; the film scrolls under it. */}
      <div className="pointer-events-none absolute bottom-0 left-1/2 top-9 z-[3] w-0.5 -translate-x-1/2 bg-m-strong shadow-[0_0_0_1px_rgb(0_0_0/0.15)]" aria-hidden="true" data-centre-playhead>
        <span className="absolute -left-[5px] top-0 size-3 rounded-full bg-m-strong" />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- toolbar --- */

type SheetId = "motion" | "styles" | "media" | "text" | "music" | "elements" | "colour" | "sound" | "export" | "edit";

const SHEET_TITLE: Record<SheetId, string> = {
  motion: "Motion",
  styles: "Motion styles",
  media: "Media",
  text: "Text",
  music: "Music",
  elements: "Elements",
  colour: "Colour",
  sound: "Sound",
  export: "Export video",
  edit: "Edit clip",
};

function ToolButton({ icon: Icon, label, onClick, tone }: { icon: LucideIcon; label: string; onClick: () => void; tone?: "danger" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("grid h-[58px] w-[64px] shrink-0 place-items-center content-center gap-1 rounded-[12px] text-[11px] font-medium", tone === "danger" ? "text-m-danger-text hover:bg-m-danger/10" : "text-m-text-2 hover:bg-m-ink/[0.06]")}
    >
      <Icon className="size-[22px]" aria-hidden="true" />
      {label}
    </button>
  );
}

/** The phone editor below the viewer: the timeline, a CapCut-style tool bar, and sheets for each tool. */
export function PhoneEditor() {
  const film = useEditor((s) => s.film)!;
  const selection = useEditor((s) => s.selection);
  const playhead = useEditor((s) => s.playhead);
  const [sheet, setSheet] = useState<SheetId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const clip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0]) ?? null : null;

  const open = (id: SheetId) => {
    if (id === "motion") setMotionMode("quick");
    if (id === "edit") setMotionMode("layer");
    if (id === "colour") setWorkspace("colour");
    setSheet(id);
  };

  function split() {
    if (!clip) return;
    const r = splitClip(film, clip.id, playhead);
    commit(r.film === film ? { film, problem: "Move the playhead inside the clip to split it." } : r.film);
  }
  function keyframe() {
    if (clip) return commit(addTransformKeyframes(film, clip.id, playhead));
    const at = shotAt(film, Math.min(playhead, Math.max(0, filmDuration(film) - 1e-3)));
    commit(addCameraKeyframes(film, at.shot.id, at.local));
    notify(`Camera keyframe added in ${at.shot.name}.`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-phone-editor>
      <PhoneTimeline onAddMusic={() => open("music")} onAddText={() => open("text")} />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={MEDIA_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void importFiles(files, setBusy);
        }}
      />
      <nav aria-label={clip ? `Tools for ${clip.name}` : "Tools"} className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-m-line bg-m-chrome px-1.5 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] [scrollbar-width:none]">
        {clip ? (
          <>
            <ToolButton icon={ArrowLeft} label="Back" onClick={() => select({ clipIds: [], keyframe: null })} />
            <ToolButton icon={SlidersHorizontal} label="Edit" onClick={() => open("edit")} />
            <ToolButton icon={Scissors} label="Split" onClick={split} />
            <ToolButton icon={Diamond} label="Keyframe" onClick={keyframe} />
            {clip.source.kind === "text" && <ToolButton icon={Type} label="Font" onClick={() => open("text")} />}
            {clip.source.kind === "audio" && <ToolButton icon={Music} label="Volume" onClick={() => open("sound")} />}
            <ToolButton icon={Copy} label="Duplicate" onClick={() => commit(duplicateClip(film, clip.id))} />
            <ToolButton icon={Trash2} label="Delete" tone="danger" onClick={() => commit(deleteClips(film, [clip.id]))} />
          </>
        ) : (
          <>
            <ToolButton icon={Video} label="Motion" onClick={() => open("motion")} />
            <ToolButton icon={Sparkles} label="Styles" onClick={() => open("styles")} />
            <ToolButton icon={Type} label="Text" onClick={() => open("text")} />
            <ToolButton icon={Music} label="Music" onClick={() => open("music")} />
            <ToolButton icon={Images} label="Media" onClick={() => open("media")} />
            <ToolButton icon={Wand2} label="Elements" onClick={() => open("elements")} />
            <ToolButton icon={Palette} label="Colour" onClick={() => open("colour")} />
            <ToolButton icon={Diamond} label="Keyframe" onClick={keyframe} />
            <ToolButton icon={Upload} label="Export" onClick={() => open("export")} />
          </>
        )}
      </nav>
      {busy && (
        <p role="status" className="shrink-0 bg-m-chrome px-3 pb-1 text-[12px] text-m-accent-text">
          {busy}
        </p>
      )}
      <MotionSheet open={sheet !== null} title={sheet ? SHEET_TITLE[sheet] : ""} onClose={() => setSheet(null)}>
        {sheet === "motion" || sheet === "edit" ? (
          <MotionPanel />
        ) : sheet === "styles" ? (
          <LibraryPanel tab="styles" />
        ) : sheet === "media" ? (
          <div className="grid gap-2">
            <div className="px-3 pt-1">
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] bg-m-accent text-[14px] font-semibold text-white hover:bg-m-accent-hover">
                <Upload className="size-4" aria-hidden="true" /> Add photos, video or sound
              </button>
            </div>
            <LibraryPanel tab="media" />
          </div>
        ) : sheet === "elements" ? (
          <LibraryPanel tab="elements" />
        ) : sheet === "text" ? (
          <TextSheetBody />
        ) : sheet === "music" ? (
          <div className="grid gap-3 px-3">
            <MusicPicker onAdded={() => setSheet(null)} />
            <div className="grid gap-2 border-t border-m-line pt-3">
              <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-m-text-2">Your sound</p>
              <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-m-line bg-m-raised text-[14px] font-semibold text-m-text hover:bg-m-ink/[0.06]">
                <Upload className="size-4" aria-hidden="true" /> Add music or a voice-over from your phone
              </button>
            </div>
          </div>
        ) : sheet === "colour" ? (
          <ColourPanel />
        ) : sheet === "sound" ? (
          <SoundPanel />
        ) : sheet === "export" ? (
          <DeliverPanel />
        ) : null}
      </MotionSheet>
    </div>
  );
}
