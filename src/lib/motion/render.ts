/**
 * Draws one frame of a film at film time `t`. The viewer and the exporter
 * both call this with the same inputs, so what you preview is what you
 * export. Nothing editor-only (selection, guides, handles) is drawn here.
 */

import { context2d, makeCanvas } from "@/lib/scene/backdrops";
import { drawBackdropLayer, drawImageLayer, drawMissing, drawProductShadow, drawTextBlock, layoutText, type Ctx, type Drawable, type FontFamilies, type Placement, type TextAnimationState, type TextLayout } from "@/lib/scene/draw";
import { applyColour, combine } from "./colour";
import { isNeutral, type Clip, type ColourAdjust, type Film, type Shot, type TextAnimation } from "./model";
import { cameraValue, clipRange, clipValue, filmDuration, shotStarts, shotsAt, transitionLength } from "./time";

export interface FilmResources {
  image(assetId: string): Drawable | null;
  /** The frame of a video at media time `time` (seconds), or null if it isn't ready or is missing. */
  video(mediaId: string, time: number): Drawable | null;
  fonts: FontFamilies;
}

export interface RenderOptions {
  /** Draw labelled boxes where media is missing (preview). Exports check for missing media first. */
  showMissing?: boolean;
}

/** Whether this browser can blur canvas drawing (Chrome, Edge, Firefox; not every Safari). */
export const canBlur = (() => {
  try {
    if (typeof document === "undefined") return false;
    const c = document.createElement("canvas").getContext("2d");
    return !!c && "filter" in c;
  } catch {
    return false;
  }
})();

/* --------------------------------------------------------------- scratch --- */

