"use client";

import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { AlertTriangle, Ban, Check, Clock, Download, Ellipsis, Loader2, Lock, RotateCcw, Scissors, Trash2, Wand2, X } from "lucide-react";
import { useState } from "react";
import { phaseText } from "@/components/editor/engine-text";
import { ActivityBar, ProgressBar, Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/editor/export";
import { decodeMask } from "@/lib/image/mask-codec";
import { isReady, renderItem, useBatch, type BatchItem } from "@/lib/batch/batch-store";
import { exportName } from "@/lib/batch/settings";
import { useEngineState } from "@/lib/processing/registry";
import { importWithMask } from "@/lib/project/actions";
import { useProject } from "@/lib/project/store";

export function statusOf(item: BatchItem): { label: string; tone: "ready" | "processing" | "review" | "error" | "idle"; icon: React.ElementType } {
  switch (item.status) {
    case "done":
      return item.review ? { label: "Needs review", tone: "review", icon: AlertTriangle } : { label: "Ready", tone: "ready", icon: Check };
    case "processing":
      return { label: "Processing", tone: "processing", icon: Loader2 };
    case "queued":
      return { label: "Queued", tone: "idle", icon: Clock };
    case "needs-auth":
      return { label: "Sign in required", tone: "idle", icon: Lock };
    case "error":
      return { label: "Failed", tone: "error", icon: AlertTriangle };
    case "cancelled":
      return { label: "Cancelled", tone: "idle", icon: Ban };
  }
}

export function StatusBadge({ item, className }: { item: BatchItem; className?: string }) {
  const s = statusOf(item);
  return (
    <span
      title={item.review ?? undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold shadow-sm",
        s.tone === "ready" && "border-success/20 bg-success-50 text-success",
        s.tone === "processing" && "border-blue/20 bg-blue-50 text-blue-700",
        s.tone === "review" && "border-warn/25 bg-warn-50 text-warn",
        s.tone === "error" && "border-danger/25 bg-danger-50 text-danger",
        s.tone === "idle" && "border-line bg-surface text-muted",
        className,
      )}
    >
      <s.icon className={cn("size-3.5", s.tone === "processing" && "animate-spin")} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function useItemActions(item: BatchItem) {
  const router = useRouter();
  const [busy, setBusy] = useState<"download" | "open" | null>(null);
  const [error, setError] = useState<string | null>(null);
  return {
    busy,
    error,
    async download() {
      setBusy("download");
      setError(null);
      try {
        downloadBlob(await renderItem(item), exportName(item.name, item.settings, new Set()));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Download failed.");
      } finally {
        setBusy(null);
      }
    },
    async refine() {
      if (!item.maskBlob || !item.result) return;
      setBusy("open");
      const { mask } = await decodeMask(item.maskBlob);
      await importWithMask(item.file, mask, item.result);
      router.push("/editor");
    },
  };
}

export function ItemMenu({ item, actions }: { item: BatchItem; actions: ReturnType<typeof useItemActions> }) {
  const { process, cancel, remove } = useBatch.getState();
  const ready = isReady(item);
  const busy = item.status === "processing" || item.status === "queued";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`More actions for ${item.name}`}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink data-[state=open]:bg-ink/5"
      >
        {actions.busy ? <Spinner /> : <Ellipsis className="size-4" aria-hidden="true" />}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={6}
        className="z-50 min-w-[210px] animate-scale-in rounded-xl border border-line bg-surface p-1 text-sm shadow-[var(--shadow-float)]"
      >
        {ready && (
          <>
            <MenuItem icon={Wand2} onSelect={() => void actions.refine()}>
              Refine in editor
            </MenuItem>
            <MenuItem icon={Download} onSelect={() => void actions.download()}>
              Download
            </MenuItem>
          </>
        )}
        {busy ? (
          <MenuItem icon={X} onSelect={() => cancel(item.id)}>
            Cancel processing
          </MenuItem>
        ) : (
          <MenuItem icon={item.status === "error" || item.status === "cancelled" ? RotateCcw : Scissors} onSelect={() => process([item.id])}>
            {item.status === "error" || item.status === "cancelled" ? "Retry" : "Remove background again"}
          </MenuItem>
        )}
        <DropdownMenu.Separator className="my-1 h-px bg-line" />
        <MenuItem icon={Trash2} onSelect={() => remove(item.id)} danger>
          Remove from batch
        </MenuItem>
      </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ icon: Icon, children, onSelect, danger }: { icon: React.ElementType; children: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper",
        danger && "text-danger",
      )}
    >
      <Icon className="size-4 opacity-70" aria-hidden="true" />
      {children}
    </DropdownMenu.Item>
  );
}

