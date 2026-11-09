"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { AlertTriangle, Ban, Check, Clock, Download, Ellipsis, Loader2, Lock, RotateCcw, Scissors, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useState } from "react";
import { phaseText } from "@/components/editor/engine-text";
import { ActivityBar, ProgressBar, Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import {
  cancelItems,
  downloadItem,
  isBusy,
  isReady,
  openInEditor,
  processItems,
  removeItems,
  toggleSelected,
  useBatch,
  type BatchItem,
} from "@/lib/batch/batch-store";
import { canvasSize } from "@/lib/batch/settings";
import { useEngineState } from "@/lib/processing/registry";
import { useProject } from "@/lib/project/store";
import { signInHref } from "@/lib/session-gate";

type Tone = "ready" | "processing" | "review" | "error" | "idle";

export function statusOf(item: BatchItem): { label: string; tone: Tone; icon: React.ElementType } {
  switch (item.status) {
    case "ready":
      return item.review ? { label: "Check edges", tone: "review", icon: AlertTriangle } : { label: "Ready", tone: "ready", icon: Check };
    case "processing":
      return { label: "Processing", tone: "processing", icon: Loader2 };
    case "queued":
      return { label: "Queued", tone: "idle", icon: Clock };
    case "needs-auth":
      return { label: "Sign in required", tone: "idle", icon: Lock };
    case "needs-pro":
      return { label: "Pro required", tone: "idle", icon: Sparkles };
    case "failed":
      return { label: "Failed", tone: "error", icon: AlertTriangle };
    case "cancelled":
      return { label: "Cancelled", tone: "idle", icon: Ban };
  }
}

export function StatusBadge({ item, className }: { item: BatchItem; className?: string }) {
  const s = statusOf(item);
  return (
    <span
      data-status={item.status}
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

function useRefine(item: BatchItem) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  return {
    opening,
    async refine() {
      setOpening(true);
      try {
        if (await openInEditor(item.id)) router.push("/editor");
      } finally {
        setOpening(false);
      }
    },
  };
}

/** What the item is doing right now, in words, from real engine state. */
function useActivity(item: BatchItem) {
  const engineId = useProject((s) => s.engineId);
  const engine = useEngineState(engineId);
  const location = engineId.startsWith("server") ? "server" : "device";
  const text = item.status === "processing" ? phaseText(item.phase, engine, location) : item.status === "queued" ? "Waiting in the queue" : null;
  const download = item.status === "processing" && engine.kind === "downloading" && engine.total ? { loaded: engine.loaded, total: engine.total } : null;
  return { text, download };
}

function OutputSize({ item }: { item: BatchItem }) {
  const out = canvasSize(item.settings, item.width, item.height);
  const changed = out.width !== item.width || out.height !== item.height;
  return (
    <span className="tabular-nums">
      {item.width.toLocaleString("en-US")} × {item.height.toLocaleString("en-US")} px
      {changed && isReady(item) && (
        <span className="text-ink-3" title="Size of the exported file">
          {" "}
          → {out.width.toLocaleString("en-US")} × {out.height.toLocaleString("en-US")}
        </span>
      )}
    </span>
  );
}

export function ItemMenu({ item }: { item: BatchItem }) {
  const busy = isBusy(item);
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`More actions for ${item.name}`}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink data-[state=open]:bg-ink/5"
      >
        <Ellipsis className="size-4" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[230px] animate-scale-in rounded-xl border border-line bg-surface p-1 text-sm shadow-[var(--shadow-float)]"
        >
          {busy ? (
            <MenuItem icon={X} onSelect={() => cancelItems([item.id])}>
              Cancel processing
            </MenuItem>
          ) : item.status === "ready" ? (
            <MenuItem icon={Scissors} onSelect={() => processItems([item.id], { again: true })}>
              Remove background again{item.refined ? " (discards edits)" : ""}
            </MenuItem>
          ) : (
            <MenuItem icon={RotateCcw} onSelect={() => processItems([item.id])}>
              {item.status === "failed" || item.status === "cancelled" ? "Retry" : "Process now"}
            </MenuItem>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <MenuItem icon={Trash2} onSelect={() => removeItems([item.id])} danger>
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
      className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper", danger && "text-danger")}
    >
      <Icon className="size-4 opacity-70" aria-hidden="true" />
      {children}
    </DropdownMenu.Item>
  );
}

const actionBase =
  "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** The always-visible actions for one item. */
function ItemActions({ item, compact }: { item: BatchItem; compact?: boolean }) {
  const exporting = useBatch((s) => s.exporting);
  const { opening, refine } = useRefine(item);
  const activity = useActivity(item);
  switch (item.status) {
    case "ready":
      return (
        <div className="flex gap-2">
          <button type="button" onClick={() => void refine()} disabled={opening} className={cn(actionBase, "border border-line bg-surface text-ink hover:bg-paper")} aria-label={`Refine ${item.name} in the editor`}>
            {opening ? <Spinner /> : <Wand2 className="size-4" aria-hidden="true" />}
            {!compact && "Refine"}
            {compact && <span className="sr-only">Refine</span>}
          </button>
          <button
            type="button"
            onClick={() => void downloadItem(item.id)}
            disabled={exporting !== null}
            title={exporting ? "Another download is being prepared" : undefined}
            className={cn(actionBase, "bg-blue text-white hover:bg-blue-600")}
            aria-label={`Download ${item.name}`}
          >
            Download
            <Download className="size-4" aria-hidden="true" />
          </button>
        </div>
      );
    case "processing":
    case "queued":
      return (
        <div className="grid gap-1.5">
          {activity.download ? (
            <ProgressBar value={activity.download.loaded} max={activity.download.total} label={`Model download for ${item.name}`} />
          ) : item.status === "processing" ? (
            <ActivityBar label={`Processing ${item.name}`} />
          ) : null}
          <div className="flex items-center gap-2">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted" aria-live="polite">
              {item.status === "processing" && <Spinner className="size-3.5 shrink-0 text-blue" />}
              <span className="min-w-0 truncate">{activity.text}</span>
            </p>
            <button type="button" onClick={() => cancelItems([item.id])} className="shrink-0 rounded-md px-1.5 py-1 text-xs font-semibold text-muted hover:bg-ink/5 hover:text-ink">
              Cancel
            </button>
          </div>
        </div>
      );
    case "failed":
    case "cancelled":
      return (
        <button type="button" onClick={() => processItems([item.id])} className={cn(actionBase, "w-full border border-blue/40 text-blue-700 hover:bg-blue-50")}>
          <RotateCcw className="size-4" aria-hidden="true" /> Retry
        </button>
      );
    case "needs-auth":
      return (
        <Link href={signInHref("/batch")} className={cn(actionBase, "w-full border border-blue/40 text-blue-700 hover:bg-blue-50")}>
          <Lock className="size-4" aria-hidden="true" /> Sign in to process
        </Link>
      );
    case "needs-pro":
      return (
        <Link href="/pricing?from=batch" className={cn(actionBase, "w-full border border-blue/40 text-blue-700 hover:bg-blue-50")}>
          <Sparkles className="size-4" aria-hidden="true" /> Upgrade to process
        </Link>
      );
  }
}

function Note({ item }: { item: BatchItem }) {
  if (item.status === "failed" && item.error)
    return (
      <p className="line-clamp-2 text-xs leading-snug text-danger" title={item.error.detail ?? item.error.message}>
        {item.error.message}
      </p>
    );
  if (item.status === "ready" && item.review)
    return (
      <p className="line-clamp-2 text-xs leading-snug text-warn" title={item.review}>
        {item.review} Refine to fix it.
      </p>
    );
  return null;
}

export function BatchCard({ item, selected, compact }: { item: BatchItem; selected: boolean; compact?: boolean }) {
  const checkboxId = `batch-select-${item.id}`;
  const done = item.status === "ready";
  const image = done ? (item.previewUrl ?? item.thumbUrl) : item.thumbUrl;
  return (
    <li
      data-batch-item={item.name}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[14px] bg-surface transition-[box-shadow] duration-150",
        selected ? "shadow-[0_0_0_2px_var(--color-blue)]" : "shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1px_var(--color-line-strong),var(--shadow-card)]",
      )}
    >
      <label htmlFor={checkboxId} className={cn("relative block aspect-[4/3] cursor-pointer overflow-hidden", done ? "checkerboard" : "bg-paper-2")}>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={done ? `${item.name}, background removed` : item.name}
            className={cn("absolute inset-0 size-full object-contain p-3", done && "animate-fade-in", isBusy(item) && "opacity-75")}
          />
        )}
        <span className="sr-only">Select {item.name}</span>
      </label>
      <input
        id={checkboxId}
        type="checkbox"
        checked={selected}
        onChange={() => toggleSelected(item.id)}
        aria-label={`Select ${item.name}`}
        className="absolute left-3 top-3 size-5 cursor-pointer rounded-md accent-[var(--color-blue)]"
      />
      <StatusBadge item={item} className="absolute right-3 top-3" />
      <div className="flex flex-1 flex-col gap-2 border-t border-line p-3">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-ink" title={item.name}>
              {item.name}
              {item.refined && <span className="ml-1.5 rounded bg-blue-50 px-1 py-px text-[11px] font-semibold text-blue-700">Edited</span>}
            </p>
            <p className="truncate text-xs text-muted">
              <OutputSize item={item} />
            </p>
          </div>
          <ItemMenu item={item} />
        </div>
        <Note item={item} />
        <div className="mt-auto">
          <ItemActions item={item} compact={compact} />
        </div>
      </div>
    </li>
  );
}

