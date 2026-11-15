import { backgroundHex, type BrandPresetInput } from "@/lib/brand-presets";
import { DEFAULT_IDENTITY } from "@/lib/brand-presets";
import { backdropInfo, backdropLayer, emptyScene, logoLayer, productLayer, shadowLayer, standOnSurface, textLayer, SCENE_FORMATS, type Scene, type SceneFormatId } from "./model";

/** Dark or light text for a background colour. */
function readableOn(hex: string | null) {
  if (!hex) return "#20292D";
  const n = parseInt(hex.slice(1), 16);
  const l = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return l > 150 ? "#20292D" : "#FFFFFF";
}

/**
 * A scene that shows a preset's identity on a product: the set recoloured
 * with the preset's background, the heading in its typeface, its logo, and
 * the preset's shadow choice. It's only for previews and is never saved.
 */
export function brandPreviewScene(preset: Pick<BrandPresetInput, "name" | "colors" | "layout" | "identity">, product: { id: string; aspect: number } | null, format: SceneFormatId = "portrait", logo: { id: string; aspect: number } | null = null): Scene {
  const identity = preset.identity ?? DEFAULT_IDENTITY;
  const scene = emptyScene(preset.name || "Preview", format);
  const { width, height } = SCENE_FORMATS[format];
  const tint = backgroundHex(preset.layout, preset.colors);
  const backdrop = { ...backdropLayer("ivory-plinth"), tint: tint && tint.toUpperCase() !== "#FFFFFF" ? tint : null };
  const surface = backdropInfo("ivory-plinth")!.surfaceY;
  const layers: Scene["layers"] = [backdrop];
  if (product) {
    const p = standOnSurface(productLayer(product.id, "Product", product.aspect, { scale: format === "wide" ? 0.5 : 0.42, x: 0.5 }), surface, width, height);
    if (preset.layout.shadow) layers.push(shadowLayer(p));
    layers.push(p);
  }
  const ink = readableOn(tint);
  layers.push(textLayer({ text: preset.name || "Your brand", font: identity.typography.heading.font, weight: identity.typography.heading.weight, size: format === "wide" ? 0.085 : 0.075, color: ink }, { y: format === "wide" ? 0.2 : 0.2 }));
  if (logo) layers.push({ ...logoLayer(logo.id, logo.aspect), x: 0.5, y: 0.085, scale: 0.06 });
  return { ...scene, formats: [format], layers };
}
