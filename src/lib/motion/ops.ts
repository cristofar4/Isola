/**
 * Editing operations on a film. Each takes a film and returns a new one (or
 * the same object when the edit isn't allowed), so the editor can keep
 * undo/redo history and the rules live in one place:
 *
 * - No clip or shot is ever shorter than MIN_CLIP / MIN_SHOT.
 * - Clips on the same track never overlap. A move that would overlap snaps
 *   to the nearest gap that fits, or is refused. Use another track to layer.
 * - A clip that belongs to a shot stays inside that shot.
 * - Trimming the start of a video or audio clip moves its source in-point,
 *   so the picture and sound stay where they were; keyframes keep their
 *   place on the film clock.
 * - Locked tracks can't be edited.
 */

import { MAX_FILM, MIN_CLIP, MIN_SHOT, newShot, newTrack, uid, type CameraProp, type Clip, type ClipProp, type Ease, type Film, type Keyframe, type Shot, type Track, type TransitionKind } from "./model";
import { cameraValue, clipRange, clipValue, filmDuration, shotAt, shotStart, valueAt } from "./time";

const EPS = 1e-6;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number) => Math.round(v * 1e6) / 1e6;

export type EditResult = { film: Film; problem?: string };

function trackOf(film: Film, id: string) {
  return film.tracks.find((t) => t.id === id) ?? null;
}

function locked(film: Film, clip: Clip) {
  return trackOf(film, clip.trackId)?.locked === true;
}

function mediaDuration(film: Film, clip: Clip) {
  if (clip.source.kind !== "video" && clip.source.kind !== "audio") return Infinity;
  const id = clip.source.mediaId;
  const m = film.media.find((x) => x.id === id);
  return m && m.duration > 0 ? m.duration : Infinity;
}

function shiftKeyframes(keyframes: Clip["keyframes"], by: number): Clip["keyframes"] {
  if (!by) return keyframes;
  const out: Clip["keyframes"] = {};
  for (const [p, list] of Object.entries(keyframes) as Array<[ClipProp, Keyframe[]]>) out[p] = list.map((k) => ({ ...k, t: round(k.t + by) }));
  return out;
}

function withClips(film: Film, clips: Clip[]): Film {
  return { ...film, clips };
}

function replaceClip(film: Film, next: Clip): Film {
  return withClips(
    film,
    film.clips.map((c) => (c.id === next.id ? next : c)),
  );
}

/** Ranges of the other clips on a track (absolute film time), sorted. */
function occupied(film: Film, trackId: string, except: Set<string>) {
  return film.clips
    .filter((c) => c.trackId === trackId && !except.has(c.id))
    .map((c) => clipRange(film, c))
    .sort((a, b) => a.start - b.start);
}

function overlaps(ranges: Array<{ start: number; end: number }>, start: number, end: number) {
  return ranges.some((r) => start < r.end - EPS && end > r.start + EPS);
}

/**
 * Find where a clip of `length` can go near `want` on a track, between `lo`
 * and `hi`, without overlapping `ranges`. Returns the start, or null.
 */
function fitNear(ranges: Array<{ start: number; end: number }>, want: number, length: number, lo: number, hi: number): number | null {
  const candidates = [clamp(want, lo, hi - length)];
  for (const r of ranges) {
    candidates.push(r.end, r.start - length);
  }
  let best: number | null = null;
  for (const c of candidates) {
    if (c < lo - EPS || c + length > hi + EPS) continue;
    if (overlaps(ranges, c, c + length)) continue;
    if (best === null || Math.abs(c - want) < Math.abs(best - want)) best = c;
  }
  return best === null ? null : round(clamp(best, lo, hi - length));
}

/* ------------------------------------------------------------------ clips --- */

export function addClip(film: Film, clip: Clip): EditResult {
  const track = trackOf(film, clip.trackId);
  if (!track) return { film, problem: "That track no longer exists." };
  if (track.locked) return { film, problem: `${track.name} is locked.` };
  if ((track.kind === "audio") !== (clip.source.kind === "audio")) return { film, problem: track.kind === "audio" ? "Only sound goes on audio tracks." : "Sound goes on an audio track." };
  const lo = clip.shotId ? shotStart(film, clip.shotId) : 0;
  const hi = clip.shotId ? lo + (film.shots.find((s) => s.id === clip.shotId)?.duration ?? 0) : MAX_FILM;
  const duration = Math.max(MIN_CLIP, Math.min(clip.duration, hi - lo));
  const start = fitNear(occupied(film, clip.trackId, new Set()), lo + clip.start, duration, lo, hi);
  if (start === null) return { film, problem: "There's no room on that track here. Add it on another track." };
  return { film: withClips(film, [...film.clips, { ...clip, start: round(start - lo), duration }]) };
}

/** Clips that ride along with a clip (its shadow). */
function companions(film: Film, id: string) {
  return film.clips.filter((c) => c.source.kind === "shadow" && c.source.targetClipId === id);
}

