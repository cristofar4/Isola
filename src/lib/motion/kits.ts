/**
 * Motion styles ("kits"). A kit turns a set of separate layers (backdrop,
 * products and their shadows, text, logos) into shots, clips and keyframes.
 * Everything a kit makes is ordinary film data: every timing, keyframe, text
 * animation and transition can be edited afterwards, and a customised film
 * can be saved as a reusable style.
 *
 * All movement here is 2D: pans, zooms, rotations, fades, light overlays and
 * parallax between separate layers. A single photograph has no other side, so
 * no kit pretends to orbit a product or show unseen angles.
 */

import type { BackdropId, Scene, SceneLayer, TextStyle } from "@/lib/scene/model";
import { DEFAULT_TEXT, sanitiseText } from "@/lib/scene/model";
import { DEFAULT_TEXT_ANIM, NEUTRAL, newClip, newShot, newTrack, uid, type Aspect, type CameraProp, type Clip, type ClipProp, type ColourAdjust, type Ease, type Film, type Keyframe, type SceneLink, type Shot, type TextAnimation, type Track, type Transform, type TransitionKind } from "./model";

/* ------------------------------------------------------------- layer sets --- */

export interface LayerRef<S> {
  name: string;
  source: S;
  transform: Transform;
  link: SceneLink | null;
}

export interface LayerSet {
  backdrop: LayerRef<{ kind: "backdrop"; backdrop: BackdropId | null; imageAssetId: string | null; tint: string | null }> | null;
  products: Array<LayerRef<{ kind: "image"; assetId: string; aspect: number }> & { shadow: (LayerRef<{ softness: number; direction: number; length: number }> & { opacity: number }) | null }>;
  texts: Array<LayerRef<TextStyle>>;
  logos: Array<LayerRef<{ kind: "image"; assetId: string; aspect: number }>>;
  /** For titles when there's no text layer: the scene or film name. */
  title: string;
}

const linkOf = (sceneId: string | null, layer: SceneLayer | null, made: Record<string, unknown> = {}): SceneLink | null =>
  sceneId && layer ? { sceneId, layerId: layer.id, detached: false, imported: JSON.parse(JSON.stringify(layer)), made } : null;

const tf = (l: { x: number; y: number; scale: number; rotation: number; opacity: number }, over: Partial<Transform> = {}): Transform => ({ x: l.x, y: l.y, scale: l.scale, rotation: l.rotation, opacity: l.opacity, anchorX: 0.5, anchorY: 0.5, ...over });

/** The layers of a scene, ready for a kit. Hidden layers are left out. */
export function layerSetFromScene(scene: Scene): LayerSet {
  const visible = scene.layers.filter((l) => l.visible);
  const b = visible.find((l) => l.kind === "backdrop");
  const set: LayerSet = { backdrop: null, products: [], texts: [], logos: [], title: scene.name };
  if (b && b.kind === "backdrop") set.backdrop = { name: "Backdrop", source: { kind: "backdrop", backdrop: b.backdrop, imageAssetId: b.imageAssetId, tint: b.tint }, transform: tf(b, { x: 0.5, y: 0.5, scale: 1, rotation: 0 }), link: linkOf(scene.id, b) };
  for (const l of visible) {
    if (l.kind === "product") {
      const sh = visible.find((x) => x.kind === "shadow" && x.targetId === l.id);
      set.products.push({
        name: l.name,
        source: { kind: "image", assetId: l.assetId, aspect: l.aspect },
        transform: tf(l),
        link: linkOf(scene.id, l),
        shadow: sh && sh.kind === "shadow" ? { name: sh.name, source: { softness: sh.softness, direction: sh.direction, length: sh.length }, opacity: sh.opacity, transform: tf(sh), link: linkOf(scene.id, sh) } : null,
      });
    } else if (l.kind === "text") {
      set.texts.push({ name: l.name, source: sanitiseText(l), transform: tf(l), link: linkOf(scene.id, l) });
    } else if (l.kind === "logo") {
      set.logos.push({ name: l.name, source: { kind: "image", assetId: l.assetId, aspect: l.aspect }, transform: tf(l), link: linkOf(scene.id, l) });
    }
  }
  return set;
}

/**
 * The layers already in a film (to apply a different style to it). Each
 * scene layer or product image counts once, taken from its first clip.
 */
