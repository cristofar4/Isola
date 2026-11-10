/**
 * Motion Studio's project ("film"). One model drives the storyboard, the
 * timeline, the viewer and the export:
 *
 * - `shots` play one after another; their order is the storyboard order and
 *   their durations add up to the film's length.
 * - `clips` sit on `tracks`. A visual clip normally belongs to a shot and its
 *   `start` is relative to that shot, so reordering shots carries their clips
 *   along. Clips with `shotId: null` are placed in absolute film time (music,
 *   a logo across the whole film).
 * - Keyframe times are relative to the clip's start.
 * - Positions are fractions of the frame and sizes fractions of its short side,
 *   so changing the aspect ratio never breaks the layout.
 *
 * Bump FILM_VERSION and extend `migrateFilm` whenever the stored shape changes.
 */

import { type BackdropId, type SceneFormatId, type TextStyle, sanitiseText, backdropInfo, clamp } from "@/lib/scene/model";

export const FILM_VERSION = 1;

export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";
export const ASPECTS: Record<Aspect, { label: string; width: number; height: number }> = {
  "16:9": { label: "Landscape 16:9", width: 1920, height: 1080 },
  "9:16": { label: "Portrait 9:16", width: 1080, height: 1920 },
  "1:1": { label: "Square 1:1", width: 1080, height: 1080 },
  "4:5": { label: "Portrait 4:5", width: 1080, height: 1350 },
};
export const ASPECT_ORDER: Aspect[] = ["16:9", "9:16", "1:1", "4:5"];
export const FRAME_RATES = [24, 25, 30, 60] as const;
export type FrameRate = (typeof FRAME_RATES)[number];

export const MIN_SHOT = 0.2;
export const MIN_CLIP = 0.1;
export const MAX_FILM = 600;

export type Ease = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "custom";
export const EASE_LABEL: Record<Ease, string> = { linear: "Linear", "ease-in": "Ease in", "ease-out": "Ease out", "ease-in-out": "Ease in/out", custom: "Custom curve" };

/** A keyframe: value `v` at clip-relative time `t`. `ease` shapes the curve from this keyframe to the next. */
export interface Keyframe {
  id: string;
  t: number;
  v: number;
  ease: Ease;
  /** Cubic-bezier control points (x1, y1, x2, y2) when ease is "custom". */
  bezier?: [number, number, number, number];
}

export type ClipProp = "x" | "y" | "scale" | "rotation" | "opacity" | "blur" | "intensity" | "lightX" | "lightY";
export type CameraProp = "zoom" | "panX" | "panY" | "rotate";
export const CAMERA_DEFAULTS: Record<CameraProp, number> = { zoom: 1, panX: 0, panY: 0, rotate: 0 };

export interface Transform {
  x: number;
  y: number;
  /** Height as a fraction of the frame's short side (backdrops: 1 fills the frame). */
  scale: number;
  rotation: number;
  opacity: number;
  /** Anchor inside the layer (0..1). Scale and rotation happen around it. */
  anchorX: number;
  anchorY: number;
}

export interface ColourAdjust {
  /** Stops, −2..2. */
  exposure: number;
  /** −1..1 for the rest. */
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
}
export const NEUTRAL: ColourAdjust = { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 };

export type TextAnimKind = "none" | "fade" | "slide" | "reveal" | "stagger";
export const TEXT_ANIM_LABEL: Record<TextAnimKind, string> = { none: "None", fade: "Fade", slide: "Slide up", reveal: "Reveal (wipe)", stagger: "Stagger" };
export interface TextAnimation {
  in: { kind: TextAnimKind; duration: number };
  out: { kind: TextAnimKind; duration: number };
  /** For stagger: animate word by word or letter by letter. */
  by: "word" | "letter";
}
export const DEFAULT_TEXT_ANIM: TextAnimation = { in: { kind: "fade", duration: 0.8 }, out: { kind: "none", duration: 0.5 }, by: "word" };