/**
 * Move a clip to `absStart` on `trackId`. A clip that belongs to a shot is
 * re-homed into the shot at that time; its shadow moves with it.
 */
export function moveClip(film: Film, clipId: string, trackId: string, absStart: number): EditResult {
  const clip = film.clips.find((c) => c.id === clipId);
  const track = trackOf(film, trackId);
  if (!clip || !track) return { film };
  if (locked(film, clip) || track.locked) return { film, problem: "Unlock the track to move clips on it." };
  if ((track.kind === "audio") !== (clip.source.kind === "audio")) return { film, problem: track.kind === "audio" ? "Only sound goes on audio tracks." : "Sound goes on an audio track." };
  const old = clipRange(film, clip);
  let shotId = clip.shotId;
  let lo = 0;
  let hi = MAX_FILM;
  if (clip.shotId) {
    const at = shotAt(film, clamp(absStart + EPS, 0, filmDuration(film) - EPS));
    shotId = at.shot.id;
    lo = at.start;
    hi = at.start + at.shot.duration;
    if (clip.duration > at.shot.duration + EPS) return { film, problem: `This clip is longer than ${at.shot.name}. Trim it first.` };
  }
  const start = fitNear(occupied(film, trackId, new Set([clip.id])), Math.max(0, absStart), clip.duration, lo, hi);
  if (start === null) return { film, problem: "There's no room on that track there." };
  const moved: Clip = { ...clip, trackId, shotId, start: round(start - lo) };
  let next = replaceClip(film, moved);
  // Shadows follow their product (same shot, same time shift) when there's room.
  const delta = start - old.start;
  for (const s of companions(film, clip.id)) {
    const r = clipRange(film, s);
    const want = r.start + delta;
    const sLo = shotId ? lo : 0;
    const sStart = fitNear(occupied(next, s.trackId, new Set([s.id])), want, s.duration, sLo, shotId ? hi : MAX_FILM);
    if (sStart !== null && !locked(next, s)) next = replaceClip(next, { ...s, shotId, start: round(sStart - sLo) });
  }
  return { film: next };
}

/** Trim a clip's start or end to absolute time `abs`. */
export function trimClip(film: Film, clipId: string, edge: "start" | "end", abs: number): EditResult {
  const clip = film.clips.find((c) => c.id === clipId);
  if (!clip) return { film };
  if (locked(film, clip)) return { film, problem: "Unlock the track to trim clips on it." };
  const range = clipRange(film, clip);
  const shotLo = clip.shotId ? shotStart(film, clip.shotId) : 0;
  const shotHi = clip.shotId ? shotLo + (film.shots.find((s) => s.id === clip.shotId)?.duration ?? 0) : MAX_FILM;
  const others = occupied(film, clip.trackId, new Set([clip.id]));
  if (edge === "start") {
    const prevEnd = Math.max(shotLo, ...others.filter((r) => r.end <= range.start + EPS).map((r) => r.end));
    const inPoint = clip.source.kind === "video" || clip.source.kind === "audio" ? clip.source.in : Infinity;
    const lo = Math.max(prevEnd, range.start - inPoint);
    const s = round(clamp(abs, lo, range.end - MIN_CLIP));
    const delta = s - range.start;
    if (Math.abs(delta) < EPS) return { film };
    const source = clip.source.kind === "video" || clip.source.kind === "audio" ? { ...clip.source, in: round(clip.source.in + delta) } : clip.source;
    const audio = clip.audio ? { ...clip.audio, fadeIn: Math.min(clip.audio.fadeIn, range.end - s) } : null;
    return { film: replaceClip(film, { ...clip, start: round(s - shotLo), duration: round(range.end - s), source, keyframes: shiftKeyframes(clip.keyframes, -delta), audio }) };
  }
  const nextStart = Math.min(shotHi, ...others.filter((r) => r.start >= range.end - EPS).map((r) => r.start));
  const inPoint = clip.source.kind === "video" || clip.source.kind === "audio" ? clip.source.in : 0;
  const hi = Math.min(nextStart, range.start + (mediaDuration(film, clip) - inPoint));
  const e = round(clamp(abs, range.start + MIN_CLIP, hi));
  if (Math.abs(e - range.end) < EPS) return { film };
  const audio = clip.audio ? { ...clip.audio, fadeOut: Math.min(clip.audio.fadeOut, e - range.start) } : null;
  return { film: replaceClip(film, { ...clip, duration: round(e - range.start), audio }) };
}

/** Change a clip's duration from its start (inspector field). */
export function setClipDuration(film: Film, clipId: string, duration: number): EditResult {
  const clip = film.clips.find((c) => c.id === clipId);
  if (!clip) return { film };
  return trimClip(film, clipId, "end", clipRange(film, clip).start + duration);
}

/**
 * Split a clip at absolute time `abs`. Both halves keep every keyframe (the
 * right half's shifted), so the animation plays exactly as before.
 */
