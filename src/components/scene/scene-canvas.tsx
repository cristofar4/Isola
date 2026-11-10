"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { corners, hitTest, type Placement } from "@/lib/scene/draw";
import { fontFamilies } from "@/lib/scene/fonts";
import { backdropInfo, SCENE_FORMATS, type Scene, type SceneFormatId, type SceneLayer } from "@/lib/scene/model";
import { layerPlacement, renderScene } from "@/lib/scene/render";
import { assetImage, loadAssetImages, onImagesChanged } from "@/lib/scene/resources";
import { sceneAssetIds } from "@/lib/scene/render";

export type DragMode = "move" | "rotate" | "scale";

interface Props {
  scene: Scene;
  format: SceneFormatId;
  selectedId: string | null;
  mode: DragMode;
  snap: boolean;
  compare: boolean;
  onSelect: (id: string | null) => void;
  onPreview: (scene: Scene) => void;
  onCommit: (scene: Scene, base: Scene) => void;
}

let measuring: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
/** A context for measuring text (layout doesn't depend on any particular canvas). */
function measureCtx() {
  if (!measuring && typeof document !== "undefined") measuring = document.createElement("canvas").getContext("2d");
  return measuring;
}

const editable = (l: SceneLayer) => l.visible && !l.locked && l.kind !== "backdrop" && l.kind !== "shadow";

function patchLayer(scene: Scene, id: string, patch: Partial<SceneLayer>): Scene {
  return { ...scene, layers: scene.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as SceneLayer) : l)) };
}

/**
 * The scene at its real proportions, drawn by renderScene. Selection boxes,
 * handles and guides are an SVG overlay on top: they never reach an export.
 */