export function layerSetFromFilm(film: Film): LayerSet {
  const set: LayerSet = { backdrop: null, products: [], texts: [], logos: [], title: film.name };
  const seen = new Set<string>();
  const key = (c: Clip) => (c.link ? `l:${c.link.layerId}` : c.source.kind === "image" ? `a:${c.source.assetId}:${c.role}` : c.source.kind === "backdrop" ? `b:${c.source.backdrop}:${c.source.imageAssetId}` : c.source.kind === "text" ? `t:${c.source.style.text}` : `c:${c.id}`);
  const ordered = [...film.clips].sort((a, b) => (film.shots.findIndex((s) => s.id === a.shotId) - film.shots.findIndex((s) => s.id === b.shotId)) || a.start - b.start);
  // Base values: if a property is animated, use its first keyframe so the layout is the one you see.
  const base = (c: Clip): Transform => {
    const first = (p: ClipProp, v: number) => c.keyframes[p]?.[0]?.v ?? v;
    return { ...c.transform, x: first("x", c.transform.x), y: first("y", c.transform.y), scale: first("scale", c.transform.scale), rotation: first("rotation", c.transform.rotation), opacity: 1 };
  };
  for (const c of ordered) {
    const k = key(c);
    if (seen.has(k)) continue;
    if (c.source.kind === "backdrop" && !set.backdrop) {
      seen.add(k);
      set.backdrop = { name: c.name, source: c.source, transform: { ...base(c), scale: 1, x: 0.5, y: 0.5 }, link: c.link };
    } else if (c.source.kind === "image" && c.role === "product") {
      seen.add(k);
      const shadowClip = film.clips.find((s) => s.source.kind === "shadow" && s.source.targetClipId === c.id);
      set.products.push({
        name: c.name,
        source: c.source,
        transform: base(c),
        link: c.link,
        shadow: shadowClip && shadowClip.source.kind === "shadow" ? { name: shadowClip.name, source: { softness: shadowClip.source.softness, direction: shadowClip.source.direction, length: shadowClip.source.length }, opacity: shadowClip.transform.opacity, transform: shadowClip.transform, link: shadowClip.link } : null,
      });
    } else if (c.source.kind === "image" && c.role !== "product") {
      seen.add(k);
      set.logos.push({ name: c.name, source: c.source, transform: base(c), link: c.link });
    } else if (c.source.kind === "text" && c.link) {
      seen.add(k);
      set.texts.push({ name: c.name, source: c.source.style, transform: base(c), link: c.link });
    }
  }
  return set;
}

/* ---------------------------------------------------------------- building --- */

export interface KitParam {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}

export interface KitInput {
  set: LayerSet;
  aspect: Aspect;
  /** Brand colours (default brand preset), used for end cards. */
  brand: string[];
}

export interface KitResult {
  shots: Shot[];
  tracks: Track[];
  clips: Clip[];
  markers: Film["markers"];
  fadeIn: number;
  fadeOut: number;
  grade: Film["grade"];
}

export interface KitDefinition {
  id: string;
  name: string;
  summary: string;
  /** What the style does, in plain words (shown before applying). */
  details: string[];
  pace: "Slow" | "Medium" | "Fast";
  params: KitParam[];
  /** Layers the style needs to look as intended; null when the set qualifies. */
  check(set: LayerSet): string | null;
  build(input: KitInput, params: Record<string, number>): KitResult;
}

const kf = (t: number, v: number, ease: Ease = "ease-in-out"): Keyframe => ({ id: uid(), t: Math.round(t * 1e4) / 1e4, v, ease });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