export function splitClip(film: Film, clipId: string, abs: number): EditResult {
  const clip = film.clips.find((c) => c.id === clipId);
  if (!clip) return { film };
  if (locked(film, clip)) return { film, problem: "Unlock the track to split clips on it." };
  const range = clipRange(film, clip);
  if (abs <= range.start + MIN_CLIP - EPS || abs >= range.end - MIN_CLIP + EPS) return { film, problem: "Move the playhead inside the clip (not right at an edge) to split it." };
  const cut = round(abs - range.start);
  const left: Clip = { ...clip, duration: cut };
  const right: Clip = {
    ...clip,
    id: uid(),
    start: round(clip.start + cut),
    duration: round(clip.duration - cut),
    keyframes: shiftKeyframes(clip.keyframes, -cut),
    source: clip.source.kind === "video" || clip.source.kind === "audio" ? { ...clip.source, in: round(clip.source.in + cut) } : clip.source,
    link: clip.link ? { ...clip.link } : null,
  };
  if (clip.source.kind === "text") {
    left.source = { ...clip.source, anim: { ...clip.source.anim, out: { ...clip.source.anim.out, kind: "none" } } };
    right.source = { ...clip.source, anim: { ...clip.source.anim, in: { ...clip.source.anim.in, kind: "none" } } };
  }
  if (clip.audio) {
    left.audio = { ...clip.audio, fadeOut: 0 };
    right.audio = { ...clip.audio, fadeIn: 0 };
  }
  let clips = film.clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c]));
  // A shadow that covers the cut is split too, so each half of the product keeps its shadow.
  for (const s of companions(film, clip.id)) {
    const r = clipRange(film, s);
    if (abs <= r.start + MIN_CLIP || abs >= r.end - MIN_CLIP) continue;
    const sCut = round(abs - r.start);
    const sLeft: Clip = { ...s, duration: sCut };
    const sRight: Clip = { ...s, id: uid(), start: round(s.start + sCut), duration: round(s.duration - sCut), keyframes: shiftKeyframes(s.keyframes, -sCut), source: s.source.kind === "shadow" ? { ...s.source, targetClipId: right.id } : s.source };
    clips = clips.flatMap((c) => (c.id === s.id ? [sLeft, sRight] : [c]));
  }
  return { film: withClips(film, clips) };
}

/** Delete clips (and the shadows that belong to them). */
export function deleteClips(film: Film, ids: string[]): EditResult {
  const gone = new Set(ids.filter((id) => {
    const c = film.clips.find((x) => x.id === id);
    return c && !locked(film, c);
  }));
  if (!gone.size) return { film, problem: ids.length ? "Unlock the track to delete clips on it." : undefined };
  for (const id of [...gone]) companions(film, id).forEach((s) => gone.add(s.id));
  return { film: withClips(film, film.clips.filter((c) => !gone.has(c.id))) };
}

/** Copy a clip onto a new track just above its own, at the same time. */
export function duplicateClip(film: Film, clipId: string): EditResult {
  const clip = film.clips.find((c) => c.id === clipId);
  if (!clip) return { film };
  const track = trackOf(film, clip.trackId)!;
  const index = film.tracks.findIndex((t) => t.id === track.id);
  const copyTrack = newTrack(track.kind, `${track.name} copy`.slice(0, 40));
  const tracks = [...film.tracks.slice(0, index), copyTrack, ...film.tracks.slice(index)];
  const copy: Clip = { ...structuredClone(clip), id: uid(), trackId: copyTrack.id, name: `${clip.name} copy`.slice(0, 80), link: clip.link ? { ...clip.link } : null };
  return { film: { ...film, tracks, clips: [...film.clips, copy] } };
}

export function updateClip(film: Film, clipId: string, fn: (c: Clip) => Clip): EditResult {
  const clip = film.clips.find((c) => c.id === clipId);
  if (!clip) return { film };
  if (locked(film, clip)) return { film, problem: "Unlock the track to change clips on it." };
  return { film: replaceClip(film, fn(clip)) };
}

/* ---------------------------------------------------------------- keyframes --- */

/** Add or update the keyframe at `t` (within half a frame). */
export function upsertKeyframe(list: Keyframe[] | undefined, t: number, v: number, tolerance: number, ease: Ease = "ease-in-out"): Keyframe[] {
  const kfs = [...(list ?? [])];
  const hit = kfs.findIndex((k) => Math.abs(k.t - t) <= tolerance);
  if (hit >= 0) kfs[hit] = { ...kfs[hit], v };
  else kfs.push({ id: uid(), t: round(t), v, ease });
  return kfs.sort((a, b) => a.t - b.t);
}

/** Move a keyframe in time. Refused if another keyframe is already there. */
export function moveKeyframeIn(list: Keyframe[], id: string, t: number, tolerance: number): Keyframe[] {
  if (list.some((k) => k.id !== id && Math.abs(k.t - t) < tolerance)) return list;
  return list.map((k) => (k.id === id ? { ...k, t: round(t) } : k)).sort((a, b) => a.t - b.t);
}

