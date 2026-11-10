"use client";

import { ChevronLeft, ChevronRight, Copy, Link2, Link2Off, Trash2 } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { NumberField } from "@/components/scene/fields";
import { cn } from "@/lib/cn";
import { commit, notify, select, setPlayhead, useEditor } from "@/lib/motion/editor";
import { ASPECTS, EASE_LABEL, MIN_SHOT, TEXT_ANIM_LABEL, TRANSITION_LABEL, type CameraProp, type Clip, type ClipProp, type Ease, type Film, type Keyframe, type TextAnimKind, type TransitionKind } from "@/lib/motion/model";
import { clearKeyframes, deleteClips, deleteKeyframe, duplicateClip, duplicateKeyframe, editKeyframe, setClipDuration, setKeyframe, setShotDuration, setTransition, updateClip, type KeyTarget } from "@/lib/motion/ops";
import { canBlur, clipLocalAt } from "@/lib/motion/render";
import { detachClip } from "@/lib/motion/scene-link";
import { bezierOf, cameraValue, clipBase, clipRange, clipValue, secs, shotStart, valueAt } from "@/lib/motion/time";
import { FONT_LABEL, FONT_WEIGHTS, type FontId } from "@/lib/scene/model";
import { DarkButton, Diamond, Field, PanelTitle, darkInput, darkSelect } from "./ui";

/* --------------------------------------------------------------- props --- */

interface PropSpec {
  label: string;
  unit: string;
  decimals: number;
  step: number;
  min: number;
  max: number;
  toUi: (v: number, f: Film) => number;
  fromUi: (v: number, f: Film) => number;
}

const px = (axis: "width" | "height"): Pick<PropSpec, "toUi" | "fromUi"> => ({ toUi: (v, f) => v * ASPECTS[f.aspect][axis], fromUi: (v, f) => v / ASPECTS[f.aspect][axis] });
const pct: Pick<PropSpec, "toUi" | "fromUi"> = { toUi: (v) => v * 100, fromUi: (v) => v / 100 };
const same: Pick<PropSpec, "toUi" | "fromUi"> = { toUi: (v) => v, fromUi: (v) => v };

export const CLIP_PROPS: Record<ClipProp, PropSpec> = {
  x: { label: "Position X", unit: "px", decimals: 0, step: 1, min: -10000, max: 10000, ...px("width") },
  y: { label: "Position Y", unit: "px", decimals: 0, step: 1, min: -10000, max: 10000, ...px("height") },
  scale: { label: "Scale", unit: "%", decimals: 1, step: 1, min: 1, max: 2000, ...pct },
  rotation: { label: "Rotation", unit: "°", decimals: 1, step: 1, min: -3600, max: 3600, ...same },
  opacity: { label: "Opacity", unit: "%", decimals: 0, step: 1, min: 0, max: 100, ...pct },
  blur: { label: "Blur", unit: "%", decimals: 1, step: 0.1, min: 0, max: 10, ...same },
  intensity: { label: "Light intensity", unit: "%", decimals: 0, step: 1, min: 0, max: 100, ...pct },
  lightX: { label: "Light X", unit: "px", decimals: 0, step: 1, min: -10000, max: 10000, ...px("width") },
  lightY: { label: "Light Y", unit: "px", decimals: 0, step: 1, min: -10000, max: 10000, ...px("height") },
};

export const CAMERA_PROPS: Record<CameraProp, PropSpec> = {
  zoom: { label: "Zoom", unit: "%", decimals: 1, step: 1, min: 10, max: 1000, ...pct },
  panX: { label: "Pan X", unit: "%", decimals: 1, step: 0.5, min: -200, max: 200, ...pct },
  panY: { label: "Pan Y", unit: "%", decimals: 1, step: 0.5, min: -200, max: 200, ...pct },
  rotate: { label: "Roll", unit: "°", decimals: 1, step: 0.5, min: -360, max: 360, ...same },
};

export function propsFor(clip: Clip): ClipProp[] {
  switch (clip.source.kind) {
    case "light":
      return ["lightX", "lightY", "scale", "intensity", "opacity"];
    case "shadow":
    case "solid":
      return ["opacity"];
    case "backdrop":
      return ["x", "y", "scale", "rotation", "opacity", ...(canBlur ? (["blur"] as ClipProp[]) : [])];
    case "audio":
      return [];
    default:
      return ["x", "y", "scale", "rotation", "opacity", ...(canBlur ? (["blur"] as ClipProp[]) : [])];
  }
}

