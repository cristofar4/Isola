/**
 * Scene Studio's document: a product composition made of separate layers
 * (backdrop, product cutouts, their shadows, text and logos).
 *
 * Coordinates are resolution-independent so the same scene renders in every
 * format (Square, Portrait, Wide, Story) and at any size:
 * - `x`, `y`: the layer's centre as a fraction of the frame's width/height.
 * - `scale`: the layer's height as a fraction of the frame's short side.
 * - `rotation`: degrees, clockwise.
 *
 * Product layers point at library assets (cutouts with transparency). The
 * files themselves are never changed: everything here is placement.
 */

export const SCENE_VERSION = 1;

export type SceneFormatId = "square" | "portrait" | "wide" | "story";

export const SCENE_FORMATS: Record<SceneFormatId, { label: string; ratio: string; width: number; height: number }> = {
  square: { label: "Square 1:1", ratio: "1:1", width: 1080, height: 1080 },
  portrait: { label: "Portrait 4:5", ratio: "4:5", width: 1080, height: 1350 },
  wide: { label: "Wide 16:9", ratio: "16:9", width: 1920, height: 1080 },
  story: { label: "Story 9:16", ratio: "9:16", width: 1080, height: 1920 },
};
export const FORMAT_ORDER: SceneFormatId[] = ["square", "portrait", "wide", "story"];

export type BackdropId = "ivory-plinth" | "sage-wall" | "warm-stone" | "pale-blue" | "linen" | "marble";

export interface BackdropInfo {
  id: BackdropId;
  name: string;
  category: "Studio" | "Natural" | "Interior";
  /** Where products rest, as a fraction of the frame height (the plinth or floor). */
  surfaceY: number;
  /** The wall colour, used for swatches and as the base before a tint. */
  wall: string;
  keywords: string;
}

/** Backdrops are drawn by code (src/lib/scene/backdrops.ts), not photographs, so they work at any size and carry no licence questions. */
export const BACKDROPS: BackdropInfo[] = [
  { id: "ivory-plinth", name: "Ivory plinth", category: "Studio", surfaceY: 0.7, wall: "#ECE4D8", keywords: "cream pedestal cylinder podium warm" },
  { id: "sage-wall", name: "Sage wall", category: "Natural", surfaceY: 0.8, wall: "#B9C4B0", keywords: "green window light shadow botanical" },
  { id: "warm-stone", name: "Warm stone", category: "Natural", surfaceY: 0.69, wall: "#D8C6AE", keywords: "travertine rock beige slab sand" },
  { id: "pale-blue", name: "Pale blue seamless", category: "Studio", surfaceY: 0.8, wall: "#D3E0EC", keywords: "sky sweep clean cool minimal" },
  { id: "linen", name: "Sunlight on linen", category: "Interior", surfaceY: 0.8, wall: "#EFE6D7", keywords: "fabric cloth sheet soft morning" },
  { id: "marble", name: "Marble slab", category: "Interior", surfaceY: 0.67, wall: "#E7E5E1", keywords: "white grey stone veins luxury" },
];

export function backdropInfo(id: BackdropId | null | undefined) {
  return BACKDROPS.find((b) => b.id === id) ?? null;
}

export type FontId = "sans" | "display" | "serif" | "condensed";
export const FONT_LABEL: Record<FontId, string> = { sans: "Inter", display: "Inter Tight", serif: "Cormorant Garamond", condensed: "Bebas Neue" };
/** Weights each font family actually ships, so a choice never falls back silently. */
export const FONT_WEIGHTS: Record<FontId, number[]> = { sans: [400, 500, 600, 700], display: [600, 700, 800], serif: [400, 500, 600, 700], condensed: [400] };

export interface TextStyle {
  text: string;
  font: FontId;
  weight: number;
  /** Font size as a fraction of the frame's short side. */
  size: number;
  color: string;
  align: "left" | "center" | "right";
  /** Extra space between letters, in em. */
  letterSpacing: number;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  uppercase: boolean;
}

export const DEFAULT_TEXT: TextStyle = { text: "Your headline", font: "display", weight: 700, size: 0.07, color: "#20292D", align: "center", letterSpacing: 0, lineHeight: 1.15, uppercase: false };

interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface BackdropLayer extends LayerBase {
  kind: "backdrop";
  backdrop: BackdropId | null;
  /** An uploaded background from the library instead of a drawn backdrop. */
  imageAssetId: string | null;
  /** Recolours the set (keeps its light and shade). */
  tint: string | null;
}

export interface ProductLayer extends LayerBase {
  kind: "product";
  assetId: string;
  /** Width ÷ height of the asset, so layout doesn't need the pixels. */
  aspect: number;
  /** Optional light matched to the backdrop. Off by default: it changes how the product looks. */
  light: boolean;
}

export interface ShadowLayer extends LayerBase {
  kind: "shadow";
  /** The product layer this shadow belongs to; it follows that layer. */
  targetId: string;
  /** 0 (crisp) to 1 (very soft). */
  softness: number;
  /** Direction the light comes from, in degrees (0 = straight above, 90 = from the left). */
  direction: number;
  /** Length of the cast shadow relative to the product height (0 = contact shadow only). */
  length: number;
}

export interface TextLayer extends LayerBase, TextStyle {
  kind: "text";
}

export interface LogoLayer extends LayerBase {
  kind: "logo";
  assetId: string;
  aspect: number;
}

export type SceneLayer = BackdropLayer | ProductLayer | ShadowLayer | TextLayer | LogoLayer;
export type SceneLayerKind = SceneLayer["kind"];

export interface Scene {
  version: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
  /** Goes up by one with every saved change; Motion Studio uses it to notice updates. */
  revision: number;
  /** The format being edited. */
  format: SceneFormatId;
  /** Formats made from this scene (all share the same layers). */
  formats: SceneFormatId[];
  /** Bottom to top. */
  layers: SceneLayer[];
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
export const newId = uid;

const base = (name: string, over: Partial<LayerBase> = {}): LayerBase => ({ id: uid(), name, visible: true, locked: false, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, ...over });

export function backdropLayer(backdrop: BackdropId | null = "ivory-plinth"): BackdropLayer {
  return { ...base("Backdrop"), kind: "backdrop", backdrop, imageAssetId: null, tint: null };
}

/** A product placed standing on the backdrop's surface. */
export function productLayer(assetId: string, name: string, aspect: number, opts: { surfaceY?: number; x?: number; scale?: number } = {}): ProductLayer {
  const scale = opts.scale ?? 0.5;
  const surfaceY = opts.surfaceY ?? 0.75;
  return { ...base(name, { x: opts.x ?? 0.5, y: surfaceY - scale * 0.5 * (1 / 1), scale }), kind: "product", assetId, aspect: aspect > 0 && Number.isFinite(aspect) ? aspect : 1, light: false };
}

export function shadowLayer(target: ProductLayer): ShadowLayer {
  return { ...base(`${target.name} shadow`, { opacity: 0.7 }), kind: "shadow", targetId: target.id, softness: 0.45, direction: 45, length: 0.25 };
}

export function textLayer(style: Partial<TextStyle> = {}, over: Partial<LayerBase> = {}): TextLayer {
  return { ...base("Text", { y: 0.16, ...over }), kind: "text", ...DEFAULT_TEXT, ...style };
}

export function logoLayer(assetId: string, aspect: number): LogoLayer {
  return { ...base("Logo", { x: 0.5, y: 0.1, scale: 0.08 }), kind: "logo", assetId, aspect: aspect > 0 ? aspect : 1 };
}

export function emptyScene(name = "Untitled scene", format: SceneFormatId = "square"): Scene {
  const now = Date.now();
  return { version: SCENE_VERSION, id: uid(), name, createdAt: now, updatedAt: now, trashedAt: null, revision: 1, format, formats: [format], layers: [backdropLayer()] };
}

/** Put a product's bottom edge on the frame height fraction `surfaceY` for a frame of the given size. */
export function standOnSurface(layer: ProductLayer, surfaceY: number, width: number, height: number): ProductLayer {
  const short = Math.min(width, height);
  const halfHeight = (layer.scale * short) / 2 / height;
  return { ...layer, y: clamp(surfaceY - halfHeight, -1, 2) };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, lo, hi) : fallback);

