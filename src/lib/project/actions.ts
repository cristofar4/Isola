"use client";

import { decodeImage, makeThumbnail } from "@/lib/image/decode";
import { validateImageFile, type ValidationError } from "@/lib/image/validate";
import { readRect, writeRect, type Rect } from "@/lib/editor/geometry";
import { ImageLayers } from "@/lib/editor/layers";
import type { CompositeSources } from "@/lib/editor/compose";
import type { HistoryEntry } from "@/lib/editor/history";
import { DEFAULT_SETTINGS, type EditSettings } from "@/lib/editor/types";
import { getEngine } from "@/lib/processing/registry";
import { EngineError, isCancellation, looksEmpty } from "@/lib/processing/types";
import { uploadLimits } from "@/lib/config";
import { isSignedIn } from "@/lib/session-gate";
import {
  backgroundAssets,
  createImageAssets,
  imageAssets,
  releaseImageAssets,
} from "./assets";
import { getImage, newImage, useProject, type ProjectImage } from "./store";

const store = () => useProject.getState();

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function bump(id: string, patch: Partial<ProjectImage> = {}) {
  const assets = imageAssets.get(id);
  store().patchImage(id, (img) => ({
    ...patch,
    revision: img.revision + 1,
    history: assets
      ? {
          canUndo: assets.history.canUndo,
          canRedo: assets.history.canRedo,
          undoLabel: assets.history.undoLabel,
          redoLabel: assets.history.redoLabel,
        }
      : img.history,
  }));
}

export interface ImportReport {
  accepted: string[];
  rejected: Array<{ name: string; error: ValidationError }>;
}

/**
 * Validate, decode and queue files for processing. Works for every entry
 * point (landing page, editor, drag and drop, samples).
 */
export async function importFiles(
  files: File[],
  options: { process?: boolean; activate?: boolean } = {},
): Promise<ImportReport> {
  const { process = true, activate = true } = options;
  const report: ImportReport = { accepted: [], rejected: [] };
  for (const file of files) {
    const validation = await validateImageFile(file);
    if (!validation.ok) {
      report.rejected.push({ name: file.name, error: validation.error });
      continue;
    }
    const id = uid();
    imageAssets.set(id, createImageAssets(file));
    store().addImage(
      newImage({ id, name: file.name || "image", size: file.size, mime: validation.info.mime }),
    );
    if (activate && report.accepted.length === 0) store().setActive(id);
    report.accepted.push(id);
  }
  // Decode sequentially to keep peak memory predictable.
  void (async () => {
    for (const id of report.accepted) {
      const ok = await decodeInto(id);
      if (ok && process) void processImage(id);
    }
  })();
  return report;
}

async function decodeInto(id: string): Promise<boolean> {
  const assets = imageAssets.get(id);
  if (!assets) return false;
  try {
    const decoded = await decodeImage(assets.file);
    if (!imageAssets.has(id)) {
      decoded.bitmap.close();
      return false;
    }
    assets.decoded = decoded;
    const thumb = await makeThumbnail(decoded.bitmap, 240, "image/jpeg");
    store().patchImage(id, {
      width: decoded.width,
      height: decoded.height,
      hasAlpha: decoded.hasAlpha,
      thumbUrl: URL.createObjectURL(thumb),
      status: "queued",
    });
    return true;
  } catch (error) {
    store().patchImage(id, {
      status: "error",
      error: { code: "decode-failed", message: error instanceof Error ? error.message : "Couldn't decode this image." },
    });
    return false;
  }
}

/** Start every image that was waiting for the visitor to sign in. */
export function resumeAfterSignIn() {
  for (const image of store().images) if (image.status === "needs-auth") void processImage(image.id);
}

