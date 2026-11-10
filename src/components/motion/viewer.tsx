"use client";

import { Expand, Pause, Play, Repeat, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { commit, preview, setPlayhead, useEditor } from "@/lib/motion/editor";
import { ASPECT_ORDER, ASPECTS, type Aspect, type Clip, type Film } from "@/lib/motion/model";
import { setKeyframe, updateClip } from "@/lib/motion/ops";
import { clipCorners, clipLocalAt, filmAssets, motionPath, renderFrame } from "@/lib/motion/render";
import { cameraValue, clipValue, filmDuration, timecode, toFrame } from "@/lib/motion/time";
import { ensureFonts, fontFamilies } from "@/lib/scene/fonts";
import { loadAssetImages, onImagesChanged } from "@/lib/scene/resources";
import { onVideoFrame, previewResources, togglePlay } from "./playback";
import { IconButton, darkSelectBase } from "./ui";

/** The viewer's canvas, so scopes can read the real preview pixels. */
export const viewerCanvas: { current: HTMLCanvasElement | null; version: number } = { current: null, version: 0 };
const frameListeners = new Set<() => void>();
export function onViewerFrame(fn: () => void) {
  frameListeners.add(fn);
  return () => {
    frameListeners.delete(fn);
  };
}

let measuring: CanvasRenderingContext2D | null = null;
const measureCtx = () => (measuring ??= document.createElement("canvas").getContext("2d"));

type Zoom = "fit" | 0.5 | 1 | 2;
type Quality = 1 | 0.5 | 0.25;

/** Set a clip's x/y: the keyframes at the playhead if it's animated there, otherwise its base position. */
export function placeClip(film: Film, clip: Clip, t: number, x: number, y: number) {
  const at = clipLocalAt(film, clip, t);
  const lt = at?.lt ?? 0;
  let next = film;
  for (const [prop, v] of [
    ["x", x],
    ["y", y],
  ] as const) {
    if (clip.keyframes[prop]?.length) next = setKeyframe(next, { kind: "clip", clipId: clip.id, prop }, lt, v).film;
    else next = updateClip(next, clip.id, (c) => ({ ...c, transform: { ...c.transform, [prop]: v } })).film;
  }
  return next;
}

export function Viewer() {
  const film = useEditor((s) => s.film)!;
  const playhead = useEditor((s) => s.playhead);
  const playing = useEditor((s) => s.playing);
  const loop = useEditor((s) => s.loop);
  const selection = useEditor((s) => s.selection);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [quality, setQuality] = useState<Quality>(1);
  const [safe, setSafe] = useState(false);
  const [version, setVersion] = useState(0);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const drag = useRef<{ base: Film; clip: Clip; start: { x: number; y: number }; from: { x: number; y: number }; key?: number } | null>(null);
  const base = ASPECTS[film.aspect];
  const D = filmDuration(film);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setArea({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size = useMemo(() => {
    const fit = Math.min((area.w - 24) / base.width, (area.h - 24) / base.height);
    const s = zoom === "fit" ? fit : zoom * (Math.min(base.width, base.height) > 0 ? Math.min(1, 540 / Math.min(base.width, base.height)) : 1);
    return { w: Math.max(32, Math.floor(base.width * Math.max(0.05, s))), h: Math.max(32, Math.floor(base.height * Math.max(0.05, s))) };
  }, [area, base, zoom]);

  // Media and fonts the film needs.
  const assetKey = JSON.stringify(filmAssets(film));
  const textKey = JSON.stringify(film.clips.flatMap((c) => (c.source.kind === "text" ? [[c.source.style.font, c.source.style.weight]] : [])));
  useEffect(() => {
    const { images } = JSON.parse(assetKey) as ReturnType<typeof filmAssets>;
    void loadAssetImages(images);
  }, [assetKey]);
  useEffect(() => {
    const used = (JSON.parse(textKey) as Array<[string, number]>).map(([font, weight]) => ({ font: font as never, weight }));
    void ensureFonts(used).then(() => setVersion((v) => v + 1));
  }, [textKey]);
  useEffect(() => onImagesChanged(() => setVersion((v) => v + 1)), []);
  useEffect(() => onVideoFrame(() => setVersion((v) => v + 1)), []);

  // Draw the frame (same renderer as the export).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(size.w * dpr * quality));
    const H = Math.max(2, Math.round(size.h * dpr * quality));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, film, playhead, W, H, previewResources(playing), { showMissing: true });
    viewerCanvas.current = canvas;
    viewerCanvas.version++;
    frameListeners.forEach((l) => l());
  }, [film, playhead, size, quality, playing, version]);

  const selected = selection.clipIds.length === 1 ? (film.clips.find((c) => c.id === selection.clipIds[0]) ?? null) : null;
  const fonts = useMemo(() => fontFamilies(), []);
  const box = selected && measureCtx() ? clipCorners(film, selected, playhead, size.w, size.h, measureCtx()!, fonts) : null;
  const path = selected && selected.source.kind !== "light" ? motionPath(film, selected, size.w, size.h) : null;
  const movable = selected && ["image", "video", "text", "light"].includes(selected.source.kind) && !film.tracks.find((t) => t.id === selected.trackId)?.locked;

  function point(e: ReactPointerEvent) {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!selected || !movable || !box || e.button !== 0) return;
    const pt = point(e);
    const keyEl = (e.target as HTMLElement).closest("[data-path-key]");
    const at = clipLocalAt(film, selected, playhead);
    const xs = box.map((p) => p[0]);
    const ys = box.map((p) => p[1]);
    const inside = pt.x >= Math.min(...xs) && pt.x <= Math.max(...xs) && pt.y >= Math.min(...ys) && pt.y <= Math.max(...ys);
    if (!keyEl && (!inside || !at)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const lt = keyEl ? Number(keyEl.getAttribute("data-path-key")) : at!.lt;
    const isLight = selected.source.kind === "light";
    drag.current = { base: film, clip: selected, start: pt, from: { x: clipValue(selected, isLight ? "lightX" : "x", lt), y: clipValue(selected, isLight ? "lightY" : "y", lt) }, key: keyEl ? lt : undefined };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const pt = point(e);
    // Screen movement → frame fractions (approximately undoing the camera zoom for this layer).
    const at = clipLocalAt(d.base, d.clip, playhead);
    const zoomNow = at?.shot ? 1 + (cameraValue(at.shot, "zoom", at.shotLocal) - 1) * d.clip.depth : 1;
    let x = d.from.x + (pt.x - d.start.x) / size.w / zoomNow;
    let y = d.from.y + (pt.y - d.start.y) / size.h / zoomNow;
    let gx: number | null = null;
    let gy: number | null = null;
    if (!e.altKey) {
      for (const target of [0.5, 1 / 3, 2 / 3]) {
        if (Math.abs(x - target) < 6 / size.w) {
          x = target;
          gx = target;
        }
        if (Math.abs(y - target) < 6 / size.h) {
          y = target;
          gy = target;
        }
      }
    }
    setGuides({ x: gx, y: gy });
    let next: Film;
    if (d.clip.source.kind === "light") {
      next = d.base;
      const lt = d.key ?? at?.lt ?? 0;
      for (const [prop, v] of [
        ["lightX", x],
        ["lightY", y],
      ] as const) {
        if (d.clip.keyframes[prop]?.length) next = setKeyframe(next, { kind: "clip", clipId: d.clip.id, prop }, lt, v).film;
        else next = updateClip(next, d.clip.id, (c) => ({ ...c, transform: { ...c.transform, [prop === "lightX" ? "x" : "y"]: v } })).film;
      }
    } else if (d.key !== undefined) {
      next = setKeyframe(d.base, { kind: "clip", clipId: d.clip.id, prop: "x" }, d.key, x).film;
      next = setKeyframe(next, { kind: "clip", clipId: d.clip.id, prop: "y" }, d.key, y).film;
    } else next = placeClip(d.base, d.clip, playhead, x, y);
    preview(next);
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setGuides({ x: null, y: null });
    if (d) commit(useEditor.getState().film!, { base: d.base });
  }

  async function fullscreen() {
    const el = stageRef.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await el.requestFullscreen?.().catch(() => undefined);
  }

  const step = (frames: number) => setPlayhead(toFrame(playhead + frames / film.fps, film.fps));
  const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] px-2 py-1.5">
        <label className="sr-only" htmlFor="viewer-aspect">
          Aspect ratio
        </label>
        <select id="viewer-aspect" value={film.aspect} onChange={(e) => commit({ ...film, aspect: e.target.value as Aspect })} className={darkSelectBase} title="Output aspect ratio">
          {ASPECT_ORDER.map((a) => (
            <option key={a} value={a}>
              {ASPECTS[a].label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="viewer-quality">
          Preview quality
        </label>
        <select id="viewer-quality" value={quality} onChange={(e) => setQuality(Number(e.target.value) as Quality)} className={darkSelectBase} title="Preview quality (exports are always full quality)">
          <option value={1}>Full quality</option>
          <option value={0.5}>Half</option>
          <option value={0.25}>Quarter</option>
        </select>
        <IconButton label="Safe areas" active={safe} onClick={() => setSafe((s) => !s)}>
          <span className="block size-4 rounded-[3px] border border-dashed border-current" />
        </IconButton>
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor="viewer-zoom">
            Zoom
          </label>
          <select id="viewer-zoom" value={String(zoom)} onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as Zoom))} className={darkSelectBase}>
            <option value="fit">Fit</option>
            <option value="0.5">50%</option>
            <option value="1">100%</option>
            <option value="2">200%</option>
          </select>
          {canFullscreen && (
            <IconButton label="Fullscreen" onClick={() => void fullscreen()}>
              <Expand className="size-4" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-auto bg-[#0B0D11]">
        <div className="flex min-h-full min-w-full items-center justify-center p-3">
          <div ref={stageRef} className="relative shrink-0 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]" style={{ width: size.w, height: size.h }}>
            <canvas ref={canvasRef} role="img" aria-label={`Preview at ${timecode(playhead, film.fps)}`} data-viewer className="block size-full" />
            <div className="absolute inset-0 touch-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} style={{ cursor: movable ? "move" : "default" }}>
              <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
                {safe && (
                  <>
                    <rect x={size.w * 0.035} y={size.h * 0.035} width={size.w * 0.93} height={size.h * 0.93} fill="none" stroke="rgba(255,255,255,0.45)" strokeDasharray="5 4" />
                    <rect x={size.w * 0.05} y={size.h * 0.05} width={size.w * 0.9} height={size.h * 0.9} fill="none" stroke="rgba(164,177,255,0.6)" strokeDasharray="2 4" />
                  </>
                )}
                {guides.x !== null && <line x1={guides.x * size.w} x2={guides.x * size.w} y1={0} y2={size.h} stroke="#F472B6" strokeDasharray="4 3" />}
                {guides.y !== null && <line y1={guides.y * size.h} y2={guides.y * size.h} x1={0} x2={size.w} stroke="#F472B6" strokeDasharray="4 3" />}
                {path && <polyline points={path.points.map((p) => p.join(",")).join(" ")} fill="none" stroke="#A4B1FF" strokeWidth={1.5} strokeDasharray="5 4" />}
                {box && <polygon points={box.map((p) => p.join(",")).join(" ")} fill="none" stroke="#8B9BFF" strokeWidth={1.5} />}
              </svg>
              {path?.keys.map((k) => (
                <span key={k.t} data-path-key={k.t} title={`Position keyframe at ${k.t.toFixed(2)}s`} className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab border border-[#101318] bg-[#F5B942]" style={{ left: k.x, top: k.y }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Transport */}
      <div className="grid gap-1.5 border-t border-white/[0.08] px-3 py-2">
        <label className="sr-only" htmlFor="scrub">
          Playhead
        </label>
        <input id="scrub" type="range" min={0} max={D} step={1 / film.fps} value={Math.min(playhead, D)} onChange={(e) => setPlayhead(Number(e.target.value))} className="w-full accent-[#8B9BFF]" />
        <div className="flex items-center gap-1">
          <span className="font-mono text-[13px] tabular-nums text-[#E8EAF0]" data-timecode>
            {timecode(playhead, film.fps)}
          </span>
          <span className="font-mono text-[13px] tabular-nums text-[#8890A2]">/ {timecode(D, film.fps)}</span>
          <div className="mx-auto flex items-center gap-1">
            <IconButton label="Go to start" onClick={() => setPlayhead(0)}>
              <SkipBack className="size-4" aria-hidden="true" />
            </IconButton>
            <IconButton label="Previous frame" onClick={() => step(-1)}>
              <StepBack className="size-4" aria-hidden="true" />
            </IconButton>
            <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="inline-flex size-10 items-center justify-center rounded-full bg-[#5465E6] text-white hover:bg-[#4757D9]">
              {playing ? <Pause className="size-5" aria-hidden="true" /> : <Play className="ml-0.5 size-5" aria-hidden="true" />}
            </button>
            <IconButton label="Next frame" onClick={() => step(1)}>
              <StepForward className="size-4" aria-hidden="true" />
            </IconButton>
            <IconButton label="Go to end" onClick={() => setPlayhead(D)}>
              <SkipForward className="size-4" aria-hidden="true" />
            </IconButton>
          </div>
          <IconButton label="Loop playback" active={loop} onClick={() => useEditor.setState({ loop: !loop })}>
            <Repeat className="size-4" aria-hidden="true" />
          </IconButton>
          <span className="hidden text-[12px] text-[#8890A2] sm:inline">{film.fps} fps</span>
        </div>
      </div>
    </div>
  );
}

