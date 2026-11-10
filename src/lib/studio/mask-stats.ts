"use client";

import { analyseMask, type MaskStats } from "@/lib/consistency";
import { downsample } from "@/lib/editor/mask-ops";
import { decodeMask } from "@/lib/image/mask-codec";

const cache = new WeakMap<Blob, MaskStats>();
/** For masks read again from storage (a new Blob each time): keyed by image id and mask size. */
const keyed = new Map<string, MaskStats>();

/** Consistency measurements for a stored mask, on a copy at most 256px across. Cached per mask. */
export async function maskStatsFor(maskBlob: Blob | null, key?: string): Promise<MaskStats | null> {
  if (!maskBlob) return null;
  const hit = cache.get(maskBlob) ?? (key ? keyed.get(key) : undefined);
  if (hit) return hit;
  try {
    const { mask, width, height } = await decodeMask(maskBlob);
    const factor = Math.max(1, Math.ceil(Math.max(width, height) / 256));
    const small = downsample(mask, width, height, factor);
    const stats = analyseMask(small.data, small.width, small.height);
    cache.set(maskBlob, stats);
    if (key) {
      if (keyed.size > 200) keyed.clear();
      keyed.set(key, stats);
    }
    return stats;
  } catch {
    return null;
  }
}