export type LightStyle = "spotlight" | "sweep" | "glow";

export type ClipSource =
  | { kind: "backdrop"; backdrop: BackdropId | null; imageAssetId: string | null; tint: string | null }
  | { kind: "image"; assetId: string; aspect: number }
  | { kind: "video"; mediaId: string; in: number; aspect: number }
  | { kind: "audio"; mediaId: string; in: number }
  | { kind: "shadow"; targetClipId: string; softness: number; direction: number; length: number }
  | { kind: "text"; style: TextStyle; anim: TextAnimation }
  | { kind: "light"; style: LightStyle; color: string }
  | { kind: "solid"; color: string };
export type SourceKind = ClipSource["kind"];

/** What a clip is for. Background colour grades and parallax depth treat roles differently. */
export type ClipRole = "background" | "product" | "overlay" | "audio";

export interface AudioSettings {
  /** dB, −60..12. */
  gain: number;
  fadeIn: number;
  fadeOut: number;
}

/** Where a clip came from in Scene Studio, and the layer as it was when last brought in. */
export interface SceneLink {
  sceneId: string;
  layerId: string;
  detached: boolean;
  /** The scene layer (JSON) at import or last update, to spot what changed since. */
  imported: Record<string, unknown>;
  /** This clip's own placement and look when it was linked, to tell video edits made here from scene changes. */
  made: Record<string, unknown>;
}

export interface Clip {
  id: string;
  name: string;
  trackId: string;
  shotId: string | null;
  start: number;
  duration: number;
  source: ClipSource;
  role: ClipRole;
  transform: Transform;
  keyframes: Partial<Record<ClipProp, Keyframe[]>>;
  /** How much the scene camera moves this layer: 1 moves with the scene, 0 stays fixed on screen, in between for parallax. */
  depth: number;
  /** Base values of animatable effects: blur in % of the short side, light intensity 0..1. */
  effects: { blur: number; intensity: number };
  grade: ColourAdjust | null;
  audio: AudioSettings | null;
  link: SceneLink | null;
}

export type TransitionKind = "cut" | "dissolve" | "dip" | "slide" | "wipe";
export const TRANSITION_LABEL: Record<TransitionKind, string> = { cut: "Cut", dissolve: "Dissolve", dip: "Dip to black", slide: "Slide", wipe: "Wipe" };

export interface Shot {
  id: string;
  name: string;
  duration: number;
  /** How this shot comes in from the previous one (ignored on the first shot). Centred on the cut. */
  transition: { kind: TransitionKind; duration: number };
  /** Whole-scene camera keyframes, relative to the shot start. */
  camera: Partial<Record<CameraProp, Keyframe[]>>;
}

export interface Track {
  id: string;
  kind: "visual" | "audio";
  name: string;
  hidden: boolean;
  locked: boolean;
  muted: boolean;
  solo: boolean;
}

export interface Marker {
  id: string;
  t: number;
  label: string;
}

export interface MediaItem {
  id: string;
  kind: "video" | "audio";
  name: string;
  mime: string;
  bytes: number;
  duration: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  /** Waveform peaks (0..1), about 1,000 points across the whole file. */
  peaks: number[] | null;
  createdAt: number;
}

export type ExportContainer = "mp4" | "webm";
export type ExportQuality = "standard" | "high" | "max";
export type ExportResolution = 720 | 1080 | 2160;
export interface ExportSettings {
  container: ExportContainer;
  quality: ExportQuality;
  resolution: ExportResolution;
  includeAudio: boolean;
  fileName: string;
}

export interface Grade {
  /** Whole frame, product included. */
  frame: ColourAdjust;
  /** Background layers only (backdrops, background images and video): the product is untouched. */
  background: ColourAdjust;
  /** 0..1, darkened corners on the whole frame. */
  vignette: number;
}

