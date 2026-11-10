import type { Rect } from "@/lib/editor/geometry";
import { applyPolicySize, type ExportPolicy } from "@/lib/plan-policy";
import { BATCH_WHITE, CANVAS_LABEL, canvasSize, normaliseSettings, placement, usesLayout, type BatchSettings } from "@/lib/batch/settings";

/**
 * Consistency check for a collection of cutouts. Everything here is measured
 * from the real masks and settings: nothing is estimated or simulated. Checks
 * compare each image with the rest of the collection, so a style the whole set
 * shares (say, portraits cropped at the shoulders) isn't reported as a fault.
 */

export type Side = "top" | "right" | "bottom" | "left";

export interface MaskStats {
  /** Sides of the photo the subject runs into. */
  touches: Side[];
  /** Small separate pieces next to the main subject: usually background left behind. */
  fragments: number;
}

const FG = 127;

/** Measure a (downscaled) mask: 0–255 per pixel, `w` × `h`. */
export function analyseMask(mask: Uint8Array, w: number, h: number): MaskStats {
  const touches: Side[] = [];
  const count = (indexes: (i: number) => number, n: number) => {
    let c = 0;
    for (let i = 0; i < n; i++) if (mask[indexes(i)] > FG) c++;
    return c;
  };
  const enough = (n: number) => Math.max(2, Math.round(n * 0.03));
  if (count((x) => x, w) >= enough(w)) touches.push("top");
  if (count((y) => y * w + (w - 1), h) >= enough(h)) touches.push("right");
  if (count((x) => (h - 1) * w + x, w) >= enough(w)) touches.push("bottom");
  if (count((y) => y * w, h) >= enough(h)) touches.push("left");
  return { touches, fragments: countFragments(mask, w, h) };
}

/** Connected pieces (8-neighbour) that are tiny next to the largest one. */
function countFragments(mask: Uint8Array, w: number, h: number): number {
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const areas: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] <= FG || label[start]) continue;
    const id = areas.length + 1;
    let top = 0;
    let area = 0;
    stack[top++] = start;
    label[start] = id;
    while (top) {
      const p = stack[--top];
      area++;
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] > FG && !label[q]) {
            label[q] = id;
            stack[top++] = q;
          }
        }
      }
    }
    areas.push(area);
  }
  if (areas.length < 2) return 0;
  const largest = Math.max(...areas);
  // Pieces over 3% of the main one are treated as real parts (the second shoe of a pair, an earring).
  const min = Math.max(3, largest * 0.0005);
  return areas.filter((a) => a !== largest && a >= min && a <= largest * 0.03).length;
}

/* ---------------------------------------------------------------- targets -- */

export type TargetId = "amazon" | "instagram";

export const TARGETS: Record<TargetId, { label: string; rules: string }> = {
  amazon: {
    label: "Amazon main image",
    rules: "Pure white background, product filling at least 85% of the frame, 1,000px or more on the longest side, no watermark.",
  },
  instagram: {
    label: "Instagram post",
    rules: "Between 4:5 (portrait) and 1.91:1 (landscape), shown 1080px wide, no transparency.",
  },
};

export const AMAZON_MIN_FILL = 0.85;
export const AMAZON_MIN_SIDE = 1000;

/* ----------------------------------------------------------------- report -- */

export type IssueKind =
  | "different-settings"
  | "cut-off"
  | "fragments"
  | "soft-edges"
  | "enlarged"
  | "scale"
  | "off-centre"
  | "watermark"
  | "background"
  | "fill"
  | "size"
  | "aspect"
  | "transparency";

export const ISSUE_LABEL: Record<IssueKind, string> = {
  "different-settings": "Different settings",
  "cut-off": "Cut off",
  fragments: "Stray specks",
  "soft-edges": "Edges need review",
  enlarged: "Enlarged",
  scale: "Scale mismatch",
  "off-centre": "Off-centre",
  watermark: "Watermark",
  background: "Background",
  fill: "Product too small",
  size: "Too small",
  aspect: "Aspect ratio",
  transparency: "Transparency",
};

