"use client";

import { useRouter } from "next/navigation";
import { Archive, Download, ImagePlus, Maximize2, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { EngineChip } from "@/components/editor/engine-chip";
import { phaseText } from "@/components/editor/engine-text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ActivityBar, ProgressBar, Spinner } from "@/components/ui/progress";
import { useFileDrop } from "@/components/upload/use-file-drop";
import { ACCEPT_ATTRIBUTE, batchConfig, FORMAT_LABEL, formatBytes, uploadLimits } from "@/lib/config";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/editor/export";
import { decodeMask } from "@/lib/image/mask-codec";
import { renderItemPng, outputName, useBatch, zipFinished, type BatchItem } from "@/lib/batch/batch-store";
import { useEngineState } from "@/lib/processing/registry";
import { importWithMask } from "@/lib/project/actions";
import { useProject } from "@/lib/project/store";

const statusText: Record<BatchItem["status"], string> = {
  queued: "Queued",
  processing: "Processing",
  done: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

function ItemCard({ item }: { item: BatchItem }) {
  const router = useRouter();
  const engineId = useProject((s) => s.engineId);
  const engine = useEngineState(engineId);
  const { retry, cancel, remove } = useBatch.getState();
  const [busy, setBusy] = useState<"download" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy("download");
    setError(null);
    try {
      downloadBlob(await renderItemPng(item), outputName(item.name, new Set()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  }

  async function openInEditor() {
    if (!item.maskBlob || !item.result) return;
    setBusy("open");
    const { mask } = await decodeMask(item.maskBlob);
    await importWithMask(item.file, mask, item.result);
    router.push("/editor");
  }

  const showResult = item.status === "done" && item.resultUrl;
  return (
    <li className="group overflow-hidden rounded-[14px] border border-line bg-surface shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]">
      <div className={cn("relative aspect-[4/3] overflow-hidden", showResult ? "checkerboard" : "bg-paper-2")}>
        {(showResult ? item.resultUrl : item.thumbUrl) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(showResult ? item.resultUrl : item.thumbUrl)!}
            alt={showResult ? `${item.name} with background removed` : item.name}
            className={cn("absolute inset-0 size-full object-contain", showResult && "animate-fade-in")}
          />
        )}
        {item.status === "processing" && (
          <div className="absolute inset-x-3 bottom-3 rounded-lg bg-white/90 px-3 py-2 backdrop-blur">
            <p className="truncate text-xs font-medium text-ink">{phaseText(item.phase, engine, engineId.startsWith("server") ? "server" : "device")}</p>
            <div className="mt-1.5">
              {engine.kind === "downloading" && engine.total ? (
                <ProgressBar value={engine.loaded} max={engine.total} label="Model download" />
              ) : (
                <ActivityBar label={`Processing ${item.name}`} />
              )}
            </div>
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink" title={item.name}>
              {item.name}
            </p>
            <p className="text-[11px] text-muted">
              {item.width} × {item.height} · {formatBytes(item.size)}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              item.status === "done" && "bg-success-50 text-success",
              item.status === "error" && "bg-danger-50 text-danger",
              item.status === "processing" && "bg-blue-50 text-blue-700",
              (item.status === "queued" || item.status === "cancelled") && "bg-paper-2 text-muted",
            )}
          >
            {statusText[item.status]}
          </span>
        </div>
        {item.error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {item.error.message}
          </p>
        )}
        {item.notice && <p className="mt-2 text-xs text-warn">{item.notice}</p>}
        {error && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-3 flex items-center gap-1">
          {item.status === "done" && (
            <>
              <Button size="sm" variant="secondary" onClick={() => void openInEditor()} disabled={busy !== null} icon={busy === "open" ? <Spinner /> : <Maximize2 className="size-3.5" aria-hidden="true" />}>
                Edit
              </Button>
              <IconButton
                size="sm"
                label={`Download ${item.name} as PNG`}
                icon={busy === "download" ? <Spinner /> : <Download className="size-4" />}
                disabled={busy !== null}
                onClick={() => void download()}
              />
            </>
          )}
          {(item.status === "error" || item.status === "cancelled") && (
            <Button size="sm" variant="secondary" onClick={() => retry(item.id)} icon={<RotateCcw className="size-3.5" aria-hidden="true" />}>
              Retry
            </Button>
          )}
          {(item.status === "queued" || item.status === "processing") && (
            <Button size="sm" variant="ghost" onClick={() => cancel(item.id)} icon={<X className="size-3.5" aria-hidden="true" />}>
              Cancel
            </Button>
          )}
          <IconButton size="sm" className="ml-auto" label={`Remove ${item.name} from the queue`} icon={<Trash2 className="size-4" />} onClick={() => remove(item.id)} />
        </div>
      </div>
    </li>
  );
}

export function BatchStudio() {
  const items = useBatch((s) => s.items);
  const zipping = useBatch((s) => s.zipping);
  const add = useBatch((s) => s.add);
  const retryFailed = useBatch((s) => s.retryFailed);
  const clear = useBatch((s) => s.clear);
  const [issues, setIssues] = useState<Array<{ name: string; message: string }>>([]);
  const [zipError, setZipError] = useState<string | null>(null);
  const inputId = "batch-files";

  async function addFiles(files: File[]) {
    const rejected = await add(files);
    setIssues(rejected.map((r) => ({ name: r.name, message: r.error.message })));
  }
  const drop = useFileDrop((files) => void addFiles(files));

  const counts = items.reduce(
    (acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }),
    {} as Partial<Record<BatchItem["status"], number>>,
  );
  const done = counts.done ?? 0;
  const failed = (counts.error ?? 0) + (counts.cancelled ?? 0);

  async function downloadZip() {
    setZipError(null);
    try {
      downloadBlob(await zipFinished(), "isola-batch.zip");
    } catch (e) {
      setZipError(e instanceof Error ? e.message : "Couldn't create the ZIP file.");
    }
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow text-muted">Batch studio</p>
          <h1 className="display mt-2 text-[40px] sm:text-[52px]">
            A whole shoot. <span className="text-blue">One workflow.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Add up to {uploadLimits.maxBatchFiles} images. They&apos;re processed {batchConfig.concurrency === 1 ? "one at a time" : `${batchConfig.concurrency} at a time`} on
            this device to keep memory use predictable. Open any result in the editor to refine it.
          </p>
        </div>
        <EngineChip />
      </div>

      <label
        htmlFor={inputId}
        className={cn(
          "mt-8 flex cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed px-6 py-10 text-center transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue",
          drop.dragging ? "border-blue bg-blue-50" : "border-line-strong bg-surface hover:border-blue/60",
        )}
        {...drop.bind}
      >
        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void addFiles(files);
          }}
        />
        <span className={cn("inline-flex size-12 items-center justify-center rounded-full transition-colors", drop.dragging ? "bg-blue text-white" : "bg-blue-50 text-blue")} aria-hidden="true">
          <Upload className="size-6" />
        </span>
        <span className="mt-3 font-display text-xl font-bold tracking-tight">{drop.dragging ? "Drop to add to the queue" : "Drop images or click to choose"}</span>
        <span className="mt-1 text-[13px] text-muted">
          {FORMAT_LABEL} · up to {formatBytes(uploadLimits.maxFileBytes)} each · {items.length}/{uploadLimits.maxBatchFiles} in queue
        </span>
      </label>

      {issues.length > 0 && (
        <div role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger-50 px-4 py-3 text-[13px] text-danger">
          <p className="font-semibold">Some files weren&apos;t added:</p>
          <ul className="mt-1 list-disc pl-5">
            {issues.map((i) => (
              <li key={i.name + i.message}>
                {i.name}: {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm text-muted" aria-live="polite">
              <span className="font-semibold text-ink">{done}</span> done · {counts.processing ?? 0} processing · {counts.queued ?? 0} queued
              {failed > 0 && ` · ${failed} failed or cancelled`}
            </p>
            {failed > 0 && (
              <Button variant="secondary" size="sm" onClick={retryFailed} icon={<RotateCcw className="size-3.5" aria-hidden="true" />}>
                Retry failed
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={clear} icon={<Trash2 className="size-3.5" aria-hidden="true" />}>
              Clear queue
            </Button>
            <label htmlFor={inputId} className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] font-semibold hover:bg-paper">
              <ImagePlus className="size-3.5" aria-hidden="true" /> Add more
            </label>
            <Button
              size="sm"
              disabled={done === 0 || zipping !== null}
              onClick={() => void downloadZip()}
              icon={zipping ? <Spinner /> : <Archive className="size-3.5" aria-hidden="true" />}
            >
              {zipping ? `Packing ${zipping.done} of ${zipping.total}…` : `Download ${done} as ZIP`}
            </Button>
          </div>
          {zipError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {zipError}
            </p>
          )}
          <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Batch queue">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