export interface Film {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
  aspect: Aspect;
  fps: FrameRate;
  shots: Shot[];
  /** Top of the list is in front. */
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
  media: MediaItem[];
  grade: Grade;
  /** dB. */
  masterGain: number;
  /** Fade from black at the start and to black at the end, in seconds. */
  fadeIn: number;
  fadeOut: number;
  export: ExportSettings;
  source: { sceneId: string; sceneName: string; revision: number; format: SceneFormatId } | null;
  /** The motion style last applied (built-in kit id or saved style id). */
  styleId: string | null;
}

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);

export const defaultTransform = (over: Partial<Transform> = {}): Transform => ({ x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5, ...over });

export function newTrack(kind: Track["kind"], name: string): Track {
  return { id: uid(), kind, name, hidden: false, locked: false, muted: false, solo: false };
}

export function newShot(name: string, duration = 4): Shot {
  return { id: uid(), name, duration, transition: { kind: "cut", duration: 0 }, camera: {} };
}

export function newClip(fields: Pick<Clip, "trackId" | "shotId" | "start" | "duration" | "source" | "name"> & Partial<Clip>): Clip {
  const role: ClipRole = fields.role ?? (fields.source.kind === "audio" ? "audio" : fields.source.kind === "backdrop" ? "background" : fields.source.kind === "image" || fields.source.kind === "shadow" ? "product" : "overlay");
  return {
    id: uid(),
    transform: defaultTransform(),
    keyframes: {},
    depth: role === "overlay" ? 0 : 1,
    effects: { blur: 0, intensity: 1 },
    grade: null,
    audio: fields.source.kind === "audio" ? { gain: 0, fadeIn: 0, fadeOut: 0 } : null,
    link: null,
    ...fields,
    role,
  };
}

export const DEFAULT_EXPORT: ExportSettings = { container: "mp4", quality: "high", resolution: 1080, includeAudio: true, fileName: "" };

export function emptyFilm(name = "Untitled film", aspect: Aspect = "16:9"): Film {
  const now = Date.now();
  const shot = newShot("Shot 1", 5);
  return {
    version: FILM_VERSION,
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
    aspect,
    fps: 30,
    shots: [shot],
    tracks: [newTrack("visual", "Typography"), newTrack("visual", "Product"), newTrack("visual", "Backdrop"), newTrack("audio", "Music")],
    clips: [],
    markers: [],
    media: [],
    grade: { frame: { ...NEUTRAL }, background: { ...NEUTRAL }, vignette: 0 },
    masterGain: 0,
    fadeIn: 0,
    fadeOut: 0,
    export: { ...DEFAULT_EXPORT },
    source: null,
    styleId: null,
  };
}

/* ------------------------------------------------------------- migration --- */

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const n = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity) => (isNum(v) ? clamp(v, lo, hi) : fallback);
const str = (v: unknown, fallback: string, max = 200) => (typeof v === "string" ? v.slice(0, max) : fallback);
const HEX = /^#[0-9a-f]{6}$/i;
const EASES: Ease[] = ["linear", "ease-in", "ease-out", "ease-in-out", "custom"];
const CLIP_PROPS: ClipProp[] = ["x", "y", "scale", "rotation", "opacity", "blur", "intensity", "lightX", "lightY"];
const CAMERA_PROPS: CameraProp[] = ["zoom", "panX", "panY", "rotate"];
const TRANSITIONS: TransitionKind[] = ["cut", "dissolve", "dip", "slide", "wipe"];
const ANIMS: TextAnimKind[] = ["none", "fade", "slide", "reveal", "stagger"];