class Builder {
  tracks = {
    titles: newTrack("visual", "Typography"),
    light: newTrack("visual", "Lighting"),
    logos: newTrack("visual", "Logo"),
    products: [] as Track[],
    /** One shadow track per product: clips on a track never overlap. */
    shadows: [] as Track[],
    backdrop: newTrack("visual", "Backdrop"),
    cards: newTrack("visual", "End card"),
  };
  shots: Shot[] = [];
  clips: Clip[] = [];
  markers: Film["markers"] = [];
  constructor(readonly input: KitInput) {
    const many = input.set.products.length > 1;
    this.tracks.products = input.set.products.map((_, i) => newTrack("visual", many ? `Product ${i + 1}` : "Product"));
    this.tracks.shadows = input.set.products.map((_, i) => newTrack("visual", many ? `Shadow ${i + 1}` : "Shadow"));
  }
  get set() {
    return this.input.set;
  }
  shot(name: string, duration: number, transition: TransitionKind = "cut", tDur = 0, camera: Shot["camera"] = {}): Shot {
    const s: Shot = { ...newShot(name, Math.max(0.3, duration)), transition: { kind: transition, duration: transition === "cut" ? 0 : tDur }, camera };
    this.shots.push(s);
    return s;
  }
  private made(c: Clip): Clip {
    if (c.link) c.link = { ...c.link, made: { transform: c.transform, source: c.source } };
    return c;
  }
  /** Backdrop, shadows, products and logos for a whole shot. Returns the product clips (to animate). */
  stage(shot: Shot, opts: { backdropScale?: number; backdropDepth?: number; logos?: boolean } = {}) {
    const products: Clip[] = [];
    const { set } = this;
    if (set.backdrop) {
      this.clips.push(this.made(newClip({ trackId: this.tracks.backdrop.id, shotId: shot.id, start: 0, duration: shot.duration, source: set.backdrop.source, name: set.backdrop.name, role: "background", transform: { ...set.backdrop.transform, scale: opts.backdropScale ?? 1 }, depth: opts.backdropDepth ?? 1, link: set.backdrop.link ? { ...set.backdrop.link } : null })));
    }
    set.products.forEach((p, i) => {
      const clip = this.made(newClip({ trackId: this.tracks.products[i].id, shotId: shot.id, start: 0, duration: shot.duration, source: p.source, name: p.name, role: "product", transform: { ...p.transform }, link: p.link ? { ...p.link } : null }));
      products.push(clip);
      this.clips.push(clip);
      if (p.shadow) {
        this.clips.push(
          this.made(
            newClip({
              trackId: this.tracks.shadows[i].id,
              shotId: shot.id,
              start: 0,
              duration: shot.duration,
              source: { kind: "shadow", targetClipId: clip.id, ...p.shadow.source },
              name: p.shadow.name,
              role: "product",
              transform: { ...p.shadow.transform, opacity: p.shadow.opacity },
              link: p.shadow.link ? { ...p.shadow.link } : null,
            }),
          ),
        );
      }
    });
    if (opts.logos !== false) {
      for (const l of set.logos) this.clips.push(this.made(newClip({ trackId: this.tracks.logos.id, shotId: shot.id, start: 0, duration: shot.duration, source: l.source, name: l.name, role: "overlay", transform: { ...l.transform }, depth: 0, link: l.link ? { ...l.link } : null })));
    }
    return products;
  }
  /** A title: the scene's first text layer (as designed), or the scene name in a clean default style. */
  title(shot: Shot, start: number, duration: number, style: Partial<TextStyle>, anim: TextAnimation, place: Partial<Transform> = {}, index = 0) {
    const t = this.set.texts[index];
    const base: TextStyle = t ? t.source : { ...DEFAULT_TEXT, text: this.set.title || "Your title" };
    const clip = this.made(
      newClip({
        trackId: this.tracks.titles.id,
        shotId: shot.id,
        start: clamp(start, 0, shot.duration - 0.2),
        duration: Math.max(0.2, Math.min(duration, shot.duration - clamp(start, 0, shot.duration - 0.2))),
        source: { kind: "text", style: sanitiseText({ ...base, ...style, text: base.text }), anim },
        name: t?.name ?? "Title",
        role: "overlay",
        transform: { ...(t?.transform ?? { x: 0.5, y: 0.14, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 }), ...place },
        depth: 0,
        link: t?.link ? { ...t.link } : null,
      }),
    );
    this.clips.push(clip);
    return clip;
  }
  /** Keyframe a clip property (values relative to its base are common, so pass absolute values). */
  animate(clip: Clip, prop: ClipProp, frames: Keyframe[]) {
    clip.keyframes[prop] = frames;
  }
  /** Shadows follow their product's fade. */
  fadeWithProduct(product: Clip, frames: Keyframe[]) {
    this.animate(product, "opacity", frames);
    for (const s of this.clips) {
      if (s.source.kind === "shadow" && s.source.targetClipId === product.id) s.keyframes.opacity = frames.map((k) => ({ ...k, id: uid(), v: k.v * s.transform.opacity }));
    }
  }
  result(extra: Partial<KitResult> = {}): KitResult {
    const used = new Set(this.clips.map((c) => c.trackId));
    // Front to back: each product sits just above its own shadow.
    const productTracks = this.tracks.products.flatMap((t, i) => [t, this.tracks.shadows[i]]);
    const order = [this.tracks.cards, this.tracks.titles, this.tracks.logos, this.tracks.light, ...productTracks, this.tracks.backdrop];
    const tracks = order.filter((t) => used.has(t.id));
    if (!tracks.length) tracks.push(newTrack("visual", "Video"));
    return { shots: this.shots, tracks, clips: this.clips, markers: this.markers, fadeIn: 0, fadeOut: 0, grade: { frame: { ...NEUTRAL }, background: { ...NEUTRAL }, vignette: 0 }, ...extra };
  }
  /** The main product's centre (for framing close-ups). */
  hero() {
    const p = this.set.products[0];
    return p ? { x: p.transform.x, y: p.transform.y, h: p.transform.scale } : { x: 0.5, y: 0.5, h: 0.5 };
  }
}

/** Camera framing that centres a point at a zoom (pan is in frame fractions from the centre). */
function frame(point: { x: number; y: number }, zoom: number): Partial<Record<CameraProp, number>> {
  return { zoom, panX: point.x - 0.5, panY: point.y - 0.5 };
}

