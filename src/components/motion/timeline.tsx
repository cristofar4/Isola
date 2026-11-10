"use client";

import { DropdownMenu } from "radix-ui";
import { ArrowDown, ArrowUp, Diamond as DiamondIcon, Ellipsis, Eye, EyeOff, Flag, Lock, Magnet, Pencil, Plus, Scissors, Trash2, Unlock, Volume2, VolumeX, ZoomIn } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { askName } from "@/components/studio/name-dialog";
import { cn } from "@/lib/cn";
import { commit, notify, preview, select, setPlayhead, useEditor } from "@/lib/motion/editor";
import type { Clip, ClipProp, Film, Track } from "@/lib/motion/model";
import { addMarker, addTrack, deleteMarker, deleteTrack, moveClip, moveKeyframe, moveMarker, moveTrack, renameMarker, setTrack, splitClip, trimClip } from "@/lib/motion/ops";
import { clipRange, filmDuration, shotStarts, snapTime, timecode } from "@/lib/motion/time";
import { assetMissing } from "@/lib/scene/resources";
import { missingVideos } from "./playback";
import { IconButton } from "./ui";

const HEADER = 196;
const RULER = 34;
const rowHeight = (t: Track) => (t.kind === "audio" ? 52 : 44);

const KIND_COLOUR: Record<Clip["source"]["kind"], string> = {
  backdrop: "bg-[#2E3D4F] border-[#4A6380]",
  image: "bg-[#3A4280] border-[#6F7FF7]",
  video: "bg-[#1F4F49] border-[#3E9C8F]",
  audio: "bg-[#1E3C42] border-[#3D8A94]",
  shadow: "bg-[#2B2F37] border-[#525A68]",
  text: "bg-[#47366B] border-[#9278D6]",
  light: "bg-[#4D3D1C] border-[#C99A3B]",
  solid: "bg-[#3A3A3A] border-[#6B6B6B]",
};

function Waveform({ film, clip, width, height }: { film: Film; clip: Clip; width: number; height: number }) {
  const media = clip.source.kind === "audio" ? film.media.find((m) => m.id === (clip.source as { mediaId: string }).mediaId) : null;
  if (!media?.peaks?.length || clip.source.kind !== "audio" || width < 4) return null;
  const peaks = media.peaks;
  const from = (clip.source.in / media.duration) * peaks.length;
  const to = ((clip.source.in + clip.duration) / media.duration) * peaks.length;
  const bars = Math.max(1, Math.min(Math.floor(width / 2), 600));
  const mid = height / 2;
  let d = "";
  for (let i = 0; i < bars; i++) {
    const idx = Math.floor(from + ((to - from) * i) / bars);
    const v = peaks[Math.min(peaks.length - 1, Math.max(0, idx))] ?? 0;
    const h = Math.max(0.5, v * mid * 0.95);
    const x = (i / bars) * width;
    d += `M${x.toFixed(1)} ${(mid - h).toFixed(1)}V${(mid + h).toFixed(1)}`;
  }
  return (
    <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
      <path d={d} stroke="#7FD3DC" strokeOpacity={0.75} strokeWidth={1} />
    </svg>
  );
}

function keyTimes(clip: Clip) {
  const times = new Map<number, ClipProp[]>();
  for (const [prop, list] of Object.entries(clip.keyframes) as Array<[ClipProp, Clip["keyframes"][ClipProp]]>) {
    for (const k of list ?? []) {
      const t = Math.round(k.t * 1000) / 1000;
      times.set(t, [...(times.get(t) ?? []), prop]);
    }
  }
  return [...times.entries()].sort((a, b) => a[0] - b[0]);
}

type Drag =
  | { kind: "move"; base: Film; clip: Clip; grab: number; trackId: string }
  | { kind: "trim"; base: Film; clip: Clip; edge: "start" | "end" }
  | { kind: "key"; base: Film; clip: Clip; t: number }
  | { kind: "marker"; base: Film; id: string }
  | { kind: "scrub" };