export function BatchRow({ item, selected }: { item: BatchItem; selected: boolean }) {
  const image = item.status === "ready" ? (item.previewUrl ?? item.thumbUrl) : item.thumbUrl;
  return (
    <li
      data-batch-item={item.name}
      className={cn("flex flex-wrap items-center gap-3 rounded-[12px] px-3 py-2 transition-colors sm:flex-nowrap", selected ? "bg-blue-50 shadow-[0_0_0_1px_var(--color-blue)]" : "hover:bg-paper")}
    >
      <input type="checkbox" checked={selected} onChange={() => toggleSelected(item.id)} aria-label={`Select ${item.name}`} className="size-5 shrink-0 cursor-pointer accent-[var(--color-blue)]" />
      <span className={cn("relative size-12 shrink-0 overflow-hidden rounded-lg border border-line", item.status === "ready" ? "checkerboard-sm" : "bg-paper-2")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {image && <img src={image} alt="" className="absolute inset-0 size-full object-contain p-0.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-ink">{item.name}</p>
        <p className="truncate text-xs text-muted">
          <OutputSize item={item} />
          {item.status === "failed" && item.error && <span className="text-danger"> · {item.error.message}</span>}
          {item.status === "ready" && item.review && <span className="text-warn"> · {item.review}</span>}
        </p>
      </div>
      <StatusBadge item={item} className="hidden sm:inline-flex" />
      <div className="w-full sm:w-[230px]">
        <ItemActions item={item} />
      </div>
      <ItemMenu item={item} />
    </li>
  );
}
