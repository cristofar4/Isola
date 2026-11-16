/**
 * Export preflight: what the next download will contain, checked against the
 * images' applied settings. Every line is computed from the batch as it is;
 * nothing here is advice the app can't back up.
 */

import { planConfig } from "@/lib/config";
import type { Rect } from "@/lib/editor/geometry";
import { canvasSize, exportName, type BatchSettings } from "./settings";

export interface PreflightItem {
  id: string;
  name: string;
  width: number;
  height: number;
  status: "queued" | "processing" | "ready" | "failed" | "cancelled" | "needs-auth" | "needs-pro";
  review: string | null;
  settings: BatchSettings;
  bounds?: Rect | null;
}

export type PreflightAction = "review" | "apply" | "upgrade" | "retry" | "process";

export interface PreflightLine {
  id: string;
  tone: "ok" | "warn" | "info";
  text: string;
  action?: PreflightAction;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function formatLine(settings: BatchSettings[]): PreflightLine {
  const kinds = new Map<string, number>();
  for (const s of settings) {
    const key = s.format === "jpeg" ? (s.background.kind === "transparent" ? `JPEG on ${s.matte}` : "JPEG") : s.background.kind === "transparent" ? "Transparent PNG" : "PNG with background";
    kinds.set(key, (kinds.get(key) ?? 0) + 1);
  }
  if (kinds.size === 1) {
    const [key] = [...kinds.keys()];
    if (key.startsWith("JPEG on")) return { id: "format", tone: "info", text: `JPEG has no transparency: transparent areas are filled with ${key.slice(8)}` };
    return { id: "format", tone: "ok", text: `${key} selected` };
  }
  return { id: "format", tone: "info", text: `Mixed formats: ${[...kinds].map(([k, n]) => `${n} ${k}`).join(", ")}` };
}

/**
 * Preflight for the images a download would take (`targets`), given whether
 * the panel has unapplied edits and the plan.
 */
export function preflight(targets: PreflightItem[], opts: { unapplied: boolean; pro: boolean; project: string; total: number }): PreflightLine[] {
  const lines: PreflightLine[] = [];
  const ready = targets.filter((t) => t.status === "ready");
  if (targets.length === 0) return [{ id: "empty", tone: "info", text: "Add images to see what will be exported." }];
  if (ready.length === 0) lines.push({ id: "none", tone: "warn", text: "No finished images yet", action: targets.some((t) => t.status === "failed" || t.status === "cancelled") ? "retry" : undefined });
  else lines.push(formatLine(ready.map((r) => r.settings)));

  const review = ready.filter((r) => r.review).length;
  if (review) lines.push({ id: "review", tone: "warn", text: `${plural(review, "image")} ${review === 1 ? "needs" : "need"} review`, action: "review" });
  else if (ready.length) lines.push({ id: "review", tone: "ok", text: "No edges flagged for review" });

  const busy = targets.filter((t) => t.status === "processing" || t.status === "queued").length;
  if (busy) lines.push({ id: "busy", tone: "info", text: `${plural(busy, "image")} still processing (left out until finished)` });
  const failed = targets.filter((t) => t.status === "failed" || t.status === "cancelled").length;
  if (failed) lines.push({ id: "failed", tone: "warn", text: `${plural(failed, "image")} failed or cancelled (left out)`, action: "retry" });
  const waiting = targets.filter((t) => t.status === "needs-auth" || t.status === "needs-pro").length;
  if (waiting) lines.push({ id: "waiting", tone: "warn", text: `${plural(waiting, "image")} waiting to be processed`, action: "upgrade" });

  if (opts.unapplied) lines.push({ id: "unapplied", tone: "warn", text: "Settings here aren't applied yet: downloads use the applied ones", action: "apply" });

  if (ready.length) {
    // Smallest output (after the plan's limit), since marketplaces set minimum sizes.
    const cap = opts.pro ? Infinity : planConfig.freeMaxExportSide;
    let smallest: { w: number; h: number } | null = null;
    for (const r of ready) {
      const c = canvasSize(r.settings, r.width, r.height);
      const k = Math.min(1, cap / Math.max(c.width, c.height));
      const size = { w: Math.round(c.width * k), h: Math.round(c.height * k) };
      if (!smallest || Math.max(size.w, size.h) < Math.max(smallest.w, smallest.h)) smallest = size;
    }
    if (smallest) lines.push({ id: "size", tone: Math.max(smallest.w, smallest.h) < 1000 ? "warn" : "ok", text: `Smallest export: ${smallest.w.toLocaleString("en-US")} × ${smallest.h.toLocaleString("en-US")} px` });

    // Names that would collide get -2, -3…
    const used = new Set<string>();
    let renamed = 0;
    ready.forEach((r, i) => {
      const base = exportName(r.name, r.settings, new Set(), { index: i + 1, total: opts.total, project: opts.project });
      if (exportName(r.name, r.settings, used, { index: i + 1, total: opts.total, project: opts.project }) !== base) renamed++;
    });
    if (renamed) lines.push({ id: "names", tone: "info", text: `${plural(renamed, "file")} share a name and get -2, -3…` });
  }
  if (!opts.pro) lines.push({ id: "plan", tone: "warn", text: `Free plan: up to ${planConfig.freeMaxExportSide.toLocaleString("en-US")}px on the longest side`, action: "upgrade" });
  return lines;
}