function migrateKeyframes<P extends string>(raw: unknown, props: P[]): Partial<Record<P, Keyframe[]>> {
  const out: Partial<Record<P, Keyframe[]>> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const p of props) {
    const list = (raw as Record<string, unknown>)[p];
    if (!Array.isArray(list)) continue;
    const kfs = list
      .filter((k): k is Keyframe => !!k && typeof k === "object" && isNum((k as Keyframe).t) && isNum((k as Keyframe).v))
      .map((k) => {
        const ease = EASES.includes(k.ease) ? k.ease : "linear";
        const bezier = ease === "custom" && Array.isArray(k.bezier) && k.bezier.length === 4 && k.bezier.every(isNum) ? ([clamp(k.bezier[0], 0, 1), k.bezier[1], clamp(k.bezier[2], 0, 1), k.bezier[3]] as Keyframe["bezier"]) : undefined;
        return { id: str(k.id, uid(), 80), t: clamp(k.t, -MAX_FILM, MAX_FILM), v: k.v, ease: bezier || ease !== "custom" ? ease : "linear", ...(bezier ? { bezier } : {}) };
      })
      .sort((a, b) => a.t - b.t);
    if (kfs.length) out[p] = kfs;
  }
  return out;
}

function migrateAdjust(raw: unknown): ColourAdjust {
  const r = (raw ?? {}) as Partial<ColourAdjust>;
  return {
    exposure: n(r.exposure, 0, -2, 2),
    contrast: n(r.contrast, 0, -1, 1),
    saturation: n(r.saturation, 0, -1, 1),
    temperature: n(r.temperature, 0, -1, 1),
    tint: n(r.tint, 0, -1, 1),
    highlights: n(r.highlights, 0, -1, 1),
    shadows: n(r.shadows, 0, -1, 1),
  };
}

function migrateSource(raw: unknown): ClipSource | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  switch (s.kind) {
    case "backdrop":
      return { kind: "backdrop", backdrop: backdropInfo(s.backdrop as BackdropId)?.id ?? null, imageAssetId: typeof s.imageAssetId === "string" ? s.imageAssetId : null, tint: typeof s.tint === "string" && HEX.test(s.tint) ? s.tint : null };
    case "image":
      return typeof s.assetId === "string" ? { kind: "image", assetId: s.assetId, aspect: n(s.aspect, 1, 0.05, 20) } : null;
    case "video":
      return typeof s.mediaId === "string" ? { kind: "video", mediaId: s.mediaId, in: n(s.in, 0, 0, 1e6), aspect: n(s.aspect, 16 / 9, 0.05, 20) } : null;
    case "audio":
      return typeof s.mediaId === "string" ? { kind: "audio", mediaId: s.mediaId, in: n(s.in, 0, 0, 1e6) } : null;
    case "shadow":
      return typeof s.targetClipId === "string" ? { kind: "shadow", targetClipId: s.targetClipId, softness: n(s.softness, 0.45, 0, 1), direction: n(s.direction, 45, -180, 180), length: n(s.length, 0.25, 0, 1.5) } : null;
    case "text": {
      const a = (s.anim ?? {}) as Partial<TextAnimation>;
      const phase = (p: unknown, fallback: TextAnimation["in"]) => {
        const r = (p ?? {}) as Partial<TextAnimation["in"]>;
        return { kind: ANIMS.includes(r.kind as TextAnimKind) ? (r.kind as TextAnimKind) : fallback.kind, duration: n(r.duration, fallback.duration, 0, 10) };
      };
      return { kind: "text", style: sanitiseText((s.style ?? {}) as Partial<TextStyle>), anim: { in: phase(a.in, DEFAULT_TEXT_ANIM.in), out: phase(a.out, DEFAULT_TEXT_ANIM.out), by: a.by === "letter" ? "letter" : "word" } };
    }
    case "light":
      return { kind: "light", style: s.style === "sweep" || s.style === "glow" ? s.style : "spotlight", color: typeof s.color === "string" && HEX.test(s.color) ? s.color : "#FFF1DC" };
    case "solid":
      return { kind: "solid", color: typeof s.color === "string" && HEX.test(s.color) ? s.color : "#20292D" };
    default:
      return null;
  }
}

/**
 * Turns stored (or older) data into a valid film: unknown fields are dropped,
 * numbers are clamped, clips pointing at missing tracks or shots are removed,
 * and there is always at least one shot.
 */
