"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  CircleCheck,
  Columns2,
  Crop,
  Download,
  Eye,
  Info,
  Ellipsis,
  HardDrive,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Lock,
  Pencil,
  RotateCw,
  ScanSearch,
  Scissors,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { engineSummary } from "@/components/editor/engine-text";
import { Button, ButtonLink } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ProgressBar, Spinner } from "@/components/ui/progress";
import { useFileDrop } from "@/components/upload/use-file-drop";
import { ACCEPT_ATTRIBUTE, FORMAT_LABEL, batchConfig, formatBytes, formatNaira, planConfig, uploadLimits } from "@/lib/config";
import { cn } from "@/lib/cn";
import {
  addFiles,
  cancelItems,
  clearBatch,
  exportItems,
  applySettings,
  hasUnappliedEdits,
  isBusy,
  isReady,
  matchReference,
  openInEditor,
  patchSettings,
  processItems,
  removeItems,
  restoreBatch,
  resumeWaiting,
  setSelection,
  targetIds,
  targetsMixed,
  undoSettings,
  useBatch,
  type BatchItem,
  type BatchView,
} from "@/lib/batch/batch-store";
import { CATALOGUE_PRESET, formatLabel, sameSettings, sizeLabel, type BatchSettings } from "@/lib/batch/settings";
import { describeLayout, presetToBatchSettings, type BrandPreset } from "@/lib/brand-presets";
import { flaggedCount } from "@/lib/consistency";
import { useEngineState } from "@/lib/processing/registry";
import { useProject } from "@/lib/project/store";
import { usePlan } from "@/lib/plan";
import { exportPolicy, policySummary } from "@/lib/plan-policy";
import { signInHref, useOnSignIn } from "@/lib/session-gate";
import { BatchCard, BatchRow, usePeek } from "./batch-card";
import { BatchSettingsPanel, useSettingsTab } from "./batch-settings-panel";
import { ConsistencyPanel, useCheckTarget, useConsistencyReport } from "./consistency-panel";
import { ExportSetDialog } from "./export-set-dialog";

export function countItems(items: BatchItem[]) {
  const c = { total: items.length, ready: 0, review: 0, processing: 0, queued: 0, failed: 0, cancelled: 0, waiting: 0 };
  for (const i of items) {
    if (i.status === "ready") {
      c.ready++;
      if (i.review) c.review++;
    } else if (i.status === "processing") c.processing++;
    else if (i.status === "queued") c.queued++;
    else if (i.status === "failed") c.failed++;
    else if (i.status === "cancelled") c.cancelled++;
    else c.waiting++;
  }
  return c;
}

function Dot({ className }: { className: string }) {
  return <span className={cn("inline-block size-2.5 rounded-full", className)} aria-hidden="true" />;
}

function useAddFiles() {
  const [issues, setIssues] = useState<Array<{ name: string; message: string }>>([]);
  return {
    issues,
    clear: () => setIssues([]),
    async add(files: File[]) {
      if (!files.length) return;
      const rejected = await addFiles(files);
      setIssues(rejected.map((r) => ({ name: r.name, message: r.error.message })));
    },
  };
}

function SelectAll({ visible }: { visible: BatchItem[] }) {
  const selected = useBatch((s) => s.selected);
  const ref = useRef<HTMLInputElement>(null);
  const visibleIds = visible.map((i) => i.id);
  const chosen = visibleIds.filter((id) => selected.includes(id)).length;
  const all = visible.length > 0 && chosen === visible.length;
  const some = chosen > 0 && !all;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        disabled={!visible.length}
        onChange={() => {
          const rest = selected.filter((id) => !visibleIds.includes(id));
          setSelection(all ? rest : [...rest, ...visibleIds]);
        }}
        className="size-5 cursor-pointer accent-[var(--color-blue)]"
      />
      Select all
    </label>
  );
}

const toolButton =
  "inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-line bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:border-line-strong hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45";

function EngineNotice() {
  const engineId = useProject((s) => s.engineId);
  const engine = useEngineState(engineId);
  const items = useBatch((s) => s.items);
  const failed = items.filter((i) => i.status === "failed" || i.status === "cancelled").map((i) => i.id);
  if (engine.kind !== "error" && engine.kind !== "unavailable") return null;
  return (
    <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-danger/25 bg-danger-50 px-4 py-3 text-[13px] text-danger sm:flex-row sm:items-center">
      <AlertTriangle className="hidden size-5 shrink-0 sm:block" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-semibold">{engine.message}</p>
        {engine.reason === "model-missing" && <p>The server has no copy of the model and couldn&apos;t download one. Ask the site owner to check the model setup.</p>}
        {engine.reason === "model-download-failed" && <p>Check your connection, then retry. Images you added are kept.</p>}
        {engine.reason === "unsupported-browser" && <p>Try a current version of Chrome, Edge, Firefox or Safari.</p>}
        {engine.reason === "out-of-memory" && <p>Close other tabs, or process fewer or smaller images at a time.</p>}
      </div>
      {failed.length > 0 && (
        <Button variant="danger" size="sm" onClick={() => processItems(failed)} icon={<RotateCw className="size-4" aria-hidden="true" />}>
          Retry {failed.length} image{failed.length === 1 ? "" : "s"}
        </Button>
      )}
    </div>
  );
}

