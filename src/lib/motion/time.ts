/**
 * Time in Motion Studio: easing, keyframe interpolation and where shots and
 * clips sit on the film's clock. Pure functions, so the viewer, the timeline
 * and the exporter all agree on what happens at any time `t` (seconds).
 */

import { CAMERA_DEFAULTS, type CameraProp, type Clip, type ClipProp, type Ease, type Film, type Keyframe, type Shot } from "./model";

/* --------------------------------------------------------------- easing --- */

export const EASE_BEZIER: Record<Exclude<Ease, "custom">, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** Cubic-bezier easing as in CSS: control points (x1, y1), (x2, y2); x is time, y is progress. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton's method, then bisection if it doesn't settle.
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-7) return sampleY(s);
      const d = slopeX(s);
      if (Math.abs(d) < 1e-7) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(s);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

const curveCache = new Map<string, (x: number) => number>();
export function easeFn(k: Pick<Keyframe, "ease" | "bezier">): (x: number) => number {
  const pts = k.ease === "custom" && k.bezier ? k.bezier : EASE_BEZIER[k.ease === "custom" ? "linear" : k.ease];
  if (k.ease === "linear") return (x) => Math.min(1, Math.max(0, x));
  const key = pts.join(",");
  let fn = curveCache.get(key);
  if (!fn) {
    fn = cubicBezier(...pts);
    curveCache.set(key, fn);
  }
  return fn;
}

/** The bezier points an ease uses (for drawing and editing curves). */
export function bezierOf(k: Pick<Keyframe, "ease" | "bezier">): [number, number, number, number] {
  return k.ease === "custom" && k.bezier ? k.bezier : EASE_BEZIER[k.ease === "custom" ? "linear" : k.ease];
}

/* --------------------------------------------------------- interpolation --- */

/** Value of an animated property at keyframe time `t`; without keyframes, `base`. */
export function valueAt(keyframes: Keyframe[] | undefined, base: number, t: number): number {
  if (!keyframes || keyframes.length === 0) return base;
  if (t <= keyframes[0].t) return keyframes[0].v;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.t) return last.v;
  // Keyframe lists are short; a linear scan is fastest in practice.
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.v;
      const p = easeFn(a)((t - a.t) / span);
      return a.v + (b.v - a.v) * p;
    }
  }
  return last.v;
}

export function clipBase(clip: Clip, prop: ClipProp): number {
  switch (prop) {
    case "x":
    case "y":
    case "scale":
    case "rotation":
    case "opacity":
      return clip.transform[prop];
    case "blur":
      return clip.effects.blur;
    case "intensity":
      return clip.effects.intensity;
    case "lightX":
      return clip.transform.x;
    case "lightY":
      return clip.transform.y;
  }
}

/** A clip property at clip-relative time `local`. */
export function clipValue(clip: Clip, prop: ClipProp, local: number) {
  return valueAt(clip.keyframes[prop], clipBase(clip, prop), local);
}

export function cameraValue(shot: Shot, prop: CameraProp, local: number) {
  return valueAt(shot.camera[prop], CAMERA_DEFAULTS[prop], local);
}

/* ------------------------------------------------------------- the clock --- */

export function shotStarts(film: Pick<Film, "shots">): number[] {
  const out: number[] = [];
  let t = 0;
  for (const s of film.shots) {
    out.push(t);
    t += s.duration;
  }
  return out;
}

export function filmDuration(film: Pick<Film, "shots">) {
  return film.shots.reduce((sum, s) => sum + s.duration, 0);
}

export function shotStart(film: Pick<Film, "shots">, shotId: string) {
  let t = 0;
  for (const s of film.shots) {
    if (s.id === shotId) return t;
    t += s.duration;
  }
  return 0;
}

/** Where a clip sits on the film clock. */
export function clipRange(film: Pick<Film, "shots">, clip: Pick<Clip, "shotId" | "start" | "duration">) {
  const offset = clip.shotId ? shotStart(film, clip.shotId) : 0;
  return { start: offset + clip.start, end: offset + clip.start + clip.duration };
}

/** The shot playing at film time `t` (the last shot for t at or past the end). */
export function shotAt(film: Pick<Film, "shots">, t: number) {
  const starts = shotStarts(film);
  for (let i = film.shots.length - 1; i >= 0; i--) {
    if (t >= starts[i] - 1e-9) return { shot: film.shots[i], index: i, start: starts[i], local: t - starts[i] };
  }
  return { shot: film.shots[0], index: 0, start: 0, local: t };
}

/** Clamp a transition so it never takes more than half of either shot. */
export function transitionLength(film: Pick<Film, "shots">, index: number) {
  if (index <= 0) return 0;
  const shot = film.shots[index];
  if (shot.transition.kind === "cut") return 0;
  const prev = film.shots[index - 1];
  return Math.max(0, Math.min(shot.transition.duration, prev.duration / 2, shot.duration / 2));
}

/**
 * Which shot(s) to show at `t`. Transitions are centred on the cut: for half
 * the transition before and after it both shots are drawn, the outgoing one
 * holding its last moment and the incoming one its first.
 */
export function shotsAt(film: Pick<Film, "shots">, t: number): { a: { index: number; local: number }; b?: { index: number; local: number }; progress: number } {
  const starts = shotStarts(film);
  const cur = shotAt(film, t);
  // Near the start of the current shot: the transition into it.
  const inLen = transitionLength(film, cur.index);
  if (inLen > 0 && t - cur.start < inLen / 2) {
    const prev = cur.index - 1;
    const progress = (t - (cur.start - inLen / 2)) / inLen;
    return { a: { index: prev, local: t - starts[prev] }, b: { index: cur.index, local: Math.max(0, t - cur.start) }, progress };
  }
  // Near the end of the current shot: the transition out of it.
  const next = cur.index + 1;
  if (next < film.shots.length) {
    const outLen = transitionLength(film, next);
    const end = starts[next];
    if (outLen > 0 && end - t < outLen / 2) {
      const progress = (t - (end - outLen / 2)) / outLen;
      return { a: { index: cur.index, local: t - cur.start }, b: { index: next, local: 0 }, progress };
    }
  }
  return { a: { index: cur.index, local: t - cur.start }, progress: 0 };
}

/** Frame-exact times: snap a time to the film's frame grid. */
export function toFrame(t: number, fps: number) {
  return Math.round(t * fps) / fps;
}

/** Timecode as HH:MM:SS:FF (or MM:SS:FF under an hour). */
export function timecode(t: number, fps: number) {
  const total = Math.max(0, Math.round(t * fps));
  const f = total % fps;
  const s = Math.floor(total / fps);
  const pad = (v: number) => String(v).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${pad(h)}:` : ""}${pad(m)}:${pad(s % 60)}:${pad(f)}`;
}

/** Seconds with one decimal, for durations: "3.4s". */
export const secs = (t: number) => `${(Math.round(t * 10) / 10).toFixed(1)}s`;

/** Nearest snap target within `threshold` seconds, or the time itself. */
export function snapTime(t: number, targets: number[], threshold: number) {
  let best = t;
  let dist = threshold;
  for (const target of targets) {
    const d = Math.abs(target - t);
    if (d <= dist) {
      dist = d;
      best = target;
    }
  }
  return best;
}
