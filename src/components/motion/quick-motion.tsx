"use client";

import { Lightbulb, Type } from "lucide-react";
import { useEffect, useMemo } from "react";
import { NumberField, RangeField } from "@/components/scene/fields";
import { defaultPreset, usePresets } from "@/components/studio/use-presets";
import { cn } from "@/lib/cn";
import { commit, notify, select, setMotionMode, useEditor, type MotionMode } from "@/lib/motion/editor";
import { KITS, applyKitResult, buildFromStyle, defaultParams, layerSetFromFilm } from "@/lib/motion/kits";
import { EASE_LABEL, TRANSITION_LABEL, type Clip, type Ease, type Film, type TransitionKind } from "@/lib/motion/model";
import { CAMERA_MOVES, CAMERA_MOVE_LABEL, applyCameraMove, describeCameraMove, scaleFilm, setAllTransitions, setLightSweep, shotSweeps, updateClip, type CameraMove } from "@/lib/motion/ops";
import { clipLocalAt } from "@/lib/motion/render";
import { loadFilms, useFilms } from "@/lib/motion/store";
import { clipBase, clipRange, clipValue, filmDuration, secs, shotAt } from "@/lib/motion/time";
import { AnimatePanel, AssemblePanel, CLIP_PROPS, PropRow, TextSection } from "./inspector";
import { AddText } from "./library-panel";
import { Field, darkSelect } from "./ui";

const EASES: Ease[] = ["linear", "ease-in", "ease-out", "ease-in-out"];

