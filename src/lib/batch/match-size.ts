/**
 * "Match product size": make every product in a collection look the same
 * size as one reference image.
 *
 * With one padding for everything, a tall bottle fills the canvas's height
 * and a wide shoe its width, so they share a longest side but not a visual
 * size. Here the size of a product is the side of the square with the same
 * area as its subject box, as a share of the canvas's shorter side. Each
 * image gets the padding that gives it the reference's size; a product is
 * never enlarged past what the collection's padding allows.
 */

import type { Rect } from "@/lib/editor/geometry";
import { MAX_PADDING, canvasSize, placement, usesLayout, type BatchSettings } from "./settings";

export interface Sized {
  width: number;
  height: number;
  bounds: Rect | null;
}

const subject = (i: Sized) => i.bounds ?? { x: 0, y: 0, w: i.width, h: i.height };

/** A product's visual size under these settings: √(subject area) ÷ the canvas's shorter side. */
export function visualSize(settings: BatchSettings, item: Sized): number {
  const canvas = canvasSize(settings, item.width, item.height);
  const { s } = placement(settings, item.width, item.height, item.bounds, canvas);
  const b = subject(item);
  return (Math.sqrt(b.w * b.h) * s) / Math.min(canvas.width, canvas.height);
}

/**
 * The padding (whole per cent) that gives `item` the same visual size as
 * `reference` has under `settings`. Returns the collection's own padding when
 * the layout doesn't apply (original framing, or "cover" fit).
 */
export function matchedPadding(settings: BatchSettings, reference: Sized, item: Sized): number {
  if (!usesLayout(settings) || settings.fit !== "contain") return settings.padding;
  const target = visualSize(settings, reference);
  const canvas = canvasSize(settings, item.width, item.height);
  const short = Math.min(canvas.width, canvas.height);
  const b = subject(item);
  // The scale that gives the target size, then the margin at which "contain" produces that scale.
  const s = (target * short) / Math.sqrt(b.w * b.h);
  const margin = Math.min((canvas.width - s * b.w) / 2, (canvas.height - s * b.h) / 2);
  const padding = Math.round((margin / short) * 100);
  // Never bigger than the collection's padding allows, never past the limit.
  return Math.min(MAX_PADDING, Math.max(settings.padding, padding));
}

/** Per-image settings for a collection matched to a reference. Images without a subject box keep the collection's padding. */
export function matchSettings<T extends Sized & { id: string }>(settings: BatchSettings, reference: Sized, items: T[]): Map<string, BatchSettings> {
  const out = new Map<string, BatchSettings>();
  for (const item of items) out.set(item.id, item.bounds ? { ...settings, padding: matchedPadding(settings, reference, item) } : settings);
  return out;
}