export function editKeyframeIn(list: Keyframe[], id: string, patch: Partial<Omit<Keyframe, "id">>): Keyframe[] {
  return list.map((k) => (k.id === id ? { ...k, ...patch, ...(patch.ease && patch.ease !== "custom" ? { bezier: undefined } : {}) } : k)).sort((a, b) => a.t - b.t);
}

export type KeyTarget = { kind: "clip"; clipId: string; prop: ClipProp } | { kind: "camera"; shotId: string; prop: CameraProp };

function getList(film: Film, target: KeyTarget): Keyframe[] | undefined {
  if (target.kind === "clip") return film.clips.find((c) => c.id === target.clipId)?.keyframes[target.prop];
  return film.shots.find((s) => s.id === target.shotId)?.camera[target.prop];
}

function setList(film: Film, target: KeyTarget, list: Keyframe[]): Film {
  if (target.kind === "clip") {
    return {
      ...film,
      clips: film.clips.map((c) => {
        if (c.id !== target.clipId) return c;
        const keyframes = { ...c.keyframes };
        if (list.length) keyframes[target.prop] = list;
        else delete keyframes[target.prop];
        return { ...c, keyframes };
      }),
    };
  }
  return {
    ...film,
    shots: film.shots.map((s) => {
      if (s.id !== target.shotId) return s;
      const camera = { ...s.camera };
      if (list.length) camera[target.prop] = list;
      else delete camera[target.prop];
      return { ...s, camera };
    }),
  };
}

function targetLocked(film: Film, target: KeyTarget) {
  if (target.kind !== "clip") return false;
  const clip = film.clips.find((c) => c.id === target.clipId);
  return clip ? locked(film, clip) : true;
}

const halfFrame = (film: Film) => 0.5 / film.fps;

export function setKeyframe(film: Film, target: KeyTarget, t: number, v: number): EditResult {
  if (targetLocked(film, target)) return { film, problem: "Unlock the track to animate this clip." };
  return { film: setList(film, target, upsertKeyframe(getList(film, target), t, v, halfFrame(film))) };
}

export function moveKeyframe(film: Film, target: KeyTarget, id: string, t: number): EditResult {
  const list = getList(film, target);
  if (!list || targetLocked(film, target)) return { film };
  const next = moveKeyframeIn(list, id, t, halfFrame(film));
  return next === list ? { film, problem: "There's already a keyframe there." } : { film: setList(film, target, next) };
}

export function editKeyframe(film: Film, target: KeyTarget, id: string, patch: Partial<Omit<Keyframe, "id">>): EditResult {
  const list = getList(film, target);
  if (!list || targetLocked(film, target)) return { film };
  return { film: setList(film, target, editKeyframeIn(list, id, patch)) };
}

export function deleteKeyframe(film: Film, target: KeyTarget, id: string): EditResult {
  const list = getList(film, target);
  if (!list || targetLocked(film, target)) return { film };
  return { film: setList(film, target, list.filter((k) => k.id !== id)) };
}

/** Copy a keyframe (value and ease) to time `t`. */
export function duplicateKeyframe(film: Film, target: KeyTarget, id: string, t: number): EditResult {
  const list = getList(film, target);
  const k = list?.find((x) => x.id === id);
  if (!list || !k || targetLocked(film, target)) return { film };
  if (list.some((x) => Math.abs(x.t - t) < halfFrame(film))) return { film, problem: "There's already a keyframe there." };
  return { film: setList(film, target, [...list, { ...k, id: uid(), t: round(t) }].sort((a, b) => a.t - b.t)) };
}

/** Remove all keyframes of a property, keeping the value it has at `t` as the fixed value. */
export function clearKeyframes(film: Film, target: KeyTarget, t: number): EditResult {
  const list = getList(film, target);
  if (!list || targetLocked(film, target)) return { film };
  let next = setList(film, target, []);
  if (target.kind === "clip") {
    const v = valueAt(list, 0, t);
    next = {
      ...next,
      clips: next.clips.map((c) => {
        if (c.id !== target.clipId) return c;
        if (target.prop === "blur") return { ...c, effects: { ...c.effects, blur: v } };
        if (target.prop === "intensity") return { ...c, effects: { ...c.effects, intensity: v } };
        const key = target.prop === "lightX" ? "x" : target.prop === "lightY" ? "y" : target.prop;
        return { ...c, transform: { ...c.transform, [key]: v } };
      }),
    };
  }
  return { film: next };
}

/* ------------------------------------------------------------------ shots --- */

export function addShot(film: Film, afterIndex: number, duration = 3): EditResult {
  const shot = newShot(`Shot ${film.shots.length + 1}`, Math.max(MIN_SHOT, duration));
  const shots = [...film.shots.slice(0, afterIndex + 1), shot, ...film.shots.slice(afterIndex + 1)];
  return { film: { ...film, shots } };
}