function Group({ title, note, children, action }: { title: string; note?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="grid gap-2.5 border-b border-m-line px-3 py-3.5 last:border-b-0" data-quick={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-m-strong">{title}</h3>
        {action}
      </div>
      {children}
      {note && <p className="text-[11px] leading-snug text-m-subtle">{note}</p>}
    </section>
  );
}

/** The layer the quick controls move: the selected one, or the shot's main product. */
function quickLayer(film: Film, shotId: string, selected: Clip | null | undefined) {
  if (selected && selected.source.kind !== "audio") return selected;
  const inShot = film.clips.filter((c) => c.shotId === shotId);
  return inShot.find((c) => c.role === "product" && (c.source.kind === "image" || c.source.kind === "video")) ?? null;
}

/**
 * One-step motion: a preset, the film's length, a camera move for the shot,
 * the main layer's position and scale (with keyframes), parallax depth, a
 * light sweep and the transition between shots. Each control writes ordinary
 * shots, clips and keyframes, so everything stays editable in Keyframes.
 */
export function QuickMotion() {
  const film = useEditor((s) => s.film)!;
  const playhead = useEditor((s) => s.playhead);
  const selection = useEditor((s) => s.selection);
  const styles = useFilms((s) => s.styles);
  const presets = usePresets((s) => s.presets);
  const brand = useMemo(() => defaultPreset(presets)?.colors.map((c) => c.hex) ?? [], [presets]);
  const set = useMemo(() => layerSetFromFilm(film), [film]);
  useEffect(() => {
    void loadFilms().catch(() => undefined);
    if (!usePresets.getState().presets) void usePresets.getState().load();
  }, []);

  const D = filmDuration(film);
  const selected = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0]) : null;
  const shot = (selected?.shotId ? film.shots.find((s) => s.id === selected.shotId) : null) ?? shotAt(film, Math.min(playhead, Math.max(0, D - 1e-3))).shot;
  const camera = describeCameraMove(shot);
  const layer = quickLayer(film, shot.id, selected);
  const layerLocked = layer ? !!film.tracks.find((t) => t.id === layer.trackId)?.locked : false;
  const at = layer ? clipLocalAt(film, layer, playhead) : null;
  const sweepOn = shotSweeps(film, shot.id).length > 0;
  const kinds = new Set(film.shots.slice(1).map((s) => s.transition.kind));
  const transition: TransitionKind | "mixed" = kinds.size === 1 ? [...kinds][0] : kinds.size === 0 ? "cut" : "mixed";
  const transitionLength = film.shots.slice(1).find((s) => s.transition.kind !== "cut")?.transition.duration ?? 0.8;
  const known = KITS.some((k) => k.id === film.styleId) || styles.some((s) => s.id === film.styleId);

  function applyPreset(id: string) {
    const kit = KITS.find((k) => k.id === id);
    if (kit) {
      const problem = kit.check(set);
      if (problem) return notify(problem, "error");
      commit(applyKitResult(film, kit.build({ set, aspect: film.aspect, brand }, defaultParams(kit)), kit.id));
      return notify(`Applied ${kit.name}. Undo brings your previous edit back.`);
    }
    const style = styles.find((s) => s.id === id);
    if (!style) return;
    commit(applyKitResult(film, buildFromStyle(style, set), style.id));
    notify(`Applied ${style.name}. Undo brings your previous edit back.`);
  }

  function move(next: CameraMove, intensity = camera.intensity, ease = camera.ease) {
    commit(applyCameraMove(film, shot.id, next, intensity, ease), { coalesce: `quick-cam:${shot.id}:${next}` });
  }

  return (
    <div data-quick-motion>
      <Group title="Preset" note="Rebuilds the shots and visual clips from your layers (sound is kept). Undo brings your edit back.">
        <label className="sr-only" htmlFor="quick-preset">
          Motion preset
        </label>
        <select id="quick-preset" value={known ? film.styleId! : ""} onChange={(e) => e.target.value && applyPreset(e.target.value)} className={darkSelect}>
          {!known && <option value="">Your own edit</option>}
          {KITS.map((k) => (
            <option key={k.id} value={k.id} disabled={!!k.check(set)}>
              {k.name}
              {k.check(set) ? " (needs a product layer)" : ""}
            </option>
          ))}
          {styles.length > 0 && (
            <optgroup label="Your styles">
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Group>

      <Group title="Duration" note="Stretches every shot, clip and keyframe in proportion. Sound keeps its own speed.">
        <NumberField tone="dark" label="Film length" unit="s" decimals={1} step={0.5} min={0.5} max={600} value={D} onChange={(v) => commit(scaleFilm(film, v / D))} />
      </Group>

      <Group
        title="Camera movement"
        note={camera.move === "custom" ? `${shot.name} has its own camera keyframes. Choosing a move replaces them; edit them in Keyframes.` : `Moves the whole of ${shot.name}. Layers follow by their depth, which is what reads as parallax.`}
        action={
          film.shots.length > 1 && camera.move !== "custom" ? (
            <button
              type="button"
              className="text-[12px] font-semibold text-m-accent-text hover:underline"
              onClick={() => {
                let next = film;
                for (const s of film.shots) next = applyCameraMove(next, s.id, camera.move as CameraMove, camera.intensity, camera.ease).film;
                commit(next);
                notify(`${CAMERA_MOVE_LABEL[camera.move]} on all ${film.shots.length} shots.`);
              }}
            >
              Use on all shots
            </button>
          ) : null
        }
      >
        <label className="sr-only" htmlFor="quick-camera">
          Camera movement
        </label>
        <select id="quick-camera" value={camera.move} onChange={(e) => move(e.target.value as CameraMove)} className={darkSelect} data-camera-move={camera.move}>
          {camera.move === "custom" && <option value="custom">{CAMERA_MOVE_LABEL.custom}</option>}
          {CAMERA_MOVES.map((m) => (
            <option key={m} value={m}>
              {CAMERA_MOVE_LABEL[m]}
            </option>
          ))}
        </select>
        <RangeField tone="dark" label="Intensity" min={5} max={100} step={5} value={Math.round(camera.intensity * 100)} format={(v) => `${v}%`} disabled={camera.move === "none" || camera.move === "custom"} onChange={(v) => move(camera.move as CameraMove, v / 100)} />
        <Field label="Easing">
          <select aria-label="Easing" value={EASES.includes(camera.ease) ? camera.ease : "ease-in-out"} disabled={camera.move === "none" || camera.move === "custom"} onChange={(e) => move(camera.move as CameraMove, camera.intensity, e.target.value as Ease)} className={cn(darkSelect, "disabled:opacity-40")}>
            {EASES.map((e) => (
              <option key={e} value={e}>
                {EASE_LABEL[e]}
              </option>
            ))}
          </select>
        </Field>
      </Group>

      <Group title={layer ? `Layer: ${layer.name}` : "Layer"} note={layer ? (at ? "◆ adds a keyframe at the playhead, so the value can change over time." : "Move the playhead over this layer to add keyframes.") : undefined}>
        {layer ? (
          <>
            {(layer.source.kind === "light" || layer.source.kind === "shadow" || layer.source.kind === "solid" ? [] : (["scale", "x", "y"] as const)).map((prop) => (
                <PropRow key={prop} film={film} target={{ kind: "clip", clipId: layer.id, prop }} spec={CLIP_PROPS[prop]} value={at ? clipValue(layer, prop, at.lt) : clipBase(layer, prop)} keyframes={layer.keyframes[prop]} local={at?.lt ?? null} offset={clipRange(film, layer).start} enabled={!layerLocked} />
              ))}
            {layer.source.kind !== "solid" && (
              <RangeField tone="dark" label="Parallax depth" min={0} max={200} step={5} value={Math.round(layer.depth * 100)} format={(v) => `${v}%`} disabled={layerLocked} onChange={(v) => commit(updateClip(film, layer.id, (c) => ({ ...c, depth: v / 100 })), { coalesce: `depth:${layer.id}` })} />
            )}
            <p className="text-[11px] leading-snug text-m-subtle">Depth is how much the camera moves this layer: 100% moves with the scene, 0% stays put, in between drifts behind it.</p>
            {selected !== layer && (
              <button type="button" className="justify-self-start text-[12px] font-semibold text-m-accent-text hover:underline" onClick={() => select({ clipIds: [layer.id], shotId: layer.shotId ?? shot.id })}>
                Select this layer on the timeline
              </button>
            )}
          </>
        ) : (
          <p className="text-[12px] text-m-muted">Select a layer on the timeline to position it.</p>
        )}
      </Group>

      <Group title="Lighting" note="A band of light crosses the frame during this shot. It is its own clip over the scene; the product image isn't changed.">
        <button type="button" role="switch" aria-checked={sweepOn} onClick={() => commit(setLightSweep(film, shot.id, !sweepOn))} className="flex items-center gap-2.5 rounded-[9px] border border-m-line bg-m-ink/[0.03] px-2.5 py-2 text-left text-[13px] text-m-text hover:bg-m-ink/[0.06]">
          <Lightbulb className="size-4 text-m-muted" aria-hidden="true" />
          <span className="flex-1">Lighting sweep</span>
          <span className={cn("relative h-5 w-9 rounded-full transition-colors", sweepOn ? "bg-m-accent" : "bg-m-ink/20")} aria-hidden="true">
            <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", sweepOn ? "left-[18px]" : "left-0.5")} />
          </span>
        </button>
      </Group>

      <Group title="Transitions" note={film.shots.length < 2 ? "Add a second shot in the storyboard to use transitions." : "Between every pair of shots. Change one cut on its own under Layer, with that shot selected."}>
        <label className="sr-only" htmlFor="quick-transition">
          Transition between shots
        </label>
        <select id="quick-transition" value={transition} disabled={film.shots.length < 2} onChange={(e) => commit(setAllTransitions(film, e.target.value as TransitionKind, transitionLength))} className={cn(darkSelect, "disabled:opacity-40")}>
          {transition === "mixed" && <option value="mixed">Mixed</option>}
          {(Object.keys(TRANSITION_LABEL) as TransitionKind[]).map((t) => (
            <option key={t} value={t}>
              {TRANSITION_LABEL[t]}
            </option>
          ))}
        </select>
        {film.shots.length > 1 && transition !== "cut" && transition !== "mixed" && (
          <NumberField tone="dark" label="Transition length" unit="s" decimals={2} step={0.1} min={0.05} max={5} value={transitionLength} onChange={(v) => commit(setAllTransitions(film, transition, v))} />
        )}
      </Group>
    </div>
  );
}

const MODES: Array<{ id: MotionMode; label: string; hint: string }> = [
  { id: "quick", label: "Quick", hint: "One-step controls" },
  { id: "keyframes", label: "Keyframes", hint: "Values over time, curves" },
  { id: "layer", label: "Layer", hint: "The selected clip or shot" },
];

/** The Motion tab: quick controls, the keyframe editor, or the selected layer's details. */
export function MotionPanel() {
  const mode = useEditor((s) => s.motionMode);
  return (
    <div>
      <div role="radiogroup" aria-label="Motion controls" className="mx-3 mb-1 grid grid-cols-3 gap-1 rounded-[10px] bg-m-ink/[0.05] p-1">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} title={m.hint} onClick={() => setMotionMode(m.id)} className={cn("h-8 rounded-[8px] text-[12px] font-semibold", mode === m.id ? "bg-m-raised text-m-strong shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-m-muted hover:text-m-strong")}>
            {m.label}
          </button>
        ))}
      </div>
      <div data-motion-mode={mode} className={mode === "quick" ? undefined : "pt-2"}>
        {mode === "quick" ? <QuickMotion /> : mode === "keyframes" ? <AnimatePanel /> : <AssemblePanel />}
      </div>
    </div>
  );
}

