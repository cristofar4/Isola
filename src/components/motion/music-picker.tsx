"use client";

import { Music, Pause, Play, Plus, Shuffle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { MUSIC, encodeWav, renderMusic, type MusicId } from "@/lib/motion/music";
import { addMusic } from "./add-media";

const PREVIEW_SECONDS = 12;

/**
 * "Music made by ISOLA": five styles, each with versions, previewed and added
 * to the film. Everything is composed in this browser, so there are no
 * third-party recordings and nothing to license.
 */
export function MusicPicker({ onAdded }: { onAdded?: () => void }) {
  const [variation, setVariation] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPlaying(null);
  };
  useEffect(() => stop, []);

  async function preview(id: MusicId) {
    const key = `${id}:${variation[id] ?? 0}`;
    if (playing === key) return stop();
    stop();
    setLoading(key);
    try {
      const wav = encodeWav(await renderMusic(id, PREVIEW_SECONDS, variation[id] ?? 0));
      url.current = URL.createObjectURL(wav);
      const a = new Audio(url.current);
      a.onended = () => stop();
      audio.current = a;
      await a.play();
      setPlaying(key);
    } catch {
      stop();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-2.5" data-music-picker>
      <p className="text-[12px] leading-snug text-m-subtle">
        Made by ISOLA on this device, at your film&apos;s length. No third-party recordings, so there&apos;s nothing to license.
      </p>
      <ul className="grid gap-2">
        {MUSIC.map((m) => {
          const v = variation[m.id] ?? 0;
          const key = `${m.id}:${v}`;
          const isPlaying = playing === key;
          return (
            <li key={m.id} className={cn("flex items-center gap-3 rounded-[12px] border p-2.5", isPlaying ? "border-m-accent-2 bg-m-accent/10" : "border-m-line bg-m-raised")} data-music={m.id}>
              <button
                type="button"
                onClick={() => void preview(m.id)}
                aria-label={isPlaying ? `Stop ${m.name}` : `Preview ${m.name}`}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-m-accent text-white hover:bg-m-accent-hover"
              >
                {loading === key ? <Spinner className="size-4" /> : isPlaying ? <Pause className="size-4" aria-hidden="true" /> : <Play className="ml-0.5 size-4" aria-hidden="true" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[14px] font-semibold text-m-text">
                  <Music className="size-3.5 shrink-0 text-m-accent-text" aria-hidden="true" />
                  <span className="truncate">{m.name}</span>
                  {v > 0 && <span className="shrink-0 text-[11px] font-medium text-m-subtle">version {v + 1}</span>}
                </p>
                <p className="truncate text-[12px] text-m-muted">{m.mood}</p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  <span className="rounded-full bg-m-ink/[0.06] px-1.5 text-[10px] font-semibold text-m-muted">{m.bpm} BPM</span>
                  {m.tags.map((t) => (
                    <span key={t} className="rounded-full bg-m-ink/[0.06] px-1.5 text-[10px] font-semibold text-m-muted">
                      {t}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (playing?.startsWith(`${m.id}:`)) stop();
                    setVariation((x) => ({ ...x, [m.id]: ((x[m.id] ?? 0) + 1) % 4 }));
                  }}
                  aria-label={`Another version of ${m.name}`}
                  title="Another version"
                  className="inline-flex size-8 items-center justify-center rounded-[8px] text-m-text-2 hover:bg-m-ink/[0.07]"
                >
                  <Shuffle className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    stop();
                    void addMusic(m.id, v, setBusy).then(() => onAdded?.());
                  }}
                  aria-label={`Add ${m.name} to the film`}
                  title="Add to the film"
                  className="inline-flex size-8 items-center justify-center rounded-[8px] bg-m-ink/[0.07] text-m-text hover:bg-m-ink/[0.12] disabled:opacity-40"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {busy && (
        <p role="status" className="flex items-center gap-2 text-[12px] text-m-accent-text">
          <Spinner className="size-3.5" /> {busy}
        </p>
      )}
    </div>
  );
}
