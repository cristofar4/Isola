"use client";

import { useRouter } from "next/navigation";
import { ArrowDown, Download, Image as ImageIcon, LayoutGrid, List, Lock, Pencil, Plus, RotateCw, Scissors, SlidersHorizontal, Upload } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { EngineChip } from "@/components/editor/engine-chip";
import { Button, ButtonLink } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/progress";
import { useFileDrop } from "@/components/upload/use-file-drop";
import { ACCEPT_ATTRIBUTE, FORMAT_LABEL, formatBytes, uploadLimits } from "@/lib/config";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/editor/export";
import { isReady, useBatch, zipItems, type BatchItem } from "@/lib/batch/batch-store";
import { useEngineState } from "@/lib/processing/registry";
import { useProject } from "@/lib/project/store";
import { signInHref, useOnSignIn } from "@/lib/session-gate";
import { formatNaira, planConfig } from "@/lib/config";
import { usePlan } from "@/lib/plan";
import { BatchCard, BatchRow } from "./batch-card";
import { BatchSettingsPanel } from "./batch-settings-panel";

function slug(name: string) {
  return name.trim().toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "") || "isola-batch";
}

function counts(items: BatchItem[]) {
  let ready = 0, processing = 0, queued = 0, review = 0, failed = 0, waiting = 0;
  for (const i of items) {
    if (i.status === "done") {
      if (i.review) review++;
      else ready++;
    } else if (i.status === "processing") processing++;
    else if (i.status === "queued") queued++;
    else if (i.status === "needs-auth" || i.status === "needs-pro") waiting++;
    else failed++;
  }
  return { ready, processing, queued, review, failed, waiting };
}

function useAddFiles() {
  const add = useBatch((s) => s.add);
  const [issues, setIssues] = useState<Array<{ name: string; message: string }>>([]);
  return {
    issues,
    clear: () => setIssues([]),
    async addFiles(files: File[]) {
      if (!files.length) return;
      const rejected = await add(files);
      setIssues(rejected.map((r) => ({ name: r.name, message: r.error.message })));
    },
  };
}

function useZip() {
  const name = useBatch((s) => s.name);
  const zipping = useBatch((s) => s.zipping);
  const [error, setError] = useState<string | null>(null);
  return {
    zipping,
    error,
    async run(ids: string[]) {
      setError(null);
      try {
        downloadBlob(await zipItems(ids), `${slug(name)}.zip`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the ZIP file.");
      }
    },
  };
}

function SelectAll() {
  const items = useBatch((s) => s.items);
  const selected = useBatch((s) => s.selected);
  const selectAll = useBatch((s) => s.selectAll);
  const ref = useRef<HTMLInputElement>(null);
  const all = items.length > 0 && selected.length === items.length;
  const some = selected.length > 0 && !all;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
      <input ref={ref} type="checkbox" checked={all} disabled={!items.length} onChange={() => selectAll(!all)} className="size-5 cursor-pointer accent-[var(--color-blue)]" />
      Select all
    </label>
  );
}

