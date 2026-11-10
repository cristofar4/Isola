/**
 * Renders a scene into any frame size. Used for the Scene Studio canvas, its
 * format thumbnails, PNG/JPEG exports and Motion Studio's import previews.
 * Selection outlines and handles are drawn by the editor on a separate
 * overlay, never here.
 */

import { drawBackdropLayer, drawImageLayer, drawMissing, drawProductShadow, drawTextBlock, layoutText, type Ctx, type Drawable, type FontFamilies, type Placement } from "./draw";
import { backdropInfo, type Scene, type SceneLayer, type TextLayer } from "./model";

export interface SceneResources {
  image(assetId: string): Drawable | null;
  fonts: FontFamilies;
}

/** Placement of an image layer (product or logo) in a W × H frame. */
export function imagePlacement(layer: { x: number; y: number; scale: number; rotation: number; opacity: number; aspect: number }, W: number, H: number): Placement {
  const short = Math.min(W, H);
  const h = layer.scale * short;
  return { cx: layer.x * W, cy: layer.y * H, w: h * layer.aspect, h, rotation: layer.rotation, opacity: layer.opacity };
}

export function textPixelSize(layer: Pick<TextLayer, "size" | "scale">, W: number, H: number) {
  return layer.size * (layer.scale || 1) * Math.min(W, H);
}

/** The on-screen box of any layer (backdrops fill the frame; shadows follow their product). */
export function layerPlacement(ctx: Ctx, scene: Pick<Scene, "layers">, layer: SceneLayer, W: number, H: number, res: Pick<SceneResources, "fonts">): Placement | null {
  switch (layer.kind) {
    case "backdrop":
      return { cx: W / 2, cy: H / 2, w: W, h: H, rotation: 0, opacity: layer.opacity };
    case "product":
    case "logo":
      return imagePlacement(layer, W, H);
    case "shadow": {
      const target = scene.layers.find((l) => l.id === layer.targetId);
      return target && target.kind === "product" ? imagePlacement(target, W, H) : null;
    }
    case "text": {
      const layout = layoutText(ctx, layer, textPixelSize(layer, W, H), res.fonts);
      return { cx: layer.x * W, cy: layer.y * H, w: layout.width, h: layout.height, rotation: layer.rotation, opacity: layer.opacity };
    }
  }
}

/** Assets a scene draws (to load before rendering). */
export function sceneAssetIds(scene: Pick<Scene, "layers">) {
  const ids = new Set<string>();
  for (const l of scene.layers) {
    if (l.kind === "product" || l.kind === "logo") ids.add(l.assetId);
    if (l.kind === "backdrop" && l.imageAssetId) ids.add(l.imageAssetId);
  }
  return [...ids];
}

/** Assets the scene uses that aren't available in this browser. */
export function missingAssets(scene: Pick<Scene, "layers">, res: Pick<SceneResources, "image">) {
  return sceneAssetIds(scene).filter((id) => !res.image(id));
}

export interface RenderSceneOptions {
  /** Layers to leave out (e.g. Compare shows the product without the set). */
  skip?: (layer: SceneLayer) => boolean;
  /** Draw a labelled box where an image is missing (preview); exports refuse to run instead. */
  showMissing?: boolean;
}

export function renderScene(ctx: Ctx, scene: Pick<Scene, "layers">, W: number, H: number, res: SceneResources, opts: RenderSceneOptions = {}) {
  const short = Math.min(W, H);
  const backdrop = scene.layers.find((l) => l.kind === "backdrop");
  const lightDirection = backdrop?.kind === "backdrop" ? (backdropInfo(backdrop.backdrop)?.id === "warm-stone" ? -40 : 40) : 40;
  ctx.save();
  for (const layer of scene.layers) {
    if (!layer.visible || opts.skip?.(layer)) continue;
    ctx.save();
    ctx.globalAlpha = 1;
    switch (layer.kind) {
      case "backdrop": {
        ctx.globalAlpha = layer.opacity;
        drawBackdropLayer(ctx, layer, W, H, layer.imageAssetId ? res.image(layer.imageAssetId) : null);
        break;
      }
      case "product":
      case "logo": {
        const img = res.image(layer.assetId);
        const p = imagePlacement(layer, W, H);
        if (img) drawImageLayer(ctx, img, p, layer.kind === "product" && layer.light ? { direction: lightDirection, strength: 1 } : null);
        else if (opts.showMissing) drawMissing(ctx, p, "Missing image");
        break;
      }
      case "shadow": {
        const target = scene.layers.find((l) => l.id === layer.targetId);
        if (!target || target.kind !== "product" || !target.visible || opts.skip?.(target)) break;
        const img = res.image(target.assetId);
        if (img) drawProductShadow(ctx, img, imagePlacement(target, W, H), { opacity: layer.opacity, softness: layer.softness, direction: layer.direction, length: layer.length }, short);
        break;
      }
      case "text": {
        const layout = layoutText(ctx, layer, textPixelSize(layer, W, H), res.fonts);
        drawTextBlock(ctx, layer, layout, { cx: layer.x * W, cy: layer.y * H, w: layout.width, h: layout.height, rotation: layer.rotation, opacity: layer.opacity });
        break;
      }
    }
    ctx.restore();
  }
  ctx.restore();
}
