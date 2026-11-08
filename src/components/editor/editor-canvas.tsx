"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { drawComposite } from "@/lib/editor/compose";
import { clampRect, unionRect, writeRect, type Rect } from "@/lib/editor/geometry";
import { createStrokeBuffers, finishStroke, stampSegment, type StrokeBuffers } from "@/lib/editor/mask-ops";
import { cropOf } from "@/lib/editor/types";
import { commitMaskEdit, compositeSources, updateSettings } from "@/lib/project/actions";
import { imageAssets } from "@/lib/project/assets";
import type { ProjectImage } from "@/lib/project/store";
import { cn } from "@/lib/cn";
import { aspectRatioOf, useEditorUI } from "./editor-ui-store";
import { CanvasStatus } from "./canvas-status";

interface View {
  scale: number;
  tx: number;
  ty: number;
}

type Handle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type Gesture =
  | { kind: "pan"; x0: number; y0: number; tx0: number; ty0: number }
  | { kind: "pinch"; d0: number; cx0: number; cy0: number; view0: View }
  | { kind: "stroke"; last: { x: number; y: number }; dirty: Rect | null; mode: "restore" | "erase" }
  | { kind: "crop"; handle: Handle; x0: number; y0: number; rect0: Rect }
  | null;

const MIN_SCALE = 0.02;
const MAX_SCALE = 32;
const MIN_CROP = 16;

function makeChecker(ctx: CanvasRenderingContext2D) {
  const tile = document.createElement("canvas");
  tile.width = 16;
  tile.height = 16;
  const t = tile.getContext("2d")!;
  t.fillStyle = "#ffffff";
  t.fillRect(0, 0, 16, 16);
  t.fillStyle = "#e7e9e4";
  t.fillRect(0, 0, 8, 8);
  t.fillRect(8, 8, 8, 8);
  return ctx.createPattern(tile, "repeat");
}

