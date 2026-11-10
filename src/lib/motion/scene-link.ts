/**
 * Scene Studio ↔ Motion Studio.
 *
 * "Animate scene" turns a scene's separate layers into a film with a motion
 * style. Every clip made from a scene layer remembers the layer (and how it
 * looked) so "Update from scene" can show what changed, refresh linked clips
 * while keeping their animation and timing, and never silently overwrite an
 * edit made in Motion Studio. A clip can be detached to stop following its
 * layer.
 */

import { FONT_LABEL, type Scene, type SceneFormatId, type SceneLayer } from "@/lib/scene/model";
import { applyKitResult, defaultParams, kitById, layerSetFromScene, type KitInput } from "./kits";
import { emptyFilm, newClip, type Aspect, type Clip, type ClipProp, type Film } from "./model";

export const ASPECT_FOR_FORMAT: Record<SceneFormatId, Aspect> = { square: "1:1", portrait: "4:5", wide: "16:9", story: "9:16" };

/** A new film from a scene, styled with `kitId` (default: Slow reveal). */
export function filmFromScene(scene: Scene, opts: { kitId?: string; params?: Record<string, number>; brand?: string[]; aspect?: Aspect } = {}): Film {
  const aspect = opts.aspect ?? ASPECT_FOR_FORMAT[scene.format];
  const film = emptyFilm(scene.name, aspect);
  const kit = kitById(opts.kitId ?? "slow-reveal") ?? kitById("slow-reveal")!;
  const input: KitInput = { set: layerSetFromScene(scene), aspect, brand: opts.brand ?? [] };
  const built = kit.build(input, { ...defaultParams(kit), ...(opts.params ?? {}) });
  return { ...applyKitResult(film, built, kit.id), source: { sceneId: scene.id, sceneName: scene.name, revision: scene.revision, format: scene.format } };
}

/* -------------------------------------------------------------- changes --- */

type Field = "Image" | "Backdrop" | "Position" | "Size" | "Rotation" | "Opacity" | "Text" | "Typography" | "Shadow";

const FIELDS: Record<SceneLayer["kind"], Partial<Record<Field, string[]>>> = {
  backdrop: { Backdrop: ["backdrop", "imageAssetId", "tint"] },
  product: { Image: ["assetId", "aspect"], Position: ["x", "y"], Size: ["scale"], Rotation: ["rotation"], Opacity: ["opacity"] },
  logo: { Image: ["assetId", "aspect"], Position: ["x", "y"], Size: ["scale"], Rotation: ["rotation"], Opacity: ["opacity"] },
  shadow: { Shadow: ["softness", "direction", "length", "opacity"] },
  text: { Text: ["text"], Typography: ["font", "weight", "size", "color", "align", "letterSpacing", "lineHeight", "uppercase"], Position: ["x", "y"], Size: ["scale"], Rotation: ["rotation"], Opacity: ["opacity"] },
};

/** Which of a clip's own values (as made) correspond to each field, to spot edits made in Motion Studio. */
function editedHere(clip: Clip, field: Field): boolean {
  const made = clip.link?.made as { transform?: Clip["transform"]; source?: Clip["source"] } | undefined;
  if (!made || !made.transform || !made.source) return false;
  const t = clip.transform;
  const m = made.transform;
  const diff = (a: number, b: number) => Math.abs(a - b) > 1e-4;
  switch (field) {
    case "Position":
      return diff(t.x, m.x) || diff(t.y, m.y);
    case "Size":
      return diff(t.scale, m.scale);
    case "Rotation":
      return diff(t.rotation, m.rotation);
    case "Opacity":
      return diff(t.opacity, m.opacity);
    case "Text":
      return clip.source.kind === "text" && made.source.kind === "text" && clip.source.style.text !== made.source.style.text;
    case "Typography":
      return clip.source.kind === "text" && made.source.kind === "text" && JSON.stringify({ ...clip.source.style, text: "" }) !== JSON.stringify({ ...made.source.style, text: "" });
    case "Image":
      return clip.source.kind === "image" && made.source.kind === "image" && clip.source.assetId !== made.source.assetId;
    case "Backdrop":
      return clip.source.kind === "backdrop" && JSON.stringify(clip.source) !== JSON.stringify(made.source);
    case "Shadow":
      return clip.source.kind === "shadow" && made.source.kind === "shadow" && (diff(clip.source.softness, made.source.softness) || diff(clip.source.direction, made.source.direction) || diff(clip.source.length, made.source.length));
  }
}

export interface FieldChange {
  field: Field;
  /** Plain-words description: "Moved", "Text: “Old” → “New”". */
  detail: string;
  /** Some linked clips were also changed in Motion Studio for this field. */
  conflict: boolean;
}

export type SceneChange =
  | { kind: "changed"; layerId: string; name: string; layerKind: SceneLayer["kind"]; clipIds: string[]; fields: FieldChange[] }
  | { kind: "added"; layerId: string; name: string; layerKind: SceneLayer["kind"] }
  | { kind: "removed"; layerId: string; name: string; clipIds: string[] };