/** The Text tab: the selected title's words, type and animation; otherwise the film's titles and a way to add one. */
export function TextPanel() {
  const film = useEditor((s) => s.film)!;
  const selection = useEditor((s) => s.selection);
  const clip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0]) : null;
  const titles = film.clips.filter((c) => c.source.kind === "text");
  return (
    <div className="grid gap-3 px-3 pb-4" data-text-panel>
      {clip?.source.kind === "text" ? (
        <div className="[&>div]:border-t-0 [&>div]:pt-0">
          <TextSection film={film} clip={clip} />
        </div>
      ) : (
        <p className="text-[12px] leading-snug text-m-muted">{titles.length ? "Choose a title to edit its words, type and animation." : "This film has no text yet. Add a title below; it says only what you type."}</p>
      )}
      {titles.length > 0 && (
        <div className="grid gap-1.5 border-t border-m-line pt-3">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-m-text-2">Text in this film</h3>
          <ul className="grid gap-1">
            {titles.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={clip?.id === t.id}
                  data-text-clip={t.name}
                  onClick={() => {
                    select({ clipIds: [t.id], shotId: t.shotId, keyframe: null });
                    useEditor.setState({ playhead: Math.min(filmDuration(film), clipRange(film, t).start + Math.min(t.duration / 2, 1)) });
                  }}
                  className={cn("flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px]", clip?.id === t.id ? "bg-m-accent/15 text-m-strong ring-1 ring-m-accent-2/50" : "bg-m-ink/[0.04] text-m-text hover:bg-m-ink/[0.08]")}
                >
                  <Type className="size-3.5 shrink-0 text-m-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t.source.kind === "text" ? t.source.style.text.split("\n")[0] || t.name : t.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-m-subtle">{secs(clipRange(film, t).start)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid gap-2 border-t border-m-line pt-3">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-m-text-2">Add text</h3>
        <AddText />
      </div>
    </div>
  );
}