export function EditorCanvas({ image }: { image: ProjectImage }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [cropDraft, setCropDraft] = useState<Rect | null>(null);
  const [panning, setPanning] = useState(false);
  const gesture = useRef<Gesture>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const buffers = useRef<{ id: string; buffers: StrokeBuffers } | null>(null);
  const spaceHeld = useRef(false);
  const checker = useRef<CanvasPattern | null>(null);
  const raf = useRef(0);

  const tool = useEditorUI((s) => s.tool);
  const brushSize = useEditorUI((s) => s.brushSize);
  const brushHardness = useEditorUI((s) => s.brushHardness);
  const compare = useEditorUI((s) => s.compare);
  const comparePosition = useEditorUI((s) => s.comparePosition);
  const setComparePosition = useEditorUI((s) => s.setComparePosition);
  const aspect = useEditorUI((s) => s.aspect);
  const command = useEditorUI((s) => s.command);
  const setZoom = useEditorUI((s) => s.setZoom);

  const { width: W, height: H, settings, status } = image;
  const ready = status === "ready" && Boolean(imageAssets.get(image.id)?.layers);
  const cropMode = tool === "crop" && ready;
  const fullRect: Rect = { x: 0, y: 0, w: W, h: H };
  const crop = cropOf(settings, W, H);
  const shownCrop = cropDraft ?? crop;
  const content = cropMode ? fullRect : crop;

  /* ------------------------------------------------------------ sizing -- */
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitView = useCallback((): View | null => {
    if (!size.w || !size.h || !W || !H) return null;
    const pad = size.w < 640 ? 16 : 40;
    const scale = Math.max(
      MIN_SCALE,
      Math.min((size.w - pad * 2) / content.w, (size.h - pad * 2) / content.h, MAX_SCALE),
    );
    return {
      scale,
      tx: (size.w - content.w * scale) / 2 - content.x * scale,
      ty: (size.h - content.h * scale) / 2 - content.y * scale,
    };
  }, [size.w, size.h, W, H, content.x, content.y, content.w, content.h]);

  // Fit whenever the image, its crop, the canvas size or crop mode changes
  // (state adjusted during render, React's recommended alternative to an effect).
  const fitKey = `${image.id}:${W}x${H}:${content.x},${content.y},${content.w},${content.h}:${size.w}x${size.h}`;
  const [fittedKey, setFittedKey] = useState<string | null>(null);
  if (fitKey !== fittedKey) {
    const next = fitView();
    if (next) {
      setFittedKey(fitKey);
      setView(next);
    }
  }

  useEffect(() => setZoom(view.scale), [view.scale, setZoom]);

  const zoomAt = useCallback((factor: number, sx: number, sy: number, absolute?: number) => {
    setView((v) => {
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, absolute ?? v.scale * factor));
      const ix = (sx - v.tx) / v.scale;
      const iy = (sy - v.ty) / v.scale;
      return { scale, tx: sx - ix * scale, ty: sy - iy * scale };
    });
  }, []);

  // View commands from the toolbar and shortcuts (zoom menu, fit, 100%).
  const [handledCommand, setHandledCommand] = useState(command?.nonce ?? 0);
  if (command && command.nonce !== handledCommand) {
    setHandledCommand(command.nonce);
    if (command.type === "fit") {
      const next = fitView();
      if (next) setView(next);
    } else if (command.type === "zoom-to") zoomAt(1, size.w / 2, size.h / 2, command.scale);
    else zoomAt(command.factor, size.w / 2, size.h / 2);
  }

  /* ----------------------------------------------------------- drawing -- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const sources = compositeSources(image.id);
    if (!sources) return;
    const v = viewRef.current;
    const dest: Rect = { x: v.tx + content.x * v.scale, y: v.ty + content.y * v.scale, w: content.w * v.scale, h: content.h * v.scale };
    const drawSettings = cropMode ? { ...settings, crop: null } : settings;
    const showResult = Boolean(sources.layers) && status === "ready";
    const needsChecker =
      showResult && (settings.background.kind === "transparent" || (settings.background.kind === "image" && !sources.backgroundImage));

    ctx.save();
    ctx.shadowColor = "rgba(32,41,45,0.18)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
    ctx.restore();

    const paintResult = (clip: Rect) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      if (needsChecker) {
        checker.current ??= makeChecker(ctx);
        if (checker.current) {
          ctx.fillStyle = checker.current;
          ctx.fillRect(dest.x, dest.y, dest.w, dest.h);
        }
      }
      drawComposite(ctx, sources, drawSettings, dest);
      ctx.restore();
    };
    const paintOriginal = (clip: Rect) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      drawComposite(ctx, sources, drawSettings, dest, { view: "original" });
      ctx.restore();
    };

    if (!showResult) paintOriginal(dest);
    else if (compare && !cropMode) {
      const split = dest.x + dest.w * comparePosition;
      paintOriginal({ x: dest.x, y: dest.y, w: split - dest.x, h: dest.h });
      paintResult({ x: split, y: dest.y, w: dest.x + dest.w - split, h: dest.h });
    } else paintResult(dest);

    if (cropMode) {
      const c = shownCrop;
      const cx = v.tx + c.x * v.scale;
      const cy = v.ty + c.y * v.scale;
      ctx.save();
      ctx.fillStyle = "rgba(32,41,45,0.55)";
      ctx.beginPath();
      ctx.rect(dest.x, dest.y, dest.w, dest.h);
      ctx.rect(cx, cy, c.w * v.scale, c.h * v.scale);
      ctx.fill("evenodd");
      ctx.restore();
    }
  }, [size.w, size.h, image.id, content.x, content.y, content.w, content.h, cropMode, settings, status, compare, comparePosition, shownCrop]);

  const drawRef = useRef(draw);
  drawRef.current = draw;
  const scheduleDraw = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => drawRef.current());
  }, []);

  useEffect(() => {
    scheduleDraw();
  }, [draw, view, image.revision, scheduleDraw]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /* ------------------------------------------------------------- input -- */
  const toImage = (sx: number, sy: number) => {
    const v = viewRef.current;
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
  };
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = localPoint(e);
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), p.x, p.y);
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        setView((v) => ({ ...v, tx: v.tx - e.deltaX * k, ty: v.ty - e.deltaY * k }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        if (!spaceHeld.current) setPanning(true);
        spaceHeld.current = true;
        if (e.target === document.body || e.target === containerRef.current) e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceHeld.current = false;
        setPanning(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  function strokeBuffers(): StrokeBuffers | null {
    const assets = imageAssets.get(image.id);
    if (!assets?.mask) return null;
    if (buffers.current?.id !== image.id || buffers.current.buffers.coverage.length !== assets.mask.length) {
      buffers.current = { id: image.id, buffers: createStrokeBuffers(assets.mask.length) };
    }
    return buffers.current.buffers;
  }

  function paintSegment(from: { x: number; y: number }, to: { x: number; y: number }, mode: "restore" | "erase") {
    const assets = imageAssets.get(image.id);
    const b = strokeBuffers();
    if (!assets?.mask || !assets.layers || !b) return null;
    const radius = brushSize / 2 / viewRef.current.scale;
    const rect = stampSegment(assets.mask, W, H, b, from, to, radius, brushHardness, mode);
    if (rect) {
      assets.layers.update(rect);
      scheduleDraw();
    }
    return rect;
  }

  function endStroke(commit: boolean) {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind !== "stroke" || !g.dirty) return;
    const assets = imageAssets.get(image.id);
    const b = strokeBuffers();
    if (!assets?.mask || !b) return;
    const { before, after, changed } = finishStroke(assets.mask, W, b, g.dirty);
    if (!commit) {
      writeRect(assets.mask, W, g.dirty, before);
      assets.layers?.update(g.dirty);
      scheduleDraw();
      return;
    }
    if (changed) commitMaskEdit(image.id, g.mode === "restore" ? "Restore brush" : "Erase brush", g.dirty, before, after);
  }

  function moveCursor(p: { x: number; y: number } | null) {
    const el = cursorRef.current;
    if (!el) return;
    if (!p) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    el.style.transform = `translate(${p.x - brushSize / 2}px, ${p.y - brushSize / 2}px)`;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    const target = e.target as HTMLElement;
    // Let buttons, links and other overlay controls inside the canvas receive their own clicks.
    if (target.closest("[data-overlay-control], button, a, input, summary, details")) return;
    containerRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 2) {
      if (gesture.current?.kind === "stroke") endStroke(false);
      if (gesture.current?.kind === "crop") setCropDraft(null);
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        kind: "pinch",
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        cx0: (a.x + b.x) / 2,
        cy0: (a.y + b.y) / 2,
        view0: viewRef.current,
      };
      return;
    }
    if (pointers.current.size > 2) return;

    const handle = target.dataset.handle as Handle | undefined;
    if (cropMode && handle) {
      const ip = toImage(p.x, p.y);
      gesture.current = { kind: "crop", handle, x0: ip.x, y0: ip.y, rect0: shownCrop };
      return;
    }
    const wantsPan = e.button === 1 || spaceHeld.current || tool === "move" || tool === "crop" || !ready;
    if (wantsPan) {
      gesture.current = { kind: "pan", x0: p.x, y0: p.y, tx0: viewRef.current.tx, ty0: viewRef.current.ty };
      setPanning(true);
      return;
    }
    if (tool === "restore" || tool === "erase") {
      const ip = toImage(p.x, p.y);
      const dirty = paintSegment(ip, ip, tool);
      gesture.current = { kind: "stroke", last: ip, dirty, mode: tool };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = localPoint(e);
    if (tool === "restore" || tool === "erase") moveCursor(p);
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      setView((v) => ({ ...v, tx: g.tx0 + p.x - g.x0, ty: g.ty0 + p.y - g.y0 }));
    } else if (g.kind === "pinch" && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, g.view0.scale * (d / g.d0)));
      const ix = (g.cx0 - g.view0.tx) / g.view0.scale;
      const iy = (g.cy0 - g.view0.ty) / g.view0.scale;
      setView({ scale, tx: cx - ix * scale, ty: cy - iy * scale });
    } else if (g.kind === "stroke") {
      const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
      const points = (events.length ? events : [e.nativeEvent]).map((ev) => {
        const lp = localPoint(ev);
        return toImage(lp.x, lp.y);
      });
      for (const ip of points) {
        const rect = paintSegment(g.last, ip, g.mode);
        g.dirty = unionRect(g.dirty, rect);
        g.last = ip;
      }
    } else if (g.kind === "crop") {
      const ip = toImage(p.x, p.y);
      setCropDraft(resizeCrop(g.rect0, g.handle, ip.x - g.x0, ip.y - g.y0, W, H, aspectRatioOf(aspect, W, H)));
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    if (g.kind === "stroke") endStroke(e.type !== "pointercancel");
    else if (g.kind === "crop") {
      gesture.current = null;
      if (cropDraft) commitCrop(cropDraft);
      setCropDraft(null);
    } else {
      gesture.current = null;
      setPanning(false);
    }
  }

  function commitCrop(rect: Rect) {
    const r = clampRect({ x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }, W, H);
    if (!r) return;
    const isFull = r.x === 0 && r.y === 0 && r.w === W && r.h === H;
    updateSettings(image.id, "Crop", { crop: isFull ? null : r, output: null });
  }

  // Apply aspect presets immediately while cropping.
  useEffect(() => {
    if (!cropMode) return;
    const ratio = aspectRatioOf(aspect, W, H);
    if (!ratio) return;
    const c = cropOf(image.settings, W, H);
    if (Math.abs(c.w / c.h - ratio) < 0.005) return;
    let w = c.w;
    let h = w / ratio;
    if (h > H) {
      h = H;
      w = h * ratio;
    }
    if (w > W) {
      w = W;
      h = w / ratio;
    }
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    commitCrop({ x: Math.min(W - w, Math.max(0, cx - w / 2)), y: Math.min(H - h, Math.max(0, cy - h / 2)), w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, cropMode]);

  /* ---------------------------------------------------------- overlays -- */
  const destScreen = {
    x: view.tx + content.x * view.scale,
    y: view.ty + content.y * view.scale,
    w: content.w * view.scale,
    h: content.h * view.scale,
  };
  const cropScreen = {
    x: view.tx + shownCrop.x * view.scale,
    y: view.ty + shownCrop.y * view.scale,
    w: shownCrop.w * view.scale,
    h: shownCrop.h * view.scale,
  };
  const ratioLocked = aspectRatioOf(aspect, W, H) !== null;
  const handles: Handle[] = ratioLocked ? ["nw", "ne", "se", "sw"] : ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const brushTool = (tool === "restore" || tool === "erase") && ready;

  const cursor = panning
    ? "cursor-grabbing"
    : brushTool && !spaceHeld.current
      ? "cursor-none"
      : tool === "move" || !ready
        ? "cursor-grab"
        : "cursor-default";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-roledescription="image canvas"
      data-view={`${view.scale},${view.tx},${view.ty}`}
      aria-label={`${image.name}, ${W} by ${H} pixels. ${
        brushTool ? `${tool === "restore" ? "Restore" : "Erase"} brush active, drag to paint.` : "Drag to pan, Control plus scroll to zoom."
      }`}
      className={cn("relative h-full w-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue/50", cursor)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => moveCursor(null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 120 : 40;
        if (e.key === "ArrowLeft") setView((v) => ({ ...v, tx: v.tx + step }));
        else if (e.key === "ArrowRight") setView((v) => ({ ...v, tx: v.tx - step }));
        else if (e.key === "ArrowUp") setView((v) => ({ ...v, ty: v.ty + step }));
        else if (e.key === "ArrowDown") setView((v) => ({ ...v, ty: v.ty - step }));
        else return;
        e.preventDefault();
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {(status === "processing" || status === "queued") && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute overflow-hidden"
          style={{ left: destScreen.x, top: destScreen.y, width: destScreen.w, height: destScreen.h }}
        >
          <div className="absolute inset-0 bg-blue/10" />
          <div className="absolute inset-y-0 -left-1/2 w-1/2 animate-sweep bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)]" />
        </div>
      )}

      {brushTool && (
        <div
          ref={cursorRef}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 rounded-full border-2 border-white opacity-0 shadow-[0_0_0_1px_rgba(32,41,45,0.55),inset_0_0_0_1px_rgba(32,41,45,0.35)]"
          style={{ width: brushSize, height: brushSize }}
        >
          <span
            className={cn(
              "absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
              tool === "restore" ? "bg-blue" : "bg-danger",
            )}
          />
        </div>
      )}

      {cropMode && (
        <div
          className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(32,41,45,0.6)]"
          style={{ left: cropScreen.x, top: cropScreen.y, width: cropScreen.w, height: cropScreen.h }}
        >
          <div data-handle="move" className="absolute inset-0 cursor-move" aria-hidden="true">
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="border-[0.5px] border-white/40" />
              ))}
            </div>
          </div>
          {handles.map((h) => (
            <span
              key={h}
              data-handle={h}
              aria-hidden="true"
              className={cn(
                "absolute size-4 rounded-[3px] border-2 border-blue bg-white shadow",
                h.includes("n") ? "-top-2" : h.includes("s") ? "-bottom-2" : "top-1/2 -translate-y-1/2",
                h.includes("w") ? "-left-2" : h.includes("e") ? "-right-2" : "left-1/2 -translate-x-1/2",
                h === "n" || h === "s" ? "cursor-ns-resize" : h === "e" || h === "w" ? "cursor-ew-resize" : h === "nw" || h === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize",
              )}
            />
          ))}
          <span className="pointer-events-none absolute -top-8 left-0 rounded-md bg-ink px-2 py-0.5 text-xs font-medium tabular-nums text-white">
            {Math.round(shownCrop.w)} × {Math.round(shownCrop.h)}
          </span>
        </div>
      )}

      {compare && ready && !cropMode && (
        <CompareHandle
          left={destScreen.x + destScreen.w * comparePosition}
          top={destScreen.y}
          height={destScreen.h}
          position={comparePosition}
          onChange={setComparePosition}
          toFraction={(clientX) => {
            const rect = containerRef.current!.getBoundingClientRect();
            return (clientX - rect.left - destScreen.x) / destScreen.w;
          }}
        />
      )}

      <CanvasStatus image={image} />
    </div>
  );
}