export function Timeline() {
  const film = useEditor((s) => s.film)!;
  const playhead = useEditor((s) => s.playhead);
  const selection = useEditor((s) => s.selection);
  const [pps, setPps] = useState(90);
  const [snap, setSnap] = useState(true);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const D = filmDuration(film);
  const starts = shotStarts(film);
  const maxEnd = Math.max(D, ...film.clips.map((c) => clipRange(film, c).end));
  const width = Math.max(600, (maxEnd + 3) * pps);
  const selectedSet = new Set(selection.clipIds);

  const rows = useMemo(
    () =>
      film.tracks.reduce<Array<{ track: Track; top: number; h: number }>>((acc, t) => {
        const prev = acc.at(-1);
        return [...acc, { track: t, top: prev ? prev.top + prev.h : RULER, h: rowHeight(t) }];
      }, []),
    [film.tracks],
  );
  const totalH = (rows.at(-1)?.top ?? RULER) + (rows.at(-1)?.h ?? 0);

  function timeAt(e: { clientX: number }) {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left - HEADER + el.scrollLeft) / pps);
  }
  function trackAt(e: { clientY: number }) {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const y = e.clientY - r.top + el.scrollTop;
    return rows.find((row) => y >= row.top && y < row.top + row.h)?.track ?? null;
  }
  function snapped(t: number, film2: Film, ignore: string) {
    if (!snap) return t;
    const targets = [0, D, playhead, ...starts, ...film2.markers.map((m) => m.t)];
    for (const c of film2.clips) {
      if (c.id === ignore) continue;
      const r = clipRange(film2, c);
      targets.push(r.start, r.end);
    }
    const out = snapTime(t, targets, 8 / pps);
    setSnapAt(out !== t ? out : null);
    return out;
  }

  function startScrub(e: ReactPointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind: "scrub" };
    setPlayhead(timeAt(e));
  }

  function onClipDown(e: ReactPointerEvent, clip: Clip, part: "body" | "start" | "end") {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (e.shiftKey) {
      select({ clipIds: selectedSet.has(clip.id) ? selection.clipIds.filter((x) => x !== clip.id) : [...selection.clipIds, clip.id], keyframe: null });
      return;
    }
    select({ clipIds: [clip.id], shotId: clip.shotId ?? selection.shotId, keyframe: null });
    const track = film.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (part === "body") drag.current = { kind: "move", base: film, clip, grab: timeAt(e) - clipRange(film, clip).start, trackId: clip.trackId };
    else drag.current = { kind: "trim", base: film, clip, edge: part };
  }

  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const t = timeAt(e);
    if (d.kind === "scrub") return setPlayhead(t);
    if (d.kind === "move") {
      const track = trackAt(e);
      const target = track && track.kind === (d.clip.source.kind === "audio" ? "audio" : "visual") ? track : film.tracks.find((x) => x.id === d.trackId)!;
      let start = t - d.grab;
      const sStart = snapped(start, d.base, d.clip.id);
      if (sStart !== start) start = sStart;
      else {
        const end = snapped(start + d.clip.duration, d.base, d.clip.id);
        start = end - d.clip.duration;
      }
      const r = moveClip(d.base, d.clip.id, target.id, start);
      preview(r.film);
    } else if (d.kind === "trim") {
      preview(trimClip(d.base, d.clip.id, d.edge, snapped(t, d.base, d.clip.id)).film);
    } else if (d.kind === "key") {
      const r0 = clipRange(d.base, d.clip);
      const nt = Math.max(0, Math.min(d.clip.duration, snapped(t, d.base, "") - r0.start));
      let next = d.base;
      for (const [prop, list] of Object.entries(d.clip.keyframes) as Array<[ClipProp, Clip["keyframes"][ClipProp]]>) {
        const k = list?.find((x) => Math.abs(x.t - d.t) < 1e-3);
        if (k) next = moveKeyframe(next, { kind: "clip", clipId: d.clip.id, prop }, k.id, nt).film;
      }
      preview(next);
    } else if (d.kind === "marker") {
      preview(moveMarker(d.base, d.id, snapped(t, d.base, "")).film);
    }
  }

  function onUp() {
    const d = drag.current;
    drag.current = null;
    setSnapAt(null);
    if (!d || d.kind === "scrub") return;
    const now = useEditor.getState().film!;
    if (now === d.base) return;
    commit(now, { base: d.base });
  }

  const selectedClip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0]) : null;

  function split() {
    const ids = selection.clipIds.length ? selection.clipIds : film.clips.filter((c) => {
      const r = clipRange(film, c);
      return playhead > r.start && playhead < r.end;
    }).map((c) => c.id);
    if (!ids.length) return notify("Select a clip under the playhead to split it.", "error");
    let next = film;
    let problem: string | undefined;
    for (const id of ids) {
      const r = splitClip(next, id, playhead);
      next = r.film;
      problem ??= r.problem;
    }
    commit({ film: next, problem: next === film ? problem : undefined });
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-timeline>
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] px-2 py-1">
        <IconButton label="Split at playhead (S)" onClick={split}>
          <Scissors className="size-4" aria-hidden="true" />
        </IconButton>
        <IconButton label="Add marker at playhead (M)" onClick={() => commit(addMarker(film, playhead, `Marker ${film.markers.length + 1}`))}>
          <Flag className="size-4" aria-hidden="true" />
        </IconButton>
        <IconButton label="Snapping" active={snap} onClick={() => setSnap((s) => !s)}>
          <Magnet className="size-4" aria-hidden="true" />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />
        <button type="button" onClick={() => commit(addTrack(film, "visual"))} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-[#C9CEDA] hover:bg-white/[0.07]">
          <Plus className="size-3.5" aria-hidden="true" /> Video track
        </button>
        <button type="button" onClick={() => commit(addTrack(film, "audio"))} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-[#C9CEDA] hover:bg-white/[0.07]">
          <Plus className="size-3.5" aria-hidden="true" /> Audio track
        </button>
        <div className="ml-auto flex items-center gap-2">
          <ZoomIn className="size-4 text-[#9AA1B2]" aria-hidden="true" />
          <label className="sr-only" htmlFor="tl-zoom">
            Timeline zoom
          </label>
          <input id="tl-zoom" type="range" min={20} max={400} step={5} value={pps} onChange={(e) => setPps(Number(e.target.value))} className="w-28 accent-[#8B9BFF]" />
        </div>
      </div>
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto [scrollbar-width:thin]"
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => {
          if (!e.ctrlKey && !e.metaKey) return;
          e.preventDefault();
          setPps((p) => Math.min(400, Math.max(20, p * (e.deltaY < 0 ? 1.15 : 0.87))));
        }}
      >
        <div className="relative" style={{ width: HEADER + width, height: totalH }}>
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex" style={{ height: RULER }}>
            <div className="sticky left-0 z-30 flex shrink-0 items-center border-b border-r border-white/[0.08] bg-[#161A21] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8890A2]" style={{ width: HEADER }}>
              Tracks
            </div>
            <div className="relative cursor-text border-b border-white/[0.08] bg-[#161A21]" style={{ width }} onPointerDown={startScrub} aria-label="Timeline ruler" role="presentation">
              {Array.from({ length: Math.ceil(maxEnd + 3) + 1 }, (_, s) => (
                <span key={s} className="absolute top-0 h-full border-l border-white/10" style={{ left: s * pps }}>
                  {(pps >= 40 || s % 2 === 0) && <span className="absolute left-1 top-0.5 font-mono text-[10px] text-[#8890A2]">{timecode(s, film.fps).slice(0, -3)}</span>}
                </span>
              ))}
              {film.shots.map((s, i) => (
                <span key={s.id} className={cn("absolute bottom-0 h-3 truncate border-l border-[#8B9BFF]/60 px-1 text-[9px] leading-3 text-[#A4B1FF]", i % 2 ? "bg-white/[0.03]" : "bg-[#8B9BFF]/10")} style={{ left: starts[i] * pps, width: s.duration * pps }}>
                  {s.name}
                </span>
              ))}
              {film.markers.map((m) => (
                <span
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Marker ${m.label} at ${timecode(m.t, film.fps)}`}
                  title={`${m.label} — drag to move, double-click to rename, Delete to remove`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    drag.current = { kind: "marker", base: film, id: m.id };
                  }}
                  onDoubleClick={() => void askName("Rename marker", { label: "Marker name", initial: m.label, action: "Rename" }).then((n) => n && commit(renameMarker(film, m.id, n)))}
                  onKeyDown={(e) => (e.key === "Delete" || e.key === "Backspace") && commit(deleteMarker(film, m.id))}
                  className="absolute top-0 z-10 flex -translate-x-1/2 cursor-grab flex-col items-center"
                  style={{ left: m.t * pps }}
                >
                  <span className="rounded-sm bg-[#F5B942] px-1 text-[9px] font-bold text-[#101318]">{m.label.slice(0, 14)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Tracks */}
          {rows.map(({ track, top, h }, ti) => {
            const clips = film.clips.filter((c) => c.trackId === track.id);
            return (
              <div key={track.id} className="absolute left-0 flex" style={{ top, height: h, width: HEADER + width }} data-track={track.name}>
                <div className="sticky left-0 z-10 flex shrink-0 items-center gap-0.5 border-b border-r border-white/[0.08] bg-[#161A21] pl-2 pr-1" style={{ width: HEADER }}>
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold text-[#E8EAF0]" title="Rename track" onClick={() => void askName("Rename track", { label: "Track name", initial: track.name, action: "Rename" }).then((n) => n && commit(setTrack(film, track.id, { name: n })))}>
                    <span className="mr-1 text-[10px] font-bold text-[#8890A2]">{track.kind === "audio" ? "A" : "V"}</span>
                    {track.name}
                  </button>
                  {track.kind === "visual" ? (
                    <IconButton label={track.hidden ? `Show ${track.name}` : `Hide ${track.name}`} active={track.hidden} onClick={() => commit(setTrack(film, track.id, { hidden: !track.hidden }))} className="size-6">
                      {track.hidden ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                    </IconButton>
                  ) : (
                    <>
                      <IconButton label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`} active={track.muted} onClick={() => commit(setTrack(film, track.id, { muted: !track.muted }))} className="size-6">
                        {track.muted ? <VolumeX className="size-3.5" aria-hidden="true" /> : <Volume2 className="size-3.5" aria-hidden="true" />}
                      </IconButton>
                      <IconButton label={track.solo ? `Unsolo ${track.name}` : `Solo ${track.name}`} active={track.solo} onClick={() => commit(setTrack(film, track.id, { solo: !track.solo }))} className="size-6 text-[11px] font-bold">
                        S
                      </IconButton>
                    </>
                  )}
                  <IconButton label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`} active={track.locked} onClick={() => commit(setTrack(film, track.id, { locked: !track.locked }))} className="size-6">
                    {track.locked ? <Lock className="size-3.5" aria-hidden="true" /> : <Unlock className="size-3.5" aria-hidden="true" />}
                  </IconButton>
                  <DropdownMenu.Root modal={false}>
                    <DropdownMenu.Trigger aria-label={`More for ${track.name}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] text-[#9AA1B2] hover:bg-white/[0.08] hover:text-white">
                      <Ellipsis className="size-3.5" aria-hidden="true" />
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content align="start" sideOffset={4} className="z-50 min-w-[170px] rounded-lg border border-white/10 bg-[#1D222B] p-1 shadow-xl">
                        {(
                          [
                            ["Rename", Pencil, () => void askName("Rename track", { label: "Track name", initial: track.name, action: "Rename" }).then((n) => { if (n) commit(setTrack(film, track.id, { name: n })); }), false],
                            ["Move up", ArrowUp, () => commit(moveTrack(film, track.id, ti - 1)), ti === 0],
                            ["Move down", ArrowDown, () => commit(moveTrack(film, track.id, ti + 1)), ti === film.tracks.length - 1],
                            ["Delete track", Trash2, () => commit(deleteTrack(film, track.id)), false],
                          ] as const
                        ).map(([label, Icon, run, disabled]) => (
                          <DropdownMenu.Item key={label} disabled={disabled} onSelect={run} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-[#E8EAF0] outline-none data-[disabled]:opacity-35 data-[highlighted]:bg-white/10">
                            <Icon className="size-3.5" aria-hidden="true" /> {label}
                          </DropdownMenu.Item>
                        ))}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
                <div className={cn("relative border-b border-white/[0.06]", ti % 2 ? "bg-white/[0.015]" : "", track.locked && "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.025)_6px_12px)]")} style={{ width }} onPointerDown={startScrub}>
                  {clips.map((c) => {
                    const r = clipRange(film, c);
                    const left = r.start * pps;
                    const w = Math.max(3, c.duration * pps);
                    const missing = (c.source.kind === "image" && assetMissing(c.source.assetId)) || (c.source.kind === "video" && missingVideos.has(c.source.mediaId)) || ((c.source.kind === "audio" || c.source.kind === "video") && !film.media.some((m) => m.id === (c.source as { mediaId: string }).mediaId));
                    const isSel = selectedSet.has(c.id);
                    return (
                      <div
                        key={c.id}
                        data-clip={c.name}
                        role="button"
                        tabIndex={-1}
                        aria-pressed={isSel}
                        aria-label={`${c.name}, ${timecode(r.start, film.fps)} to ${timecode(r.end, film.fps)}`}
                        onPointerDown={(e) => onClipDown(e, c, "body")}
                        className={cn("absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-[6px] border text-[11px] text-white/90", KIND_COLOUR[c.source.kind], isSel && "ring-2 ring-[#C3CBFF]", missing && "border-[#F07167] bg-[repeating-linear-gradient(135deg,rgba(240,113,103,0.25)_0_6px,transparent_6px_12px)]")}
                        style={{ left, width: w }}
                      >
                        {c.source.kind === "audio" && <Waveform film={film} clip={c} width={w} height={h - 8} />}
                        <span className="pointer-events-none relative block truncate px-1.5 pt-0.5 font-semibold">
                          {missing ? "Missing · " : ""}
                          {c.source.kind === "text" ? c.source.style.text : c.name}
                          {c.link && !c.link.detached ? " ↔" : ""}
                        </span>
                        {(c.audio?.fadeIn ?? 0) > 0 && <span className="pointer-events-none absolute bottom-0 left-0 top-0 bg-gradient-to-r from-black/40 to-transparent" style={{ width: (c.audio!.fadeIn) * pps }} />}
                        {(c.audio?.fadeOut ?? 0) > 0 && <span className="pointer-events-none absolute bottom-0 right-0 top-0 bg-gradient-to-l from-black/40 to-transparent" style={{ width: (c.audio!.fadeOut) * pps }} />}
                        {keyTimes(c).map(([t]) => (
                          <span
                            key={t}
                            role="presentation"
                            title={`Keyframes at ${t.toFixed(2)}s (drag to move)`}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              select({ clipIds: [c.id] });
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                              drag.current = { kind: "key", base: film, clip: c, t };
                            }}
                            className={cn("absolute bottom-0.5 size-2.5 -translate-x-1/2 rotate-45 cursor-ew-resize border border-[#101318]", isSel ? "bg-[#F5B942]" : "bg-[#F5B942]/60")}
                            style={{ left: t * pps }}
                          />
                        ))}
                        <span role="presentation" title="Trim start" onPointerDown={(e) => onClipDown(e, c, "start")} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize hover:bg-white/40" />
                        <span role="presentation" title="Trim end" onPointerDown={(e) => onClipDown(e, c, "end")} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize hover:bg-white/40" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Shot boundaries, snap line, film end and playhead */}
          {starts.slice(1).map((s) => (
            <span key={s} className="pointer-events-none absolute z-[5] w-px bg-[#8B9BFF]/30" style={{ left: HEADER + s * pps, top: RULER, height: totalH - RULER }} aria-hidden="true" />
          ))}
          <span className="pointer-events-none absolute z-[5] w-px bg-white/40" style={{ left: HEADER + D * pps, top: 0, height: totalH }} aria-hidden="true" />
          {snapAt !== null && <span className="pointer-events-none absolute z-[25] w-px bg-[#F472B6]" style={{ left: HEADER + snapAt * pps, top: 0, height: totalH }} aria-hidden="true" />}
          <span className="pointer-events-none absolute z-[26] w-0.5 bg-[#8B9BFF]" style={{ left: HEADER + playhead * pps - 1, top: 0, height: totalH }} aria-hidden="true">
            <span className="absolute -left-[5px] top-0 size-3 rotate-45 bg-[#8B9BFF]" />
          </span>
        </div>
      </div>
      {selectedClip && Object.keys(selectedClip.keyframes).length > 0 && (
        <p className="flex items-center gap-1.5 border-t border-white/[0.08] px-3 py-1 text-[11px] text-[#8890A2]">
          <DiamondIcon className="size-3" aria-hidden="true" /> Drag a keyframe diamond to move it in time. Edit values and curves in Animate.
        </p>
      )}
    </div>
  );
}