const pool = new Map<string, Array<HTMLCanvasElement | OffscreenCanvas>>();
function scratch(W: number, H: number, slot: number) {
  const key = `${W}x${H}`;
  const list = pool.get(key) ?? [];
  pool.set(key, list);
  while (list.length <= slot) list.push(makeCanvas(W, H));
  if (pool.size > 4) {
    // Keep memory bounded when the viewer resizes.
    for (const k of pool.keys()) {
      if (k !== key) {
        pool.delete(k);
        break;
      }
    }
  }
  const canvas = list[slot];
  const ctx = context2d(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  return { canvas, ctx };
}

/* ---------------------------------------------------------------- camera --- */

interface CameraState {
  zoom: number;
  panX: number;
  panY: number;
  rotate: number;
}

function cameraAt(shot: Shot | null, local: number): CameraState {
  if (!shot) return { zoom: 1, panX: 0, panY: 0, rotate: 0 };
  return { zoom: cameraValue(shot, "zoom", local), panX: cameraValue(shot, "panX", local), panY: cameraValue(shot, "panY", local), rotate: cameraValue(shot, "rotate", local) };
}

/**
 * The scene camera: zoom, pan and roll for the whole shot. Each layer follows
 * it in proportion to its depth (1 = fully, 0 = fixed on screen), which is
 * what makes parallax.
 */
function applyCamera(ctx: Ctx, cam: CameraState, depth: number, W: number, H: number) {
  if (depth === 0) return;
  const z = 1 + (cam.zoom - 1) * depth;
  ctx.translate(W / 2, H / 2);
  if (cam.rotate) ctx.rotate(((cam.rotate * depth) * Math.PI) / 180);
  ctx.scale(z, z);
  ctx.translate(-W / 2 - cam.panX * W * depth, -H / 2 - cam.panY * H * depth);
}

/* ------------------------------------------------------------------ text --- */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

/** Text animation state at clip time `lt` of a clip lasting `D`. */
export function textAnimationState(anim: TextAnimation, lt: number, D: number, layout: TextLayout): { alpha: number; dy: number; state: TextAnimationState } {
  const inDur = Math.min(anim.in.duration, D / 2);
  const outDur = Math.min(anim.out.duration, D / 2);
  const pIn = anim.in.kind === "none" || inDur <= 0 ? 1 : clamp01(lt / inDur);
  const pOut = anim.out.kind === "none" || outDur <= 0 ? 1 : clamp01((D - lt) / outDur);
  let alpha = 1;
  let dy = 0;
  const state: TextAnimationState = {};
  const em = layout.px;
  const units = anim.by === "letter" ? Math.max(1, layout.glyphs) : Math.max(1, layout.words);
  const phase = (kind: TextAnimation["in"]["kind"], p: number, leaving: boolean) => {
    const e = easeOut(p);
    switch (kind) {
      case "fade":
        alpha *= e;
        break;
      case "slide":
        alpha *= e;
        dy += (1 - e) * em * 0.5 * (leaving ? -1 : 1);
        break;
      case "reveal":
        state.reveal = Math.min(state.reveal ?? 1, e);
        break;
      case "stagger": {
        const prev = state.glyph;
        state.glyph = (g) => {
          const base = prev ? prev(g) : { alpha: 1, dx: 0, dy: 0 };
          const i = anim.by === "letter" ? g.index : g.word;
          // Units start one after another; each takes 40% of the phase.
          const order = leaving ? units - 1 - i : i;
          const start = units > 1 ? (order / (units - 1)) * 0.6 : 0;
          const u = easeOut(clamp01((p - start) / 0.4));
          return { alpha: base.alpha * u, dx: base.dx, dy: base.dy + (1 - u) * em * 0.35 * (leaving ? -1 : 1) };
        };
        break;
      }
    }
  };
  if (pIn < 1) phase(anim.in.kind, pIn, false);
  if (pOut < 1) phase(anim.out.kind, pOut, true);
  return { alpha, dy, state };
}

/* ---------------------------------------------------------------- lights --- */

function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawLight(ctx: Ctx, clip: Clip, lt: number, W: number, H: number) {
  if (clip.source.kind !== "light") return;
  const S = Math.min(W, H);
  const intensity = clamp01(clipValue(clip, "intensity", lt)) * clamp01(clipValue(clip, "opacity", lt));
  if (intensity <= 0) return;
  const cx = clipValue(clip, "lightX", lt) * W;
  const cy = clipValue(clip, "lightY", lt) * H;
  const r = Math.max(4, clipValue(clip, "scale", lt) * S * 0.6);
  const [cr, cg, cb] = hexRgb(clip.source.color);
  ctx.save();
  if (clip.source.style === "spotlight") {
    const g = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(6,6,10,${0.78 * intensity})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.8);
    glow.addColorStop(0, `rgba(${cr},${cg},${cb},${0.32 * intensity})`);
    glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  } else if (clip.source.style === "sweep") {
    ctx.globalCompositeOperation = "screen";
    ctx.translate(cx, H / 2);
    ctx.rotate((18 * Math.PI) / 180);
    const g = ctx.createLinearGradient(-r, 0, r, 0);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
    g.addColorStop(0.5, `rgba(${cr},${cg},${cb},${0.5 * intensity})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -Math.hypot(W, H), r * 2, Math.hypot(W, H) * 2);
  } else {
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.45 * intensity})`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/* ----------------------------------------------------------------- clips --- */

/** The animated placement of an image or video clip at clip time `lt`. */
export function clipPlacement(clip: Clip, lt: number, W: number, H: number): Placement {
  const S = Math.min(W, H);
  const aspect = clip.source.kind === "image" || clip.source.kind === "video" ? clip.source.aspect : 1;
  const h = clipValue(clip, "scale", lt) * S;
  return {
    cx: clipValue(clip, "x", lt) * W,
    cy: clipValue(clip, "y", lt) * H,
    w: h * aspect,
    h,
    rotation: clipValue(clip, "rotation", lt),
    opacity: clamp01(clipValue(clip, "opacity", lt)),
    ax: clip.transform.anchorX,
    ay: clip.transform.anchorY,
  };
}

function clipDrawable(clip: Clip, lt: number, res: FilmResources): Drawable | null {
  if (clip.source.kind === "image") return res.image(clip.source.assetId);
  if (clip.source.kind === "video") return res.video(clip.source.mediaId, clip.source.in + lt);
  return null;
}

interface Active {
  clip: Clip;
  lt: number;
}

function drawClipContent(ctx: Ctx, film: Film, a: Active, all: Map<string, Active>, cam: CameraState, W: number, H: number, res: FilmResources, opts: RenderOptions) {
  const { clip, lt } = a;
  const S = Math.min(W, H);
  const src = clip.source;
  switch (src.kind) {
    case "backdrop": {
      const opacity = clamp01(clipValue(clip, "opacity", lt));
      if (opacity <= 0) return;
      ctx.save();
      applyCamera(ctx, cam, clip.depth, W, H);
      ctx.globalAlpha *= opacity;
      const s = clipValue(clip, "scale", lt);
      ctx.translate(clipValue(clip, "x", lt) * W, clipValue(clip, "y", lt) * H);
      ctx.rotate((clipValue(clip, "rotation", lt) * Math.PI) / 180);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
      drawBackdropLayer(ctx, src, W, H, src.imageAssetId ? res.image(src.imageAssetId) : null);
      ctx.restore();
      return;
    }
    case "image":
    case "video": {
      const p = clipPlacement(clip, lt, W, H);
      const img = clipDrawable(clip, lt, res);
      ctx.save();
      applyCamera(ctx, cam, clip.depth, W, H);
      if (img) drawImageLayer(ctx, img, p);
      else if (opts.showMissing) drawMissing(ctx, p, src.kind === "video" ? "Missing video" : "Missing image");
      ctx.restore();
      return;
    }
    case "shadow": {
      const target = all.get(src.targetClipId);
      if (!target) return;
      const img = clipDrawable(target.clip, target.lt, res);
      if (!img) return;
      const p = clipPlacement(target.clip, target.lt, W, H);
      ctx.save();
      applyCamera(ctx, cam, target.clip.depth, W, H);
      drawProductShadow(ctx, img, p, { opacity: clamp01(clipValue(clip, "opacity", lt)), softness: src.softness, direction: src.direction, length: src.length }, S);
      ctx.restore();
      return;
    }
    case "text": {
      const scale = clipValue(clip, "scale", lt);
      const layout = layoutText(ctx, src.style, src.style.size * scale * S, res.fonts);
      const anim = textAnimationState(src.anim, lt, clip.duration, layout);
      ctx.save();
      applyCamera(ctx, cam, clip.depth, W, H);
      drawTextBlock(
        ctx,
        src.style,
        layout,
        { cx: clipValue(clip, "x", lt) * W, cy: clipValue(clip, "y", lt) * H + anim.dy, w: layout.width, h: layout.height, rotation: clipValue(clip, "rotation", lt), opacity: clamp01(clipValue(clip, "opacity", lt)) * anim.alpha, ax: clip.transform.anchorX, ay: clip.transform.anchorY },
        anim.state,
      );
      ctx.restore();
      return;
    }
    case "light": {
      ctx.save();
      applyCamera(ctx, cam, clip.depth, W, H);
      drawLight(ctx, clip, lt, W, H);
      ctx.restore();
      return;
    }
    case "solid": {
      const opacity = clamp01(clipValue(clip, "opacity", lt));
      if (opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha *= opacity;
      ctx.fillStyle = src.color;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      return;
    }
    case "audio":
      return;
  }
}

function layerGrade(film: Film, clip: Clip): ColourAdjust | null {
  const bg = clip.role === "background" && !isNeutral(film.grade.background) ? film.grade.background : null;
  const own = !isNeutral(clip.grade) ? clip.grade : null;
  if (bg && own) return combine(bg, own);
  return bg ?? own;
}

function drawClip(ctx: Ctx, film: Film, a: Active, all: Map<string, Active>, cam: CameraState, W: number, H: number, res: FilmResources, opts: RenderOptions) {
  const grade = layerGrade(film, a.clip);
  const blur = canBlur ? clipValue(a.clip, "blur", a.lt) : 0;
  if (!grade && blur <= 0.01) return drawClipContent(ctx, film, a, all, cam, W, H, res, opts);
  // Draw the layer on its own, grade/blur it, then lay it into the frame.
  const { canvas, ctx: lc } = scratch(W, H, 2);
  drawClipContent(lc, film, a, all, cam, W, H, res, opts);
  if (grade) {
    const img = lc.getImageData(0, 0, W, H);
    applyColour(img.data, grade);
    lc.putImageData(img, 0, 0);
  }
  ctx.save();
  if (blur > 0.01) ctx.filter = `blur(${((blur / 100) * Math.min(W, H)).toFixed(2)}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.restore();
}

/** Clips active in shot `index` at shot time `local` (and film time `abs`), back to front. */
function activeClips(film: Film, index: number, local: number, abs: number) {
  const shot = film.shots[index];
  const map = new Map<string, Active>();
  for (const c of film.clips) {
    if (c.source.kind === "audio") continue;
    if (c.shotId === shot.id) {
      if (local >= c.start - 1e-9 && local < c.start + c.duration) map.set(c.id, { clip: c, lt: local - c.start });
    } else if (c.shotId === null) {
      const r = clipRange(film, c);
      if (abs >= r.start - 1e-9 && abs < r.end) map.set(c.id, { clip: c, lt: abs - r.start });
    }
  }
  return map;
}

function renderShot(ctx: Ctx, film: Film, index: number, local: number, abs: number, W: number, H: number, res: FilmResources, opts: RenderOptions) {
  const shot = film.shots[index];
  const all = activeClips(film, index, local, abs);
  const cam = cameraAt(shot, local);
  const tracks = film.tracks.filter((t) => t.kind === "visual");
  for (let i = tracks.length - 1; i >= 0; i--) {
    const track = tracks[i];
    if (track.hidden) continue;
    const onTrack = [...all.values()].filter((a) => a.clip.trackId === track.id).sort((x, y) => x.clip.start - y.clip.start);
    for (const a of onTrack) drawClip(ctx, film, a, all, cam, W, H, res, opts);
  }
}

/** Film time to render for frame `t`: the very end shows the last moment, not black. */
export function frameTime(film: Film, t: number) {
  const D = filmDuration(film);
  return Math.min(Math.max(0, t), Math.max(0, D - 1e-4));
}

/** Render the film at time `t` into a W × H context. */
export function renderFrame(ctx: Ctx, film: Film, t: number, W: number, H: number, res: FilmResources, opts: RenderOptions = {}) {
  const time = frameTime(film, t);
  const D = filmDuration(film);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const at = shotsAt(film, time);
  const starts = shotStarts(film);
  if (!at.b) {
    renderShot(ctx, film, at.a.index, at.a.local, time, W, H, res, opts);
  } else {
    const kind = film.shots[at.b.index].transition.kind;
    const p = clamp01(at.progress);
    const outLocal = Math.min(at.a.local, film.shots[at.a.index].duration - 1e-4);
    const A = scratch(W, H, 0);
    const B = scratch(W, H, 1);
    A.ctx.fillStyle = B.ctx.fillStyle = "#000";
    A.ctx.fillRect(0, 0, W, H);
    B.ctx.fillRect(0, 0, W, H);
    renderShot(A.ctx, film, at.a.index, outLocal, starts[at.a.index] + outLocal, W, H, res, opts);
    renderShot(B.ctx, film, at.b.index, at.b.local, starts[at.b.index] + at.b.local, W, H, res, opts);
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    if (kind === "dissolve") {
      ctx.drawImage(A.canvas, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(B.canvas, 0, 0);
      ctx.globalAlpha = 1;
    } else if (kind === "dip") {
      ctx.drawImage(p < 0.5 ? A.canvas : B.canvas, 0, 0);
      ctx.fillStyle = `rgba(0,0,0,${p < 0.5 ? p * 2 : (1 - p) * 2})`;
      ctx.fillRect(0, 0, W, H);
    } else if (kind === "slide") {
      ctx.drawImage(A.canvas, -e * W, 0);
      ctx.drawImage(B.canvas, (1 - e) * W, 0);
    } else if (kind === "wipe") {
      ctx.drawImage(A.canvas, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, e * W, H);
      ctx.clip();
      ctx.drawImage(B.canvas, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(p < 0.5 ? A.canvas : B.canvas, 0, 0);
    }
  }
  // Whole-frame grade (includes the product), then vignette, then the film's fades.
  if (!isNeutral(film.grade.frame)) {
    const img = ctx.getImageData(0, 0, W, H);
    applyColour(img.data, film.grade.frame);
    ctx.putImageData(img, 0, 0);
  }
  if (film.grade.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.hypot(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) * 0.58);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.75 * film.grade.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  let black = 0;
  if (film.fadeIn > 0 && time < film.fadeIn) black = Math.max(black, 1 - time / film.fadeIn);
  if (film.fadeOut > 0 && time > D - film.fadeOut) black = Math.max(black, (time - (D - film.fadeOut)) / film.fadeOut);
  if (black > 0) {
    ctx.fillStyle = `rgba(0,0,0,${clamp01(black)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

/** Media a film draws, to load (or check for) before playing or exporting. */
export function filmAssets(film: Film) {
  const images = new Set<string>();
  const videos = new Set<string>();
  for (const c of film.clips) {
    if (c.source.kind === "image") images.add(c.source.assetId);
    if (c.source.kind === "backdrop" && c.source.imageAssetId) images.add(c.source.imageAssetId);
    if (c.source.kind === "video") videos.add(c.source.mediaId);
  }
  return { images: [...images], videos: [...videos] };
}

/** Video clips playing at film time `t`, with the media time each needs (for decoding ahead of a frame). */
export function videoNeeds(film: Film, t: number): Array<{ mediaId: string; time: number }> {
  const time = frameTime(film, t);
  const at = shotsAt(film, time);
  const starts = shotStarts(film);
  const out: Array<{ mediaId: string; time: number }> = [];
  const shots = at.b ? [{ index: at.a.index, local: Math.min(at.a.local, film.shots[at.a.index].duration - 1e-4) }, at.b] : [at.a];
  for (const s of shots) {
    for (const a of activeClips(film, s.index, s.local, starts[s.index] + s.local).values()) {
      if (a.clip.source.kind === "video") out.push({ mediaId: a.clip.source.mediaId, time: a.clip.source.in + a.lt });
    }
  }
  return out;
}

export { transitionLength };