/** Run (or re-run) background removal. The original stays untouched for retries. */
export async function processImage(id: string): Promise<void> {
  const assets = imageAssets.get(id);
  const image = getImage(id);
  if (!assets || !image) return;
  if (!assets.decoded) {
    const ok = await decodeInto(id);
    if (!ok) return;
  }
  const decoded = assets.decoded!;
  // Removing backgrounds needs an account; wait here until the visitor signs in.
  if (!(await isSignedIn())) {
    store().patchImage(id, { status: assets.mask ? "ready" : "needs-auth", phase: null });
    return;
  }
  assets.abort?.abort();
  const controller = new AbortController();
  assets.abort = controller;
  const engineId = store().engineId;
  store().patchImage(id, { status: "processing", phase: { kind: "waiting" }, error: null, notice: null });
  try {
    const engine = getEngine(engineId);
    const result = await engine.removeBackground(decoded.bitmap, {
      signal: controller.signal,
      onPhase: (phase) => {
        if (assets.abort === controller) store().patchImage(id, { phase });
      },
    });
    if (assets.abort !== controller || !imageAssets.has(id)) return;
    assets.abort = null;
    const previous = assets.mask;
    assets.aiMask = result.mask;
    const mask = result.mask.slice();
    assets.mask = mask;
    if (previous) {
      assets.history.push({ kind: "mask-replace", label: "Reprocess", before: previous, after: mask.slice() });
    }
    const settings = getImage(id)!.settings;
    if (assets.layers) assets.layers.setMask(mask);
    else
      assets.layers = new ImageLayers(decoded.pixels, decoded.width, decoded.height, mask, {
        shift: settings.shift,
        feather: settings.feather,
      });
    const thumb = await makeThumbnail(assets.layers.cutout as OffscreenCanvas, 240, "image/png");
    const old = getImage(id)?.resultThumbUrl;
    if (old) URL.revokeObjectURL(old);
    bump(id, {
      status: "ready",
      phase: null,
      resultThumbUrl: URL.createObjectURL(thumb),
      result: { engineId: result.engineId, backend: result.backend, durationMs: result.durationMs },
      notice: looksEmpty(result)
        ? "No clear subject was found. Use the restore brush to bring back what you want to keep."
        : null,
    });
  } catch (error) {
    if (assets.abort === controller) assets.abort = null;
    if (!imageAssets.has(id)) return;
    if (isCancellation(error)) {
      store().patchImage(id, { status: assets.mask ? "ready" : "cancelled", phase: null });
      return;
    }
    if (error instanceof EngineError && error.code === "auth-required") {
      store().patchImage(id, { status: assets.mask ? "ready" : "needs-auth", phase: null });
      return;
    }
    const e =
      error instanceof EngineError
        ? { code: error.code, message: error.message, detail: error.detail }
        : { code: "inference-failed", message: "Processing failed.", detail: String(error) };
    store().patchImage(id, { status: assets.mask ? "ready" : "error", phase: null, error: e });
  }
}

export function cancelProcessing(id: string) {
  imageAssets.get(id)?.abort?.abort();
}

export function removeImage(id: string) {
  const image = getImage(id);
  if (image?.thumbUrl) URL.revokeObjectURL(image.thumbUrl);
  if (image?.resultThumbUrl) URL.revokeObjectURL(image.resultThumbUrl);
  releaseImageAssets(id);
  store().dropImage(id);
}

/**
 * Add an image whose mask already exists (from Batch Studio). With
 * `batchItemId`, the editor image stays linked to that batch item so edits
 * can flow back to it.
 */
export async function importWithMask(
  file: File,
  mask: Uint8Array,
  meta: { engineId: string; backend: string; durationMs: number },
  options: { batchItemId?: string; background?: EditSettings["background"] } = {},
) {
  const id = uid();
  const assets = createImageAssets(file);
  imageAssets.set(id, assets);
  store().addImage(
    newImage({
      id,
      name: file.name,
      size: file.size,
      mime: file.type,
      batchItemId: options.batchItemId ?? null,
      settings: options.background ? { ...DEFAULT_SETTINGS, background: options.background } : DEFAULT_SETTINGS,
    }),
  );
  store().setActive(id);
  const ok = await decodeInto(id);
  if (!ok || !assets.decoded) return id;
  const { decoded } = assets;
  if (mask.length !== decoded.width * decoded.height) {
    store().patchImage(id, { status: "queued" });
    void processImage(id);
    return id;
  }
  assets.aiMask = mask;
  assets.mask = mask.slice();
  assets.layers = new ImageLayers(decoded.pixels, decoded.width, decoded.height, assets.mask, { shift: 0, feather: 0 });
  const thumb = await makeThumbnail(assets.layers.cutout as OffscreenCanvas, 240, "image/png");
  bump(id, { status: "ready", result: meta, resultThumbUrl: URL.createObjectURL(thumb) });
  return id;
}

/* ------------------------------------------------------------- editing ---- */

export function compositeSources(id: string): CompositeSources | null {
  const assets = imageAssets.get(id);
  const image = getImage(id);
  if (!assets?.decoded || !image) return null;
  const bg = image.settings.background;
  return {
    width: assets.decoded.width,
    height: assets.decoded.height,
    original: assets.decoded.bitmap,
    layers: assets.layers,
    backgroundImage: bg.kind === "image" ? (backgroundAssets.get(bg.assetId)?.bitmap ?? null) : null,
  };
}

export function commitMaskEdit(id: string, label: string, rect: Rect, before: Uint8Array, after: Uint8Array) {
  const assets = imageAssets.get(id);
  if (!assets) return;
  assets.history.push({ kind: "mask", label, rect, before, after });
  bump(id);
  void refreshResultThumb(id);
}

let refineTimer: number | undefined;

/**
 * Apply settings without recording history (live slider feedback). Edge
 * refinement rebuilds the whole cutout, so during drags it is coalesced.
 */
export function previewSettings(id: string, next: EditSettings, options: { immediate?: boolean } = {}) {
  const assets = imageAssets.get(id);
  const layers = assets?.layers;
  if (layers) {
    const current = layers.currentRefinement;
    if (current.shift !== next.shift || current.feather !== next.feather) {
      window.clearTimeout(refineTimer);
      const apply = () => {
        layers.setRefinement({ shift: next.shift, feather: next.feather });
        bump(id);
      };
      if (options.immediate) apply();
      else refineTimer = window.setTimeout(apply, 90);
    }
  }
  bump(id, { settings: next });
}