function CompareHandle({
  left,
  top,
  height,
  position,
  onChange,
  toFraction,
}: {
  left: number;
  top: number;
  height: number;
  position: number;
  onChange: (p: number) => void;
  toFraction: (clientX: number) => number;
}) {
  const dragging = useRef(false);
  return (
    <div data-overlay-control className="absolute" style={{ left, top, height }}>
      <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-blue" aria-hidden="true" />
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-sm">
        Removed
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-xs font-semibold text-ink shadow-sm">
        Original
      </span>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Comparison divider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position * 100)}
        aria-valuetext={`${Math.round(position * 100)}% original`}
        className="absolute top-1/2 inline-flex size-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border-2 border-white bg-blue text-white shadow-[var(--shadow-blue)]"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
        }}
        onPointerMove={(e) => dragging.current && onChange(toFraction(e.clientX))}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          if (e.key === "ArrowLeft") onChange(position - step);
          else if (e.key === "ArrowRight") onChange(position + step);
          else if (e.key === "Home") onChange(0);
          else if (e.key === "End") onChange(1);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
        </svg>
      </div>
    </div>
  );
}

function resizeCrop(r: Rect, handle: Handle, dx: number, dy: number, W: number, H: number, ratio: number | null): Rect {
  if (handle === "move") {
    return {
      x: Math.min(W - r.w, Math.max(0, r.x + dx)),
      y: Math.min(H - r.h, Math.max(0, r.y + dy)),
      w: r.w,
      h: r.h,
    };
  }
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.w;
  let y1 = r.y + r.h;
  if (handle.includes("w")) x0 = Math.min(x1 - MIN_CROP, Math.max(0, x0 + dx));
  if (handle.includes("e")) x1 = Math.max(x0 + MIN_CROP, Math.min(W, x1 + dx));
  if (handle.includes("n")) y0 = Math.min(y1 - MIN_CROP, Math.max(0, y0 + dy));
  if (handle.includes("s")) y1 = Math.max(y0 + MIN_CROP, Math.min(H, y1 + dy));
  if (ratio) {
    // Corner handles only: derive height from width, anchored at the opposite corner.
    let w = x1 - x0;
    let h = w / ratio;
    const anchorY = handle.includes("n") ? y1 : y0;
    const maxH = handle.includes("n") ? anchorY : H - anchorY;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    if (handle.includes("w")) x0 = x1 - w;
    else x1 = x0 + w;
    if (handle.includes("n")) y0 = anchorY - h;
    else y1 = anchorY + h;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
