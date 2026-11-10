"use client";

import { Music, Plus, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NumberField, RangeField } from "@/components/scene/fields";
import { cn } from "@/lib/cn";
import { audibleClips } from "@/lib/motion/audio";
import { commit, preview, useEditor } from "@/lib/motion/editor";
import { MEDIA_ACCEPT } from "@/lib/motion/media";
import type { Film } from "@/lib/motion/model";
import { setTrack, updateClip } from "@/lib/motion/ops";
import { secs } from "@/lib/motion/time";
import { addMediaClip, importFiles } from "./add-media";
import { filmAudio } from "./playback";
import { DarkButton } from "./ui";

/** Level meters fed by the master output's analysers (the actual signal, not a guess). */
function Meters() {
  const playing = useEditor((s) => s.playing);
  const silent = { peak: -Infinity, rms: -Infinity };
  const [state, setState] = useState<{ levels: Array<{ peak: number; rms: number }>; hold: number[] }>({ levels: [silent, silent], hold: [-Infinity, -Infinity] });
  useEffect(() => {
    const audio = filmAudio;
    if (!playing || !audio) return;
    let raf = 0;
    const tick = () => {
      const m = audio.meters();
      setState((s) => ({ levels: m, hold: m.map((x, i) => Math.max(x.peak, s.hold[i] - 0.4)) }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setTimeout(() => setState({ levels: [{ peak: -Infinity, rms: -Infinity }, { peak: -Infinity, rms: -Infinity }], hold: [-Infinity, -Infinity] }), 0);
    };
  }, [playing]);
  const levels = state.levels;
  const pct = (db: number) => (Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0);
  return (
    <div className="grid gap-1.5" data-meters aria-label="Master level" role="group">
      {(["L", "R"] as const).map((ch, i) => (
        <div key={ch} className="flex items-center gap-2 text-[11px] text-[#9AA1B2]">
          <span className="w-3 font-bold">{ch}</span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#3BB273] via-[#C9D94A] to-[#F07167]" style={{ width: `${pct(levels[i].peak)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${pct(state.hold[i])}%` }} />
          </div>
          <span className="w-14 text-right font-mono tabular-nums" data-meter-db={ch}>
            {Number.isFinite(levels[i].peak) ? `${levels[i].peak.toFixed(1)} dB` : "−∞ dB"}
          </span>
        </div>
      ))}
      <p className="text-[10px] text-[#8890A2]">Peak level of the master output while playing.</p>
    </div>
  );
}

export function SoundPanel() {
  const film = useEditor((s) => s.film)!;
  const selection = useEditor((s) => s.selection);
  const clip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0] && c.source.kind === "audio") : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const base = useRef<Film | null>(null);
  const sounds = film.media.filter((m) => m.hasAudio);
  const heard = audibleClips(film).length;
  const track = clip ? film.tracks.find((t) => t.id === clip.trackId) : null;

  return (
    <div className="grid gap-3 px-3 pb-4" data-sound-panel>
      <div className="grid gap-2">
        <RangeField
          tone="dark"
          label="Master gain"
          value={film.masterGain}
          min={-24}
          max={12}
          step={0.5}
          format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`}
          onChange={(v) => {
            base.current ??= film;
            filmAudio?.setMaster(v);
            preview({ ...film, masterGain: v });
          }}
          onCommit={() => {
            if (base.current) commit(useEditor.getState().film!, { base: base.current });
            base.current = null;
          }}
        />
        <Meters />
        <p className="text-[11px] text-[#8890A2]">{heard ? `${heard} sound clip${heard === 1 ? "" : "s"} will be heard (muted tracks are silent; with any track on solo, only solo tracks play).` : "No sound yet."}</p>
      </div>
      {clip && clip.source.kind === "audio" && clip.audio && (
        <div className="grid gap-2 border-t border-white/[0.08] pt-3">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">{clip.name}</h3>
          <NumberField tone="dark" label="Volume" unit="dB" decimals={1} step={0.5} min={-60} max={12} value={clip.audio.gain} onChange={(v) => commit(updateClip(film, clip.id, (c) => ({ ...c, audio: { ...c.audio!, gain: v } })), { coalesce: `gain:${clip.id}` })} />
          <NumberField tone="dark" label="Fade in" unit="s" decimals={2} step={0.1} min={0} max={clip.duration} value={clip.audio.fadeIn} onChange={(v) => commit(updateClip(film, clip.id, (c) => ({ ...c, audio: { ...c.audio!, fadeIn: Math.min(v, c.duration) } })))} />
          <NumberField tone="dark" label="Fade out" unit="s" decimals={2} step={0.1} min={0} max={clip.duration} value={clip.audio.fadeOut} onChange={(v) => commit(updateClip(film, clip.id, (c) => ({ ...c, audio: { ...c.audio!, fadeOut: Math.min(v, c.duration) } })))} />
          <p className="text-[11px] text-[#8890A2]">
            Plays {secs(clip.source.in)}–{secs(clip.source.in + clip.duration)} of the file. Trim or move it on the timeline.
          </p>
          {track && (
            <div className="flex gap-2">
              <DarkButton size="sm" tone={track.muted ? "primary" : "plain"} aria-pressed={track.muted} onClick={() => commit(setTrack(film, track.id, { muted: !track.muted }))}>
                {track.muted ? "Muted" : "Mute track"}
              </DarkButton>
              <DarkButton size="sm" tone={track.solo ? "primary" : "plain"} aria-pressed={track.solo} onClick={() => commit(setTrack(film, track.id, { solo: !track.solo }))}>
                {track.solo ? "Solo on" : "Solo track"}
              </DarkButton>
            </div>
          )}
        </div>
      )}
      <div className="grid gap-2 border-t border-white/[0.08] pt-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">Sound files</h3>
          <input ref={inputRef} id="motion-sound-files" type="file" multiple accept={MEDIA_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void importFiles(Array.from(e.target.files ?? []), setBusy).finally(() => (e.target.value = ""))} />
          <DarkButton size="sm" icon={<Upload className="size-3.5" aria-hidden="true" />} onClick={() => inputRef.current?.click()} disabled={!!busy}>
            Add sound
          </DarkButton>
        </div>
        {busy && <p className="text-[12px] text-[#A4B1FF]" role="status">{busy}</p>}
        <ul className="grid gap-1">
          {sounds.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-[8px] bg-white/[0.03] px-2 py-1.5 text-[12px] text-[#C9CEDA]">
              <Music className="size-3.5 shrink-0 text-[#7FD3DC]" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              <span className="tabular-nums text-[#8890A2]">{secs(m.duration)}</span>
              <button type="button" aria-label={`Add ${m.name} at the playhead`} onClick={() => addMediaClip({ ...m, kind: "audio" })} className="inline-flex size-6 items-center justify-center rounded hover:bg-white/10">
                <Plus className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <p className={cn("text-[11px] leading-snug text-[#8890A2]")}>ISOLA doesn&apos;t include music or sound effects. Add sound you have the rights to use; it stays on this device.</p>
      </div>
    </div>
  );
}