function StatusStrip() {
  const items = useBatch((s) => s.items);
  const engineId = useProject((s) => s.engineId);
  const engine = useEngineState(engineId);
  const c = countItems(items);
  const busy = c.processing + c.queued > 0;
  const location = engineId.startsWith("server") ? "on our server" : "on this device";
  return (
    <div data-batch-status role="group" className="mt-5 flex flex-col gap-3 rounded-[14px] border border-blue-100 bg-blue-50/60 px-4 py-3 lg:flex-row lg:items-center lg:gap-5" aria-label="Batch status">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-ink" aria-live="polite">
        <span className="inline-flex items-center gap-2 font-bold">
          <ImageIcon className="size-4 text-muted" aria-hidden="true" />
          {c.total} image{c.total === 1 ? "" : "s"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Dot className="bg-success" /> {c.ready} ready{c.review ? ` (${c.review} to check)` : ""}
        </span>
        {c.processing > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Dot className="bg-blue" /> {c.processing} processing
          </span>
        )}
        {c.queued > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Dot className="bg-line-strong" /> {c.queued} queued
          </span>
        )}
        {c.failed > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Dot className="bg-danger" /> {c.failed} failed
          </span>
        )}
        {c.cancelled > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Dot className="bg-subtle" /> {c.cancelled} cancelled
          </span>
        )}
        {c.waiting > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Dot className="bg-warn" /> {c.waiting} waiting
          </span>
        )}
      </p>
      {c.total > 0 && (
        <div className="flex min-w-0 flex-1 items-center gap-3 lg:border-l lg:border-line lg:pl-5">
          <ProgressBar value={c.ready} max={c.total} label="Images ready" className="h-2 max-w-[280px] flex-1" />
          <span className="shrink-0 text-[13px] tabular-nums text-muted">
            {c.ready} of {c.total} ready
          </span>
        </div>
      )}
      {(busy || engine.kind === "downloading" || engine.kind === "initialising") && (
        <p className="flex items-center gap-2 text-[13px] text-muted lg:ml-auto" aria-live="polite">
          <Spinner className="size-4 text-blue" />
          {engine.kind === "downloading" || engine.kind === "initialising" ? engineSummary(engine) : `Removing backgrounds ${location}`}
        </p>
      )}
    </div>
  );
}

export type BatchFilter = "all" | "ready" | "processing" | "review" | "failed" | "waiting";

const matchesFilter = (item: BatchItem, filter: BatchFilter) => {
  switch (filter) {
    case "all":
      return true;
    case "ready":
      return item.status === "ready" && !item.review;
    case "review":
      return item.status === "ready" && !!item.review;
    case "processing":
      return item.status === "processing" || item.status === "queued";
    case "failed":
      return item.status === "failed" || item.status === "cancelled";
    case "waiting":
      return item.status === "needs-auth" || item.status === "needs-pro";
  }
};