/** Copy a shot and its clips (with their shadows re-linked to the copies). */
export function duplicateShot(film: Film, shotId: string): EditResult {
  const index = film.shots.findIndex((s) => s.id === shotId);
  if (index < 0) return { film };
  const shot = film.shots[index];
  const copy: Shot = { ...structuredClone(shot), id: uid(), name: `${shot.name} copy`.slice(0, 60) };
  const ids = new Map<string, string>();
  const own = film.clips.filter((c) => c.shotId === shotId);
  own.forEach((c) => ids.set(c.id, uid()));
  const copies = own.map((c) => {
    const cc: Clip = { ...structuredClone(c), id: ids.get(c.id)!, shotId: copy.id };
    if (cc.source.kind === "shadow") cc.source = { ...cc.source, targetClipId: ids.get(cc.source.targetClipId) ?? cc.source.targetClipId };
    return cc;
  });
  const shots = [...film.shots.slice(0, index + 1), copy, ...film.shots.slice(index + 1)];
  return { film: { ...film, shots, clips: [...film.clips, ...copies] } };
}

export function deleteShot(film: Film, shotId: string): EditResult {
  if (film.shots.length <= 1) return { film, problem: "A film needs at least one shot." };
  return { film: { ...film, shots: film.shots.filter((s) => s.id !== shotId), clips: film.clips.filter((c) => c.shotId !== shotId) } };
}

export function reorderShots(film: Film, from: number, to: number): EditResult {
  if (from === to || from < 0 || to < 0 || from >= film.shots.length || to >= film.shots.length) return { film };
  const shots = [...film.shots];
  const [s] = shots.splice(from, 1);
  shots.splice(to, 0, s);
  return { film: { ...film, shots } };
}

/**
 * Change a shot's length. Clips that run to the end of the shot stretch or
 * shrink with it; other clips are trimmed (or pulled in) so nothing sticks
 * out past the new end.
 */
export function setShotDuration(film: Film, shotId: string, duration: number): EditResult {
  const shot = film.shots.find((s) => s.id === shotId);
  if (!shot) return { film };
  const d = round(clamp(duration, MIN_SHOT, MAX_FILM));
  const old = shot.duration;
  const clips = film.clips.map((c) => {
    if (c.shotId !== shotId) return c;
    const end = c.start + c.duration;
    if (Math.abs(end - old) < 1e-3 && d > old) return { ...c, duration: round(d - c.start) };
    if (end <= d + EPS) return c;
    const duration2 = Math.max(MIN_CLIP, Math.min(c.duration, d));
    const start = Math.max(0, Math.min(c.start, d - duration2));
    return { ...c, start: round(start), duration: round(Math.min(duration2, d - start)) };
  });
  return { film: { ...film, shots: film.shots.map((s) => (s.id === shotId ? { ...s, duration: d } : s)), clips } };
}

export function setTransition(film: Film, shotId: string, kind: TransitionKind, duration: number): EditResult {
  return { film: { ...film, shots: film.shots.map((s) => (s.id === shotId ? { ...s, transition: { kind, duration: kind === "cut" ? 0 : round(clamp(duration, 0.05, 5)) } } : s)) } };
}

export function renameShot(film: Film, shotId: string, name: string): EditResult {
  return { film: { ...film, shots: film.shots.map((s) => (s.id === shotId ? { ...s, name: name.trim().slice(0, 60) || s.name } : s)) } };
}

/**
 * Make the whole film longer or shorter by `factor`: shots, the clips and
 * keyframes in them, transitions, markers and fades all scale together, so
 * the edit keeps its shape. Sound isn't stretched: audio clips keep their
 * length (their start moves with the picture) and video clips never run
 * past the end of their file.
 */
export function scaleFilm(film: Film, factor: number): EditResult {
  if (!(factor > 0) || Math.abs(factor - 1) < 1e-6) return { film };
  const total = filmDuration(film) * factor;
  if (total > MAX_FILM) return { film, problem: "A film can be up to 10 minutes long." };
  if (film.shots.some((s) => s.duration * factor < MIN_SHOT)) return { film, problem: "That's too short for these shots. Delete a shot or choose a longer length." };
  const k = (v: number) => round(v * factor);
  const keys = <P extends string>(map: Partial<Record<P, Keyframe[]>>) => {
    const out: Partial<Record<P, Keyframe[]>> = {};
    for (const [p, list] of Object.entries(map) as Array<[P, Keyframe[]]>) out[p] = list.map((kf) => ({ ...kf, t: k(kf.t) }));
    return out;
  };
  const shots = film.shots.map((s) => ({ ...s, duration: k(s.duration), transition: { ...s.transition, duration: s.transition.kind === "cut" ? 0 : round(clamp(s.transition.duration * factor, 0.05, 5)) }, camera: keys(s.camera) }));
  const clips = film.clips.map((c) => {
    const isSound = c.source.kind === "audio";
    if (isSound) return { ...c, start: k(c.start) };
    let duration = Math.max(MIN_CLIP, k(c.duration));
    if (c.source.kind === "video") {
      const media = film.media.find((m) => c.source.kind === "video" && m.id === c.source.mediaId);
      if (media && media.duration > 0) duration = Math.max(MIN_CLIP, Math.min(duration, media.duration - c.source.in));
    }
    return { ...c, start: k(c.start), duration, keyframes: keys(c.keyframes) };
  });
  return {
    film: { ...film, shots, clips, markers: film.markers.map((m) => ({ ...m, t: k(m.t) })), fadeIn: round(clamp(film.fadeIn * factor, 0, 10)), fadeOut: round(clamp(film.fadeOut * factor, 0, 10)) },
  };
}