function setBase(film: Film, clip: Clip, prop: ClipProp, v: number): Film {
  return updateClip(film, clip.id, (c) => {
    if (prop === "blur") return { ...c, effects: { ...c.effects, blur: v } };
    if (prop === "intensity") return { ...c, effects: { ...c.effects, intensity: v } };
    const key = prop === "lightX" ? "x" : prop === "lightY" ? "y" : prop;
    return { ...c, transform: { ...c.transform, [key]: v } };
  }).film;
}

/** One animatable property: its value at the playhead, a keyframe toggle, and jumps to the previous/next keyframe. */
function PropRow({ film, target, spec, value, keyframes, local, offset, enabled }: { film: Film; target: KeyTarget; spec: PropSpec; value: number; keyframes: Keyframe[] | undefined; local: number | null; offset: number; enabled: boolean }) {
  const half = 0.5 / film.fps;
  const here = local !== null ? keyframes?.find((k) => Math.abs(k.t - local) <= half) : undefined;
  const animated = !!keyframes?.length;
  const prev = local !== null ? [...(keyframes ?? [])].reverse().find((k) => k.t < local - half) : undefined;
  const next = local !== null ? keyframes?.find((k) => k.t > local + half) : undefined;
  function change(ui: number) {
    const v = spec.fromUi(ui, film);
    if (animated) {
      if (local === null) return notify("Move the playhead over this clip to change an animated value.", "error");
      commit(setKeyframe(film, target, local, v), { coalesce: `kf:${JSON.stringify(target)}:${local.toFixed(3)}` });
    } else if (target.kind === "clip") {
      const clip = film.clips.find((c) => c.id === target.clipId)!;
      commit(setBase(film, clip, target.prop, v), { coalesce: `base:${target.clipId}:${target.prop}` });
    } else if (local !== null) commit(setKeyframe(film, target, local, v));
  }
  function toggle() {
    if (local === null) return;
    if (here) commit(deleteKeyframe(film, target, here.id));
    else commit(setKeyframe(film, target, local, value));
  }
  return (
    <div className="flex items-center gap-1" data-prop={spec.label}>
      <Diamond on={!!here} animated={animated} disabled={!enabled || local === null} label={here ? `Remove ${spec.label} keyframe` : `Add ${spec.label} keyframe`} onClick={toggle} />
      <NumberField tone="dark" className="flex-1" label={spec.label} unit={spec.unit} decimals={spec.decimals} step={spec.step} min={spec.min} max={spec.max} value={spec.toUi(value, film)} onChange={change} disabled={!enabled} />
      <button type="button" aria-label={`Previous ${spec.label} keyframe`} disabled={!prev} onClick={() => prev && setPlayhead(offset + prev.t)} className="inline-flex size-6 items-center justify-center rounded text-[#9AA1B2] hover:bg-white/10 disabled:opacity-25">
        <ChevronLeft className="size-3.5" aria-hidden="true" />
      </button>
      <button type="button" aria-label={`Next ${spec.label} keyframe`} disabled={!next} onClick={() => next && setPlayhead(offset + next.t)} className="inline-flex size-6 items-center justify-center rounded text-[#9AA1B2] hover:bg-white/10 disabled:opacity-25">
        <ChevronRight className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/* --------------------------------------------------------- curve editor --- */

/**
 * The value of one property over time. Choose a segment (between two
 * keyframes) to edit its curve: the two handles are the segment's
 * cubic-bezier control points, and they change the actual interpolation.
 */
function CurveEditor({ film, target, keyframes, span, local }: { film: Film; target: KeyTarget; keyframes: Keyframe[]; span: number; local: number | null }) {
  const [segment, setSegment] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ handle: 0 | 1; base: Film } | null>(null);
  const W = 280;
  const H = 150;
  const pad = 14;
  const values = keyframes.map((k) => k.v);
  const tMin = Math.min(0, ...keyframes.map((k) => k.t));
  const tMax = Math.max(span, ...keyframes.map((k) => k.t), 0.01);
  let vMin = Math.min(...values);
  let vMax = Math.max(...values);
  if (vMax - vMin < 1e-6) {
    vMin -= 1;
    vMax += 1;
  }
  const sx = (t: number) => pad + ((t - tMin) / (tMax - tMin)) * (W - pad * 2);
  const sy = (v: number) => H - pad - ((v - vMin) / (vMax - vMin)) * (H - pad * 2);
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = tMin + ((tMax - tMin) * i) / 120;
    pts.push(`${sx(t).toFixed(1)},${sy(valueAt(keyframes, 0, t)).toFixed(1)}`);
  }
  const seg = Math.min(segment, keyframes.length - 2);
  const a = keyframes[seg];
  const b = keyframes[seg + 1];
  const bz = a ? bezierOf(a) : null;
  const handles = a && b && bz ? ([
    [sx(a.t + bz[0] * (b.t - a.t)), sy(a.v + bz[1] * (b.v - a.v))],
    [sx(a.t + bz[2] * (b.t - a.t)), sy(a.v + bz[3] * (b.v - a.v))],
  ] as Array<[number, number]>) : null;
  const flat = a && b && Math.abs(b.v - a.v) < 1e-9;

  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || !a || !b || !bz) return;
    const r = svgRef.current!.getBoundingClientRect();
    const t = tMin + ((e.clientX - r.left - pad) / (W - pad * 2)) * (tMax - tMin);
    const v = vMin + ((H - pad - (e.clientY - r.top)) / (H - pad * 2)) * (vMax - vMin);
    const x = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    const y = Math.max(-1.5, Math.min(2.5, (v - a.v) / (b.v - a.v || 1)));
    const next: [number, number, number, number] = d.handle === 0 ? [x, y, bz[2], bz[3]] : [bz[0], bz[1], x, y];
    useEditor.setState({ film: editKeyframe(d.base, target, a.id, { ease: "custom", bezier: next }).film });
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    if (d) commit(useEditor.getState().film!, { base: d.base });
  }

  return (
    <div className="grid gap-2">
      <svg ref={svgRef} width={W} height={H} className="w-full rounded-[8px] border border-white/[0.08] bg-[#0F1216]" viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} role="img" aria-label="Value over time">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)} stroke="rgba(255,255,255,0.05)" />
        ))}
        {local !== null && <line x1={sx(local)} x2={sx(local)} y1={0} y2={H} stroke="#8B9BFF" strokeOpacity={0.5} />}
        <polyline points={pts.join(" ")} fill="none" stroke="#A4B1FF" strokeWidth={2} />
        {keyframes.slice(0, -1).map((k, i) => (
          <rect key={k.id} x={sx(k.t)} y={0} width={Math.max(1, sx(keyframes[i + 1].t) - sx(k.t))} height={H} fill={i === seg ? "rgba(139,155,255,0.07)" : "transparent"} onClick={() => setSegment(i)} className="cursor-pointer" />
        ))}
        {handles && a && b && (
          <>
            <line x1={sx(a.t)} y1={sy(a.v)} x2={handles[0][0]} y2={handles[0][1]} stroke="#F5B942" strokeOpacity={0.7} />
            <line x1={sx(b.t)} y1={sy(b.v)} x2={handles[1][0]} y2={handles[1][1]} stroke="#F5B942" strokeOpacity={0.7} />
            {handles.map(([x, y], i) => (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={6}
                fill="#101318"
                stroke="#F5B942"
                strokeWidth={2}
                className="cursor-grab"
                aria-label={`Curve handle ${i + 1}`}
                onPointerDown={(e) => {
                  (e.currentTarget as Element).setPointerCapture(e.pointerId);
                  drag.current = { handle: i as 0 | 1, base: film };
                }}
              />
            ))}
          </>
        )}
        {keyframes.map((k) => (
          <rect key={k.id} x={sx(k.t) - 4} y={sy(k.v) - 4} width={8} height={8} transform={`rotate(45 ${sx(k.t)} ${sy(k.v)})`} fill="#F5B942" />
        ))}
      </svg>
      <p className="text-[11px] leading-snug text-[#8890A2]">
        {keyframes.length < 2 ? "Add two keyframes to shape the movement between them." : flat ? "This segment's start and end values are equal, so its curve has no visible effect." : `Segment ${seg + 1} of ${keyframes.length - 1} (click a shaded area to pick another). Drag the handles to shape it.`}
      </p>
    </div>
  );
}

