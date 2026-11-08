import type { DecodedImage } from "@/lib/image/decode";
import { History } from "@/lib/editor/history";
import type { ImageLayers } from "@/lib/editor/layers";

/**
 * Heavy, non-serialisable data lives here instead of in React state:
 * decoded originals, masks, render layers and history. The store only holds
 * light metadata plus revision counters that tell components to redraw.
 */
export interface ImageAssets {
  /** The uploaded file, kept untouched so processing can be retried. */
  file: File;
  decoded: DecodedImage | null;
  /** Mask exactly as the engine returned it. */
  aiMask: Uint8Array | null;
  /** The editable mask (brushes write here). */
  mask: Uint8Array | null;
  layers: ImageLayers | null;
  history: History;
  abort: AbortController | null;
}

export interface BackgroundAsset {
  bitmap: ImageBitmap;
  name: string;
  thumbUrl: string;
}

export const imageAssets = new Map<string, ImageAssets>();
export const backgroundAssets = new Map<string, BackgroundAsset>();

export function createImageAssets(file: File): ImageAssets {
  return { file, decoded: null, aiMask: null, mask: null, layers: null, history: new History(), abort: null };
}

export function releaseImageAssets(id: string) {
  const assets = imageAssets.get(id);
  if (!assets) return;
  assets.abort?.abort();
  assets.decoded?.bitmap.close();
  imageAssets.delete(id);
}