/** Makes stored or imported data safe to render: fills missing fields and drops broken layers. */
export function migrateScene(raw: unknown): Scene | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Scene> & { layers?: unknown[] };
  if (typeof r.id !== "string") return null;
  const formats = (Array.isArray(r.formats) ? r.formats : []).filter((f): f is SceneFormatId => f in SCENE_FORMATS);
  const format = r.format && r.format in SCENE_FORMATS ? r.format : (formats[0] ?? "square");
  const layers: SceneLayer[] = [];
  for (const l of Array.isArray(r.layers) ? r.layers : []) {
    if (!l || typeof l !== "object") continue;
    const layer = l as SceneLayer;
    if (typeof layer.id !== "string" || !["backdrop", "product", "shadow", "text", "logo"].includes(layer.kind)) continue;
    const b: LayerBase = {
      id: layer.id,
      name: typeof layer.name === "string" ? layer.name.slice(0, 80) : layer.kind,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      x: num(layer.x, 0.5, -2, 3),
      y: num(layer.y, 0.5, -2, 3),
      scale: num(layer.scale, 0.5, 0.01, 6),
      rotation: num(layer.rotation, 0, -3600, 3600),
      opacity: num(layer.opacity, 1, 0, 1),
    };
    if (layer.kind === "backdrop") layers.push({ ...b, kind: "backdrop", backdrop: backdropInfo(layer.backdrop)?.id ?? null, imageAssetId: typeof layer.imageAssetId === "string" ? layer.imageAssetId : null, tint: typeof layer.tint === "string" && HEX.test(layer.tint) ? layer.tint : null });
    else if (layer.kind === "product" && typeof layer.assetId === "string") layers.push({ ...b, kind: "product", assetId: layer.assetId, aspect: num(layer.aspect, 1, 0.05, 20), light: layer.light === true });
    else if (layer.kind === "logo" && typeof layer.assetId === "string") layers.push({ ...b, kind: "logo", assetId: layer.assetId, aspect: num(layer.aspect, 1, 0.05, 20) });
    else if (layer.kind === "shadow" && typeof layer.targetId === "string")
      layers.push({ ...b, kind: "shadow", targetId: layer.targetId, softness: num(layer.softness, 0.45, 0, 1), direction: num(layer.direction, 45, -180, 180), length: num(layer.length, 0.25, 0, 1.5) });
    else if (layer.kind === "text") layers.push({ ...b, kind: "text", ...sanitiseText(layer) });
  }
  return {
    version: SCENE_VERSION,
    id: r.id,
    name: typeof r.name === "string" && r.name.trim() ? r.name.slice(0, 80) : "Untitled scene",
    createdAt: num(r.createdAt, Date.now()),
    updatedAt: num(r.updatedAt, Date.now()),
    trashedAt: typeof r.trashedAt === "number" ? r.trashedAt : null,
    revision: Math.max(1, Math.round(num(r.revision, 1))),
    format,
    formats: formats.length ? [...new Set(formats)] : [format],
    layers,
  };
}

export function sanitiseText(t: Partial<TextStyle>): TextStyle {
  const font: FontId = t.font && t.font in FONT_LABEL ? t.font : DEFAULT_TEXT.font;
  const weights = FONT_WEIGHTS[font];
  const weight = weights.includes(Number(t.weight)) ? Number(t.weight) : weights.reduce((best, w) => (Math.abs(w - Number(t.weight ?? 700)) < Math.abs(best - Number(t.weight ?? 700)) ? w : best), weights[0]);
  return {
    text: typeof t.text === "string" ? t.text.slice(0, 400) : DEFAULT_TEXT.text,
    font,
    weight,
    size: num(t.size, DEFAULT_TEXT.size, 0.01, 0.5),
    color: typeof t.color === "string" && HEX.test(t.color) ? t.color.toUpperCase() : DEFAULT_TEXT.color,
    align: t.align === "left" || t.align === "right" ? t.align : "center",
    letterSpacing: num(t.letterSpacing, 0, -0.1, 1),
    lineHeight: num(t.lineHeight, DEFAULT_TEXT.lineHeight, 0.7, 3),
    uppercase: t.uppercase === true,
  };
}

/** The product layers, in order, for things like "animate each product". */
export const productsOf = (scene: Pick<Scene, "layers">) => scene.layers.filter((l): l is ProductLayer => l.kind === "product");