/** Use one transition between every pair of shots. */
export function setAllTransitions(film: Film, kind: TransitionKind, duration = 0.8): EditResult {
  return { film: { ...film, shots: film.shots.map((s, i) => (i === 0 ? s : { ...s, transition: { kind, duration: kind === "cut" ? 0 : round(clamp(duration, 0.05, 5)) } })) } };
}

/** Pin a clip where it is at a film time: keyframes on its position and scale (or a light's, or a shadow's opacity). */
export function addTransformKeyframes(film: Film, clipId: string, abs: number): EditResult {
  const clip = film.clips.find((c) => c.id === clipId);
  if (!clip || clip.source.kind === "audio") return { film, problem: "Sound has no position to keyframe. Select a visual clip." };
  if (locked(film, clip)) return { film, problem: "Unlock the track to animate this clip." };
  const r = clipRange(film, clip);
  if (abs < r.start - 1e-6 || abs > r.end + 1e-6) return { film, problem: "Move the playhead over the selected clip to add keyframes." };
  const t = clamp(abs - r.start, 0, clip.duration);
  const props: ClipProp[] = clip.source.kind === "light" ? ["lightX", "lightY", "scale"] : clip.source.kind === "shadow" || clip.source.kind === "solid" ? ["opacity"] : ["x", "y", "scale"];
  let next = film;
  for (const prop of props) next = setList(next, { kind: "clip", clipId, prop }, upsertKeyframe(clip.keyframes[prop], t, clipValue(clip, prop, t), halfFrame(film)));
  return { film: next };
}

/** Pin the scene camera where it is at a time in a shot: keyframes on zoom and pan. */
export function addCameraKeyframes(film: Film, shotId: string, local: number): EditResult {
  const shot = film.shots.find((s) => s.id === shotId);
  if (!shot) return { film, problem: "That shot no longer exists." };
  const t = clamp(local, 0, shot.duration);
  let next = film;
  for (const prop of ["zoom", "panX", "panY"] as CameraProp[]) next = setList(next, { kind: "camera", shotId, prop }, upsertKeyframe(shot.camera[prop], t, cameraValue(shot, prop, t), halfFrame(film)));
  return { film: next };
}

/* ----------------------------------------------------------- quick motion --- */

/**
 * One-step camera moves for a shot. Each is ordinary camera keyframes (at the
 * shot's start and end), so they show on the timeline and stay editable in
 * Keyframes. Pans keep a little zoom so the edges of the set never show.
 */
export type CameraMove = "none" | "push-in" | "pull-out" | "pan-left" | "pan-right" | "rise" | "drift";
export const CAMERA_MOVES: CameraMove[] = ["none", "push-in", "pull-out", "pan-left", "pan-right", "rise", "drift"];
export const CAMERA_MOVE_LABEL: Record<CameraMove | "custom", string> = {
  none: "None (locked off)",
  "push-in": "Push in",
  "pull-out": "Pull out",
  "pan-left": "Pan left",
  "pan-right": "Pan right",
  rise: "Rise",
  drift: "Drift",
  custom: "Custom keyframes",
};

const PUSH = 0.3;
const PAN_ZOOM = 0.12;
const PAN = 0.045;
const DRIFT = { from: 0.06, to: 0.14, pan: 0.025 };

/** Start and end camera values of a move at an intensity of 0–1. */
function moveValues(move: CameraMove, i: number): Array<[CameraProp, number, number]> {
  switch (move) {
    case "push-in":
      return [["zoom", 1, 1 + PUSH * i]];
    case "pull-out":
      return [["zoom", 1 + PUSH * i, 1]];
    case "pan-left":
      return [["zoom", 1 + PAN_ZOOM * i, 1 + PAN_ZOOM * i], ["panX", PAN * i, -PAN * i]];
    case "pan-right":
      return [["zoom", 1 + PAN_ZOOM * i, 1 + PAN_ZOOM * i], ["panX", -PAN * i, PAN * i]];
    case "rise":
      return [["zoom", 1 + PAN_ZOOM * i, 1 + PAN_ZOOM * i], ["panY", PAN * i, -PAN * i]];
    case "drift":
      return [["zoom", 1 + DRIFT.from * i, 1 + DRIFT.to * i], ["panX", -DRIFT.pan * i, DRIFT.pan * i]];
    default:
      return [];
  }
}

