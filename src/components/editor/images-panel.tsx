"use client";

import { AlertDialog } from "radix-ui";
import { ImagePlus, RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useUpload } from "@/components/upload/use-upload";
import { FORMAT_LABEL, formatBytes } from "@/lib/config";
import { cn } from "@/lib/cn";
import { cancelProcessing, processImage, removeImage } from "@/lib/project/actions";
import { useProject } from "@/lib/project/store";
import { StatusLabel } from "./status-label";

export function ImagesPanel({ onSelect }: { onSelect?: () => void }) {
  const images = useProject((s) => s.images);
  const activeId = useProject((s) => s.activeId);
  const setActive = useProject((s) => s.setActive);
  const upload = useUpload({ navigateTo: null });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmImage = images.find((i) => i.id === confirmId);

  return (
    <div className="flex h-full flex-col">
      <input {...upload.inputProps} />
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 className="text-[13px] font-semibold text-ink">
          Images <span className="font-normal text-muted">({images.length})</span>
        </h2>
        <Button size="sm" variant="secondary" onClick={upload.openPicker} icon={<ImagePlus className="size-3.5" aria-hidden="true" />}>
          Add
        </Button>
      </div>
      {upload.issues.length > 0 && (
        <div role="alert" className="mx-3 mb-2 rounded-lg border border-danger/25 bg-danger-50 px-3 py-2 text-xs text-danger">
          {upload.issues.map((issue) => (
            <p key={issue.name + issue.message}>
              <span className="font-semibold">{issue.name}:</span> {issue.message}
            </p>
          ))}
        </div>
      )}
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3" aria-label="Images in this project">
        {images.map((image) => (
          <li key={image.id}>
            <div
              className={cn(
                "group flex items-center gap-3 rounded-[10px] border p-2 transition-colors",
                image.id === activeId ? "border-blue/40 bg-blue-50" : "border-transparent hover:bg-paper",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-current={image.id === activeId ? "true" : undefined}
                onClick={() => {
                  setActive(image.id);
                  onSelect?.();
                }}
              >
                <span
                  className={cn(
                    "relative size-12 shrink-0 overflow-hidden rounded-lg border border-line",
                    image.resultThumbUrl ? "checkerboard-sm" : "bg-paper-2",
                  )}
                >
                  {(image.resultThumbUrl ?? image.thumbUrl) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.resultThumbUrl ?? image.thumbUrl!} alt="" className="absolute inset-0 size-full object-contain" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{image.name}</span>
                  <span className="block text-[11px] text-muted">
                    {image.width ? `${image.width} × ${image.height}` : "—"} · {formatBytes(image.size)}
                  </span>
                  <StatusLabel status={image.status} className="mt-0.5" />
                </span>
              </button>
              <div className="flex shrink-0 flex-col gap-0.5">
                {(image.status === "processing" || image.status === "queued") && (
                  <IconButton size="sm" label={`Cancel ${image.name}`} icon={<X className="size-4" />} onClick={() => cancelProcessing(image.id)} />
                )}
                {(image.status === "error" || image.status === "cancelled") && (
                  <IconButton size="sm" label={`Retry ${image.name}`} icon={<RotateCcw className="size-4" />} onClick={() => void processImage(image.id)} />
                )}
                <IconButton size="sm" label={`Remove ${image.name}`} icon={<Trash2 className="size-4" />} onClick={() => setConfirmId(image.id)} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
        {FORMAT_LABEL}. Drop or paste images anywhere in the editor.
      </p>

      <AlertDialog.Root open={confirmId !== null} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-[16px] bg-surface p-5 shadow-[var(--shadow-float)]">
            <AlertDialog.Title className="font-display text-lg font-bold">Remove this image?</AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 text-sm text-muted">
              {confirmImage?.name} and its edits will be removed from this project. This can&apos;t be undone.
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Keep</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="danger" onClick={() => confirmId && removeImage(confirmId)}>
                  Remove
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
