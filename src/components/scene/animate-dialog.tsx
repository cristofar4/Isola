"use client";

import { Dialog } from "radix-ui";
import { Clapperboard, Info, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FilmPreview } from "@/components/motion/kit-preview";
import { defaultPreset, usePresets } from "@/components/studio/use-presets";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { applyKitResult, buildFromStyle, defaultParams, KITS, layerSetFromScene } from "@/lib/motion/kits";
import { emptyFilm } from "@/lib/motion/model";
import { ASPECT_FOR_FORMAT, filmFromScene } from "@/lib/motion/scene-link";
import { createFilmFromScene, loadFilms, useFilms } from "@/lib/motion/store";
import { secs, filmDuration } from "@/lib/motion/time";
import type { Scene } from "@/lib/scene/model";

/**
 * "Animate scene": choose a motion style for this scene, see it on your own
 * layers (rendered by the real renderer), adjust its timings, then open
 * Motion Studio. Nothing happens to the scene itself.
 */
export function AnimateDialog({ scene, open, onOpenChange }: { scene: Scene; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const presets = usePresets((s) => s.presets);
  const styles = useFilms((s) => s.styles);
  const [chosen, setChosen] = useState("slow-reveal");
  const [hovered, setHovered] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, Record<string, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brand = useMemo(() => defaultPreset(presets)?.colors.map((c) => c.hex) ?? [], [presets]);
  const set = useMemo(() => layerSetFromScene(scene), [scene]);

  useEffect(() => {
    if (!open) return;
    void loadFilms().catch(() => undefined);
    if (!usePresets.getState().presets) void usePresets.getState().load();
  }, [open]);

  const previews = useMemo(() => {
    if (!open) return [];
    const kits = KITS.map((k) => {
      const p = { ...defaultParams(k), ...(params[k.id] ?? {}) };
      const problem = k.check(set);
      return { id: k.id, name: k.name, summary: k.summary, pace: k.pace, problem, kit: k, params: p, film: filmFromScene(scene, { kitId: k.id, params: p, brand }) };
    });
    const saved = styles.map((st) => {
      const film = { ...applyKitResult(emptyFilm(scene.name, ASPECT_FOR_FORMAT[scene.format]), buildFromStyle(st, set), st.id) };
      return { id: st.id, name: st.name, summary: "Your saved style", pace: null, problem: set.products.length ? null : "Needs at least one product layer.", kit: null, params: {}, film };
    });
    return [...kits, ...saved];
  }, [open, scene, set, params, brand, styles]);

  const current = previews.find((p) => p.id === chosen) ?? previews[0];

  async function animate() {
    if (!current || current.problem) return;
    setBusy(true);
    setError(null);
    try {
      const film = await createFilmFromScene(scene, current.id, { brand, params: current.params });
      onOpenChange(false);
      router.push(`/motion/${film.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The film couldn't be created.");
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-x-3 top-[4vh] z-50 mx-auto flex max-h-[92vh] max-w-[1080px] animate-scale-in flex-col overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-float)] focus:outline-none" aria-describedby="animate-desc">
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-blue-50 text-blue">
              <Clapperboard className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-[20px] font-bold text-ink">Choose a motion style</Dialog.Title>
              <p id="animate-desc" className="text-[13px] text-muted">
                Previews use your scene&apos;s own layers. Everything stays editable in Motion Studio, and this scene isn&apos;t changed.
              </p>
            </div>
            <Dialog.Close aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-ink/5 hover:text-ink">
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
            <div role="radiogroup" aria-label="Motion styles" className="grid content-start gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {previews.map((p) => (
                <div key={p.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={chosen === p.id}
                    data-style={p.id}
                    onClick={() => setChosen(p.id)}
                    onMouseEnter={() => setHovered(p.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(p.id)}
                    onBlur={() => setHovered(null)}
                    className={cn("group block w-full overflow-hidden rounded-[14px] border text-left transition-shadow", chosen === p.id ? "border-blue ring-2 ring-blue/30" : "border-line hover:border-line-strong")}
                  >
                    <FilmPreview film={p.film} playing={hovered === p.id || (chosen === p.id && hovered === null)} label={`${p.name} preview`} className="aspect-video object-contain" />
                    <span className="block px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold text-ink">{p.name}</span>
                        {p.pace && <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-muted">{p.pace}</span>}
                        <span className="ml-auto text-[12px] tabular-nums text-muted">{secs(filmDuration(p.film))}</span>
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted">{p.summary}</span>
                      {p.problem && <span className="mt-1 block text-[12px] font-medium text-warn">{p.problem}</span>}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <aside className="grid content-start gap-4 border-t border-line p-5 lg:border-l lg:border-t-0">
              {current?.kit ? (
                <>
                  <div>
                    <h3 className="text-[16px] font-bold text-ink">{current.name}</h3>
                    <ul className="mt-2 grid gap-1 text-[13px] text-ink-3">
                      {current.kit.details.map((d) => (
                        <li key={d} className="flex gap-2">
                          <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-blue" aria-hidden="true" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="grid gap-3">
                    {current.kit.params.map((param) => {
                      const v = current.params[param.id];
                      return (
                        <label key={param.id} className="grid gap-1.5">
                          <span className="flex items-center justify-between text-[13px] font-medium text-ink">
                            {param.label}
                            <span className="tabular-nums text-muted">
                              {param.unit === "s" ? `${v.toFixed(1)}s` : param.max <= 1 ? `${Math.round(v * 100)}%` : v.toFixed(2)}
                            </span>
                          </span>
                          <input
                            type="range"
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={v}
                            onChange={(e) => setParams((all) => ({ ...all, [current.id]: { ...current.params, [param.id]: Number(e.target.value) } }))}
                            className="w-full accent-blue"
                          />
                        </label>
                      );
                    })}
                  </div>
                </>
              ) : current ? (
                <div>
                  <h3 className="text-[16px] font-bold text-ink">{current.name}</h3>
                  <p className="mt-1 text-[13px] text-muted">A style you saved from a film: its shots, timings, framing, keyframes and text animation, applied to this scene&apos;s layers.</p>
                </div>
              ) : null}
              <p className="flex gap-2 rounded-[12px] bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
                <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                Motion here is 2D: camera moves, layer animation, light and parallax between your separate layers. A single photo can&apos;t be turned to show its other sides.
              </p>
              {error && (
                <p role="alert" className="text-[13px] text-danger">
                  {error}
                </p>
              )}
              <Button size="lg" onClick={() => void animate()} disabled={!current || !!current.problem || busy} icon={busy ? <Spinner className="size-4" /> : <Clapperboard className="size-4" aria-hidden="true" />}>
                {busy ? "Creating film…" : "Animate in Motion Studio"}
              </Button>
            </aside>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