function describe(field: Field, before: Record<string, unknown>, after: Record<string, unknown>): string {
  switch (field) {
    case "Text":
      return `“${String(before.text ?? "").slice(0, 40)}” → “${String(after.text ?? "").slice(0, 40)}”`;
    case "Image":
      return "Replaced with a different image";
    case "Position":
      return "Moved";
    case "Size":
      return `${Math.round(Number(before.scale) * 100)}% → ${Math.round(Number(after.scale) * 100)}% of the frame`;
    case "Rotation":
      return `${Math.round(Number(before.rotation))}° → ${Math.round(Number(after.rotation))}°`;
    case "Opacity":
      return `${Math.round(Number(before.opacity) * 100)}% → ${Math.round(Number(after.opacity) * 100)}%`;
    case "Typography":
      return before.font !== after.font ? `${FONT_LABEL[before.font as keyof typeof FONT_LABEL] ?? before.font} → ${FONT_LABEL[after.font as keyof typeof FONT_LABEL] ?? after.font}` : "Size, colour or spacing";
    case "Backdrop":
      return "Backdrop or colour changed";
    case "Shadow":
      return "Softness, direction, length or strength";
  }
}

/** True when the scene has saved changes since the film last took them in. */
export function sceneChangedSince(film: Film, scene: Scene | null) {
  return !!film.source && !!scene && scene.revision !== film.source.revision;
}

/** What "Update from scene" would change. */
export function diffScene(film: Film, scene: Scene): SceneChange[] {
  const changes: SceneChange[] = [];
  const linked = film.clips.filter((c) => c.link && c.link.sceneId === scene.id && !c.link.detached);
  const byLayer = new Map<string, Clip[]>();
  for (const c of linked) byLayer.set(c.link!.layerId, [...(byLayer.get(c.link!.layerId) ?? []), c]);
  for (const [layerId, clips] of byLayer) {
    const layer = scene.layers.find((l) => l.id === layerId);
    const imported = clips[0].link!.imported as Record<string, unknown>;
    if (!layer || !layer.visible) {
      changes.push({ kind: "removed", layerId, name: String(imported.name ?? "Layer"), clipIds: clips.map((c) => c.id) });
      continue;
    }
    const now = layer as unknown as Record<string, unknown>;
    const fields: FieldChange[] = [];
    for (const [field, keys] of Object.entries(FIELDS[layer.kind]) as Array<[Field, string[]]>) {
      if (!keys.some((k) => JSON.stringify(now[k]) !== JSON.stringify(imported[k]))) continue;
      fields.push({ field, detail: describe(field, imported, now), conflict: clips.some((c) => editedHere(c, field)) });
    }
    if (fields.length) changes.push({ kind: "changed", layerId, name: layer.name, layerKind: layer.kind, clipIds: clips.map((c) => c.id), fields });
  }
  const known = new Set([...byLayer.keys(), ...film.clips.filter((c) => c.link?.detached).map((c) => c.link!.layerId)]);
  for (const l of scene.layers) {
    if (!l.visible || known.has(l.id) || l.kind === "shadow" || l.kind === "backdrop") continue;
    changes.push({ kind: "added", layerId: l.id, name: l.name, layerKind: l.kind });
  }
  return changes;
}

export interface UpdateChoices {
  /** For conflicting fields: "scene" takes the scene's value, "film" keeps the edit made here. Key: `${layerId}:${field}`. */
  conflicts: Record<string, "scene" | "film">;
  /** Add new scene layers to every shot. */
  addNew: boolean;
  /** Remove clips whose layer was deleted or hidden in the scene (otherwise they're detached and kept). */
  removeMissing: boolean;
}

const shift = (list: Clip["keyframes"][ClipProp], by: number) => list?.map((k) => ({ ...k, v: k.v + by }));
const scaleBy = (list: Clip["keyframes"][ClipProp], by: number) => list?.map((k) => ({ ...k, v: k.v * by }));

