import { BATCH_WHITE, normaliseSettings, type BatchSettings } from "@/lib/batch/settings";

/**
 * Export sets: every finished image, rendered for several destinations at once
 * and packed into one ZIP with a folder per destination. Each destination keeps
 * the image's own look (background, padding, shadow, alignment) and changes only
 * the canvas, unless it has rules of its own (the marketplace size).
 */
export interface Destination {
  id: DestinationId;
  label: string;
  width: number;
  height: number;
  use: string;
  overrides?: Partial<BatchSettings>;
}

export type DestinationId = "square" | "portrait" | "story" | "wide" | "marketplace";

export const DESTINATIONS: Destination[] = [
  { id: "square", label: "Square 1:1", width: 1080, height: 1080, use: "Feeds and product grids" },
  { id: "portrait", label: "Portrait 4:5", width: 1080, height: 1350, use: "Instagram and Facebook feeds" },
  { id: "story", label: "Story 9:16", width: 1080, height: 1920, use: "Stories, Reels and TikTok" },
  { id: "wide", label: "Wide 16:9", width: 1920, height: 1080, use: "Banners, web heroes and YouTube" },
  {
    id: "marketplace",
    label: "Marketplace 1:1",
    width: 2000,
    height: 2000,
    use: "Pure white, JPEG, product filling 90% (meets Amazon's main-image rules)",
    overrides: { background: { kind: "color", color: BATCH_WHITE }, matte: BATCH_WHITE, format: "jpeg", padding: 5, align: { x: 0.5, y: 0.5 } },
  },
];

export const DEFAULT_DESTINATIONS: DestinationId[] = ["square", "portrait", "wide"];

export function destinationById(id: string) {
  return DESTINATIONS.find((d) => d.id === id) ?? null;
}

/** The image's settings, re-targeted at one destination's canvas. */
export function destinationSettings(base: BatchSettings, dest: Destination): BatchSettings {
  return normaliseSettings({
    ...base,
    ...dest.overrides,
    canvas: "custom",
    customSize: { width: dest.width, height: dest.height },
    fit: "contain",
  });
}

/** Folder inside the ZIP, e.g. "square-1080x1080". */
export function folderFor(dest: Destination) {
  return `${dest.id}-${dest.width}x${dest.height}`;
}