function camera(at: Array<[number, Partial<Record<CameraProp, number>>, Ease?]>): Shot["camera"] {
  const out: Shot["camera"] = {};
  for (const [t, values, ease] of at) {
    for (const [prop, v] of Object.entries(values) as Array<[CameraProp, number]>) {
      (out[prop] ??= []).push(kf(t, v, ease ?? "ease-in-out"));
    }
  }
  return out;
}

const needsProduct = (set: LayerSet) => (set.products.length ? null : "Needs at least one product layer.");
const p = (params: Record<string, number>, id: string, fallback: number) => (Number.isFinite(params[id]) ? params[id] : fallback);
const warm: ColourAdjust = { ...NEUTRAL, temperature: 0.12, contrast: -0.06, saturation: -0.04 };

export const KITS: KitDefinition[] = [
  {
    id: "slow-reveal",
    name: "Slow reveal",
    summary: "A gentle push in with a controlled fade.",
    details: ["Fades up from black", "The camera pushes in slowly across the whole shot", "The product fades in, then the title"],
    pace: "Slow",
    params: [
      { id: "duration", label: "Length", min: 3, max: 15, step: 0.5, value: 6, unit: "s" },
      { id: "push", label: "Push in", min: 0, max: 1, step: 0.05, value: 0.5 },
      { id: "titleAt", label: "Title appears at", min: 0, max: 8, step: 0.1, value: 2.2, unit: "s" },
    ],
    check: needsProduct,
    build(input, params) {
      const b = new Builder(input);
      const D = p(params, "duration", 6);
      const shot = b.shot("Reveal", D, "cut", 0, camera([
        [0, { zoom: 1 }],
        [D, { zoom: 1 + 0.12 * p(params, "push", 0.5) }],
      ]));
      for (const prod of b.stage(shot)) b.fadeWithProduct(prod, [kf(0.3, 0, "ease-out"), kf(Math.min(1.8, D * 0.35), 1)]);
      b.title(shot, Math.min(p(params, "titleAt", 2.2), D - 0.6), D, {}, { in: { kind: "fade", duration: 1.1 }, out: { kind: "none", duration: 0.5 }, by: "word" });
      return b.result({ fadeIn: Math.min(1.4, D * 0.25), fadeOut: Math.min(1, D * 0.15) });
    },
  },
  {
    id: "spotlight",
    name: "Spotlight",
    summary: "A moving spotlight finds the product, then the lights come up.",
    details: ["A spotlight layer sweeps in over the set", "The product appears as the light reaches it", "The light opens up and the title staggers in"],
    pace: "Medium",
    params: [
      { id: "duration", label: "Length", min: 4, max: 14, step: 0.5, value: 7, unit: "s" },
      { id: "search", label: "Spotlight share", min: 0.3, max: 0.8, step: 0.05, value: 0.6 },
      { id: "intensity", label: "Darkness", min: 0.3, max: 1, step: 0.05, value: 0.9 },
    ],
    check: needsProduct,
    build(input, params) {
      const b = new Builder(input);
      const D = p(params, "duration", 7);
      const d1 = D * p(params, "search", 0.6);
      const d2 = D - d1;
      const hero = b.hero();
      const s1 = b.shot("Spotlight", d1);
      for (const prod of b.stage(s1)) b.fadeWithProduct(prod, [kf(d1 * 0.25, 0, "ease-out"), kf(d1 * 0.7, 1)]);
      const light1 = newClip({ trackId: b.tracks.light.id, shotId: s1.id, start: 0, duration: d1, source: { kind: "light", style: "spotlight", color: "#FFF1DC" }, name: "Spotlight", role: "overlay", depth: 0, transform: { x: hero.x, y: hero.y, scale: 0.4, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 }, effects: { blur: 0, intensity: p(params, "intensity", 0.9) } });
      light1.keyframes = { lightX: [kf(0, 0.15), kf(d1 * 0.75, hero.x)], lightY: [kf(0, hero.y - 0.1), kf(d1 * 0.75, hero.y)], scale: [kf(0, 0.32), kf(d1, 0.62)] };
      b.clips.push(light1);
      const s2 = b.shot("Lights up", d2, "dissolve", Math.min(0.8, d2 / 2));
      b.stage(s2);
      const light2 = newClip({ trackId: b.tracks.light.id, shotId: s2.id, start: 0, duration: Math.min(1.2, d2), source: { kind: "light", style: "spotlight", color: "#FFF1DC" }, name: "Spotlight opens", role: "overlay", depth: 0, transform: { x: hero.x, y: hero.y, scale: 0.62, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 }, effects: { blur: 0, intensity: p(params, "intensity", 0.9) } });
      light2.keyframes = { intensity: [kf(0, p(params, "intensity", 0.9)), kf(Math.min(1.2, d2), 0, "ease-out")], scale: [kf(0, 0.62), kf(Math.min(1.2, d2), 1.4)] };
      b.clips.push(light2);
      b.title(s2, 0.3, d2, {}, { in: { kind: "stagger", duration: 1 }, out: { kind: "none", duration: 0.5 }, by: "letter" });
      return b.result({ fadeOut: Math.min(0.8, d2 / 3) });
    },
  },
  {
    id: "layered-parallax",
    name: "Layered parallax",
    summary: "Restrained depth: the backdrop drifts slower than the product.",
    details: ["The scene camera pans and zooms gently", "The backdrop moves less than the product (depth 0.35), which reads as depth", "A second, closer framing dissolves in with the title"],
    pace: "Slow",
    params: [
      { id: "duration", label: "Length", min: 4, max: 14, step: 0.5, value: 7, unit: "s" },
      { id: "depth", label: "Depth", min: 0.1, max: 1, step: 0.05, value: 0.5 },
    ],
    check: (set) => (!set.backdrop || !set.products.length ? "Needs a backdrop and a product on separate layers." : null),
    build(input, params) {
      const b = new Builder(input);
      const D = p(params, "duration", 7);
      const k = p(params, "depth", 0.5);
      const hero = b.hero();
      const d1 = D * 0.55;
      const s1 = b.shot("Drift", d1, "cut", 0, camera([
        [0, { panX: -0.05 * k, zoom: 1.05 }],
        [d1, { panX: 0.05 * k, zoom: 1.08 }],
      ]));
      b.stage(s1, { backdropScale: 1.14, backdropDepth: 0.35 });
      const d2 = D - d1;
      const close = frame({ x: hero.x, y: hero.y - hero.h * 0.05 }, 1.22);
      const s2 = b.shot("Closer", d2, "dissolve", Math.min(0.9, d2 / 2), camera([
        [0, { ...close, panX: (close.panX ?? 0) + 0.04 * k }],
        [d2, { ...close, zoom: (close.zoom ?? 1) + 0.04, panX: (close.panX ?? 0) - 0.03 * k }],
      ]));
      b.stage(s2, { backdropScale: 1.14, backdropDepth: 0.35 });
      b.title(s2, 0.4, d2, {}, { in: { kind: "slide", duration: 0.9 }, out: { kind: "none", duration: 0.5 }, by: "word" });
      return b.result({ fadeIn: 0.6, fadeOut: 0.6 });
    },
  },
  {
    id: "editorial-cut",
    name: "Editorial cut",
    summary: "Timed cuts between framings, with clean typography.",
    details: ["Four shots: wide, close-up, detail and hero", "Hard cuts, timed to a steady pace", "The hero shot wipes the title on in wide-spaced capitals"],
    pace: "Medium",
    params: [
      { id: "pace", label: "Shot length", min: 0.6, max: 2.5, step: 0.1, value: 1.4, unit: "s" },
      { id: "closeup", label: "Close-up zoom", min: 1.3, max: 2.6, step: 0.1, value: 1.8 },
    ],
    check: needsProduct,
    build(input, params) {
      const b = new Builder(input);
      const L = p(params, "pace", 1.4);
      const z = p(params, "closeup", 1.8);
      const hero = b.hero();
      const top = { x: hero.x, y: hero.y - hero.h * 0.22 };
      const mid = { x: hero.x + 0.02, y: hero.y + hero.h * 0.08 };
      const shots = [
        b.shot("Wide", L * 1.15, "cut", 0, camera([[0, { zoom: 1 }], [L * 1.15, { zoom: 1.03 }]])),
        b.shot("Close-up", L, "cut", 0, camera([[0, frame(top, z)], [L, frame(top, z + 0.05)]])),
        b.shot("Detail", L * 0.85, "cut", 0, camera([[0, frame(mid, z + 0.6)], [L * 0.85, frame({ ...mid, x: mid.x - 0.02 }, z + 0.62)]])),
        b.shot("Hero", L * 1.8, "cut", 0, camera([[0, { zoom: 1.08 }], [L * 1.8, { zoom: 1 }, "ease-out"]])),
      ];
      shots.forEach((s) => b.stage(s));
      b.title(shots[3], L * 0.25, L * 1.8, { uppercase: true, letterSpacing: 0.18, weight: 700, font: "display" }, { in: { kind: "reveal", duration: 0.7 }, out: { kind: "none", duration: 0.5 }, by: "word" });
      let t = 0;
      for (const s of shots.slice(0, -1)) {
        t += s.duration;
        b.markers.push({ id: uid(), t, label: `Cut to ${shots[shots.indexOf(s) + 1].name}` });
      }
      return b.result({ fadeOut: 0.5 });
    },
  },
  {
    id: "soft-luxury",
    name: "Soft luxury",
    summary: "Subtle movement, slow dissolves and an elegant serif title.",
    details: ["Three slow shots joined by long dissolves", "Barely-there camera drift", "A serif title appears letter by letter", "A warm grade on the background only (the product's colours stay true) and a soft vignette"],
    pace: "Slow",
    params: [
      { id: "duration", label: "Length", min: 6, max: 18, step: 0.5, value: 10, unit: "s" },
      { id: "dissolve", label: "Dissolve", min: 0.4, max: 2, step: 0.1, value: 1.2, unit: "s" },
    ],
    check: needsProduct,
    build(input, params) {
      const b = new Builder(input);
      const D = p(params, "duration", 10);
      const x = p(params, "dissolve", 1.2);
      const d = D / 3;
      const hero = b.hero();
      const upper = frame({ x: hero.x, y: hero.y - hero.h * 0.12 }, 1.35);
      const s1 = b.shot("Opening", d, "cut", 0, camera([[0, { zoom: 1 }], [d, { zoom: 1.04 }]]));
      const s2 = b.shot("Detail", d, "dissolve", x, camera([[0, upper], [d, { ...upper, zoom: (upper.zoom ?? 1) + 0.05 }]]));
      const s3 = b.shot("Title", d, "dissolve", x, camera([[0, { zoom: 1.05 }], [d, { zoom: 1 }]]));
      [s1, s2, s3].forEach((s) => b.stage(s));
      b.title(s3, 0.6, d, { font: "serif", weight: 500, letterSpacing: 0.12, uppercase: false }, { in: { kind: "stagger", duration: 1.6 }, out: { kind: "none", duration: 0.5 }, by: "letter" });
      return b.result({ fadeIn: 1.2, fadeOut: 1.4, grade: { frame: { ...NEUTRAL }, background: { ...warm }, vignette: 0.22 } });
    },
  },
  {
    id: "social-launch",
    name: "Social launch",
    summary: "Fast pacing, bold captions and a clear end card.",
    details: ["Five quick shots with punch-in zooms", "The product pops in with a small bounce", "A bold condensed caption", "An end card in your brand colour with your logo (if the scene has one) and a call to action you can edit"],
    pace: "Fast",
    params: [
      { id: "pace", label: "Shot length", min: 0.5, max: 1.6, step: 0.05, value: 0.9, unit: "s" },
      { id: "card", label: "End card", min: 1, max: 4, step: 0.1, value: 1.8, unit: "s" },
    ],
    check: needsProduct,
    build(input, params) {
      const b = new Builder(input);
      const L = p(params, "pace", 0.9);
      const hero = b.hero();
      const hook = b.shot("Hook", L, "cut", 0, camera([[0, { zoom: 1.3 }], [Math.min(0.35, L * 0.4), { zoom: 1 }, "ease-out"]]));
      const pop = b.shot("Product", L * 1.3);
      const detail = b.shot("Detail", L * 0.9, "cut", 0, camera([[0, frame(hero, 1.8)], [L * 0.9, frame(hero, 1.9)]]));
      const caption = b.shot("Caption", L * 1.5, "cut", 0, camera([[0, { zoom: 1.04 }], [L * 1.5, { zoom: 1 }]]));
      const card = b.shot("End card", p(params, "card", 1.8), "wipe", 0.35);
      b.stage(hook);
      for (const prod of b.stage(pop)) {
        const s = prod.transform.scale;
        b.animate(prod, "scale", [kf(0, s * 0.86, "ease-out"), kf(L * 0.45, s * 1.05, "ease-in-out"), kf(L * 0.75, s)]);
      }
      b.stage(detail);
      b.stage(caption);
      b.title(caption, 0.1, L * 1.4, { font: "condensed", weight: 400, uppercase: true, size: 0.13, letterSpacing: 0.02 }, { in: { kind: "slide", duration: 0.3 }, out: { kind: "none", duration: 0.2 }, by: "word" }, { y: 0.16 });
      // End card: brand colour, logo, call to action. Nothing here makes claims about the product.
      const bg = input.brand[0] ?? "#20292D";
      const light = isLight(bg);
      b.clips.push(newClip({ trackId: b.tracks.cards.id, shotId: card.id, start: 0, duration: card.duration, source: { kind: "solid", color: bg }, name: "End card", role: "overlay", depth: 0 }));
      const logo = input.set.logos[0];
      if (logo) b.clips.push(newClip({ trackId: b.tracks.titles.id, shotId: card.id, start: 0, duration: card.duration, source: logo.source, name: logo.name, role: "overlay", depth: 0, transform: { ...logo.transform, x: 0.5, y: 0.36, scale: 0.16 }, link: logo.link ? { ...logo.link } : null }));
      const cta = newClip({ trackId: b.tracks.titles.id, shotId: card.id, start: 0, duration: card.duration, source: { kind: "text", style: sanitiseText({ ...DEFAULT_TEXT, text: "Shop now", font: "condensed", weight: 400, size: 0.11, uppercase: true, color: light ? "#20292D" : "#FFFFFF" }), anim: { ...DEFAULT_TEXT_ANIM, in: { kind: "slide", duration: 0.35 } } }, name: "Call to action", role: "overlay", depth: 0, transform: { x: 0.5, y: logo ? 0.62 : 0.5, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 } });
      // The CTA sits on its own track so it never collides with the logo.
      const ctaTrack = newTrack("visual", "Call to action");
      cta.trackId = ctaTrack.id;
      b.clips.push(cta);
      const result = b.result();
      return { ...result, tracks: [ctaTrack, ...result.tracks] };
    },
  },
];

