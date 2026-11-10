"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleCheck,
  Download,
  FolderOpen,
  HardDrive,
  Images,
  LayoutGrid,
  Layers,
  List,
  Palette,
  Plus,
  Scissors,
  Share,
  ShieldCheck,
  Upload,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ISSUE_LABEL, TARGETS, flaggedCount, targetSummary, type Issue } from "@/lib/consistency";
import { DEFAULT_DESTINATIONS, destinationById, destinationSettings } from "@/lib/export-sets";
import { getExport, type ExportRecord } from "@/lib/studio/export-history";
import { useLibrary } from "@/lib/studio/library";
import type { Project } from "@/lib/studio/project-model";
import type { BatchSnapshot } from "@/lib/studio/snapshot";
import { BrandPresetCard } from "./brand-preset-card";
import { useLibraryReady } from "./library-hooks";
import { ProductionQueue } from "./production-queue";
import { editedText, useProjectPreview } from "./project-hooks";
import { StatusPill } from "./projects-page";
import { usePresets } from "./use-presets";
import { bytesText, useBlobUrls, useCutoutPreviews, useExportHistory, useOriginalThumbs, useSnapshot, useSnapshotReport, useStorageInfo, whenText } from "./use-studio-data";

export interface StudioUser {
  name: string;
  pro: boolean;
}

const card = "rounded-[18px] border border-line bg-surface shadow-[var(--shadow-card)]";

const TOOLS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/editor", label: "Remove background", icon: Scissors },
  { href: "/editor?tool=restore", label: "Edit an image", icon: Wand2 },
  { href: "/studio/batch", label: "Start a batch", icon: Layers },
  { href: "/editor?panel=background", label: "Change background", icon: Images },
  { href: "/studio/batch?preset=default", label: "Apply brand preset", icon: Palette },
  { href: "/studio/batch?export=set", label: "Create export set", icon: Share },
];