export function cameraMoveKeys(duration: number, move: CameraMove, intensity: number, ease: Ease = "ease-in-out"): Shot["camera"] {
  const i = clamp(intensity, 0.05, 1);
  const out: Shot["camera"] = {};
  for (const [prop, a, b] of moveValues(move, i)) out[prop] = [{ id: uid(), t: 0, v: round(a), ease }, { id: uid(), t: round(duration), v: round(b), ease }];
  return out;
}

/** Replace a shot's camera animation with a move. */
export function applyCameraMove(film: Film, shotId: string, move: CameraMove, intensity: number, ease: Ease = "ease-in-out"): EditResult {
  const shot = film.shots.find((s) => s.id === shotId);
  if (!shot) return { film, problem: "That shot no longer exists." };
  return { film: { ...film, shots: film.shots.map((s) => (s.id === shotId ? { ...s, camera: cameraMoveKeys(s.duration, move, intensity, ease === "custom" ? "ease-in-out" : ease) } : s)) } };
}

/** Which move a shot's camera keyframes are (so the control shows what's really there), or "custom". */
export function describeCameraMove(shot: Shot): { move: CameraMove | "custom"; intensity: number; ease: Ease } {
  const lists = (Object.entries(shot.camera) as Array<[CameraProp, Keyframe[] | undefined]>).filter(([, list]) => list && list.length) as Array<[CameraProp, Keyframe[]]>;
  if (!lists.length) return { move: "none", intensity: 0.4, ease: "ease-in-out" };
  const custom = { move: "custom" as const, intensity: 0.4, ease: lists[0][1][0].ease };
  const near = (a: number, b: number) => Math.abs(a - b) < 2e-3;
  if (lists.some(([, list]) => list.length !== 2 || !near(list[0].t, 0) || !near(list[1].t, shot.duration))) return custom;
  const ease = lists[0][1][0].ease;
  const ends = new Map(lists.map(([prop, list]) => [prop, [list[0].v, list[1].v] as const]));
  for (const move of CAMERA_MOVES.slice(1)) {
    const shape = moveValues(move, 1);
    if (shape.length !== ends.size || shape.some(([prop]) => !ends.has(prop))) continue;
    // The intensity that would give this zoom (or pan), then check every value against it.
    const [zProp, z0, z1] = shape[0];
    const got = ends.get(zProp)!;
    const span = Math.max(Math.abs(z0 - 1), Math.abs(z1 - 1));
    const i = Math.max(Math.abs(got[0] - 1), Math.abs(got[1] - 1)) / span;
    if (!(i > 0.01 && i < 1.01)) continue;
    if (moveValues(move, i).every(([prop, a, b]) => near(ends.get(prop)![0], a) && near(ends.get(prop)![1], b))) return { move, intensity: Math.round(clamp(i, 0.05, 1) * 100) / 100, ease };
  }
  return custom;
}

/** The light sweeps that run in a shot. */
export function shotSweeps(film: Film, shotId: string) {
  return film.clips.filter((c) => c.shotId === shotId && c.source.kind === "light" && c.source.style === "sweep");
}

/** Add a band of light that crosses the frame over a shot (its own overlay clip, keyframed), or remove the shot's sweeps. */
export function setLightSweep(film: Film, shotId: string, on: boolean): EditResult {
  const shot = film.shots.find((s) => s.id === shotId);
  if (!shot) return { film, problem: "That shot no longer exists." };
  const existing = shotSweeps(film, shotId);
  if (!on) {
    if (existing.some((c) => trackOf(film, c.trackId)?.locked)) return { film, problem: "Unlock the lighting track to remove the sweep." };
    const gone = new Set(existing.map((c) => c.id));
    return { film: withClips(film, film.clips.filter((c) => !gone.has(c.id))) };
  }
  if (existing.length) return { film };
  const make = (trackId: string): Clip => ({
    id: uid(),
    trackId,
    shotId,
    start: 0,
    duration: shot.duration,
    source: { kind: "light", style: "sweep", color: "#FFF1DC" },
    name: "Light sweep",
    role: "overlay",
    depth: 0,
    transform: { x: 0.5, y: 0.5, scale: 0.5, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 },
    keyframes: { lightX: [{ id: uid(), t: 0, v: -0.25, ease: "ease-in-out" }, { id: uid(), t: round(shot.duration), v: 1.25, ease: "ease-in-out" }] },
    effects: { blur: 0, intensity: 0.8 },
    grade: null,
    audio: null,
    link: null,
  });
  // An unlocked lighting track with the whole shot free, or a new one in front.
  for (const t of film.tracks.filter((x) => x.kind === "visual" && !x.locked && /^light/i.test(x.name))) {
    const r = addClip(film, make(t.id));
    const added = r.film.clips.at(-1);
    if (!r.problem && added && added.start < 1e-6 && Math.abs(added.duration - shot.duration) < 1e-6) return r;
  }
  const track = newTrack("visual", "Lighting");
  return addClip({ ...film, tracks: [track, ...film.tracks] }, make(track.id));
}

