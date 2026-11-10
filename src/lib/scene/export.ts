"use client";

import { Zip, ZipPassThrough } from "fflate";
import { downloadBlob } from "@/lib/editor/export";
import { drawWatermark } from "@/lib/editor/watermark";
import { applyPolicySize, exportPolicy, type ExportPolicy } from "@/lib/plan-policy";
import { sessionAccess } from "@/lib/session-gate";
import { recordExport } from "@/lib/studio/export-history";
import { context2d, makeCanvas } from "./backdrops";
import { ensureFonts, fontFamilies } from "./fonts";
import { SCENE_FORMATS, type Scene, type SceneFormatId } from "./model";
import { renderScene, sceneAssetIds } from "./render";
import { assetImage, loadAssetImages } from "./resources";

export type StillFormat = "png" | "jpeg";

async function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: StillFormat): Promise<Blob> {
  const mime = type === "jpeg" ? "image/jpeg" : "image/png";
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: mime, quality: 0.92 });
  return new Promise((resolve, reject) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be encoded."))), mime, 0.92));
}

/** Prepare everything a scene draws (images, fonts). Throws if an image is missing from this browser. */
export async function prepareScene(scene: Scene) {
  const ids = sceneAssetIds(scene);
  await loadAssetImages(ids);
  const missing = ids.filter((id) => !assetImage(id));
  if (missing.length) throw new Error(`${missing.length} image${missing.length === 1 ? " is" : "s are"} missing from this browser's library. Replace or remove ${missing.length === 1 ? "that layer" : "those layers"} first.`);
  await ensureFonts(scene.layers.flatMap((l) => (l.kind === "text" ? [{ font: l.font, weight: l.weight }] : [])));
}

/** Render one format of a scene to a PNG or JPEG, following the plan's rules. */
export async function renderSceneStill(scene: Scene, format: SceneFormatId, type: StillFormat, policy: ExportPolicy) {
  const f = SCENE_FORMATS[format];
  const { width, height } = applyPolicySize(f.width, f.height, policy);
  const canvas = makeCanvas(width, height);
  const ctx = context2d(canvas);
  renderScene(ctx, scene, width, height, { image: assetImage, fonts: fontFamilies() });
  if (policy.watermark) drawWatermark(ctx, width, height);
  return { blob: await toBlob(canvas, type), width, height };
}

const stem = (name: string) => name.trim().replace(/[^\p{L}\p{N}\-_ .]+/gu, "").replace(/\s+/g, "-").slice(0, 60) || "isola-scene";

/** Download one format, or several as a ZIP (a folder per format). Returns the file name. */
export async function downloadScene(scene: Scene, formats: SceneFormatId[], type: StillFormat): Promise<string> {
  if (!formats.length) throw new Error("Choose at least one format.");
  await prepareScene(scene);
  const policy = exportPolicy((await sessionAccess()).pro);
  const ext = type === "jpeg" ? "jpg" : "png";
  if (formats.length === 1) {
    const f = SCENE_FORMATS[formats[0]];
    const { blob, width, height } = await renderSceneStill(scene, formats[0], type, policy);
    const name = `${stem(scene.name)}-${f.ratio.replace(":", "x")}-${width}x${height}.${ext}`;
    downloadBlob(blob, name);
    void recordExport({ title: scene.name, fileName: name, source: "scene", files: 1, format: type.toUpperCase(), blob, preview: blob, destinations: [f.label] });
    return name;
  }
  const chunks: Uint8Array[] = [];
  const zip = new Zip((err, chunk) => {
    if (!err) chunks.push(chunk);
  });
  let preview: Blob | null = null;
  for (const id of formats) {
    const f = SCENE_FORMATS[id];
    const { blob, width, height } = await renderSceneStill(scene, id, type, policy);
    preview ??= blob;
    const entry = new ZipPassThrough(`${f.label.replace(/[^\w]+/g, "-").replace(/-+$/, "").toLowerCase()}/${stem(scene.name)}-${width}x${height}.${ext}`);
    zip.add(entry);
    entry.push(new Uint8Array(await blob.arrayBuffer()), true);
  }
  zip.end();
  const name = `${stem(scene.name)}-formats.zip`;
  const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
  downloadBlob(blob, name);
  void recordExport({ title: scene.name, fileName: name, source: "scene", files: formats.length, format: type.toUpperCase(), blob, preview, destinations: formats.map((f) => SCENE_FORMATS[f].label) });
  return name;
}