function isLight(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const bl = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl > 150;
}

export function kitById(id: string) {
  return KITS.find((k) => k.id === id) ?? null;
}

export function defaultParams(kit: Pick<KitDefinition, "params">) {
  return Object.fromEntries(kit.params.map((x) => [x.id, x.value]));
}

/**
 * Replace a film's shots and visual clips with a style built from `set`.
 * Sound, global clips (music, overlays across the film), media and export
 * settings are kept.
 */
export function applyKitResult(film: Film, result: KitResult, styleId: string): Film {
  const keepClips = film.clips.filter((c) => c.source.kind === "audio" || c.shotId === null);
  const keepTrackIds = new Set(keepClips.map((c) => c.trackId));
  const keptVisual = film.tracks.filter((t) => t.kind === "visual" && keepTrackIds.has(t.id));
  const audio = film.tracks.filter((t) => t.kind === "audio");
  return {
    ...film,
    shots: result.shots,
    tracks: [...keptVisual, ...result.tracks, ...(audio.length ? audio : [newTrack("audio", "Music")])],
    clips: [...keepClips, ...result.clips],
    markers: result.markers,
    fadeIn: result.fadeIn,
    fadeOut: result.fadeOut,
    grade: result.grade,
    styleId,
  };
}

/* ---------------------------------------------------------- saved styles --- */