export function BatchStudio() {
  const name = useBatch((s) => s.name);
  const setName = useBatch((s) => s.setName);
  const items = useBatch((s) => s.items);
  const selected = useBatch((s) => s.selected);
  const view = useBatch((s) => s.view);
  const setView = useBatch((s) => s.setView);
  const cardSize = useBatch((s) => s.cardSize);
  const setCardSize = useBatch((s) => s.setCardSize);
  const process = useBatch((s) => s.process);
  const retryFailed = useBatch((s) => s.retryFailed);
  const resumeAfterSignIn = useBatch((s) => s.resumeAfterSignIn);
  const router = useRouter();
  // Images added while signed out start as soon as the visitor signs in.
  const { signedIn, isPending: sessionPending } = useOnSignIn(resumeAfterSignIn);
  const plan = usePlan();
  const needsPro = signedIn && !plan.isPending && !plan.pro;
  const engineId = useProject((s) => s.engineId);
  const engine = useEngineState(engineId);
  const files = useAddFiles();
  const zip = useZip();
  const drop = useFileDrop((f) => void files.addFiles(f));
  const inputRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const c = counts(items);
  const readyIds = items.filter(isReady).map((i) => i.id);
  const selectedReady = items.filter((i) => selected.includes(i.id) && isReady(i)).map((i) => i.id);
  const selectedSet = new Set(selected);
  const busy = c.processing + c.queued > 0;

  const summary = [
    `${c.ready} ready`,
    c.processing && `${c.processing} processing`,
    c.queued && `${c.queued} queued`,
    c.review && `${c.review} need${c.review === 1 ? "s" : ""} review`,
    c.waiting && `${c.waiting} waiting for ${needsPro ? "Pro" : "sign-in"}`,
    c.failed && `${c.failed} failed or cancelled`,
  ]
    .filter(Boolean)
    .join(" · ");

  const activity =
    engine.kind === "downloading" && engine.total
      ? `Downloading the model · ${Math.floor((engine.loaded / engine.total) * 100)}%`
      : busy
        ? "Processing images…"
        : null;

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
          void files.addFiles(list);
        }}
      />

      <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-6 pt-8 sm:px-6 lg:px-8">
        {/* Page header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <h1 className="display text-[38px] sm:text-[44px]">Batch Studio</h1>
          <div className="relative w-full max-w-[320px] lg:ml-8">
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
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <EngineChip className="hidden xl:inline-flex" />
            <Button variant="secondary" size="lg" onClick={() => inputRef.current?.click()} icon={<Plus className="size-4" aria-hidden="true" />}>
              Add images
            </Button>
            <Button
              size="lg"
              disabled={readyIds.length === 0 || zip.zipping !== null}
              onClick={() => void zip.run(readyIds)}
              icon={zip.zipping ? <Spinner className="size-5" /> : undefined}
            >
              {zip.zipping ? `Packing ${zip.zipping.done} of ${zip.zipping.total}…` : "Export all"}
              {!zip.zipping && <ArrowDown className="size-4" aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {(files.issues.length > 0 || zip.error) && (
          <div role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger-50 px-4 py-3 text-[13px] text-danger">
            {zip.error && <p>{zip.error}</p>}
            {files.issues.length > 0 && (
              <>
                <p className="font-semibold">Some files weren&apos;t added:</p>
                <ul className="mt-1 list-disc pl-5">
                  {files.issues.map((i) => (
                    <li key={i.name + i.message}>
                      {i.name}: {i.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Images */}
          <section aria-label="Images in this batch" className="rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
            {needsPro && (
              <div className="mb-4 flex flex-col gap-3 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center">
                <Lock className="hidden size-5 shrink-0 text-blue sm:block" aria-hidden="true" />
                <div className="flex-1 text-[13px] leading-relaxed text-ink-3">
                  <p className="font-semibold text-ink">Batch Studio is part of Pro</p>
                  <p>
                    Process up to {uploadLimits.maxBatchFiles} images at once, at full resolution and without a watermark, for{" "}
                    {formatNaira(planConfig.proPriceNgn)}/month. Single images stay free in the editor.
                  </p>
                </div>
                <ButtonLink href="/pricing" size="sm">
                  Upgrade to Pro
                </ButtonLink>
              </div>
            )}
            {!sessionPending && !signedIn && (
              <div className="mb-4 flex flex-col gap-3 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center">
                <Lock className="hidden size-5 shrink-0 text-blue sm:block" aria-hidden="true" />
                <div className="flex-1 text-[13px] leading-relaxed text-ink-3">
                  <p className="font-semibold text-ink">Sign in to remove backgrounds</p>
                  <p>
                    Batch Studio is part of Pro ({formatNaira(planConfig.proPriceNgn)}/month). Images you add now wait here
                    and start once you&apos;re signed in on Pro. Processing happens on this device.
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
            <div role="toolbar" aria-label="Batch actions" className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line pb-4">
              <SelectAll />
              <span className="text-sm text-muted" aria-live="polite">
                {selected.length} selected
              </span>
              <button
                type="button"
                disabled={selected.length === 0}
                onClick={() => (!signedIn ? router.push(signInHref("/batch")) : needsPro ? router.push("/pricing") : process(selected))}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
              >
                <Scissors className="size-4" aria-hidden="true" /> Remove background
              </button>
              <button
                type="button"
                disabled={c.failed === 0}
                onClick={retryFailed}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
              >
                <RotateCw className="size-4" aria-hidden="true" /> Retry failed
              </button>
              <div className="ml-auto flex items-center gap-3">
                <ToggleGroup.Root
                  type="single"
                  value={view}
                  onValueChange={(v) => v && setView(v as "grid" | "list")}
                  aria-label="View"
                  className="flex rounded-[10px] border border-line p-0.5"
                >
                  <ToggleGroup.Item value="grid" aria-label="Grid view" className="inline-flex size-8 items-center justify-center rounded-lg text-muted data-[state=on]:bg-paper-2 data-[state=on]:text-ink">
                    <LayoutGrid className="size-4" aria-hidden="true" />
                  </ToggleGroup.Item>
                  <ToggleGroup.Item value="list" aria-label="List view" className="inline-flex size-8 items-center justify-center rounded-lg text-muted data-[state=on]:bg-paper-2 data-[state=on]:text-ink">
                    <List className="size-4" aria-hidden="true" />
                  </ToggleGroup.Item>
                </ToggleGroup.Root>
                {view === "grid" && (
                  <div className="hidden items-center gap-2 sm:flex">
                    <ImageIcon className="size-3.5 text-muted" aria-hidden="true" />
                    <input
                      type="range"
                      min={180}
                      max={340}
                      step={10}
                      value={cardSize}
                      onChange={(e) => setCardSize(Number(e.target.value))}
                      aria-label="Thumbnail size"
                      className="h-1 w-28 cursor-pointer accent-[var(--color-blue)]"
                    />
                    <ImageIcon className="size-5 text-muted" aria-hidden="true" />
                  </div>
                )}
                <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSettingsOpen(true)} icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}>
                  Settings
                </Button>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted">
              {selected.length > 0
                ? `Changes apply to ${selected.length} selected image${selected.length === 1 ? "" : "s"}`
                : items.length > 0
                  ? "Select images to change their background, size or export settings."
                  : `Add up to ${uploadLimits.maxBatchFiles} images. They're processed on this device, one at a time.`}
            </p>

            {items.length > 0 &&
              (view === "grid" ? (
                <ul className="mt-4 grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cardSize}px), 1fr))` }} aria-label="Batch images">
                  {items.map((item) => (
                    <BatchCard key={item.id} item={item} selected={selectedSet.has(item.id)} />
                  ))}
                </ul>
              ) : (
                <ul className="mt-4 grid gap-1" aria-label="Batch images">
                  {items.map((item) => (
                    <BatchRow key={item.id} item={item} selected={selectedSet.has(item.id)} />
                  ))}
                </ul>
              ))}

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "mt-4 flex w-full items-center justify-center gap-4 rounded-[14px] border-2 border-dashed px-6 text-left transition-colors",
                items.length ? "py-6" : "py-16",
                drop.dragging ? "border-blue bg-blue-50" : "border-line-strong hover:border-blue/60 hover:bg-paper",
              )}
            >
              <span className={cn("inline-flex size-10 items-center justify-center rounded-full", drop.dragging ? "bg-blue text-white" : "text-blue")} aria-hidden="true">
                {items.length ? <Plus className="size-6" /> : <Upload className="size-6" />}
              </span>
              <span>
                <span className="block text-[15px] font-semibold text-ink">
                  {drop.dragging ? "Drop to add to the batch" : items.length ? "Drop more images here" : "Drop images here or choose files"}
                </span>
                <span className="block text-[13px] text-muted">
                  {FORMAT_LABEL} · up to {formatBytes(uploadLimits.maxFileBytes)} each
                </span>
              </span>
            </button>
          </section>

          {/* Settings */}
          <aside
            aria-label="Batch settings"
            className="hidden overflow-y-auto overscroll-contain rounded-[18px] border border-line bg-surface shadow-[var(--shadow-card)] [scrollbar-width:thin] lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-15rem)]"
          >
            <div className="px-5 pt-5">
              <BatchSettingsPanel />
            </div>
          </aside>
        </div>
      </div>

      {/* Status bar */}
      <div data-batch-status className="sticky bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <p className="text-[15px] font-bold text-ink">
            {items.length} image{items.length === 1 ? "" : "s"}
          </p>
          {items.length > 0 && (
            <>
              <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
              <p className="text-[13px] text-muted">{summary}</p>
            </>
          )}
          <p className="flex items-center gap-2 text-[13px] text-muted sm:mx-auto" aria-live="polite">
            {activity && (
              <>
                <Spinner className="size-4 text-blue" /> {activity}
              </>
            )}
          </p>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-[13px] text-muted md:inline">Export ready images</span>
            <span className="hidden h-5 w-px bg-line md:block" aria-hidden="true" />
            <Button
              variant="secondary"
              size="sm"
              className="h-9"
              disabled={selectedReady.length === 0 || zip.zipping !== null}
              onClick={() => void zip.run(selectedReady)}
              icon={<Download className="size-4" aria-hidden="true" />}
            >
              Download selected ZIP
            </Button>
          </div>
        </div>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen} title="Batch settings" side="bottom" className="lg:hidden">
        <BatchSettingsPanel onApplied={() => setSettingsOpen(false)} />
      </Sheet>
    </div>
  );
}