function KeyframeList({ film, target, keyframes, spec, offset, local }: { film: Film; target: KeyTarget; keyframes: Keyframe[]; spec: PropSpec; offset: number; local: number | null }) {
  return (
    <ul className="grid gap-1" aria-label={`${spec.label} keyframes`}>
      {keyframes.map((k) => (
        <li key={k.id} className="flex items-center gap-1.5 rounded-[8px] bg-white/[0.03] px-1.5 py-1 text-[12px] text-[#C9CEDA]">
          <button type="button" className="w-12 text-left font-mono tabular-nums hover:text-white" onClick={() => setPlayhead(offset + k.t)} title="Go to this keyframe">
            {secs(k.t)}
          </button>
          <span className="w-16 tabular-nums">
            {spec.toUi(k.v, film).toFixed(spec.decimals)}
            {spec.unit}
          </span>
          <label className="sr-only" htmlFor={`ease-${k.id}`}>
            Ease after this keyframe
          </label>
          <select id={`ease-${k.id}`} value={k.ease} onChange={(e) => commit(editKeyframe(film, target, k.id, { ease: e.target.value as Ease, ...(e.target.value === "custom" ? { bezier: bezierOf(k) } : {}) }))} className={cn(darkSelect, "h-7 flex-1 text-[12px]")}>
            {(Object.keys(EASE_LABEL) as Ease[]).map((e) => (
              <option key={e} value={e}>
                {EASE_LABEL[e]}
              </option>
            ))}
          </select>
          <button type="button" aria-label="Copy this keyframe to the playhead" disabled={local === null} onClick={() => local !== null && commit(duplicateKeyframe(film, target, k.id, local))} className="inline-flex size-6 items-center justify-center rounded hover:bg-white/10 disabled:opacity-25">
            <Copy className="size-3.5" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Delete this keyframe" onClick={() => commit(deleteKeyframe(film, target, k.id))} className="inline-flex size-6 items-center justify-center rounded hover:bg-white/10">
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- animate --- */

export function AnimatePanel() {
  const film = useEditor((s) => s.film)!;
  const playhead = useEditor((s) => s.playhead);
  const selection = useEditor((s) => s.selection);
  const [scope, setScope] = useState<"layer" | "camera">("layer");
  const [curveProp, setCurveProp] = useState<string>("x");
  const clip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0]) : null;
  const shot = film.shots.find((s) => s.id === (clip?.shotId ?? selection.shotId)) ?? film.shots[0];
  const effective = clip && scope === "layer" ? "layer" : "camera";
  const locked = clip ? !!film.tracks.find((t) => t.id === clip.trackId)?.locked : false;

  let rows: Array<{ target: KeyTarget; spec: PropSpec; value: number; keyframes: Keyframe[] | undefined }> = [];
  let local: number | null = null;
  let offset = 0;
  let span = shot.duration;
  if (effective === "layer" && clip) {
    const at = clipLocalAt(film, clip, playhead);
    local = at ? at.lt : null;
    offset = clipRange(film, clip).start;
    span = clip.duration;
    rows = propsFor(clip).map((prop) => ({ target: { kind: "clip", clipId: clip.id, prop }, spec: CLIP_PROPS[prop], value: local !== null ? clipValue(clip, prop, local) : clipBase(clip, prop), keyframes: clip.keyframes[prop] }));
  } else {
    offset = shotStart(film, shot.id);
    const l = playhead - offset;
    local = l >= -1e-6 && l <= shot.duration + 1e-6 ? Math.max(0, Math.min(shot.duration, l)) : null;
    rows = (Object.keys(CAMERA_PROPS) as CameraProp[]).map((prop) => ({ target: { kind: "camera", shotId: shot.id, prop }, spec: CAMERA_PROPS[prop], value: cameraValue(shot, prop, local ?? 0), keyframes: shot.camera[prop] }));
  }
  const curveRow = rows.find((r) => r.target.prop === curveProp) ?? rows.find((r) => r.keyframes?.length) ?? rows[0];

  return (
    <div className="grid gap-3 px-3 pb-4">
      <div role="radiogroup" aria-label="What to animate" className="grid grid-cols-2 gap-1 rounded-[10px] bg-white/[0.04] p-1">
        {(
          [
            ["layer", "Selected layer"],
            ["camera", "Scene camera"],
          ] as const
        ).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={effective === v} disabled={v === "layer" && !clip} onClick={() => setScope(v)} className={cn("h-8 rounded-[8px] text-[12px] font-semibold disabled:opacity-35", effective === v ? "bg-[#6F7FF7] text-white" : "text-[#C9CEDA] hover:bg-white/[0.06]")}>
            {label}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-[#8890A2]">
        {effective === "layer"
          ? `Moves only “${clip?.name}”. Keyframe times are relative to the clip.`
          : `Moves the whole of ${shot.name}: every layer follows by its depth (backdrops less, titles not at all), which is what makes parallax.`}
      </p>
      {local === null && <p className="rounded-[8px] bg-[#F5B942]/10 px-2.5 py-2 text-[12px] text-[#F5D58A]">Move the playhead {effective === "layer" ? "over this clip" : "into this shot"} to add or change keyframes.</p>}
      {locked && <p className="rounded-[8px] bg-white/[0.05] px-2.5 py-2 text-[12px] text-[#C9CEDA]">This clip&apos;s track is locked.</p>}
      <div className="grid gap-1.5">
        {rows.map((r) => (
          <PropRow key={r.spec.label} film={film} target={r.target} spec={r.spec} value={r.value} keyframes={r.keyframes} local={local} offset={offset} enabled={!locked} />
        ))}
      </div>
      {curveRow && (
        <div className="grid gap-2 border-t border-white/[0.08] pt-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">Curve</h3>
            <label className="sr-only" htmlFor="curve-prop">
              Property
            </label>
            <select id="curve-prop" value={curveRow.target.prop} onChange={(e) => setCurveProp(e.target.value)} className={cn(darkSelect, "ml-auto w-auto")}>
              {rows.map((r) => (
                <option key={r.target.prop} value={r.target.prop}>
                  {r.spec.label}
                  {r.keyframes?.length ? ` (${r.keyframes.length})` : ""}
                </option>
              ))}
            </select>
          </div>
          {curveRow.keyframes && curveRow.keyframes.length > 0 ? (
            <>
              <CurveEditor key={`${JSON.stringify(curveRow.target)}`} film={film} target={curveRow.target} keyframes={curveRow.keyframes} span={span} local={local} />
              <KeyframeList film={film} target={curveRow.target} keyframes={curveRow.keyframes} spec={curveRow.spec} offset={offset} local={local} />
              <DarkButton size="sm" tone="ghost" onClick={() => commit(clearKeyframes(film, curveRow.target, local ?? 0))}>
                Remove {curveRow.spec.label.toLowerCase()} animation
              </DarkButton>
            </>
          ) : (
            <p className="text-[12px] text-[#8890A2]">No keyframes on {curveRow.spec.label.toLowerCase()} yet. Use its ◆ to add one at the playhead.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- assemble --- */

function TextSection({ film, clip }: { film: Film; clip: Clip }) {
  if (clip.source.kind !== "text") return null;
  const src = clip.source;
  const style = src.style;
  const set = (patch: Partial<typeof style>) => commit(updateClip(film, clip.id, (c) => (c.source.kind === "text" ? { ...c, source: { ...c.source, style: { ...c.source.style, ...patch } } } : c)), { coalesce: `text:${clip.id}:${Object.keys(patch).join()}` });
  const setAnim = (phase: "in" | "out", patch: Partial<(typeof src.anim)["in"]>) => commit(updateClip(film, clip.id, (c) => (c.source.kind === "text" ? { ...c, source: { ...c.source, anim: { ...c.source.anim, [phase]: { ...c.source.anim[phase], ...patch } } } } : c)));
  return (
    <div className="grid gap-2 border-t border-white/[0.08] pt-3">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">Text</h3>
      <label className="grid gap-1 text-[12px] text-[#9AA1B2]">
        Words
        <textarea key={clip.id} defaultValue={style.text} rows={2} maxLength={400} onBlur={(e) => e.target.value !== style.text && set({ text: e.target.value })} className="rounded-[8px] border border-white/10 bg-[#1D222B] px-2.5 py-1.5 text-[13px] text-[#E8EAF0] outline-none focus:border-[#8B9BFF]" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Font">
          <select value={style.font} onChange={(e) => { const font = e.target.value as FontId; set({ font, weight: FONT_WEIGHTS[font].includes(style.weight) ? style.weight : FONT_WEIGHTS[font].at(-1)! }); }} className={darkSelect} aria-label="Font">
            {(Object.keys(FONT_LABEL) as FontId[]).map((f) => (
              <option key={f} value={f}>
                {FONT_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight">
          <select value={style.weight} onChange={(e) => set({ weight: Number(e.target.value) })} className={darkSelect} aria-label="Weight">
            {FONT_WEIGHTS[style.font].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <NumberField tone="dark" label="Size" unit="%" decimals={1} step={0.5} min={1} max={50} value={style.size * 100} onChange={(v) => set({ size: v / 100 })} />
      <NumberField tone="dark" label="Letter spacing" unit="em" decimals={2} step={0.01} min={-0.1} max={1} value={style.letterSpacing} onChange={(v) => set({ letterSpacing: v })} />
      <NumberField tone="dark" label="Line height" unit="×" decimals={2} step={0.05} min={0.7} max={3} value={style.lineHeight} onChange={(v) => set({ lineHeight: v })} />
      <div className="flex items-center justify-between gap-2 text-[12px] text-[#9AA1B2]">
        Colour
        <input type="color" aria-label="Text colour" value={style.color.toLowerCase()} onChange={(e) => set({ color: e.target.value.toUpperCase() })} className="h-7 w-12 cursor-pointer rounded border-0 bg-transparent" />
      </div>
      <div role="radiogroup" aria-label="Alignment" className="grid grid-cols-3 gap-1">
        {(["left", "center", "right"] as const).map((a) => (
          <button key={a} type="button" role="radio" aria-checked={style.align === a} onClick={() => set({ align: a })} className={cn("h-7 rounded-[7px] text-[12px] capitalize", style.align === a ? "bg-[#6F7FF7] text-white" : "bg-white/[0.04] text-[#C9CEDA]")}>
            {a === "center" ? "Centre" : a}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between text-[12px] text-[#9AA1B2]">
        Capitals
        <input type="checkbox" checked={style.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} className="size-4 accent-[#8B9BFF]" />
      </label>
      {(["in", "out"] as const).map((phase) => (
        <div key={phase} className="grid grid-cols-[1fr_88px] items-end gap-2">
          <Field label={phase === "in" ? "Animation in" : "Animation out"}>
            <select value={src.anim[phase].kind} onChange={(e) => setAnim(phase, { kind: e.target.value as TextAnimKind })} className={darkSelect} aria-label={phase === "in" ? "Animation in" : "Animation out"}>
              {(Object.keys(TEXT_ANIM_LABEL) as TextAnimKind[]).map((k) => (
                <option key={k} value={k}>
                  {TEXT_ANIM_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <NumberField tone="dark" hideLabel label={`${phase === "in" ? "In" : "Out"} duration`} unit="s" decimals={1} step={0.1} min={0} max={10} value={src.anim[phase].duration} onChange={(v) => setAnim(phase, { duration: v })} />
        </div>
      ))}
      {(src.anim.in.kind === "stagger" || src.anim.out.kind === "stagger") && (
        <div role="radiogroup" aria-label="Stagger by" className="grid grid-cols-2 gap-1">
          {(["word", "letter"] as const).map((b) => (
            <button key={b} type="button" role="radio" aria-checked={src.anim.by === b} onClick={() => commit(updateClip(film, clip.id, (c) => (c.source.kind === "text" ? { ...c, source: { ...c.source, anim: { ...c.source.anim, by: b } } } : c)))} className={cn("h-7 rounded-[7px] text-[12px]", src.anim.by === b ? "bg-[#6F7FF7] text-white" : "bg-white/[0.04] text-[#C9CEDA]")}>
              By {b}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[#8890A2]">Titles say only what you type. ISOLA doesn&apos;t write product claims.</p>
    </div>
  );
}

function ClipInspector({ film, clip }: { film: Film; clip: Clip }) {
  const playhead = useEditor((s) => s.playhead);
  const at = clipLocalAt(film, clip, playhead);
  const r = clipRange(film, clip);
  const locked = !!film.tracks.find((t) => t.id === clip.trackId)?.locked;
  const anchor = clip.transform;
  return (
    <div className="grid gap-3 px-3 pb-4" data-inspector="clip">
      <label className="grid gap-1 text-[12px] text-[#9AA1B2]">
        Name
        <input key={clip.id} defaultValue={clip.name} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value !== clip.name && commit(updateClip(film, clip.id, (c) => ({ ...c, name: e.target.value.trim() })))} className={darkInput} />
      </label>
      {locked && <p className="rounded-[8px] bg-white/[0.05] px-2.5 py-2 text-[12px] text-[#C9CEDA]">This clip&apos;s track is locked.</p>}
      <div className="grid gap-1.5">
        <p className="text-[12px] text-[#9AA1B2]">
          Starts at {secs(r.start)}
          {clip.shotId ? ` (in ${film.shots.find((s) => s.id === clip.shotId)?.name})` : " (film time)"}
        </p>
        <NumberField tone="dark" label="Duration" unit="s" decimals={2} step={0.1} min={0.1} max={600} value={clip.duration} onChange={(v) => commit(setClipDuration(film, clip.id, v))} disabled={locked} />
        {(clip.source.kind === "video" || clip.source.kind === "audio") && <p className="text-[12px] text-[#9AA1B2]">Source starts at {secs(clip.source.in)} (trim the clip&apos;s start on the timeline to change it).</p>}
      </div>
      {clip.source.kind !== "audio" && (
        <div className="grid gap-1.5 border-t border-white/[0.08] pt-3">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">Transform</h3>
          {propsFor(clip)
            .filter((p) => p !== "blur" && p !== "intensity")
            .map((prop) => (
              <PropRow key={prop} film={film} target={{ kind: "clip", clipId: clip.id, prop }} spec={CLIP_PROPS[prop]} value={at ? clipValue(clip, prop, at.lt) : clipBase(clip, prop)} keyframes={clip.keyframes[prop]} local={at?.lt ?? null} offset={r.start} enabled={!locked} />
            ))}
          {["image", "video", "text"].includes(clip.source.kind) && (
            <Field label="Anchor point" hint="Scale and rotation happen around it.">
              <div role="radiogroup" aria-label="Anchor point" className="grid w-[84px] grid-cols-3 gap-1">
                {[0, 0.5, 1].flatMap((y) =>
                  [0, 0.5, 1].map((x) => (
                    <button key={`${x}${y}`} type="button" role="radio" aria-checked={anchor.anchorX === x && anchor.anchorY === y} aria-label={`Anchor ${y === 0 ? "top" : y === 0.5 ? "middle" : "bottom"} ${x === 0 ? "left" : x === 0.5 ? "centre" : "right"}`} onClick={() => commit(updateClip(film, clip.id, (c) => ({ ...c, transform: { ...c.transform, anchorX: x, anchorY: y } })))} className={cn("size-6 rounded-[5px] border", anchor.anchorX === x && anchor.anchorY === y ? "border-[#8B9BFF] bg-[#6F7FF7]" : "border-white/15 bg-white/[0.04] hover:bg-white/10")} />
                  )),
                )}
              </div>
            </Field>
          )}
          {clip.source.kind !== "solid" && (
            <NumberField tone="dark" label="Depth (follows camera)" unit="%" decimals={0} step={5} min={0} max={200} value={clip.depth * 100} onChange={(v) => commit(updateClip(film, clip.id, (c) => ({ ...c, depth: v / 100 })))} disabled={locked} />
          )}
        </div>
      )}
      {clip.source.kind === "shadow" && (
        <div className="grid gap-1.5 border-t border-white/[0.08] pt-3">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">Shadow</h3>
          {(
            [
              ["softness", "Softness", 0, 100, "%", 100],
              ["direction", "Direction", -75, 75, "°", 1],
              ["length", "Length", 0, 150, "%", 100],
            ] as const
          ).map(([key, label, min, max, unit, k]) => (
            <NumberField key={key} tone="dark" label={label} unit={unit} min={min} max={max} value={(clip.source as unknown as Record<string, number>)[key] * k} onChange={(v) => commit(updateClip(film, clip.id, (c) => (c.source.kind === "shadow" ? { ...c, source: { ...c.source, [key]: v / k } } : c)))} />
          ))}
          <p className="text-[11px] text-[#8890A2]">A separate layer under the product: the product&apos;s own pixels are never changed.</p>
        </div>
      )}
      {clip.source.kind === "light" && (
        <div className="grid gap-1.5 border-t border-white/[0.08] pt-3">
          <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">Light</h3>
          <Field label="Style">
            <select value={clip.source.style} onChange={(e) => commit(updateClip(film, clip.id, (c) => (c.source.kind === "light" ? { ...c, source: { ...c.source, style: e.target.value as "spotlight" } } : c)))} className={darkSelect} aria-label="Light style">
              <option value="spotlight">Spotlight (darkens around a pool of light)</option>
              <option value="sweep">Sweep (a band of light)</option>
              <option value="glow">Glow</option>
            </select>
          </Field>
          <div className="flex items-center justify-between text-[12px] text-[#9AA1B2]">
            Colour
            <input type="color" aria-label="Light colour" value={clip.source.color.toLowerCase()} onChange={(e) => commit(updateClip(film, clip.id, (c) => (c.source.kind === "light" ? { ...c, source: { ...c.source, color: e.target.value.toUpperCase() } } : c)))} className="h-7 w-12 cursor-pointer border-0 bg-transparent" />
          </div>
          <p className="text-[11px] text-[#8890A2]">An overlay on its own track: it changes how the frame looks, not the product image.</p>
        </div>
      )}
      {clip.source.kind === "solid" && (
        <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-[12px] text-[#9AA1B2]">
          Colour
          <input type="color" aria-label="Solid colour" value={clip.source.color.toLowerCase()} onChange={(e) => commit(updateClip(film, clip.id, (c) => (c.source.kind === "solid" ? { ...c, source: { ...c.source, color: e.target.value.toUpperCase() } } : c)))} className="h-7 w-12 cursor-pointer border-0 bg-transparent" />
        </div>
      )}
      <TextSection film={film} clip={clip} />
      {clip.link && (
        <div className="grid gap-1.5 border-t border-white/[0.08] pt-3">
          <p className="flex items-center gap-1.5 text-[12px] text-[#C9CEDA]">
            {clip.link.detached ? <Link2Off className="size-3.5" aria-hidden="true" /> : <Link2 className="size-3.5 text-[#A4B1FF]" aria-hidden="true" />}
            {clip.link.detached ? "Detached from its scene layer" : `Linked to “${String(clip.link.imported.name ?? "a layer")}” in ${film.source?.sceneName ?? "the scene"}`}
          </p>
          {!clip.link.detached && (
            <DarkButton size="sm" tone="plain" onClick={() => commit(detachClip(film, clip.id))}>
              Detach from scene
            </DarkButton>
          )}
        </div>
      )}
      <div className="flex gap-2 border-t border-white/[0.08] pt-3">
        <DarkButton size="sm" icon={<Copy className="size-3.5" aria-hidden="true" />} onClick={() => commit(duplicateClip(film, clip.id))}>
          Duplicate
        </DarkButton>
        <DarkButton size="sm" tone="danger" icon={<Trash2 className="size-3.5" aria-hidden="true" />} onClick={() => commit(deleteClips(film, [clip.id]))}>
          Delete
        </DarkButton>
      </div>
    </div>
  );
}

function ShotInspector({ film, shotId }: { film: Film; shotId: string }) {
  const shot = film.shots.find((s) => s.id === shotId) ?? film.shots[0];
  const index = film.shots.indexOf(shot);
  return (
    <div className="grid gap-3 px-3 pb-4" data-inspector="shot">
      <p className="text-[14px] font-semibold text-[#E8EAF0]">
        {String(index + 1).padStart(2, "0")} {shot.name}
      </p>
      <NumberField tone="dark" label="Shot length" unit="s" decimals={2} step={0.1} min={MIN_SHOT} max={600} value={shot.duration} onChange={(v) => commit(setShotDuration(film, shot.id, v))} />
      <p className="text-[11px] leading-snug text-[#8890A2]">Clips that run to the end of the shot stretch with it; others are trimmed so nothing runs past the end.</p>
      <Field label={index === 0 ? "Transition in (the first shot starts the film)" : "Transition from the previous shot"}>
        <select value={shot.transition.kind} disabled={index === 0} onChange={(e) => commit(setTransition(film, shot.id, e.target.value as TransitionKind, shot.transition.duration || 0.6))} className={darkSelect} aria-label="Transition">
          {(Object.keys(TRANSITION_LABEL) as TransitionKind[]).map((t) => (
            <option key={t} value={t}>
              {TRANSITION_LABEL[t]}
            </option>
          ))}
        </select>
      </Field>
      {index > 0 && shot.transition.kind !== "cut" && (
        <>
          <NumberField tone="dark" label="Transition length" unit="s" decimals={2} step={0.1} min={0.05} max={5} value={shot.transition.duration} onChange={(v) => commit(setTransition(film, shot.id, shot.transition.kind, v))} />
          <p className="text-[11px] leading-snug text-[#8890A2]">Centred on the cut, and never longer than half of either shot. Each shot holds its last or first moment while they overlap.</p>
        </>
      )}
      <p className="text-[12px] text-[#9AA1B2]">Animate the whole shot with the scene camera in Animate.</p>
      <button type="button" onClick={() => select({ clipIds: [], shotId: shot.id })} className="sr-only">
        Selected shot
      </button>
    </div>
  );
}

export function AssemblePanel() {
  const film = useEditor((s) => s.film)!;
  const selection = useEditor((s) => s.selection);
  const clip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0]) : null;
  if (selection.clipIds.length > 1)
    return (
      <div className="grid gap-3 px-3 pb-4">
        <p className="text-[13px] text-[#C9CEDA]">{selection.clipIds.length} clips selected.</p>
        <DarkButton tone="danger" size="sm" onClick={() => commit(deleteClips(film, selection.clipIds))}>
          Delete selected clips
        </DarkButton>
      </div>
    );
  if (clip) return <ClipInspector film={film} clip={clip} />;
  return <ShotInspector film={film} shotId={selection.shotId ?? film.shots[0].id} />;
}

export { PanelTitle };
