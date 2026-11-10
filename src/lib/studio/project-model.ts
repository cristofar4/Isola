import type { Rect } from "@/lib/editor/geometry";
import { DEFAULT_BATCH_SETTINGS, canvasSize, normaliseSettings, placement, type BatchSettings } from "@/lib/batch/settings";
import { destinationById, destinationSettings, type DestinationId } from "@/lib/export-sets";

/**
 * Projects: one master image (a cutout of the source photo) and linked
 * versions, one per destination size. Every version follows the master's look
 * (background, padding, shadow, position, format) unless it has its own
 * overrides; changing the master updates every linked version at once.
 */

export interface VersionOverrides {
  padding?: number;
  align?: { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 };
  shadow?: boolean;
}

export interface ProjectVersion {
  id: string;
  destination: DestinationId;
  overrides: VersionOverrides;
}

/** The parts of a project that version history records and restores. */
export interface ProjectState {
  name: string;
  look: BatchSettings;
  versions: ProjectVersion[];
  maskKey: string | null;
  bounds: Rect | null;
  review: string | null;
}

export type ProjectStatus = "processing" | "ready" | "failed";

export interface Project extends ProjectState {
  id: string;
  folderId: string | null;
  starred: boolean;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
  sourceAssetId: string;
  width: number;
  height: number;
  status: ProjectStatus;
  error: string | null;
}

export interface Snapshot {
  id: string;
  projectId: string;
  label: string;
  createdAt: number;
  state: ProjectState;
}

export const DEFAULT_LOOK: BatchSettings = normaliseSettings({ ...DEFAULT_BATCH_SETTINGS, canvas: "square", padding: 8, fit: "contain" });
export const DEFAULT_VERSIONS: DestinationId[] = ["square", "portrait", "wide"];

export function isLinked(version: ProjectVersion) {
  return Object.keys(version.overrides).length === 0;
}

/** The settings a version renders with: the master's look on the destination's canvas, plus its overrides. */
export function versionSettings(look: BatchSettings, version: ProjectVersion): BatchSettings {
  const dest = destinationById(version.destination);
  const base = dest ? destinationSettings(look, dest) : normaliseSettings(look);
  const o = version.overrides;
  return normaliseSettings({
    ...base,
    ...(o.padding !== undefined ? { padding: o.padding } : {}),
    ...(o.align ? { align: o.align } : {}),
    ...(o.shadow !== undefined ? { shadow: o.shadow } : {}),
  });
}

/** How much of the canvas the subject's longer side fills, and how much it's enlarged. */
export function versionGeometry(settings: BatchSettings, width: number, height: number, bounds: Rect | null) {
  const canvas = canvasSize(settings, width, height);
  const b = bounds ?? { x: 0, y: 0, w: width, h: height };
  const { s } = placement(settings, width, height, bounds, canvas);
  return { canvas, fill: Math.min(1, Math.max((b.w * s) / canvas.width, (b.h * s) / canvas.height)), enlargement: s };
}

export type ProjectIssueKind = "edges" | "scale" | "shadow" | "position" | "marketplace" | "enlarged";

export interface ProjectIssue {
  key: string;
  kind: ProjectIssueKind;
  versionId: string | null;
  title: string;
  detail: string;
  severity: "warning" | "info";
  fix: { kind: "match"; versionId: string; label: string } | { kind: "padding"; versionId: string; padding: number; label: string } | { kind: "editor"; label: string } | null;
}