export type Fix =
  | { kind: "settings"; label: string; changes: Array<{ id: string; settings: BatchSettings }> }
  | { kind: "editor"; label: string; id: string }
  | { kind: "upgrade"; label: string };

export interface Issue {
  key: string;
  kind: IssueKind;
  /** null for issues about the whole collection. */
  itemId: string | null;
  title: string;
  detail: string;
  severity: "warning" | "info";
  fix: Fix | null;
}

export interface CheckEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  bounds: Rect | null;
  settings: BatchSettings;
  /** Why the mask itself should be checked, from the processing step. */
  review: string | null;
  stats: MaskStats | null;
}

export interface Report {
  checked: number;
  target: TargetId | null;
  issues: Issue[];
  /** Fixes that resolve every issue of one kind at once. */
  bulk: Partial<Record<IssueKind, Fix>>;
}

/** Settings that change how an image looks (naming is per image and doesn't count). */
function visualKey(s: BatchSettings) {
  const n = normaliseSettings(s);
  return JSON.stringify({ ...n, keepNames: null, namePattern: null });
}

function keepNaming(target: BatchSettings, own: BatchSettings): BatchSettings {
  return normaliseSettings({ ...target, keepNames: own.keepNames, namePattern: own.namePattern });
}

function describeBackground(s: BatchSettings) {
  if (s.background.kind === "transparent") return s.format === "jpeg" ? `${s.matte} (JPEG)` : "transparent";
  if (s.background.kind === "color") return s.background.color.toUpperCase();
  return `image "${s.background.name}"`;
}

/** Plain-language differences, e.g. "Original framing instead of Square 1:1". */
export function describeDifferences(own: BatchSettings, target: BatchSettings): string {
  const a = normaliseSettings(own);
  const b = normaliseSettings(target);
  const parts: string[] = [];
  const canvas = (s: BatchSettings) => (s.canvas === "custom" ? `${s.customSize.width} × ${s.customSize.height}px` : CANVAS_LABEL[s.canvas]);
  if (canvas(a) !== canvas(b)) parts.push(`${canvas(a)} instead of ${canvas(b)}`);
  if (a.padding !== b.padding) parts.push(`${a.padding}% padding instead of ${b.padding}%`);
  if (describeBackground(a) !== describeBackground(b)) parts.push(`${describeBackground(a)} background instead of ${describeBackground(b)}`);
  if (a.shadow !== b.shadow) parts.push(a.shadow ? "a shadow the others don't have" : "no shadow, unlike the others");
  if (a.format !== b.format) parts.push(`${a.format.toUpperCase()} instead of ${b.format.toUpperCase()}`);
  if (a.fit !== b.fit) parts.push(`${a.fit === "cover" ? "fills" : "fits"} the canvas differently`);
  if (a.align.x !== b.align.x || a.align.y !== b.align.y) parts.push("different alignment");
  return parts.length ? `${parts.join("; ")}.` : "Its settings differ from the rest.";
}

/** Output geometry for one image: size after the plan's limit, subject fill and enlargement. */
export function outputGeometry(entry: Pick<CheckEntry, "width" | "height" | "bounds" | "settings">, policy: ExportPolicy) {
  const canvas = canvasSize(entry.settings, entry.width, entry.height);
  const out = applyPolicySize(canvas.width, canvas.height, policy);
  const b = entry.bounds ?? { x: 0, y: 0, w: entry.width, h: entry.height };
  const { s } = placement(entry.settings, entry.width, entry.height, entry.bounds, canvas);
  const fill = Math.max((b.w * s) / canvas.width, (b.h * s) / canvas.height);
  return { width: out.width, height: out.height, fill: Math.min(1, fill), enlargement: s * out.scale };
}