type RoleKey = "backdrop" | `product:${number}` | `shadow:${number}` | `text:${number}` | `logo:${number}` | "light" | "solid" | "free-text";

interface StyleClip {
  role: RoleKey;
  track: string;
  start: number;
  duration: number;
  transform: Transform;
  keyframes: Clip["keyframes"];
  depth: number;
  effects: Clip["effects"];
  grade: Clip["grade"];
  text?: { style: TextStyle; anim: TextAnimation };
  light?: { style: "spotlight" | "sweep" | "glow"; color: string };
  solid?: string;
  shadow?: { softness: number; direction: number; length: number };
}

/** A reusable motion style saved from a customised film. */
export interface MotionStyle {
  id: string;
  name: string;
  createdAt: number;
  aspect: Aspect;
  shots: Array<{ name: string; duration: number; transition: Shot["transition"]; camera: Shot["camera"]; clips: StyleClip[] }>;
  trackOrder: string[];
  fadeIn: number;
  fadeOut: number;
  grade: Film["grade"];
}

/** Capture a film's timing, framing, keyframes, transitions and text animation as a style. Product images, sound and media aren't stored. */
export function extractStyle(film: Film, name: string): MotionStyle {
  const set = layerSetFromFilm(film);
  const productIndex = (c: Clip) => set.products.findIndex((p) => c.source.kind === "image" && p.source.assetId === c.source.assetId);
  const textIndex = (c: Clip) => set.texts.findIndex((t) => c.link && t.link?.layerId === c.link.layerId);
  const logoIndex = (c: Clip) => set.logos.findIndex((l) => c.source.kind === "image" && l.source.assetId === c.source.assetId);
  const trackName = (id: string) => film.tracks.find((t) => t.id === id)?.name ?? "Video";
  const shots = film.shots.map((s) => ({
    name: s.name,
    duration: s.duration,
    transition: s.transition,
    camera: structuredClone(s.camera),
    clips: film.clips
      .filter((c) => c.shotId === s.id && c.source.kind !== "audio" && c.source.kind !== "video")
      .flatMap((c): StyleClip[] => {
        const common = { track: trackName(c.trackId), start: c.start, duration: c.duration, transform: c.transform, keyframes: structuredClone(c.keyframes), depth: c.depth, effects: c.effects, grade: c.grade };
        const src = c.source;
        if (src.kind === "backdrop") return [{ ...common, role: "backdrop" }];
        if (src.kind === "image") {
          if (c.role === "product") return productIndex(c) >= 0 ? [{ ...common, role: `product:${productIndex(c)}` }] : [];
          return logoIndex(c) >= 0 ? [{ ...common, role: `logo:${logoIndex(c)}` }] : [];
        }
        if (src.kind === "shadow") {
          const target = film.clips.find((x) => x.id === src.targetClipId);
          const i = target ? productIndex(target) : -1;
          return i >= 0 ? [{ ...common, role: `shadow:${i}`, shadow: { softness: src.softness, direction: src.direction, length: src.length } }] : [];
        }
        if (src.kind === "text") {
          const i = textIndex(c);
          return [{ ...common, role: i >= 0 ? `text:${i}` : "free-text", text: { style: src.style, anim: src.anim } }];
        }
        if (src.kind === "light") return [{ ...common, role: "light", light: { style: src.style, color: src.color } }];
        if (src.kind === "solid") return [{ ...common, role: "solid", solid: src.color }];
        return [];
      }),
  }));
  return { id: uid(), name: name.trim().slice(0, 60) || "My style", createdAt: Date.now(), aspect: film.aspect, shots, trackOrder: film.tracks.filter((t) => t.kind === "visual").map((t) => t.name), fadeIn: film.fadeIn, fadeOut: film.fadeOut, grade: structuredClone(film.grade) };
}