/** Quality review: each version compared with the master, plus the mask's own check. */
export function reviewProject(p: Pick<Project, "look" | "versions" | "bounds" | "width" | "height" | "review">): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  if (p.review) {
    issues.push({ key: "edges", kind: "edges", versionId: null, title: "Edge halo", detail: p.review, severity: "warning", fix: { kind: "editor", label: "Review" } });
  }
  for (const v of p.versions) {
    const dest = destinationById(v.destination);
    if (!dest) continue;
    const own = versionSettings(p.look, v);
    const master = versionSettings(p.look, { ...v, overrides: {} });
    const g = versionGeometry(own, p.width, p.height, p.bounds);
    const gm = versionGeometry(master, p.width, p.height, p.bounds);
    if (v.overrides.padding !== undefined && Math.abs(g.fill - gm.fill) > 0.005) {
      const pct = Math.round((g.fill / gm.fill - 1) * 100);
      const word = pct < 0 ? "smaller" : "larger";
      issues.push({
        key: `scale:${v.id}`,
        kind: "scale",
        versionId: v.id,
        title: "Subject scale",
        detail: `${dest.label}: ${Math.abs(pct) < 15 ? `slightly ${word}` : word} than the master (${pct > 0 ? "+" : "−"}${Math.abs(pct)}%).`,
        severity: "warning",
        fix: { kind: "match", versionId: v.id, label: "Match to master" },
      });
    }
    if (v.overrides.shadow !== undefined && v.overrides.shadow !== p.look.shadow) {
      issues.push({
        key: `shadow:${v.id}`,
        kind: "shadow",
        versionId: v.id,
        title: "Shadow",
        detail: `${dest.label} ${v.overrides.shadow ? "has a shadow the master doesn't" : "has no shadow, unlike the master"}.`,
        severity: "warning",
        fix: { kind: "match", versionId: v.id, label: "Match to master" },
      });
    }
    if (v.overrides.align && (v.overrides.align.x !== p.look.align.x || v.overrides.align.y !== p.look.align.y)) {
      issues.push({
        key: `position:${v.id}`,
        kind: "position",
        versionId: v.id,
        title: "Position",
        detail: `${dest.label} places the subject differently from the master.`,
        severity: "info",
        fix: { kind: "match", versionId: v.id, label: "Match to master" },
      });
    }
    if (v.destination === "marketplace" && g.fill < 0.85) {
      issues.push({
        key: `marketplace:${v.id}`,
        kind: "marketplace",
        versionId: v.id,
        title: "Marketplace fill",
        detail: `The product fills ${Math.round(g.fill * 100)}% of the frame; marketplaces such as Amazon ask for 85% or more.`,
        severity: "warning",
        fix: { kind: "padding", versionId: v.id, padding: 5, label: "Use 5% padding" },
      });
    }
    if (p.bounds && g.enlargement > 2) {
      issues.push({
        key: `enlarged:${v.id}`,
        kind: "enlarged",
        versionId: v.id,
        title: `Enlarged ${g.enlargement.toFixed(1)}×`,
        detail: `${dest.label} enlarges the subject ${g.enlargement.toFixed(1)}×, which can look soft. A larger source photo keeps it sharp.`,
        severity: "info",
        fix: null,
      });
    }
  }
  return issues;
}

/** What changed between two states, in a few words, for version history. */
export function describeChange(before: ProjectState, after: ProjectState): string {
  if (before.maskKey !== after.maskKey) return "Mask refined";
  if (before.name !== after.name) return "Renamed";
  if (after.versions.length > before.versions.length) return "Version added";
  if (after.versions.length < before.versions.length) return "Version removed";
  const a = before.look;
  const b = after.look;
  if (JSON.stringify(a.background) !== JSON.stringify(b.background) || a.matte !== b.matte) return "Background updated";
  if (a.padding !== b.padding) return "Padding changed";
  if (a.shadow !== b.shadow) return b.shadow ? "Shadow added" : "Shadow removed";
  if (a.align.x !== b.align.x || a.align.y !== b.align.y) return "Position changed";
  if (a.format !== b.format) return "Format changed";
  if (JSON.stringify(a) !== JSON.stringify(b)) return "Look changed";
  if (JSON.stringify(before.versions) !== JSON.stringify(after.versions)) return "Version adjusted";
  return "Saved";
}