/** Settings that meet the Amazon main-image rules, keeping the image's other choices. */
export function amazonSettings(own: BatchSettings, width: number, height: number): BatchSettings {
  const square = Math.max(width, height) >= AMAZON_MIN_SIDE;
  return normaliseSettings({
    ...own,
    canvas: square ? "square" : "custom",
    customSize: square ? own.customSize : { width: AMAZON_MIN_SIDE, height: AMAZON_MIN_SIDE },
    background: { kind: "color", color: BATCH_WHITE },
    matte: BATCH_WHITE,
    format: "jpeg",
    fit: "contain",
    padding: Math.min(own.padding, 5),
    align: { x: 0.5, y: 0.5 },
  });
}

function median(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sideList = (sides: Side[]) => (sides.length === 1 ? `the ${sides[0]} edge` : `the ${sides.slice(0, -1).join(", ")} and ${sides[sides.length - 1]} edges`);

export function checkCollection(entries: CheckEntry[], options: { target: TargetId | null; policy: ExportPolicy }): Report {
  const issues: Issue[] = [];
  const bulk: Report["bulk"] = {};
  const push = (issue: Omit<Issue, "key">) => issues.push({ ...issue, key: `${issue.kind}:${issue.itemId ?? "all"}` });

  /* Settings that differ from the rest. */
  if (entries.length >= 3) {
    const groups = new Map<string, CheckEntry[]>();
    for (const e of entries) groups.set(visualKey(e.settings), [...(groups.get(visualKey(e.settings)) ?? []), e]);
    const sorted = [...groups.values()].sort((a, b) => b.length - a.length);
    const [top, second] = sorted;
    if (sorted.length > 1 && top.length >= 2 && top.length > (second?.length ?? 0)) {
      const majority = top[0].settings;
      const odd = entries.filter((e) => visualKey(e.settings) !== visualKey(majority));
      const changes = odd.map((e) => ({ id: e.id, settings: keepNaming(majority, e.settings) }));
      for (const e of odd) {
        push({
          kind: "different-settings",
          itemId: e.id,
          title: "Uses different settings",
          detail: `${describeDifferences(e.settings, majority)} ${top.length} other images share one look.`,
          severity: "warning",
          fix: { kind: "settings", label: "Match the others", changes: [{ id: e.id, settings: keepNaming(majority, e.settings) }] },
        });
      }
      bulk["different-settings"] = { kind: "settings", label: `Match all ${odd.length}`, changes };
    }
  }

  /* Cut off by the photo's edge, unless most of the collection is framed that way. */
  const measured = entries.filter((e) => e.stats);
  const shared = new Set<Side>();
  if (measured.length >= 3) {
    for (const side of ["top", "right", "bottom", "left"] as Side[]) {
      if (measured.filter((e) => e.stats!.touches.includes(side)).length / measured.length >= 0.6) shared.add(side);
    }
  }
  for (const e of measured) {
    const sides = e.stats!.touches.filter((s) => !shared.has(s));
    if (sides.length) {
      push({
        kind: "cut-off",
        itemId: e.id,
        title: `Cut off at ${sideList(sides)}`,
        detail: `The subject runs into ${sideList(sides)} of the photo, so the cutout has a straight edge there. A photo with space around the product avoids it.`,
        severity: "warning",
        fix: null,
      });
    }
    if (e.stats!.fragments > 0) {
      const n = e.stats!.fragments;
      push({
        kind: "fragments",
        itemId: e.id,
        title: `${n} stray speck${n === 1 ? "" : "s"}`,
        detail: "Small separate pieces were kept next to the subject, usually bits of the background. Erase them in the editor.",
        severity: "warning",
        fix: { kind: "editor", label: "Open in editor", id: e.id },
      });
    }
  }

  /* Mask quality noted during processing. */
  for (const e of entries) {
    if (e.review) {
      push({ kind: "soft-edges", itemId: e.id, title: "Edges need review", detail: e.review, severity: "warning", fix: { kind: "editor", label: "Refine in editor", id: e.id } });
    }
  }

  /* Enlargement: small subjects blown up to fill a large canvas look soft. */
  for (const e of entries) {
    if (!usesLayout(e.settings) || !e.bounds) continue;
    const g = outputGeometry(e, options.policy);
    if (g.enlargement > 2) {
      push({
        kind: "enlarged",
        itemId: e.id,
        title: `Enlarged ${g.enlargement.toFixed(1)}×`,
        detail: `The subject is ${Math.round(e.bounds.w)} × ${Math.round(e.bounds.h)}px in the photo and is enlarged ${g.enlargement.toFixed(1)}× to fill the canvas, which can look soft. A larger photo or more padding keeps it sharp.`,
        severity: "info",
        fix: null,
      });
    }
  }

  /* Size and position, for images that keep the photo's own framing. */
  const framed = entries.filter((e) => !usesLayout(e.settings) && e.bounds);
  if (framed.length >= 3) {
    const fills = framed.map((e) => (e.bounds!.w * e.bounds!.h) / (e.width * e.height));
    const centres = framed.map((e) => ({ x: (e.bounds!.x + e.bounds!.w / 2) / e.width, y: (e.bounds!.y + e.bounds!.h / 2) / e.height }));
    const mFill = median(fills);
    const mx = median(centres.map((c) => c.x));
    const my = median(centres.map((c) => c.y));
    const recentre = (e: CheckEntry) => ({ id: e.id, settings: normaliseSettings({ ...e.settings, canvas: "original", fit: "contain", align: { x: 0.5, y: 0.5 } }) });
    let flagged = false;
    framed.forEach((e, i) => {
      const ratio = fills[i] / mFill;
      if (ratio < 1 / 1.8 || ratio > 1.8) {
        flagged = true;
        push({
          kind: "scale",
          itemId: e.id,
          title: ratio < 1 ? "Smaller than the rest" : "Larger than the rest",
          detail: `The subject covers ${pct(fills[i])} of the photo; most of the collection covers about ${pct(mFill)}. Re-centring with equal padding makes them match.`,
          severity: "warning",
          fix: { kind: "settings", label: "Re-centre with padding", changes: [recentre(e)] },
        });
      }
      if (Math.hypot(centres[i].x - mx, centres[i].y - my) > 0.15) {
        flagged = true;
        push({
          kind: "off-centre",
          itemId: e.id,
          title: "Off-centre",
          detail: "The subject sits away from where it is in the other photos. Re-centring places every subject the same way.",
          severity: "info",
          fix: { kind: "settings", label: "Re-centre with padding", changes: [recentre(e)] },
        });
      }
    });
    if (flagged) bulk.scale = { kind: "settings", label: `Re-centre all ${framed.length}`, changes: framed.map(recentre) };
  }

  /* Destination rules. */
  if (options.target === "amazon") {
    if (options.policy.watermark && entries.length) {
      push({
        kind: "watermark",
        itemId: null,
        title: "Free exports carry a watermark",
        detail: "Amazon doesn't allow watermarks on main images. Pro exports have none.",
        severity: "warning",
        fix: { kind: "upgrade", label: "See Pro" },
      });
    }
    const fixes: Array<{ id: string; settings: BatchSettings }> = [];
    for (const e of entries) {
      const g = outputGeometry(e, options.policy);
      const s = normaliseSettings(e.settings);
      const problems: Array<Omit<Issue, "key" | "itemId" | "fix">> = [];
      const opaqueWhite =
        (s.background.kind === "color" && s.background.color.toUpperCase() === BATCH_WHITE) ||
        (s.background.kind === "transparent" && s.format === "jpeg" && s.matte.toUpperCase() === BATCH_WHITE);
      if (!opaqueWhite) {
        problems.push({
          kind: "background",
          title: "Not a pure white background",
          detail: `The background is ${describeBackground(s)}; Amazon main images need pure white (RGB 255, 255, 255).`,
          severity: "warning",
        });
      }
      if (g.fill < AMAZON_MIN_FILL) {
        problems.push({
          kind: "fill",
          title: `Product fills ${pct(g.fill)} of the frame`,
          detail: `Amazon asks for ${pct(AMAZON_MIN_FILL)} or more. Less padding makes the product larger.`,
          severity: "warning",
        });
      }
      if (Math.max(g.width, g.height) < AMAZON_MIN_SIDE) {
        problems.push({
          kind: "size",
          title: `${Math.max(g.width, g.height)}px on the longest side`,
          detail: `Amazon needs at least ${AMAZON_MIN_SIDE.toLocaleString("en-US")}px for zoom.`,
          severity: "warning",
        });
      }
      if (problems.length) {
        const change = { id: e.id, settings: keepNaming(amazonSettings(s, e.width, e.height), s) };
        fixes.push(change);
        for (const p of problems) push({ ...p, itemId: e.id, fix: { kind: "settings", label: "Make Amazon-ready", changes: [change] } });
      }
    }
    if (fixes.length) {
      const fix: Fix = { kind: "settings", label: `Make all ${fixes.length} Amazon-ready`, changes: fixes };
      bulk.background = fix;
      bulk.fill = fix;
      bulk.size = fix;
    }
  }

  if (options.target === "instagram") {
    for (const e of entries) {
      const g = outputGeometry(e, options.policy);
      const s = normaliseSettings(e.settings);
      const ratio = g.width / g.height;
      if (ratio < 0.8 - 0.005 || ratio > 1.91 + 0.005) {
        const canvas = ratio < 0.8 ? "portrait" : "landscape";
        push({
          kind: "aspect",
          itemId: e.id,
          title: `${ratio < 1 ? "Too tall" : "Too wide"} for a post`,
          detail: `It's ${g.width} × ${g.height}px; Instagram crops anything outside 4:5 to 1.91:1.`,
          severity: "warning",
          fix: { kind: "settings", label: canvas === "portrait" ? "Use Portrait 4:5" : "Use Landscape 3:2", changes: [{ id: e.id, settings: normaliseSettings({ ...s, canvas }) }] },
        });
      }
      if (s.format === "png" && s.background.kind === "transparent") {
        push({
          kind: "transparency",
          itemId: e.id,
          title: "Transparent background",
          detail: "Instagram doesn't keep transparency. Choose a background colour so you control what fills it.",
          severity: "info",
          fix: { kind: "settings", label: "Use a white background", changes: [{ id: e.id, settings: normaliseSettings({ ...s, background: { kind: "color", color: BATCH_WHITE } }) }] },
        });
      }
      if (g.width < 1080) {
        push({ kind: "size", itemId: e.id, title: `${g.width}px wide`, detail: "Instagram shows posts 1080px wide, so this will be enlarged.", severity: "info", fix: null });
      }
    }
  }

  const rank = (i: Issue) => (i.itemId === null ? 0 : i.severity === "warning" ? 1 : 2);
  issues.sort((a, b) => rank(a) - rank(b));
  return { checked: entries.length, target: options.target, issues, bulk };
}

/** Issues that come from the destination's rules (rather than consistency within the collection). */
export const TARGET_KINDS: ReadonlySet<IssueKind> = new Set<IssueKind>(["watermark", "background", "fill", "size", "aspect", "transparency"]);

/** Whether every image meets the chosen destination's rules, and how many other suggestions remain. */
export function targetSummary(report: Report) {
  if (!report.target) return null;
  const failing = report.issues.filter((i) => TARGET_KINDS.has(i.kind)).length;
  return { meets: failing === 0, failing, others: report.issues.length - failing };
}

/** Distinct images with at least one issue. */
export function flaggedCount(report: Report) {
  return new Set(report.issues.filter((i) => i.itemId).map((i) => i.itemId)).size;
}