/** Apply settings and record an undoable step. */
export function commitSettings(id: string, label: string, before: EditSettings, after: EditSettings) {
  const assets = imageAssets.get(id);
  if (!assets) return;
  if (JSON.stringify(before) === JSON.stringify(after)) {
    previewSettings(id, after, { immediate: true });
    return;
  }
  assets.history.push({ kind: "settings", label, before, after });
  previewSettings(id, after, { immediate: true });
}

export function updateSettings(id: string, label: string, patch: Partial<EditSettings>) {
  const image = getImage(id);
  if (!image) return;
  commitSettings(id, label, image.settings, { ...image.settings, ...patch });
}

function applyEntry(id: string, entry: HistoryEntry, direction: "undo" | "redo") {
  const assets = imageAssets.get(id);
  if (!assets?.decoded) return;
  if (entry.kind === "settings") {
    const settings = direction === "undo" ? entry.before : entry.after;
    assets.layers?.setRefinement({ shift: settings.shift, feather: settings.feather });
    bump(id, { settings });
    return;
  }
  if (!assets.mask) return;
  const data = direction === "undo" ? entry.before : entry.after;
  if (entry.kind === "mask") {
    writeRect(assets.mask, assets.decoded.width, entry.rect, data);
    assets.layers?.update(entry.rect);
  } else {
    assets.mask.set(data);
    assets.layers?.rebuild();
  }
  bump(id);
  void refreshResultThumb(id);
}

export function undo(id: string) {
  const entry = imageAssets.get(id)?.history.undo();
  if (entry) applyEntry(id, entry, "undo");
}

export function redo(id: string) {
  const entry = imageAssets.get(id)?.history.redo();
  if (entry) applyEntry(id, entry, "redo");
}

/** Return the mask to the engine's automatic result (undoable). */
export function resetMask(id: string) {
  const assets = imageAssets.get(id);
  if (!assets?.mask || !assets.aiMask) return;
  const before = assets.mask.slice();
  assets.mask.set(assets.aiMask);
  assets.layers?.rebuild();
  assets.history.push({ kind: "mask-replace", label: "Reset to automatic", before, after: assets.aiMask.slice() });
  bump(id);
  void refreshResultThumb(id);
}

/** Fill the whole mask (keep everything) or clear it, as an undoable step. */
export function fillMask(id: string, value: 0 | 255) {
  const assets = imageAssets.get(id);
  if (!assets?.mask) return;
  const before = assets.mask.slice();
  assets.mask.fill(value);
  assets.layers?.rebuild();
  assets.history.push({
    kind: "mask-replace",
    label: value ? "Restore all" : "Erase all",
    before,
    after: assets.mask.slice(),
  });
  bump(id);
  void refreshResultThumb(id);
}

let thumbTimer: number | undefined;
async function refreshResultThumb(id: string) {
  window.clearTimeout(thumbTimer);
  thumbTimer = window.setTimeout(async () => {
    const assets = imageAssets.get(id);
    if (!assets?.layers) return;
    const thumb = await makeThumbnail(assets.layers.cutout as OffscreenCanvas, 240, "image/png");
    const old = getImage(id)?.resultThumbUrl;
    store().patchImage(id, { resultThumbUrl: URL.createObjectURL(thumb) });
    if (old) URL.revokeObjectURL(old);
  }, 600);
}

export function maskSnapshot(id: string, rect: Rect): Uint8Array | null {
  const assets = imageAssets.get(id);
  if (!assets?.mask || !assets.decoded) return null;
  return readRect(assets.mask, assets.decoded.width, rect);
}

/* --------------------------------------------------------- backgrounds ---- */

export async function addBackgroundImage(file: File, options: { id?: string } = {}): Promise<{ id: string } | { error: string }> {
  if (options.id && backgroundAssets.has(options.id)) return { id: options.id };
  const validation = await validateImageFile(file, uploadLimits);
  if (!validation.ok) return { error: validation.error.message };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    // Backgrounds rarely need more than 4096px; cap to bound memory.
    const scale = Math.min(1, 4096 / Math.max(bitmap.width, bitmap.height));
    const sized =
      scale < 1
        ? await createImageBitmap(bitmap, {
            resizeWidth: Math.round(bitmap.width * scale),
            resizeHeight: Math.round(bitmap.height * scale),
            resizeQuality: "high",
          })
        : bitmap;
    if (sized !== bitmap) bitmap.close();
    const thumb = await makeThumbnail(sized, 160, "image/jpeg");
    const id = options.id ?? uid();
    const thumbUrl = URL.createObjectURL(thumb);
    backgroundAssets.set(id, { bitmap: sized, name: file.name, thumbUrl });
    store().addBackground({ id, name: file.name, thumbUrl });
    return { id };
  } catch {
    return { error: "This background image couldn't be decoded." };
  }
}