/** Show everything, or only the images in one state. Counts are live. */
function FilterChips({ filter, onChange }: { filter: BatchFilter; onChange: (f: BatchFilter) => void }) {
  const items = useBatch((s) => s.items);
  const chips: Array<{ id: BatchFilter; label: string; dot?: string; always?: boolean }> = [
    { id: "all", label: "All", always: true },
    { id: "ready", label: "Ready", dot: "bg-success", always: true },
    { id: "processing", label: "Processing", dot: "bg-blue", always: true },
    { id: "review", label: "Review", dot: "bg-[#E9820C]", always: true },
    { id: "failed", label: "Failed", dot: "bg-danger" },
    { id: "waiting", label: "Waiting", dot: "bg-subtle" },
  ];
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap items-center gap-2">
      {chips.map((c) => {
        const n = items.filter((i) => matchesFilter(i, c.id)).length;
        if (!c.always && n === 0 && filter !== c.id) return null;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            data-filter={c.id}
            onClick={() => onChange(c.id)}
            className={cn("inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[13px] font-medium transition-colors", filter === c.id ? "border-blue/30 bg-blue-50 text-blue-700" : "border-line bg-surface text-ink hover:border-line-strong")}
          >
            {c.dot && <Dot className={cn("size-2", c.dot)} />}
            {c.label}
            <span className="tabular-nums text-muted">{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The four steps of a collection, each with its real state: backgrounds
 * removed, one layout applied, details reviewed, exported. The current step is
 * the first one that isn't done; each step opens the tools for it.
 */
function Workflow({ flagged, onProcess, onLayout, onReview, onExport }: { flagged: number; onProcess: () => void; onLayout: () => void; onReview: () => void; onExport: () => void }) {
  const items = useBatch((s) => s.items);
  const draft = useBatch((s) => s.draft);
  const draftEdited = useBatch((s) => s.draftEdited);
  const matchSize = useBatch((s) => s.matchSize);
  const report = useBatch((s) => s.report);
  const c = countItems(items);
  const ready = items.filter(isReady);
  const all = { items, selected: [] as string[] };
  const reference = matchReference({ items, matchSize });
  // One layout: every finished image shares its settings (padding aside when sizes are matched).
  const uniform = reference ? ready.every((i) => sameSettings({ ...i.settings, padding: 0 }, { ...ready[0].settings, padding: 0 })) : !targetsMixed({ items: ready, selected: [] });
  const steps = [
    { id: "remove", label: "Remove backgrounds", icon: ImageIcon, done: c.total > 0 && c.ready === c.total, note: c.total ? `${c.ready} of ${c.total}` : "Add images", run: onProcess },
    { id: "layout", label: "Match layout", icon: Crop, done: ready.length > 0 && uniform && !hasUnappliedEdits({ ...all, draft, draftEdited, matchSize }), note: ready.length === 0 ? "" : uniform ? (reference ? "Sizes matched" : "One layout") : "Mixed settings", run: onLayout },
    { id: "review", label: "Review details", icon: ScanSearch, done: ready.length > 0 && c.review === 0 && flagged === 0, note: ready.length === 0 ? "" : c.review + flagged ? `${Math.max(c.review, flagged)} to check` : "All clear", run: onReview },
    { id: "export", label: "Export collection", icon: Upload, done: !!report && report.tone !== "error" && /^Downloaded/.test(report.message), note: c.ready ? `${c.ready} ready` : "", run: onExport },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <nav aria-label="Workflow" className="mt-5">
      <ol className="grid grid-cols-2 gap-1.5 lg:flex lg:gap-0">
        {steps.map((s, i) => {
          const active = i === (current === -1 ? steps.length - 1 : current);
          return (
            <li key={s.id} className="min-w-0 lg:-ml-2.5 lg:flex-1 lg:first:ml-0">
              <button
                type="button"
                onClick={s.run}
                aria-current={active ? "step" : undefined}
                data-step={s.id}
                data-done={s.done}
                className={cn(
                  "flex h-12 w-full items-center gap-2.5 rounded-[10px] px-4 text-left text-[14px] font-medium transition-colors lg:rounded-none lg:pl-7",
                  i === 0 ? "lg:rounded-l-[12px] lg:pl-4 lg:[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%)]" : i === steps.length - 1 ? "lg:rounded-r-[12px] lg:[clip-path:polygon(0_0,100%_0,100%_100%,0_100%,14px_50%)]" : "lg:[clip-path:polygon(0_0,calc(100%-14px)_0,100%_50%,calc(100%-14px)_100%,0_100%,14px_50%)]",
                  active ? "bg-blue text-white" : "bg-paper-2 text-ink hover:bg-line focus-visible:bg-line",
                )}
              >
                {s.done ? <CircleCheck className={cn("size-[18px] shrink-0", active ? "text-white" : "text-success")} aria-hidden="true" /> : <s.icon className="size-[18px] shrink-0" aria-hidden="true" />}
                <span className={cn("tabular-nums", active ? "text-white" : "text-ink-3")}>{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{s.label}</span>
                {s.note && <span className={cn("hidden shrink-0 pr-2 text-[12px] xl:inline", active ? "text-white" : "text-muted")}>{s.note}</span>}
                <span className="sr-only">{s.done ? " (done)" : active ? " (current step)" : ""}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ExportBar({ onOpenExportSettings }: { onOpenExportSettings: () => void }) {
  const items = useBatch((s) => s.items);
  const selected = useBatch((s) => s.selected);
  const exporting = useBatch((s) => s.exporting);
  const report = useBatch((s) => s.report);
  const dismissReport = useBatch((s) => s.dismissReport);
  const draft = useBatch((s) => s.draft);
  const draftEdited = useBatch((s) => s.draftEdited);
  const pro = useBatch((s) => s.pro);
  const matchSize = useBatch((s) => s.matchSize);
  const includeOriginals = useBatch((s) => s.includeOriginals);
  const setIncludeOriginals = useBatch((s) => s.setIncludeOriginals);
  const chosen = new Set(selected);
  const selectedItems = items.filter((i) => chosen.has(i.id));
  const selectedReady = selectedItems.filter(isReady).length;
  // The quick format switch acts on the finished images the panel targets.
  const targetSet = new Set(targetIds({ items, selected }));
  const quickTargets = items.filter((i) => targetSet.has(i.id) && isReady(i)).map((i) => i.id);
  const ready = items.filter(isReady).length;
  const c = countItems(items);
  const unapplied = hasUnappliedEdits({ items, selected, draft, draftEdited, matchSize });
  // Padding may differ per image when sizes are matched; format and size are what this label is about.
  const flat = (x: BatchSettings) => ({ ...x, padding: 0 });
  const shared = items.length > 0 && items.every((i) => sameSettings(flat(i.settings), flat(items[0].settings))) ? items[0].settings : null;
  const formatText = items.length === 0 ? `${formatLabel(draft)} · ${sizeLabel(draft)}` : shared ? `${formatLabel(shared)} · ${sizeLabel(shared)}` : "Mixed settings";

  let reason: string;
  if (exporting) reason = `${exporting.label}${exporting.total > 1 ? ` · ${exporting.done} of ${exporting.total}` : ""}…`;
  else if (items.length === 0) reason = "Add images to start.";
  else if (selected.length === 0)
    reason = ready
      ? "Select images to download them, or export every ready image."
      : c.processing + c.queued
        ? "Waiting for processing to finish."
        : c.waiting
          ? "Images are waiting to be processed."
          : "No finished images yet.";
  else if (selectedReady === 0) reason = "Select a completed image. The selected ones aren't finished.";
  else if (selectedReady < selected.length) reason = `${selected.length - selectedReady} selected image${selected.length - selectedReady === 1 ? " isn't" : "s aren't"} finished and will be left out.`;
  else if (c.failed) reason = "Failed images are excluded from exports.";
  else reason = "Downloads use each image's applied settings.";

  return (
    <div data-batch-export-bar className="sticky bottom-0 z-30 border-t border-line bg-surface/95 shadow-[0_-8px_24px_-16px_rgba(32,41,45,0.25)] backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {report && (
        <div
          role={report.tone === "error" ? "alert" : "status"}
          className={cn(
            "mx-auto flex max-w-[1440px] items-start gap-2 px-4 pt-2.5 text-[13px] sm:px-6 lg:px-8",
            report.tone === "error" ? "text-danger" : report.tone === "warn" ? "text-warn" : "text-success",
          )}
        >
          {report.tone === "ok" ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <p className="flex-1" data-export-report>
            {report.message}
          </p>
          <button type="button" onClick={dismissReport} aria-label="Dismiss" className="rounded p-0.5 text-muted hover:text-ink">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2.5 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-4 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink" data-export-summary>
            {selected.length} selected · {selectedReady} ready
          </p>
          <p id="batch-export-reason" className="truncate text-xs text-muted" aria-live="polite">
            {reason}
            {unapplied && items.length > 0 && <span className="font-medium text-warn"> Settings panel has unapplied changes.</span>}
          </p>
        </div>
        {exporting && exporting.total > 1 && <ProgressBar value={exporting.done} max={exporting.total} label="Export progress" className="lg:max-w-[140px]" />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger
              disabled={quickTargets.length === 0 || exporting !== null}
              title={`${policySummary(exportPolicy(pro))}.`}
              aria-label={`Export format: ${formatText}`}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-medium text-ink hover:border-line-strong disabled:opacity-50"
            >
              {formatText}
              <ChevronDown className="size-4 text-muted" aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="start" side="top" sideOffset={6} className="z-50 min-w-[260px] animate-scale-in rounded-xl border border-line bg-surface p-1 text-sm shadow-[var(--shadow-float)]">
                <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                  Format for {selected.length ? `${quickTargets.length} selected` : `all ${quickTargets.length} ready`}
                </DropdownMenu.Label>
                {(
                  [
                    ["png", "PNG", "Lossless; keeps transparency"],
                    ["jpeg", "JPEG", "Smaller; transparent areas are filled"],
                  ] as const
                ).map(([format, label, note]) => (
                  <DropdownMenu.Item key={format} onSelect={() => void patchSettings(quickTargets, { format })} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper">
                    <span className="w-12 font-semibold">{label}</span>
                    <span className="text-[12px] text-muted">{note}</span>
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item onSelect={onOpenExportSettings} className="cursor-pointer rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper">
                  More export settings…
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink" title="Adds each image's untouched original to the ZIP, in an “originals” folder">
            <input type="checkbox" checked={includeOriginals} onChange={(e) => setIncludeOriginals(e.target.checked)} className="size-[18px] cursor-pointer accent-[var(--color-blue)]" />
            Include original files
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex lg:shrink-0">
          <Button
            variant="outline-blue"
            className="h-11 px-3 sm:px-5"
            disabled={ready === 0 || exporting !== null}
            aria-describedby="batch-export-reason"
            onClick={() => void exportItems(items.map((i) => i.id), "all")}
          >
            Export all ready{ready ? ` (${ready})` : ""}
          </Button>
          <Button
            className="h-11 px-3 sm:px-5"
            disabled={selectedReady === 0 || exporting !== null}
            aria-describedby="batch-export-reason"
            onClick={() => void exportItems(selected, "selected")}
            icon={exporting ? <Spinner /> : undefined}
          >
            {selectedReady > 1 || (includeOriginals && selectedReady === 1) ? "Download selected ZIP" : "Download selected"}
            {!exporting && <Download className="size-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StorageNote() {
  const storage = useBatch((s) => s.storage);
  const count = useBatch((s) => s.items.length);
  const [confirming, setConfirming] = useState(false);
  if (storage.state === "loading") return null;
  const text =
    storage.state === "ok"
      ? "Kept in this browser until you remove it. Nothing is uploaded."
      : storage.state === "unavailable"
        ? "This browser isn't allowing storage, so this batch is lost if you reload or leave."
        : storage.state === "full"
          ? "Browser storage is full: some images won't survive a reload. Remove images or export them now."
          : `This batch couldn't be saved in the browser (${storage.message}). It's lost if you reload.`;
  return (
    <p className={cn("flex items-start gap-2 text-xs", storage.state === "ok" ? "text-muted" : "text-warn")}>
      <HardDrive className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {text}
      {count > 0 &&
        (confirming ? (
          <span className="inline-flex items-center gap-2">
            Remove all {count} images?
            <button type="button" className="font-semibold text-danger underline" onClick={() => void clearBatch().then(() => setConfirming(false))}>
              Clear batch
            </button>
            <button type="button" className="font-semibold underline" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="font-semibold text-blue-700 underline-offset-2 hover:underline" onClick={() => setConfirming(true)}>
            Clear batch
          </button>
        ))}
      </span>
    </p>
  );
}

type LoadedPreset = { kind: "catalogue" } | { kind: "brand"; preset: BrandPreset } | { kind: "missing" };

/**
 * Acts on links into Batch Studio: ?preset=catalogue (the Tools menu's
 * "Product images"), ?preset=<brand preset id or "default">, and, once the
 * saved batch is restored, ?check=consistency, ?export=set and ?open=<image id>.
 */
function UrlActions({ onPreset, onCheck, onExportSet }: { onPreset: (p: LoadedPreset) => void; onCheck: () => void; onExportSet: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const storage = useBatch((s) => s.storage.state);
  const handled = useRef(false);
  const preset = params.get("preset");
  const check = params.get("check");
  const exportParam = params.get("export");
  const open = params.get("open");

  useEffect(() => {
    if (!preset) return;
    if (preset === "catalogue") return onPreset({ kind: "catalogue" });
    let alive = true;
    fetch("/api/presets", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ presets: BrandPreset[] }>) : null))
      .then((json) => {
        const list = json?.presets ?? [];
        const found = preset === "default" ? (list.find((p) => p.isDefault) ?? list[0]) : list.find((p) => p.id === preset);
        if (alive) onPreset(found ? { kind: "brand", preset: found } : { kind: "missing" });
      })
      .catch(() => alive && onPreset({ kind: "missing" }));
    return () => {
      alive = false;
    };
  }, [preset, onPreset]);

  useEffect(() => {
    if (handled.current || storage === "loading" || (!check && !exportParam && !open)) return;
    handled.current = true;
    const strip = () => {
      const next = new URLSearchParams(params.toString());
      for (const key of ["check", "export", "open"]) next.delete(key);
      const qs = next.toString();
      const here = window.location.pathname;
      router.replace(qs ? `${here}?${qs}` : here, { scroll: false });
    };
    if (open) {
      void openInEditor(open).then((ok) => (ok ? router.push("/studio/editor") : strip()));
      return;
    }
    if (check === "consistency") onCheck();
    if (exportParam === "set") onExportSet();
    strip();
  }, [storage, check, exportParam, open, params, router, onCheck, onExportSet]);
  return null;
}

function PresetNotice({ loaded, onDismiss }: { loaded: LoadedPreset; onDismiss: () => void }) {
  const items = useBatch((s) => s.items);
  const draft = useBatch((s) => s.draft);
  const [applied, setApplied] = useState(false);
  if (loaded.kind === "missing") {
    return (
      <div role="alert" className="mt-4 flex flex-col gap-3 rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-[13px] leading-relaxed text-warn">
          That brand preset wasn&apos;t found on your account. It may have been deleted.{" "}
          <a href="/studio/presets" className="font-semibold underline">
            Manage brand presets
          </a>
        </p>
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    );
  }
  const settings: BatchSettings = loaded.kind === "catalogue" ? CATALOGUE_PRESET : draft;
  const title = loaded.kind === "catalogue" ? "Catalogue preset loaded" : `Brand preset “${loaded.preset.name}” loaded`;
  const description =
    loaded.kind === "catalogue"
      ? "White square canvas, 10% padding, centred products, JPEG. It's in Collection settings, not applied yet. Add your product photos, then apply it to every image."
      : `${describeLayout(loaded.preset.layout, loaded.preset.colors)}. It's in Collection settings, not applied yet.`;
  return (
    <div role="status" className="mt-4 flex flex-col gap-3 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center">
      <ShoppingBag className="hidden size-5 shrink-0 text-blue sm:block" aria-hidden="true" />
      <div className="flex-1 text-[13px] leading-relaxed text-ink-3">
        <p className="font-semibold text-ink">{title}</p>
        <p>
          {applied
            ? `Applied to ${items.length === 1 ? "1 image" : `all ${items.length} images`}. New images you add can be given the same look with Apply in Collection settings.`
            : description}
        </p>
      </div>
      <div className="flex gap-2">
        {items.length > 0 && !applied && (
          <Button
            size="sm"
            onClick={async () => {
              await applySettings(
                items.map((i) => i.id),
                settings,
              );
              setApplied(true);
            }}
          >
            {items.length === 1 ? "Apply to 1 image" : `Apply to all ${items.length} images`}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function BatchStudio() {
  const name = useBatch((s) => s.name);
  const setName = useBatch((s) => s.setName);
  const items = useBatch((s) => s.items);
  const selected = useBatch((s) => s.selected);
  const view = useBatch((s) => s.view);
  const setView = useBatch((s) => s.setView);
  const query = useBatch((s) => s.query);
  const setQuery = useBatch((s) => s.setQuery);
  const exporting = useBatch((s) => s.exporting);
  const setPro = useBatch((s) => s.setPro);
  const setTab = useSettingsTab((s) => s.setTab);
  const router = useRouter();
  const plan = usePlan();
  // Images added while signed out (or on the free plan) start once that changes.
  const { signedIn, isPending: sessionPending } = useOnSignIn(resumeWaiting);
  const needsPro = signedIn && !plan.isPending && !plan.pro;
  const files = useAddFiles();
  const drop = useFileDrop((f) => void files.add(f));
  const inputRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preset, setPreset] = useState<LoadedPreset | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [exportSetOpen, setExportSetOpen] = useState(false);
  const [filter, setFilter] = useState<BatchFilter>("all");
  const [undone, setUndone] = useState<string | null>(null);
  const historyDepth = useBatch((s) => s.history.length);
  const peeking = usePeek((s) => s.originals);
  const [checkTarget] = useCheckTarget();
  const report = useConsistencyReport(items, checkTarget, plan.pro);
  const flagged = report ? flaggedCount(report) : 0;
  const setDraft = useBatch((s) => s.setDraft);
  const loadPreset = useCallback(
    (p: LoadedPreset) => {
      setPreset(p);
      if (p.kind === "catalogue") setDraft(CATALOGUE_PRESET);
      else if (p.kind === "brand") setDraft(presetToBatchSettings(p.preset, useBatch.getState().draft));
      if (p.kind !== "missing") setTab("layout");
    },
    [setDraft, setTab],
  );
  const openCheck = useCallback(() => setCheckOpen(true), []);
  const openExportSet = useCallback(() => setExportSetOpen(true), []);

  useEffect(() => {
    void restoreBatch();
  }, []);
  useEffect(() => {
    setPro(plan.pro);
    if (plan.pro) resumeWaiting();
  }, [plan.pro, setPro]);

  const chosen = new Set(selected);
  const selectedItems = items.filter((i) => chosen.has(i.id));
  const needle = query.trim().toLowerCase();
  const visible = items.filter((i) => matchesFilter(i, filter) && (!needle || i.name.toLowerCase().includes(needle)));
  const waitingIds = items.filter((i) => i.status === "failed" || i.status === "cancelled" || i.status === "needs-auth" || i.status === "needs-pro").map((i) => i.id);

  async function undoBatch() {
    const n = await undoSettings();
    setUndone(n ? `Undid the last change to ${n} image${n === 1 ? "" : "s"}.` : null);
  }

  // What's shown now, for the shortcuts below.
  const visibleIds = useRef<string[]>([]);
  useEffect(() => {
    visibleIds.current = visible.map((i) => i.id);
  });

  // Shortcuts: select everything shown, clear the selection, undo, and hold O to see the originals.
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    function down(e: KeyboardEvent) {
      if (typing(e) || document.querySelector("[role=dialog],[role=alertdialog],[role=menu]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const state = useBatch.getState();
      if (mod && e.key.toLowerCase() === "a" && state.items.length) {
        e.preventDefault();
        setSelection(visibleIds.current);
      } else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey && state.history.length) {
        e.preventDefault();
        void undoSettings().then((n) => setUndone(n ? `Undid the last change to ${n} image${n === 1 ? "" : "s"}.` : null));
      } else if (e.key === "Escape" && state.selected.length) setSelection([]);
      else if (e.key.toLowerCase() === "o" && !mod && !e.repeat) usePeek.setState({ originals: true });
    }
    function up(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "o") usePeek.setState({ originals: false });
    }
    const blur = () => usePeek.setState({ originals: false });
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      usePeek.setState({ originals: false });
    };
  }, []);

  const eligible = selectedItems.filter((i) => i.status === "failed" || i.status === "cancelled" || i.status === "needs-auth" || i.status === "needs-pro");
  const retryable = (selectedItems.length ? selectedItems : items).filter((i) => i.status === "failed" || i.status === "cancelled");
  const cancellable = (selectedItems.length ? selectedItems : items).filter(isBusy);
  const readyIds = items.filter(isReady).map((i) => i.id);
  const yearly = formatNaira(planConfig.proYearlyPriceNgn);
  const monthly = formatNaira(planConfig.proPriceNgn);

  const removeReason =
    selected.length === 0
      ? "Select images to process them."
      : eligible.length === 0
        ? "The selected images are already processed or in progress."
        : null;

  function startSelected() {
    if (!signedIn) return router.push(signInHref("/batch"));
    if (needsPro) return router.push("/studio/plans?from=batch");
    processItems(eligible.map((i) => i.id));
  }

  function startSelectedOrAll() {
    if (!signedIn) return router.push(signInHref("/batch"));
    if (needsPro) return router.push("/studio/plans?from=batch");
  }

  function openExportSettings() {
    setTab("export");
    if (window.matchMedia("(min-width: 1024px)").matches) settingsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    else setSettingsOpen(true);
  }

  let hint: string;
  if (items.length === 0)
    hint = `Add up to ${uploadLimits.maxBatchFiles} images. Backgrounds are removed on this device, ${batchConfig.concurrency === 1 ? "one image at a time" : `${batchConfig.concurrency} images at a time`}.`;
  else if (selected.length === 0) hint = "Settings apply to every image until you select some. Select images to download or change only those.";
  else {
    const ready = selectedItems.filter(isReady).length;
    hint = `${selected.length} selected: ${ready} ready${selected.length - ready ? `, ${selected.length - ready} not finished` : ""}. Settings apply to the selection.`;
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-4rem)] flex-col" {...drop.bind}>
      <input
        ref={inputRef}
        id="batch-files"
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const list = Array.from(e.target.files ?? []);
          e.target.value = "";
          void files.add(list);
        }}
      />

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-6 pt-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <h1 className="display text-[38px] sm:text-[44px]">Batch Studio</h1>
          <div className="grid w-full max-w-[360px] gap-1.5 lg:ml-6 lg:border-l lg:border-line lg:pl-6">
            <div className="relative">
              <label htmlFor="batch-name" className="sr-only">
                Batch name
              </label>
              <input
                id="batch-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => !e.target.value.trim() && setName("Untitled batch")}
                className="h-11 w-full rounded-[10px] border border-line bg-surface pl-3.5 pr-10 text-[15px] text-ink hover:border-line-strong focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
              />
              <Pencil className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            </div>
            <p className="text-[14px] text-ink-3">One consistent finish. Across your collection.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Button variant="outline-blue" size="lg" onClick={() => inputRef.current?.click()} icon={<ImageIcon className="size-4" aria-hidden="true" />}>
              Add images
            </Button>
            <Button
              variant="secondary"
              size="lg"
              disabled={readyIds.length === 0 || exporting !== null}
              title={readyIds.length === 0 ? "No finished images yet" : undefined}
              onClick={openExportSet}
              icon={<Layers className="size-4" aria-hidden="true" />}
            >
              Export set
            </Button>
            <Button
              size="lg"
              disabled={readyIds.length === 0 || exporting !== null}
              title={readyIds.length === 0 ? "No finished images yet" : `Download every finished image (${readyIds.length})`}
              onClick={() => void exportItems(items.map((i) => i.id), "all")}
              icon={exporting ? <Spinner className="size-5" /> : <Upload className="size-4" aria-hidden="true" />}
            >
              Export ready
            </Button>
          </div>
        </div>
        <div className="mt-2">
          <StorageNote />
        </div>

        <Workflow
          flagged={flagged}
          onProcess={() => (waitingIds.length ? (signedIn && !needsPro ? processItems(waitingIds) : startSelectedOrAll()) : setFilter(countItems(items).processing + countItems(items).queued ? "processing" : "all"))}
          onLayout={() => {
            setTab("layout");
            if (!window.matchMedia("(min-width: 1024px)").matches) setSettingsOpen(true);
          }}
          onReview={openCheck}
          onExport={openExportSettings}
        />
        <StatusStrip />
        <EngineNotice />

        {files.issues.length > 0 && (
          <div role="alert" className="mt-4 flex gap-3 rounded-xl border border-danger/25 bg-danger-50 px-4 py-3 text-[13px] text-danger">
            <div className="flex-1">
              <p className="font-semibold">
                {files.issues.length} file{files.issues.length === 1 ? " wasn't" : "s weren't"} added:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {files.issues.map((i) => (
                  <li key={i.name + i.message}>
                    {i.name}: {i.message}
                  </li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={files.clear} aria-label="Dismiss" className="self-start rounded p-0.5 hover:bg-danger/10">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <Suspense fallback={null}>
          <UrlActions onPreset={loadPreset} onCheck={openCheck} onExportSet={openExportSet} />
        </Suspense>
        {preset && <PresetNotice loaded={preset} onDismiss={() => setPreset(null)} />}

        {needsPro && (
          <div className="mt-4 flex flex-col gap-3 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center">
            <Lock className="hidden size-5 shrink-0 text-blue sm:block" aria-hidden="true" />
            <div className="flex-1 text-[13px] leading-relaxed text-ink-3">
              <p className="font-semibold text-ink">Batch Studio is part of Pro</p>
              <p>
                Your images stay here. Upgrade ({monthly}/month or {yearly}/year) and they start processing, at full resolution. Single
                images stay free in the editor.
              </p>
            </div>
            <ButtonLink href="/studio/plans?from=batch" size="sm">
              Upgrade to Pro
            </ButtonLink>
          </div>
        )}
        {!sessionPending && !signedIn && (
          <div className="mt-4 flex flex-col gap-3 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center">
            <Lock className="hidden size-5 shrink-0 text-blue sm:block" aria-hidden="true" />
            <div className="flex-1 text-[13px] leading-relaxed text-ink-3">
              <p className="font-semibold text-ink">Sign in to remove backgrounds</p>
              <p>
                Batch Studio is part of Pro. Images you add now are kept in this browser while you sign in, and start once you&apos;re
                signed in on Pro. Processing happens on this device.
              </p>
            </div>
            <div className="flex gap-2">
              <ButtonLink href={signInHref("/batch")} size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href={signInHref("/batch", "sign-up")} size="sm" variant="secondary">
                Create account
              </ButtonLink>
            </div>
          </div>
        )}

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_370px] xl:grid-cols-[minmax(0,1fr)_390px]">
          {/* Images */}
          <section aria-label="Images in this batch" className="min-w-0 rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3">
              <SelectAll visible={visible} />
              {selected.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-blue-700">
                  {selected.length} selected
                  <button type="button" onClick={() => setSelection([])} aria-label="Clear selection" className="rounded-full p-0.5 hover:bg-blue-100">
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <span className="text-[14px] text-muted">0 selected</span>
              )}
              <FilterChips filter={filter} onChange={setFilter} />
            </div>
            <div role="toolbar" aria-label="Batch actions" className="flex flex-wrap items-center gap-2 border-y border-line py-3">
              <button type="button" className={toolButton} disabled={Boolean(removeReason)} title={removeReason ?? undefined} onClick={startSelected}>
                <Scissors className="size-4" aria-hidden="true" /> Remove background
              </button>
              <button type="button" className={toolButton} disabled={retryable.length === 0} title={retryable.length ? undefined : "No failed or cancelled images"} onClick={() => processItems(retryable.map((i) => i.id))}>
                <RotateCw className="size-4" aria-hidden="true" /> Retry failed{retryable.length ? ` (${retryable.length})` : ""}
              </button>
              <button
                type="button"
                className={toolButton}
                disabled={readyIds.length === 0}
                title={readyIds.length ? undefined : "No finished images to check yet"}
                onClick={openCheck}
                aria-label={flagged ? `Check consistency, ${flagged} image${flagged === 1 ? "" : "s"} with suggestions` : "Check consistency"}
              >
                <ScanSearch className="size-4" aria-hidden="true" /> Check consistency
                {flagged > 0 && <span className="rounded-full bg-warn-50 px-1.5 text-[11px] font-bold text-warn">{flagged}</span>}
              </button>
              <button
                type="button"
                className={cn(toolButton, peeking && "border-blue bg-blue-50 text-blue-700")}
                disabled={readyIds.length === 0}
                aria-pressed={peeking}
                title="Hold to see the originals (or hold the O key)"
                onPointerDown={() => usePeek.setState({ originals: true })}
                onPointerUp={() => usePeek.setState({ originals: false })}
                onPointerLeave={() => usePeek.setState({ originals: false })}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && usePeek.setState({ originals: true })}
                onKeyUp={() => usePeek.setState({ originals: false })}
              >
                <Eye className="size-4" aria-hidden="true" /> Hold to compare
              </button>
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger className={toolButton} disabled={items.length === 0}>
                  <Ellipsis className="size-4" aria-hidden="true" /> More
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="start" sideOffset={6} className="z-50 min-w-[240px] animate-scale-in rounded-xl border border-line bg-surface p-1 text-sm shadow-[var(--shadow-float)]">
                    <DropdownMenu.Item
                      disabled={cancellable.length === 0}
                      onSelect={() => cancelItems(cancellable.map((i) => i.id))}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-paper"
                    >
                      <Ban className="size-4 opacity-70" aria-hidden="true" />
                      Cancel processing{cancellable.length ? ` (${cancellable.length})` : ""}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      disabled={selected.length === 0}
                      onSelect={() => setSelection([])}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-paper"
                    >
                      <X className="size-4 opacity-70" aria-hidden="true" />
                      Clear selection
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-line" />
                    <DropdownMenu.Item
                      disabled={selected.length === 0}
                      onSelect={() => removeItems(selected)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-danger outline-none data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[highlighted]:bg-paper"
                    >
                      <Trash2 className="size-4 opacity-70" aria-hidden="true" />
                      Remove selected{selected.length ? ` (${selected.length})` : ""}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:flex-nowrap">
                <label className="relative min-w-0 basis-full sm:w-52 sm:basis-auto">
                  <span className="sr-only">Search images</span>
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search images…"
                    className="h-9 w-full rounded-[9px] border border-line bg-surface pl-8 pr-2 text-[13px] text-ink placeholder:text-subtle focus:border-blue focus:outline-none"
                  />
                </label>
                <ToggleGroup.Root
                  type="single"
                  value={view}
                  onValueChange={(v) => v && setView(v as BatchView)}
                  aria-label="Thumbnail size"
                  className="flex shrink-0 rounded-[10px] border border-line p-0.5"
                >
                  {(
                    [
                      { value: "compact", label: "Small thumbnails", icon: <LayoutGrid className="size-3.5" aria-hidden="true" /> },
                      { value: "grid", label: "Large thumbnails", icon: <LayoutGrid className="size-[18px]" aria-hidden="true" /> },
                      { value: "compare", label: "Side by side: original and result", icon: <Columns2 className="size-4" aria-hidden="true" /> },
                      { value: "list", label: "List", icon: <List className="size-4" aria-hidden="true" /> },
                    ] as const
                  ).map((o) => (
                    <ToggleGroup.Item
                      key={o.value}
                      value={o.value}
                      aria-label={o.label}
                      title={o.label}
                      className="inline-flex size-8 items-center justify-center rounded-lg text-muted data-[state=on]:bg-blue-50 data-[state=on]:text-blue-700"
                    >
                      {o.icon}
                    </ToggleGroup.Item>
                  ))}
                </ToggleGroup.Root>
                <Button variant="secondary" size="sm" className="ml-auto h-9 lg:hidden" onClick={() => setSettingsOpen(true)} icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}>
                  Settings
                </Button>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted" aria-live="polite">
              {hint}
            </p>

            {items.length > 0 && visible.length === 0 && (
              <p className="mt-6 text-center text-sm text-muted">
                {needle ? `No images match “${query}”${filter !== "all" ? " in this filter" : ""}.` : "No images in this state."}{" "}
                {filter !== "all" && (
                  <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => setFilter("all")}>
                    Show all
                  </button>
                )}
              </p>
            )}
            {visible.length > 0 &&
              (view === "list" ? (
                <ul className="mt-4 grid gap-1" aria-label="Batch images">
                  {visible.map((item) => (
                    <BatchRow key={item.id} item={item} selected={chosen.has(item.id)} />
                  ))}
                </ul>
              ) : (
                <ul
                  className="mt-4 grid gap-4"
                  style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${view === "compact" ? 170 : view === "compare" ? 340 : 220}px), 1fr))` }}
                  aria-label="Batch images"
                >
                  {visible.map((item) => (
                    <BatchCard key={item.id} item={item} selected={chosen.has(item.id)} compact={view === "compact"} compare={view === "compare"} />
                  ))}
                </ul>
              ))}

            {items.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] bg-paper px-3 py-2 text-[13px] text-ink-3">
                <Info className="size-4 shrink-0 text-muted" aria-hidden="true" />
                <p className="min-w-0 flex-1" aria-live="polite">
                  {undone ?? (cancellable.length ? "Keep editing while other images process." : "Hold O to see the originals. Ctrl+A selects everything shown; Ctrl+Z undoes a batch change.")}
                </p>
                <button type="button" onClick={() => void undoBatch()} disabled={historyDepth === 0} title={historyDepth ? "Undo the last Apply, fix or format change (Ctrl+Z)" : "No batch changes to undo yet"} className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline disabled:text-subtle disabled:no-underline">
                  <Undo2 className="size-4" aria-hidden="true" /> Undo batch changes
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "mt-4 flex w-full items-center justify-center gap-4 rounded-[14px] border-2 border-dashed px-6 text-left transition-colors",
                items.length ? "py-5" : "py-16",
                drop.dragging ? "border-blue bg-blue-50" : "border-line-strong hover:border-blue/60 hover:bg-paper",
              )}
            >
              <span className={cn("inline-flex size-10 items-center justify-center rounded-full", drop.dragging ? "bg-blue text-white" : "text-blue")} aria-hidden="true">
                {items.length ? <Upload className="size-5" /> : <Upload className="size-6" />}
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">
                  {drop.dragging ? "Drop to add to the batch" : items.length ? "Drop more images here" : "Drop images here or choose files"}
                </span>
                <span className="block text-[13px] text-muted">
                  {FORMAT_LABEL} · up to {formatBytes(uploadLimits.maxFileBytes)} each · {uploadLimits.maxBatchFiles} per batch
                </span>
              </span>
            </button>
          </section>

          {/* Settings (desktop) */}
          <aside
            ref={settingsRef}
            aria-label="Collection settings"
            className="hidden overflow-y-auto overscroll-contain rounded-[18px] border border-line bg-surface shadow-[var(--shadow-card)] [scrollbar-width:thin] lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-12rem)]"
          >
            <div className="px-5 pt-5">
              <BatchSettingsPanel onReview={openCheck} />
            </div>
          </aside>
        </div>
      </div>

      <ExportBar onOpenExportSettings={openExportSettings} />

      <ConsistencyPanel open={checkOpen} onOpenChange={setCheckOpen} />
      <ExportSetDialog open={exportSetOpen} onOpenChange={setExportSetOpen} />

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen} title="Collection settings" side="bottom" className="lg:hidden">
        <BatchSettingsPanel
          inSheet
          onApplied={() => setSettingsOpen(false)}
          onReview={() => {
            setSettingsOpen(false);
            openCheck();
          }}
        />
      </Sheet>
    </div>
  );
}