export function SceneCanvas({ scene, format, selectedId, mode, snap, compare, onSelect, onPreview, onCommit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [imagesVersion, setImagesVersion] = useState(0);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const drag = useRef<{ id: string; base: Scene; start: { x: number; y: number }; layer: SceneLayer; handle: "body" | "corner" | "rotate"; p: Placement } | null>(null);
  const f = SCENE_FORMATS[format];

  // Fit the frame inside the available space.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const pad = 24;
      const s = Math.min((r.width - pad * 2) / f.width, (r.height - pad * 2) / f.height);
      setBox({ w: Math.max(40, Math.floor(f.width * s)), h: Math.max(40, Math.floor(f.height * s)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.width, f.height]);

  useEffect(() => {
    void loadAssetImages(sceneAssetIds(scene));
  }, [scene]);
  useEffect(() => onImagesChanged(() => setImagesVersion((v) => v + 1)), []);

  const fonts = useMemo(() => fontFamilies(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !box.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(box.w * dpr);
    const H = Math.round(box.h * dpr);
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    renderScene(ctx, scene, W, H, { image: assetImage, fonts }, { showMissing: true, skip: compare ? (l) => l.kind === "backdrop" || l.kind === "shadow" : undefined });
    // Once web fonts arrive, draw again so titles use them.
    void document.fonts?.ready.then(() => {
      if (canvasRef.current === canvas) renderScene(ctx, scene, W, H, { image: assetImage, fonts }, { showMissing: true, skip: compare ? (l) => l.kind === "backdrop" || l.kind === "shadow" : undefined });
    });
  }, [scene, box, compare, imagesVersion, fonts]);

  const placementOf = (layer: SceneLayer) => {
    const ctx = measureCtx();
    return ctx ? layerPlacement(ctx, scene, layer, box.w, box.h, { fonts }) : null;
  };

  const selected = scene.layers.find((l) => l.id === selectedId) ?? null;
  const selP = selected && selected.kind !== "backdrop" ? placementOf(selected) : null;

  function local(e: ReactPointerEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function pick(x: number, y: number) {
    for (let i = scene.layers.length - 1; i >= 0; i--) {
      const l = scene.layers[i];
      if (!editable(l)) continue;
      const p = placementOf(l);
      if (p && hitTest(p, x, y)) return l;
    }
    return null;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const pt = local(e);
    const target = (e.target as HTMLElement).closest("[data-handle]")?.getAttribute("data-handle") as "corner" | "rotate" | null;
    let layer = target && selected ? selected : pick(pt.x, pt.y);
    if (!layer) {
      onSelect(null);
      return;
    }
    if (!target) onSelect(layer.id);
    layer = scene.layers.find((l) => l.id === layer!.id)!;
    const p = placementOf(layer);
    if (!p || layer.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: layer.id, base: scene, start: pt, layer, handle: target ?? "body", p };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const pt = local(e);
    const { layer, p } = d;
    const handle = d.handle === "body" ? (mode === "move" ? "move" : mode) : d.handle === "corner" ? "scale" : "rotate";
    if (handle === "move") {
      let nx = (p.cx + pt.x - d.start.x) / box.w;
      let ny = (p.cy + pt.y - d.start.y) / box.h;
      const gx: number[] = [];
      const gy: number[] = [];
      if (snap && !e.altKey) {
        const tx = 6 / box.w;
        const ty = 6 / box.h;
        const xs = [0.5, 1 / 3, 2 / 3, ...scene.layers.filter((l) => l.id !== layer.id && editable(l)).map((l) => l.x)];
        const ys = [0.5, 1 / 3, 2 / 3, ...scene.layers.filter((l) => l.id !== layer.id && editable(l)).map((l) => l.y)];
        const bx = xs.find((x) => Math.abs(x - nx) < tx);
        if (bx !== undefined) {
          nx = bx;
          gx.push(bx);
        }
        const by = ys.find((y) => Math.abs(y - ny) < ty);
        if (by !== undefined) {
          ny = by;
          gy.push(by);
        }
        // Ground contact: a product's bottom edge snaps to the backdrop's surface.
        const bd = scene.layers.find((l) => l.kind === "backdrop");
        const surface = bd?.kind === "backdrop" ? backdropInfo(bd.backdrop)?.surfaceY : undefined;
        if (layer.kind === "product" && surface !== undefined && by === undefined) {
          const half = p.h / 2 / box.h;
          if (Math.abs(ny + half - surface) < ty) {
            ny = surface - half;
            gy.push(surface);
          }
        }
      }
      setGuides({ x: gx, y: gy });
      onPreview(patchLayer(d.base, layer.id, { x: nx, y: ny }));
    } else if (handle === "scale") {
      const d0 = Math.hypot(d.start.x - p.cx, d.start.y - p.cy) || 1;
      const d1 = Math.hypot(pt.x - p.cx, pt.y - p.cy);
      const scale = Math.max(0.02, Math.min(4, layer.scale * (d1 / d0)));
      onPreview(patchLayer(d.base, layer.id, { scale }));
    } else {
      const a0 = Math.atan2(d.start.y - p.cy, d.start.x - p.cx);
      const a1 = Math.atan2(pt.y - p.cy, pt.x - p.cx);
      let rotation = layer.rotation + ((a1 - a0) * 180) / Math.PI;
      if (e.shiftKey || (snap && Math.abs(rotation % 90) < 3)) rotation = Math.round(rotation / (e.shiftKey ? 15 : 90)) * (e.shiftKey ? 15 : 90);
      rotation = Math.round(rotation * 10) / 10;
      onPreview(patchLayer(d.base, layer.id, { rotation }));
    }
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [] });
    if (d) onCommit(scene, d.base);
  }

  const pts = selP ? corners(selP) : null;
  const rotateHandle = selP && pts ? (() => {
    const [a, b] = pts;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const ang = ((selP.rotation - 90) * Math.PI) / 180;
    return { x: mx + Math.cos(ang) * 26, y: my + Math.sin(ang) * 26, mx, my };
  })() : null;

  return (
    <div ref={wrapRef} className="relative flex h-full min-h-[280px] w-full items-center justify-center">
      <div className="relative shadow-[0_10px_40px_-18px_rgb(32_41_45/0.45)]" style={{ width: box.w, height: box.h }}>
        <canvas ref={canvasRef} role="img" aria-label={`${scene.name}, ${f.label}`} className={`block size-full ${compare ? "checkerboard" : ""}`} />
        <div
          data-scene-overlay
          className="absolute inset-0 touch-none"
          style={{ cursor: mode === "rotate" ? "alias" : mode === "scale" ? "nwse-resize" : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {guides.x.map((x) => (
              <line key={`gx${x}`} x1={x * box.w} x2={x * box.w} y1={0} y2={box.h} stroke="#E0457B" strokeWidth={1} strokeDasharray="4 3" />
            ))}
            {guides.y.map((y) => (
              <line key={`gy${y}`} y1={y * box.h} y2={y * box.h} x1={0} x2={box.w} stroke="#E0457B" strokeWidth={1} strokeDasharray="4 3" />
            ))}
            {pts && (
              <>
                <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="#4163F4" strokeWidth={1.5} />
                {rotateHandle && <line x1={rotateHandle.mx} y1={rotateHandle.my} x2={rotateHandle.x} y2={rotateHandle.y} stroke="#4163F4" strokeWidth={1.5} />}
              </>
            )}
          </svg>
          {pts &&
            selected &&
            !selected.locked &&
            pts.map((p, i) => (
              <span
                key={i}
                data-handle="corner"
                className="absolute size-3 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-[3px] border-2 border-blue bg-white"
                style={{ left: p[0], top: p[1] }}
              />
            ))}
          {rotateHandle && selected && !selected.locked && (
            <span
              data-handle="rotate"
              title="Drag to rotate (Shift: 15° steps)"
              className="absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-blue bg-white"
              style={{ left: rotateHandle.x, top: rotateHandle.y }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** A small rendering of a scene in one format (format strip, cards). */
export function SceneThumb({ scene, format, className, label }: { scene: Scene; format: SceneFormatId; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    void loadAssetImages(sceneAssetIds(scene));
  }, [scene]);
  useEffect(() => onImagesChanged(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const f = SCENE_FORMATS[format];
    const s = 240 / Math.max(f.width, f.height);
    canvas.width = Math.round(f.width * s);
    canvas.height = Math.round(f.height * s);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const t = setTimeout(() => renderScene(ctx, scene, canvas.width, canvas.height, { image: assetImage, fonts: fontFamilies() }, { showMissing: true }), 60);
    return () => clearTimeout(t);
  }, [scene, format, version]);
  return <canvas ref={ref} role="img" aria-label={label} className={className} />;
}