export function ProcessingBar({ item }: { item: BatchItem }) {
  const engineId = useProject((s) => s.engineId);
  const engine = useEngineState(engineId);
  if (item.status !== "processing") return null;
  const downloading = engine.kind === "downloading" && engine.total;
  return (
    <div className="absolute inset-x-4 bottom-3">
      <p className="sr-only" aria-live="polite">
        {phaseText(item.phase, engine, engineId.startsWith("server") ? "server" : "device")}
      </p>
      {downloading ? (
        <ProgressBar value={engine.loaded} max={engine.total!} label={`Model download for ${item.name}`} />
      ) : (
        <ActivityBar label={`Processing ${item.name}`} />
      )}
    </div>
  );
}

export function BatchCard({ item, selected }: { item: BatchItem; selected: boolean }) {
  const toggle = useBatch((s) => s.toggle);
  const actions = useItemActions(item);
  const checkboxId = `batch-select-${item.id}`;
  const image = item.status === "done" ? item.previewUrl : item.thumbUrl;
  const showChecker = item.status === "done";
  return (
    <li
      className={cn(
        "group relative overflow-hidden rounded-[14px] bg-surface transition-[box-shadow] duration-150",
        selected ? "shadow-[0_0_0_2px_var(--color-blue)]" : "shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1px_var(--color-line-strong),var(--shadow-card)]",
      )}
    >
      <label htmlFor={checkboxId} className={cn("relative block aspect-[4/3] cursor-pointer overflow-hidden", showChecker ? "checkerboard" : "bg-paper-2")}>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={item.status === "done" ? `${item.name}, background removed` : item.name}
            className={cn(
              "absolute inset-0 size-full object-contain p-3 transition-opacity duration-300",
              item.status === "done" && "animate-fade-in",
              (item.status === "processing" || item.status === "queued") && "opacity-75",
            )}
          />
        )}
        <ProcessingBar item={item} />
      </label>
      <input
        id={checkboxId}
        type="checkbox"
        checked={selected}
        onChange={() => toggle(item.id)}
        aria-label={`Select ${item.name}`}
        className="absolute left-3 top-3 size-5 cursor-pointer rounded-md accent-[var(--color-blue)]"
      />
      <StatusBadge item={item} className="absolute right-3 top-3" />
      <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink" title={item.name}>
            {item.name}
          </p>
          {(item.error || item.review || actions.error) && (
            <p className={cn("line-clamp-2 text-xs leading-snug", item.error || actions.error ? "text-danger" : "text-warn")} title={item.error?.message ?? actions.error ?? item.review ?? ""}>
              {item.error?.message ?? actions.error ?? item.review}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {item.width} × {item.height}
        </span>
        {item.review && isReady(item) && (
          <button
            type="button"
            onClick={() => void actions.refine()}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-semibold text-blue-700 hover:bg-blue-50"
          >
            <Wand2 className="size-3.5" aria-hidden="true" /> Refine
          </button>
        )}
        <ItemMenu item={item} actions={actions} />
      </div>
    </li>
  );
}

export function BatchRow({ item, selected }: { item: BatchItem; selected: boolean }) {
  const toggle = useBatch((s) => s.toggle);
  const actions = useItemActions(item);
  const image = item.status === "done" ? item.previewUrl : item.thumbUrl;
  return (
    <li className={cn("flex items-center gap-3 rounded-[12px] px-3 py-2 transition-colors", selected ? "bg-blue-50 shadow-[0_0_0_1px_var(--color-blue)]" : "hover:bg-paper")}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => toggle(item.id)}
        aria-label={`Select ${item.name}`}
        className="size-5 shrink-0 cursor-pointer accent-[var(--color-blue)]"
      />
      <span className={cn("relative size-12 shrink-0 overflow-hidden rounded-lg border border-line", item.status === "done" ? "checkerboard-sm" : "bg-paper-2")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="" className="absolute inset-0 size-full object-contain p-0.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink">{item.name}</p>
        <p className="truncate text-xs text-muted">
          {item.width} × {item.height}
          {(item.error || item.review) && <span className={item.error ? "text-danger" : "text-warn"}> · {item.error?.message ?? item.review}</span>}
        </p>
      </div>
      <StatusBadge item={item} className="hidden sm:inline-flex" />
      {item.review && isReady(item) && (
        <button type="button" onClick={() => void actions.refine()} className="hidden items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-semibold text-blue-700 hover:bg-blue-50 sm:inline-flex">
          <Wand2 className="size-3.5" aria-hidden="true" /> Refine
        </button>
      )}
      <ItemMenu item={item} actions={actions} />
    </li>
  );
}