/** Build a film's shots from a saved style and a set of layers. Roles the set doesn't have are skipped. */
export function buildFromStyle(style: MotionStyle, set: LayerSet): KitResult {
  const tracks = new Map<string, Track>();
  const trackFor = (name: string) => {
    let t = tracks.get(name);
    if (!t) {
      t = newTrack("visual", name);
      tracks.set(name, t);
    }
    return t;
  };
  style.trackOrder.forEach(trackFor);
  const shots: Shot[] = [];
  const clips: Clip[] = [];
  for (const s of style.shots) {
    const shot: Shot = { ...newShot(s.name, s.duration), transition: s.transition, camera: structuredClone(s.camera) };
    shots.push(shot);
    const productClips = new Map<number, Clip>();
    const ordered = [...s.clips].sort((a, b) => (a.role.startsWith("shadow") ? 1 : 0) - (b.role.startsWith("shadow") ? 1 : 0));
    for (const sc of ordered) {
      const common = { trackId: trackFor(sc.track).id, shotId: shot.id, start: sc.start, duration: sc.duration, transform: { ...sc.transform }, keyframes: structuredClone(sc.keyframes), depth: sc.depth, effects: { ...sc.effects }, grade: sc.grade ? { ...sc.grade } : null };
      const [kind, idx] = sc.role.split(":");
      const i = Number(idx);
      if (kind === "backdrop" && set.backdrop) clips.push(newClip({ ...common, source: set.backdrop.source, name: set.backdrop.name, role: "background", link: set.backdrop.link ? { ...set.backdrop.link } : null }));
      else if (kind === "product" && set.products[i]) {
        const pr = set.products[i];
        const c = newClip({ ...common, source: pr.source, name: pr.name, role: "product", link: pr.link ? { ...pr.link } : null });
        productClips.set(i, c);
        clips.push(c);
      } else if (kind === "shadow" && productClips.has(i)) {
        clips.push(newClip({ ...common, source: { kind: "shadow", targetClipId: productClips.get(i)!.id, ...(sc.shadow ?? { softness: 0.45, direction: 45, length: 0.25 }) }, name: `${productClips.get(i)!.name} shadow`, role: "product" }));
      } else if (kind === "logo" && set.logos[i]) clips.push(newClip({ ...common, source: set.logos[i].source, name: set.logos[i].name, role: "overlay", link: set.logos[i].link ? { ...set.logos[i].link! } : null }));
      else if ((kind === "text" || kind === "free-text") && sc.text) {
        const own = kind === "text" ? set.texts[i] : null;
        const text = own?.source.text ?? (kind === "text" ? set.title : sc.text.style.text);
        clips.push(newClip({ ...common, source: { kind: "text", style: { ...sc.text.style, text }, anim: sc.text.anim }, name: own?.name ?? "Text", role: "overlay", link: own?.link ? { ...own.link } : null }));
      } else if (kind === "light" && sc.light) clips.push(newClip({ ...common, source: { kind: "light", ...sc.light }, name: "Light", role: "overlay" }));
      else if (kind === "solid" && sc.solid) clips.push(newClip({ ...common, source: { kind: "solid", color: sc.solid }, name: "Solid", role: "overlay" }));
    }
  }
  const used = new Set(clips.map((c) => c.trackId));
  return { shots, tracks: [...tracks.values()].filter((t) => used.has(t.id)), clips, markers: [], fadeIn: style.fadeIn, fadeOut: style.fadeOut, grade: structuredClone(style.grade) };
}

export function migrateStyle(raw: unknown): MotionStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as MotionStyle;
  if (typeof s.id !== "string" || !Array.isArray(s.shots)) return null;
  return { ...s, name: typeof s.name === "string" ? s.name.slice(0, 60) : "My style", trackOrder: Array.isArray(s.trackOrder) ? s.trackOrder : [], fadeIn: Number(s.fadeIn) || 0, fadeOut: Number(s.fadeOut) || 0, grade: s.grade ?? { frame: { ...NEUTRAL }, background: { ...NEUTRAL }, vignette: 0 } };
}