/* ----------------------------------------------------------------- tracks --- */

export function addTrack(film: Film, kind: Track["kind"], name?: string): EditResult {
  const count = film.tracks.filter((t) => t.kind === kind).length + 1;
  const track = newTrack(kind, name ?? (kind === "audio" ? `Audio ${count}` : `Video ${count}`));
  // New visual tracks go on top (in front); audio tracks at the bottom.
  const tracks = kind === "visual" ? [track, ...film.tracks] : [...film.tracks, track];
  return { film: { ...film, tracks } };
}

/** Move a track to a new position (visual tracks stay above audio tracks). */
export function moveTrack(film: Film, trackId: string, to: number): EditResult {
  const from = film.tracks.findIndex((t) => t.id === trackId);
  if (from < 0) return { film };
  const tracks = [...film.tracks];
  const [t] = tracks.splice(from, 1);
  tracks.splice(clamp(to, 0, tracks.length), 0, t);
  const firstAudio = tracks.findIndex((x) => x.kind === "audio");
  const lastVisual = tracks.map((x) => x.kind).lastIndexOf("visual");
  if (firstAudio >= 0 && lastVisual > firstAudio) return { film, problem: "Video tracks stay above audio tracks." };
  return { film: { ...film, tracks } };
}

export function setTrack(film: Film, trackId: string, patch: Partial<Pick<Track, "hidden" | "locked" | "muted" | "solo" | "name">>): EditResult {
  return { film: { ...film, tracks: film.tracks.map((t) => (t.id === trackId ? { ...t, ...patch, name: patch.name !== undefined ? patch.name.trim().slice(0, 40) || t.name : t.name } : t)) } };
}

export function deleteTrack(film: Film, trackId: string): EditResult {
  const track = trackOf(film, trackId);
  if (!track) return { film };
  if (track.locked) return { film, problem: `${track.name} is locked.` };
  if (track.kind === "visual" && film.tracks.filter((t) => t.kind === "visual").length <= 1) return { film, problem: "A film needs at least one video track." };
  return { film: { ...film, tracks: film.tracks.filter((t) => t.id !== trackId), clips: film.clips.filter((c) => c.trackId !== trackId) } };
}

/* ---------------------------------------------------------------- markers --- */

export function addMarker(film: Film, t: number, label = "Marker"): EditResult {
  return { film: { ...film, markers: [...film.markers, { id: uid(), t: round(clamp(t, 0, filmDuration(film))), label: label.slice(0, 40) }].sort((a, b) => a.t - b.t) } };
}

export function moveMarker(film: Film, id: string, t: number): EditResult {
  return { film: { ...film, markers: film.markers.map((m) => (m.id === id ? { ...m, t: round(clamp(t, 0, filmDuration(film))) } : m)).sort((a, b) => a.t - b.t) } };
}

export function renameMarker(film: Film, id: string, label: string): EditResult {
  return { film: { ...film, markers: film.markers.map((m) => (m.id === id ? { ...m, label: label.trim().slice(0, 40) || m.label } : m)) } };
}

export function deleteMarker(film: Film, id: string): EditResult {
  return { film: { ...film, markers: film.markers.filter((m) => m.id !== id) } };
}

/* -------------------------------------------------------------- validation --- */

/** Problems that would make playback or export wrong. An empty list means the timing is valid. */
export function validateFilm(film: Film): string[] {
  const problems: string[] = [];
  const total = filmDuration(film);
  if (!film.shots.length) problems.push("The film has no shots.");
  for (const s of film.shots) if (!(s.duration >= MIN_SHOT - EPS)) problems.push(`${s.name} is too short.`);
  const byTrack = new Map<string, Array<{ start: number; end: number; name: string }>>();
  for (const c of film.clips) {
    if (!(c.duration >= MIN_CLIP - EPS)) problems.push(`${c.name} has an invalid duration.`);
    if (c.start < -EPS) problems.push(`${c.name} starts before its shot.`);
    if (c.shotId) {
      const shot = film.shots.find((s) => s.id === c.shotId);
      if (!shot) problems.push(`${c.name} belongs to a shot that no longer exists.`);
      else if (c.start + c.duration > shot.duration + 1e-3) problems.push(`${c.name} runs past the end of ${shot.name}.`);
    }
    const r = clipRange(film, c);
    const list = byTrack.get(c.trackId) ?? [];
    list.push({ ...r, name: c.name });
    byTrack.set(c.trackId, list);
    for (const list2 of Object.values(c.keyframes)) for (const k of list2 ?? []) if (!Number.isFinite(k.t) || !Number.isFinite(k.v)) problems.push(`${c.name} has a broken keyframe.`);
  }
  for (const list of byTrack.values()) {
    list.sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) if (list[i].start < list[i - 1].end - 1e-3) problems.push(`${list[i - 1].name} and ${list[i].name} overlap on the same track.`);
  }
  if (total > MAX_FILM) problems.push("The film is longer than 10 minutes.");
  return problems;
}