function applyField(clip: Clip, field: Field, before: Record<string, unknown>, after: SceneLayer): Clip {
  const c: Clip = { ...clip, keyframes: { ...clip.keyframes }, transform: { ...clip.transform } };
  const num = (k: string) => Number(before[k]);
  const a = after as unknown as Record<string, number>;
  switch (field) {
    case "Position": {
      // Move the layer by the same amount the scene moved it, keeping its animation.
      const dx = a.x - num("x");
      const dy = a.y - num("y");
      c.transform.x += dx;
      c.transform.y += dy;
      if (c.keyframes.x) c.keyframes.x = shift(c.keyframes.x, dx);
      if (c.keyframes.y) c.keyframes.y = shift(c.keyframes.y, dy);
      if (c.source.kind === "light") {
        if (c.keyframes.lightX) c.keyframes.lightX = shift(c.keyframes.lightX, dx);
        if (c.keyframes.lightY) c.keyframes.lightY = shift(c.keyframes.lightY, dy);
      }
      break;
    }
    case "Size": {
      const ratio = num("scale") > 0 ? a.scale / num("scale") : 1;
      c.transform.scale *= ratio;
      if (c.keyframes.scale) c.keyframes.scale = scaleBy(c.keyframes.scale, ratio);
      break;
    }
    case "Rotation": {
      const d = a.rotation - num("rotation");
      c.transform.rotation += d;
      if (c.keyframes.rotation) c.keyframes.rotation = shift(c.keyframes.rotation, d);
      break;
    }
    case "Opacity":
      c.transform.opacity = a.opacity;
      break;
    case "Image":
      if (c.source.kind === "image" && (after.kind === "product" || after.kind === "logo")) c.source = { ...c.source, assetId: after.assetId, aspect: after.aspect };
      break;
    case "Backdrop":
      if (c.source.kind === "backdrop" && after.kind === "backdrop") c.source = { kind: "backdrop", backdrop: after.backdrop, imageAssetId: after.imageAssetId, tint: after.tint };
      break;
    case "Text":
      if (c.source.kind === "text" && after.kind === "text") c.source = { ...c.source, style: { ...c.source.style, text: after.text } };
      break;
    case "Typography":
      if (c.source.kind === "text" && after.kind === "text") {
        const { font, weight, size, color, align, letterSpacing, lineHeight, uppercase } = after;
        c.source = { ...c.source, style: { ...c.source.style, font, weight, size, color, align, letterSpacing, lineHeight, uppercase } };
      }
      break;
    case "Shadow":
      if (c.source.kind === "shadow" && after.kind === "shadow") {
        c.source = { ...c.source, softness: after.softness, direction: after.direction, length: after.length };
        c.transform.opacity = after.opacity;
      }
      break;
  }
  return c;
}

/** Apply a scene's changes to a film, following the choices. Returns the new film. */
export function applySceneUpdate(film: Film, scene: Scene, choices: UpdateChoices): Film {
  const changes = diffScene(film, scene);
  let clips = [...film.clips];
  for (const ch of changes) {
    if (ch.kind === "changed") {
      const layer = scene.layers.find((l) => l.id === ch.layerId)!;
      clips = clips.map((c) => {
        if (!ch.clipIds.includes(c.id)) return c;
        let next = c;
        for (const f of ch.fields) {
          const keep = f.conflict && editedHere(c, f.field) && choices.conflicts[`${ch.layerId}:${f.field}`] !== "scene";
          if (!keep) next = applyField(next, f.field, c.link!.imported as Record<string, unknown>, layer);
        }
        const imported = JSON.parse(JSON.stringify(layer));
        return { ...next, link: { ...next.link!, imported, made: { transform: next.transform, source: next.source } } };
      });
    } else if (ch.kind === "removed") {
      if (choices.removeMissing) {
        const gone = new Set(ch.clipIds);
        // Their shadows go too.
        clips.filter((c) => c.source.kind === "shadow" && gone.has(c.source.targetClipId)).forEach((c) => gone.add(c.id));
        clips = clips.filter((c) => !gone.has(c.id));
      } else clips = clips.map((c) => (ch.clipIds.includes(c.id) ? { ...c, link: { ...c.link!, detached: true } } : c));
    }
  }
  let tracks = film.tracks;
  if (choices.addNew) {
    const added = changes.filter((c): c is Extract<SceneChange, { kind: "added" }> => c.kind === "added");
    for (const a of added) {
      const layer = scene.layers.find((l) => l.id === a.layerId);
      if (!layer || layer.kind === "shadow" || layer.kind === "backdrop") continue;
      const track = { id: crypto.randomUUID(), kind: "visual" as const, name: layer.name.slice(0, 40), hidden: false, locked: false, muted: false, solo: false };
      tracks = [track, ...tracks];
      for (const shot of film.shots) {
        const transform = { x: layer.x, y: layer.y, scale: layer.scale, rotation: layer.rotation, opacity: layer.opacity, anchorX: 0.5, anchorY: 0.5 };
        const source: Clip["source"] | null = layer.kind === "text" ? { kind: "text", style: { text: layer.text, font: layer.font, weight: layer.weight, size: layer.size, color: layer.color, align: layer.align, letterSpacing: layer.letterSpacing, lineHeight: layer.lineHeight, uppercase: layer.uppercase }, anim: { in: { kind: "fade", duration: 0.6 }, out: { kind: "none", duration: 0.4 }, by: "word" } } : { kind: "image", assetId: layer.assetId, aspect: layer.aspect };
        const clip = newClip({ trackId: track.id, shotId: shot.id, start: 0, duration: shot.duration, source, name: layer.name, role: layer.kind === "product" ? "product" : "overlay", transform, depth: layer.kind === "product" ? 1 : 0 });
        clip.link = { sceneId: scene.id, layerId: layer.id, detached: false, imported: JSON.parse(JSON.stringify(layer)), made: { transform, source } };
        clips.push(clip);
      }
    }
  }
  return { ...film, tracks, clips, source: film.source ? { ...film.source, revision: scene.revision, sceneName: scene.name } : film.source };
}

/** Stop a clip following its scene layer. */
export function detachClip(film: Film, clipId: string): Film {
  return { ...film, clips: film.clips.map((c) => (c.id === clipId && c.link ? { ...c, link: { ...c.link, detached: true } } : c)) };
}