function QuickTools() {
  const presets = usePresets((s) => s.presets);
  // Without a preset yet, "Apply brand preset" starts by making one.
  const tools = TOOLS.map((t) => (t.label === "Apply brand preset" && presets?.length === 0 ? { ...t, href: "/studio/presets?new=1" } : t));
  return (
    <section aria-label="Quick start tools" className="rounded-[18px] border border-blue-100 bg-gradient-to-br from-blue-50 to-sky/50 p-3 sm:p-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-[auto_repeat(6,minmax(0,1fr))] sm:items-center">
        <p className="col-span-3 flex items-center gap-2 px-1 pb-1 sm:col-span-1 sm:block sm:border-r sm:border-blue/15 sm:pb-0 sm:pr-4">
          <Zap className="size-5 text-blue sm:mb-1.5" aria-hidden="true" />
          <span className="text-[12px] font-bold uppercase leading-tight tracking-[0.1em] text-ink">
            Quick start
            <span className="sm:block"> tools</span>
          </span>
        </p>
        {tools.map((t) => (
          <Link key={t.label} href={t.href} className="group flex flex-col items-center gap-2 rounded-[12px] px-1 py-2 text-center hover:bg-white/70">
            <span className="inline-flex size-11 items-center justify-center rounded-[12px] bg-surface text-ink shadow-[var(--shadow-card)] transition-transform group-hover:-translate-y-0.5">
              <t.icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="text-[12px] font-medium leading-tight text-ink sm:text-[13px]">{t.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function useDownloadAgain() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(record: ExportRecord) {
    setBusy(record.id);
    setError(null);
    const full = await getExport(record.id);
    setBusy(null);
    if (full?.blob) download(full.blob, full.fileName);
    else setError("That file is no longer stored in this browser. Export it again from Batch Studio or the editor.");
  }
  return { busy, error, run };
}

function exportKind(r: ExportRecord) {
  if (r.source === "export-set") return `Export set · ${r.files} files`;
  if (r.files > 1) return `ZIP · ${r.files} images`;
  return r.format;
}

/** A project in Continue creating: its first version as it exports, its status and when it was edited. */
function ProjectContinueCard({ project, compact }: { project: Project; compact: boolean }) {
  const preview = useProjectPreview(project, project.versions[0] ?? null, 420);
  const versions = `${project.versions.length} version${project.versions.length === 1 ? "" : "s"}`;
  return (
    <Link
      href={`/studio/projects/${project.id}`}
      className={cn("group overflow-hidden transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)]", card, compact && "flex items-center")}
      data-continue="project"
    >
      {compact ? (
        <span className="checkerboard-sm m-2 size-14 shrink-0 overflow-hidden rounded-[10px] border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {preview && <img src={preview} alt="" className="size-full object-contain" />}
        </span>
      ) : (
        <div className="checkerboard-sm relative aspect-[16/10]">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {preview && <img src={preview} alt="" className="absolute inset-0 size-full object-contain p-2" />}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-ink shadow-sm">
            <Layers className="size-3.5" aria-hidden="true" /> Project · {versions}
          </span>
        </div>
      )}
      <div className={cn("flex min-w-0 flex-1 items-center gap-3", compact ? "py-2 pr-3" : "px-4 py-3")}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink group-hover:text-blue-700">{project.name}</p>
          <p className="truncate text-[13px] text-muted">
            {compact && `Project · ${versions} · `}Edited {editedText(project.updatedAt)}
          </p>
        </div>
        <StatusPill project={project} />
      </div>
    </Link>
  );
}

function ContinueCreating({ snapshot, exports }: { snapshot: BatchSnapshot | null; exports: ExportRecord[] | null }) {
  const [tab, setTab] = useState<"recent" | "exports">("recent");
  useLibraryReady();
  const allProjects = useLibrary((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => !p.trashedAt).sort((a, b) => b.updatedAt - a.updatedAt), [allProjects]);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const items = snapshot?.items ?? [];
  const thumbs = useOriginalThumbs(items, 3);
  const exportThumbs = useBlobUrls((exports ?? []).map((e) => e.thumb));
  const again = useDownloadAgain();
  const ready = items.filter((i) => i.status === "ready").length;

  const compact = layout === "list";
  const batchCard = items.length > 0 && (
    <Link
      key="batch"
      href="/studio/batch"
      className={cn("group overflow-hidden transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)]", card, compact && "flex items-center")}
      data-continue="batch"
    >
      {compact ? (
        <span className="m-2 size-14 shrink-0 overflow-hidden rounded-[10px] bg-paper-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {thumbs[0] && <img src={thumbs[0]} alt="" className="size-full object-cover" />}
        </span>
      ) : (
      <div className="relative grid aspect-[16/10] grid-cols-[2fr_1fr] gap-1 bg-paper-2 p-1">
        <span className="overflow-hidden rounded-[12px] bg-paper">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {thumbs[0] && <img src={thumbs[0]} alt="" className="size-full object-cover" />}
        </span>
        <span className="grid gap-1">
          {[1, 2].map((n) => (
            <span key={n} className="overflow-hidden rounded-[10px] bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              {thumbs[n] && <img src={thumbs[n]!} alt="" className="size-full object-cover" />}
            </span>
          ))}
        </span>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-ink shadow-sm">
          <FolderOpen className="size-3.5" aria-hidden="true" /> Collection · {items.length} image{items.length === 1 ? "" : "s"}
        </span>
      </div>
      )}
      <div className={cn("min-w-0", compact ? "flex-1 py-2 pr-4" : "px-4 py-3")}>
        <p className="truncate text-[16px] font-bold text-ink group-hover:text-blue-700">{snapshot!.name}</p>
        <p className="text-[13px] text-muted">
          {compact && `Collection · ${items.length} image${items.length === 1 ? "" : "s"} · `}
          {ready} ready{snapshot!.updatedAt ? ` · Updated ${whenText(snapshot!.updatedAt)}` : ""}
        </p>
      </div>
    </Link>
  );

  const exportCard = (r: ExportRecord, i: number) => (
    <div key={r.id} className={cn("overflow-hidden", card, compact && "flex items-center")} data-continue="export">
      {compact ? (
        <span className="checkerboard-sm m-2 size-14 shrink-0 overflow-hidden rounded-[10px] border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {exportThumbs[i] && <img src={exportThumbs[i]!} alt="" className="size-full object-cover" />}
        </span>
      ) : (
      <div className="checkerboard-sm relative aspect-[16/10]">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        {exportThumbs[i] && <img src={exportThumbs[i]!} alt="" className="absolute inset-0 size-full object-contain" />}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-ink shadow-sm">
          <Download className="size-3.5" aria-hidden="true" /> {exportKind(r)}
        </span>
      </div>
      )}
      <div className={cn("flex min-w-0 flex-1 items-center gap-3", compact ? "py-2 pr-3" : "px-4 py-3")}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink">{r.title}</p>
          <p className="truncate text-[13px] text-muted">
            {compact && `${exportKind(r)} · `}Exported {whenText(r.createdAt)}
          </p>
        </div>
        {r.blob && (
          <button
            type="button"
            onClick={() => void again.run(r)}
            aria-label={`Download ${r.fileName} again`}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-ink hover:bg-paper"
          >
            <Download className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );

  const startCard = (
    <Link
      key="start"
      href="/studio/batch"
      data-start-card
      className={cn(
        "flex items-center gap-3 rounded-[18px] border-2 border-dashed border-line-strong text-center hover:border-blue/60 hover:bg-surface",
        compact ? "min-h-[76px] px-4 text-left" : "min-h-[200px] flex-col justify-center p-6",
      )}
    >
      <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue", compact ? "size-10" : "size-12")}>
        <Plus className={compact ? "size-5" : "size-6"} aria-hidden="true" />
      </span>
      <span className={cn(!compact && "grid gap-1")}>
        <span className="block text-[15px] font-semibold text-ink">Start a collection</span>
        <span className="block text-[13px] text-muted">Add product photos to Batch Studio</span>
      </span>
    </Link>
  );

  // Most recent work first: projects you edited, the batch, then exports; three cards in all.
  const projectCards = projects.slice(0, 2).map((p) => <ProjectContinueCard key={p.id} project={p} compact={compact} />);
  const before = [...projectCards, batchCard].filter(Boolean);
  const recentCards = [...before, ...(exports ?? []).slice(0, Math.max(0, 3 - before.length)).map(exportCard)].slice(0, 3);
  const list = tab === "recent" ? recentCards : (exports ?? []).map(exportCard);

  return (
    <section aria-labelledby="continue-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="continue-title" className="font-display text-[24px] font-bold tracking-[-0.02em] text-ink">
          Continue creating
        </h2>
        <div role="tablist" aria-label="Show" className="flex gap-1.5">
          {(
            [
              ["recent", "Recent"],
              ["exports", `Exports${exports?.length ? ` (${exports.length})` : ""}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn("h-9 rounded-full px-4 text-[14px] font-semibold", tab === value ? "bg-blue-50 text-blue-700 ring-1 ring-blue/20" : "border border-line bg-surface text-ink-3 hover:text-ink")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex rounded-[10px] border border-line bg-surface p-0.5" role="group" aria-label="Layout">
          {(
            [
              ["grid", "Grid", LayoutGrid],
              ["list", "List", List],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={layout === value}
              onClick={() => setLayout(value)}
              className={cn("inline-flex size-8 items-center justify-center rounded-lg", layout === value ? "bg-blue-50 text-blue-700" : "text-muted hover:text-ink")}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {again.error && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {again.error}
        </p>
      )}
      <div className={cn("mt-4 grid", compact ? "gap-2.5" : "gap-4 sm:grid-cols-2 2xl:grid-cols-3")}>
        {list.length ? list : null}
        {tab === "recent" && items.length === 0 && startCard}
        {tab === "exports" && list.length === 0 && (
          <p className="rounded-[14px] border border-dashed border-line-strong px-4 py-8 text-center text-[14px] text-muted sm:col-span-2">
            Nothing exported yet. Downloads from the editor and Batch Studio show up here, so you can take them again.
          </p>
        )}
      </div>
    </section>
  );
}

const EXAMPLE = [
  { src: "/showcase/batch/sneaker-cutout.webp", kind: "scale" as const, alt: "Sneaker cutout" },
  { src: "/showcase/batch/serum-cutout.webp", kind: "fragments" as const, alt: "Serum bottle cutout" },
  { src: "/showcase/batch/handbag-cutout.webp", kind: "cut-off" as const, alt: "Handbag cutout" },
];

function ConsistencyCard({ snapshot, pro }: { snapshot: BatchSnapshot | null; pro: boolean }) {
  const report = useSnapshotReport(snapshot, pro);
  const ready = snapshot?.items.filter((i) => i.status === "ready" && i.maskBlob) ?? [];
  const firstPerItem: Issue[] = [];
  for (const issue of report?.issues ?? []) if (issue.itemId && !firstPerItem.some((i) => i.itemId === issue.itemId)) firstPerItem.push(issue);
  const shown = firstPerItem.slice(0, 3);
  const byId = new Map(ready.map((i) => [i.id, i]));
  const previews = useCutoutPreviews(
    shown.map((i) => {
      const item = byId.get(i.itemId!);
      return item ? { item, settings: item.settings } : null;
    }),
    snapshot?.backgrounds ?? new Map(),
    pro,
    280,
  );
  const flagged = report ? flaggedCount(report) : 0;
  const meets = report ? targetSummary(report) : null;
  const example = ready.length === 0;

  return (
    <section aria-labelledby="consistency-title" className={cn("p-5 sm:p-6", card)} data-consistency-card>
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="consistency-title" className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
          Keep the collection consistent.
        </h2>
        {example ? (
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-blue-700">Example</span>
        ) : (
          report?.target && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-blue-700">{TARGETS[report.target].label}</span>
        )}
      </div>
      <p className="mt-1 text-[15px] text-ink-3">
        {example
          ? "ISOLA measures every finished cutout against the rest of the collection and suggests fixes you approve."
          : !report
            ? `Measuring ${ready.length} finished image${ready.length === 1 ? "" : "s"}…`
            : meets?.meets && report.target
              ? `All ${report.checked} finished image${report.checked === 1 ? "" : "s"} meet the ${TARGETS[report.target].label} checks.${meets.others ? ` ${meets.others} other suggestion${meets.others === 1 ? "" : "s"} to review.` : ""}`
              : report.issues.length
                ? `${flagged || report.issues.length} of ${report.checked} image${report.checked === 1 ? "" : "s"} could match the rest better. Review suggested changes before applying them.`
                : `All ${report.checked} finished image${report.checked === 1 ? "" : "s"} look consistent.`}
      </p>

      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center">
        <ul className="grid flex-1 grid-cols-3 gap-3" aria-label={example ? "Example suggestions" : "Images with suggestions"}>
          {example
            ? EXAMPLE.map((e) => (
                <li key={e.src} className="relative">
                  <span className="checkerboard-sm relative block aspect-[4/3] overflow-hidden rounded-[12px] border border-line">
                    <Image src={e.src} alt={e.alt} fill sizes="200px" className="object-contain p-3" />
                  </span>
                  <span className="absolute bottom-2 left-2 rounded-[8px] border border-blue/30 bg-surface px-2 py-0.5 text-[11px] font-semibold text-blue-700 shadow-sm">
                    {ISSUE_LABEL[e.kind]}
                  </span>
                </li>
              ))
            : shown.length === 0 && report
              ? (
                  <li className="col-span-3 flex items-center gap-2 rounded-[12px] bg-success-50 px-4 py-4 text-[14px] font-medium text-success">
                    <CircleCheck className="size-5" aria-hidden="true" /> Nothing to fix right now.
                  </li>
                )
              : shown.map((issue, i) => (
                  <li key={issue.key} className="relative" data-issue-kind={issue.kind}>
                    <span className="checkerboard-sm relative block aspect-[4/3] overflow-hidden rounded-[12px] border border-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                      {previews[i] && <img src={previews[i]!} alt={byId.get(issue.itemId!)?.name ?? ""} className="absolute inset-0 size-full object-contain" />}
                    </span>
                    <span className={cn("absolute bottom-2 left-2 rounded-[8px] border bg-surface px-2 py-0.5 text-[11px] font-semibold shadow-sm", issue.severity === "warning" ? "border-warn/40 text-warn" : "border-blue/30 text-blue-700")}>
                      {ISSUE_LABEL[issue.kind]}
                    </span>
                  </li>
                ))}
        </ul>
        <div className="flex shrink-0 flex-col gap-2 lg:w-[210px] lg:border-l lg:border-line lg:pl-5">
          <Link
            href={example ? "/studio/batch" : "/studio/batch?check=consistency"}
            className="inline-flex h-11 items-center justify-center rounded-[10px] border border-blue/40 bg-surface px-4 text-[14px] font-semibold text-blue-700 hover:border-blue hover:bg-blue-50"
          >
            {example ? "Start a collection" : report?.issues.length ? `Review ${report.issues.length} suggestion${report.issues.length === 1 ? "" : "s"}` : "Open the check"}
          </Link>
          <Link href="/studio/batch" className="inline-flex h-11 items-center justify-center rounded-[10px] border border-line bg-surface px-4 text-[14px] font-semibold text-ink hover:bg-paper">
            Open collection
          </Link>
        </div>
      </div>
    </section>
  );
}

function DestinationsCard({ snapshot, pro }: { snapshot: BatchSnapshot | null; pro: boolean }) {
  const ready = snapshot?.items.filter((i) => i.status === "ready" && i.maskBlob) ?? [];
  const first = ready[0] ?? null;
  const destinations = DEFAULT_DESTINATIONS.map((id) => destinationById(id)!);
  const previews = useCutoutPreviews(
    destinations.map((d) => (first ? { item: first, settings: destinationSettings(first.settings, d) } : null)),
    snapshot?.backgrounds ?? new Map(),
    pro,
    260,
  );
  return (
    <section aria-labelledby="destinations-title" className={cn("p-5 sm:p-6", card)} data-destinations-card>
      <h2 id="destinations-title" className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">
        One collection. Every destination.
      </h2>
      <p className="mt-1 text-[15px] text-ink-3">
        {first ? `Every finished image, sized for each place you'll use it, in one ZIP. Shown with ${first.name}.` : "Export every image as Square, Portrait, Story, Wide and marketplace sizes at once."}
      </p>
      <div className="mt-5 grid gap-5">
        <ul className="grid grid-cols-3 gap-3 sm:gap-4">
          {destinations.map((d, i) => (
            <li key={d.id} className="flex min-w-0 flex-col gap-2.5 2xl:flex-row 2xl:items-center">
              <span className="flex aspect-square w-full max-w-[120px] shrink-0 items-center justify-center rounded-[12px] bg-paper 2xl:size-[96px]">
                <span
                  className="checkerboard-sm relative overflow-hidden rounded-[6px] border border-line"
                  style={{ width: d.width >= d.height ? "80%" : `${Math.round((80 * d.width) / d.height)}%`, aspectRatio: `${d.width} / ${d.height}` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                  {previews[i] && <img src={previews[i]!} alt={`${first?.name ?? ""} as ${d.label}`} className="absolute inset-0 size-full object-contain" />}
                </span>
              </span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-[15px] font-semibold text-ink">{d.label}</span>
                <span className={cn("mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold", ready.length ? "bg-success-50 text-success" : "bg-paper-2 text-muted")}>
                  {ready.length ? <CircleCheck className="size-3.5" aria-hidden="true" /> : null}
                  {ready.length ? `${ready.length} ready` : "Nothing yet"}
                </span>
                <span className="mt-1 block text-[12px] tabular-nums text-muted">
                  {d.width} × {d.height}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <Link
          href={ready.length ? "/studio/batch?export=set" : "/studio/batch"}
          className="inline-flex h-11 items-center justify-center gap-2 justify-self-end rounded-[10px] bg-blue px-5 text-[15px] font-semibold text-white shadow-[var(--shadow-blue)] hover:bg-blue-600 max-sm:w-full"
        >
          {ready.length ? "Review export set" : "Add images"} <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function StorageCard() {
  const [info, persist] = useStorageInfo();
  return (
    <section aria-labelledby="storage-title" className={cn("p-5", card)}>
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="size-5 text-success" aria-hidden="true" />
        <h2 id="storage-title" className="font-display text-[18px] font-bold text-ink">
          Private by design
        </h2>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
        Your library, projects, batch and recent exports stay in this browser; images are processed on this device. Your account keeps only settings like brand
        presets.
      </p>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-ink">
        <HardDrive className="size-4 text-muted" aria-hidden="true" />
        {info.usage === null ? "Storage use isn't available in this browser." : `This browser holds ${bytesText(info.usage)} for ISOLA: your library, projects, batch, recent exports and any downloaded models.`}
      </p>
      {info.canPersist &&
        (info.persisted ? (
          <p className="mt-2 flex items-center gap-2 text-[13px] font-medium text-success">
            <CircleCheck className="size-4" aria-hidden="true" /> Protected from automatic clean-up
          </p>
        ) : (
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => void persist()}>
            Keep my files when space runs low
          </Button>
        ))}
    </section>
  );
}

function RecentExportsBar({ exports }: { exports: ExportRecord[] | null }) {
  const latest = exports?.[0] ?? null;
  const [thumb] = useBlobUrls([latest?.thumb ?? null]);
  const again = useDownloadAgain();
  return (
    <section aria-labelledby="exports-title" className={cn("flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:gap-6", card)} data-recent-exports>
      <h2 id="exports-title" className="flex shrink-0 items-center gap-2 text-[17px] font-bold text-ink">
        <Upload className="size-5 rotate-180" aria-hidden="true" /> Recent exports
      </h2>
      {latest ? (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="checkerboard-sm size-12 shrink-0 overflow-hidden rounded-[10px] border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              {thumb && <img src={thumb} alt="" className="size-full object-cover" />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-ink">
                {latest.title} <span className="font-normal text-muted">· {exportKind(latest)}</span>
              </p>
              <p className="truncate text-[13px] text-muted">
                {latest.fileName} · {bytesText(latest.bytes)} · {whenText(latest.createdAt)}
              </p>
            </div>
          </div>
          {latest.blob ? (
            <Button variant="secondary" onClick={() => void again.run(latest)} disabled={again.busy !== null} icon={<Download className="size-4" aria-hidden="true" />}>
              Download again
            </Button>
          ) : (
            <p className="text-[13px] text-muted">Details only: the file was too large to keep.</p>
          )}
        </>
      ) : (
        <p className="flex-1 text-[14px] text-muted">{exports === null ? "Loading…" : "Your downloads will appear here, kept in this browser so you can take them again."}</p>
      )}
      <p className="shrink-0 text-[12px] text-muted">Saved in this browser only</p>
      {again.error && (
        <p role="alert" className="text-[13px] text-danger md:basis-full">
          {again.error}
        </p>
      )}
    </section>
  );
}

/** The signed-in home: what you're working on, what needs attention, and the tools to finish it. */
export function StudioDashboard({ user }: { user: StudioUser }) {
  const state = useSnapshot();
  const exports = useExportHistory();
  const snapshot = state.status === "ready" ? state.snapshot : null;
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 content-start gap-6">
        <header>
          {firstName && <p className="text-[14px] font-medium text-muted">Welcome back, {firstName}</p>}
          <h1 className="mt-1 font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[42px]">Your studio, in sync.</h1>
          <p className="mt-2 text-[17px] text-ink-3">Create clean images. Keep every collection consistent.</p>
        </header>
        <QuickTools />
        {state.status === "unavailable" && (
          <p role="status" className="rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 text-[13px] text-warn">
            This browser isn&apos;t letting ISOLA store files (private browsing can do this), so batches and recent exports can&apos;t be shown here.
          </p>
        )}
        <ContinueCreating snapshot={snapshot} exports={exports} />
        <ConsistencyCard snapshot={snapshot} pro={user.pro} />
        <DestinationsCard snapshot={snapshot} pro={user.pro} />
      </div>
      <div className="grid content-start gap-6">
        <ProductionQueue snapshot={snapshot} pro={user.pro} />
        <BrandPresetCard />
        <StorageCard />
      </div>
      <div className="xl:col-span-2">
        <RecentExportsBar exports={exports} />
      </div>
    </div>
  );
}
