"use client";

import { addAssets, getAsset } from "@/lib/studio/library";
import { backdropInfo, productLayer, shadowLayer, standOnSurface, textLayer, SCENE_FORMATS, type ProductLayer, type Scene } from "./model";
import { createScene, saveScene } from "./store";

/**
 * A ready-made scene to try things with, built from cutouts that ship with
 * ISOLA (made by ISOLA's own models from Unsplash photos; see
 * public/samples/CREDITS.md). They're added to your library like any upload.
 */
const SAMPLE = { url: "/showcase/batch/serum-cutout.webp", name: "sample-serum-cutout.webp" };

async function sampleAsset() {
  const res = await fetch(SAMPLE.url);
  if (!res.ok) throw new Error("The sample image couldn't be loaded.");
  const blob = await res.blob();
  const { added, duplicates } = await addAssets([new File([blob], SAMPLE.name, { type: blob.type || "image/webp" })], { kind: "cutout" });
  const asset = added[0] ?? duplicates[0]?.of ?? null;
  if (!asset) throw new Error("The sample image couldn't be added to your library.");
  return getAsset(asset.id) ?? asset;
}

export async function createSampleScene(): Promise<Scene> {
  const asset = await sampleAsset();
  const scene = await createScene("Sample scene", "square");
  const { width, height } = SCENE_FORMATS.square;
  const surface = backdropInfo("ivory-plinth")!.surfaceY;
  const product: ProductLayer = standOnSurface({ ...productLayer(asset.id, "Serum", asset.width / Math.max(1, asset.height), { scale: 0.46, x: 0.5 }) }, surface, width, height);
  const title = textLayer({ text: "Your headline", size: 0.062, font: "serif", weight: 600, color: "#2C363B" }, { y: 0.14 });
  return saveScene({ ...scene, layers: [...scene.layers, shadowLayer(product), product, title] });
}
