"use client";

import { decodeToCanvas, getAsset } from "@/lib/studio/library";
import { getBlob } from "@/lib/studio/library-db";
import type { Drawable } from "./draw";

/**
 * Decoded images for scenes and films, read from the library in this browser
 * and kept in memory while they're in use. Large originals are capped so a
 * 4,000px photo doesn't hold 64 MB per frame.
 */

const MAX_SIDE = 2560;
const ready = new Map<string, Drawable | null>();
const pending = new Map<string, Promise<Drawable | null>>();
const listeners = new Set<() => void>();

export function onImagesChanged(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function assetImage(id: string): Drawable | null {
  return ready.get(id) ?? null;
}

/** True once an attempt to load the asset finished and found nothing (deleted, or another browser's library). */
export function assetMissing(id: string) {
  return ready.has(id) && ready.get(id) === null;
}

export function loadAssetImage(id: string): Promise<Drawable | null> {
  if (ready.has(id)) return Promise.resolve(ready.get(id) ?? null);
  const hit = pending.get(id);
  if (hit) return hit;
  const job = (async () => {
    try {
      const blob = await getBlob(`asset:${id}`);
      if (!blob) return null;
      const { canvas } = await decodeToCanvas(blob, MAX_SIDE);
      // A bitmap draws fast every frame; the decode canvas is set up for reading pixels.
      if (typeof createImageBitmap === "function") return (await createImageBitmap(canvas)) as Drawable;
      return canvas as Drawable;
    } catch {
      return null;
    }
  })().then((img) => {
    ready.set(id, img);
    pending.delete(id);
    listeners.forEach((l) => l());
    return img;
  });
  pending.set(id, job);
  return job;
}

export async function loadAssetImages(ids: Iterable<string>) {
  return Promise.all([...new Set(ids)].map(loadAssetImage));
}

/** Width ÷ height of a library asset (from its stored details, no decoding). */
export function assetAspect(id: string) {
  const a = getAsset(id);
  return a && a.height > 0 ? a.width / a.height : 1;
}