export function migrateFilm(raw: unknown): Film | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Film> & Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  // (Version 1 is the first stored shape; future versions convert older data here before the checks below.)
  const shots: Shot[] = (Array.isArray(r.shots) ? r.shots : [])
    .filter((s): s is Shot => !!s && typeof s === "object" && typeof (s as Shot).id === "string")
    .map((s, i) => ({
      id: s.id,
      name: str(s.name, `Shot ${i + 1}`, 60),
      duration: n(s.duration, 4, MIN_SHOT, MAX_FILM),
      transition: { kind: TRANSITIONS.includes(s.transition?.kind) ? s.transition.kind : "cut", duration: n(s.transition?.duration, 0, 0, 5) },
      camera: migrateKeyframes(s.camera, CAMERA_PROPS),
    }));
  if (!shots.length) shots.push(newShot("Shot 1", 5));
  const tracks: Track[] = (Array.isArray(r.tracks) ? r.tracks : [])
    .filter((t): t is Track => !!t && typeof t === "object" && typeof (t as Track).id === "string")
    .map((t) => ({ id: t.id, kind: t.kind === "audio" ? "audio" : "visual", name: str(t.name, t.kind === "audio" ? "Audio" : "Video", 40), hidden: t.hidden === true, locked: t.locked === true, muted: t.muted === true, solo: t.solo === true }));
  if (!tracks.some((t) => t.kind === "visual")) tracks.unshift(newTrack("visual", "Video"));
  const media: MediaItem[] = (Array.isArray(r.media) ? r.media : [])
    .filter((m): m is MediaItem => !!m && typeof m === "object" && typeof (m as MediaItem).id === "string")
    .map((m) => ({
      id: m.id,
      kind: m.kind === "audio" ? "audio" : "video",
      name: str(m.name, "Media", 120),
      mime: str(m.mime, "", 80),
      bytes: n(m.bytes, 0, 0),
      duration: n(m.duration, 0, 0, 1e6),
      width: isNum(m.width) ? m.width : null,
      height: isNum(m.height) ? m.height : null,
      hasAudio: m.hasAudio === true,
      peaks: Array.isArray(m.peaks) ? m.peaks.filter(isNum).slice(0, 4000).map((p) => clamp(p, 0, 1)) : null,
      createdAt: n(m.createdAt, Date.now()),
    }));
  const trackIds = new Set(tracks.map((t) => t.id));
  const shotIds = new Set(shots.map((s) => s.id));
  const trackKind = new Map(tracks.map((t) => [t.id, t.kind]));
  const clips: Clip[] = [];
  for (const c of Array.isArray(r.clips) ? r.clips : []) {
    if (!c || typeof c !== "object" || typeof (c as Clip).id !== "string") continue;
    const clip = c as Clip;
    const source = migrateSource(clip.source);
    if (!source || !trackIds.has(clip.trackId)) continue;
    const isAudio = source.kind === "audio";
    if ((trackKind.get(clip.trackId) === "audio") !== isAudio) continue;
    // Sound can belong to a shot too (a video's own sound follows its shot); music usually doesn't.
    const shotId = clip.shotId && shotIds.has(clip.shotId) ? clip.shotId : null;
    if (clip.shotId && !shotId) continue; // its shot is gone
    const t = (clip.transform ?? {}) as Partial<Transform>;
    clips.push({
      id: clip.id,
      name: str(clip.name, source.kind, 80),
      trackId: clip.trackId,
      shotId,
      start: n(clip.start, 0, 0, MAX_FILM),
      duration: n(clip.duration, 1, MIN_CLIP, MAX_FILM),
      source,
      role: (["background", "product", "overlay", "audio"] as ClipRole[]).includes(clip.role) ? clip.role : isAudio ? "audio" : "overlay",
      transform: { x: n(t.x, 0.5, -5, 6), y: n(t.y, 0.5, -5, 6), scale: n(t.scale, 1, 0.01, 20), rotation: n(t.rotation, 0, -3600, 3600), opacity: n(t.opacity, 1, 0, 1), anchorX: n(t.anchorX, 0.5, 0, 1), anchorY: n(t.anchorY, 0.5, 0, 1) },
      keyframes: migrateKeyframes(clip.keyframes, CLIP_PROPS),
      depth: n(clip.depth, 1, 0, 2),
      effects: { blur: n(clip.effects?.blur, 0, 0, 10), intensity: n(clip.effects?.intensity, 1, 0, 1) },
      grade: clip.grade ? migrateAdjust(clip.grade) : null,
      audio: isAudio || clip.audio ? { gain: n(clip.audio?.gain, 0, -60, 12), fadeIn: n(clip.audio?.fadeIn, 0, 0, 30), fadeOut: n(clip.audio?.fadeOut, 0, 0, 30) } : null,
      link:
        clip.link && typeof clip.link.sceneId === "string" && typeof clip.link.layerId === "string"
          ? {
              sceneId: clip.link.sceneId,
              layerId: clip.link.layerId,
              detached: clip.link.detached === true,
              imported: clip.link.imported && typeof clip.link.imported === "object" ? clip.link.imported : {},
              made: clip.link.made && typeof clip.link.made === "object" ? clip.link.made : {},
            }
          : null,
    });
  }
  const ex = (r.export ?? {}) as Partial<ExportSettings>;
  const grade = (r.grade ?? {}) as Partial<Grade>;
  const aspect = r.aspect && r.aspect in ASPECTS ? r.aspect : "16:9";
  return {
    version: FILM_VERSION,
    id: r.id,
    name: str(r.name, "Untitled film", 80).trim() || "Untitled film",
    createdAt: n(r.createdAt, Date.now()),
    updatedAt: n(r.updatedAt, Date.now()),
    trashedAt: isNum(r.trashedAt) ? r.trashedAt : null,
    aspect,
    fps: (FRAME_RATES as readonly number[]).includes(Number(r.fps)) ? (Number(r.fps) as FrameRate) : 30,
    shots,
    tracks,
    clips,
    markers: (Array.isArray(r.markers) ? r.markers : []).filter((m): m is Marker => !!m && isNum((m as Marker).t)).map((m) => ({ id: str(m.id, uid(), 80), t: clamp(m.t, 0, MAX_FILM), label: str(m.label, "Marker", 40) })),
    media,
    grade: { frame: migrateAdjust(grade.frame), background: migrateAdjust(grade.background), vignette: n(grade.vignette, 0, 0, 1) },
    masterGain: n(r.masterGain, 0, -60, 12),
    fadeIn: n(r.fadeIn, 0, 0, 10),
    fadeOut: n(r.fadeOut, 0, 0, 10),
    export: {
      container: ex.container === "webm" ? "webm" : "mp4",
      quality: ex.quality === "standard" || ex.quality === "max" ? ex.quality : "high",
      resolution: ex.resolution === 720 || ex.resolution === 2160 ? ex.resolution : 1080,
      includeAudio: ex.includeAudio !== false,
      fileName: str(ex.fileName, "", 120),
    },
    source: r.source && typeof r.source.sceneId === "string" ? { sceneId: r.source.sceneId, sceneName: str(r.source.sceneName, "Scene", 80), revision: n(r.source.revision, 1), format: (["square", "portrait", "wide", "story"] as SceneFormatId[]).includes(r.source.format) ? r.source.format : "square" } : null,
    styleId: typeof r.styleId === "string" ? r.styleId : null,
  };
}

export function isNeutral(a: ColourAdjust | null | undefined) {
  return !a || Object.values(a).every((v) => Math.abs(v) < 1e-4);
}

/** Output size for an aspect ratio at a resolution (720/1080/2160 is the short side). */
export function outputSize(aspect: Aspect, resolution: ExportResolution) {
  const base = ASPECTS[aspect];
  const s = resolution / Math.min(base.width, base.height);
  // Encoders need even dimensions.
  return { width: Math.round((base.width * s) / 2) * 2, height: Math.round((base.height * s) / 2) * 2 };
}
