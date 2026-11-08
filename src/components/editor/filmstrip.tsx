"use client";

import { Plus } from "lucide-react";
import { useUpload } from "@/components/upload/use-upload";
import { cn } from "@/lib/cn";
import { useProject } from "@/lib/project/store";
import { StatusDot } from "./status-label";

export function Filmstrip({ className }: { className?: string }) {
  const images = useProject((s) => s.images);
  const activeId = useProject((s) => s.activeId);
  const setActive = useProject((s) => s.setActive);
  const upload = useUpload({ navigateTo: null });
  return (
    <nav aria-label="Image filmstrip" className={cn("border-t border-line bg-surface", className)}>
      <input {...upload.inputProps} />
      <ul className="flex items-center gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:thin]">
        {images.map((image, i) => (
          <li key={image.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setActive(image.id)}
              aria-label={`Image ${i + 1}: ${image.name} (${image.status})`}
              aria-current={image.id === activeId ? "true" : undefined}
              className={cn(
                "relative block size-14 overflow-hidden rounded-[10px] border-2 transition-[border-color,transform] duration-150 hover:-translate-y-0.5",
                image.id === activeId ? "border-blue" : "border-line",
                image.resultThumbUrl ? "checkerboard-sm" : "bg-paper-2",
              )}
            >
              {(image.resultThumbUrl ?? image.thumbUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.resultThumbUrl ?? image.thumbUrl!} alt="" className="absolute inset-0 size-full object-contain" />
              )}
              <span className="absolute right-1 top-1">
                <StatusDot status={image.status} />
              </span>
            </button>
          </li>
        ))}
        <li className="shrink-0">
          <button
            type="button"
            onClick={upload.openPicker}
            aria-label="Add images"
            className="flex size-14 items-center justify-center rounded-[10px] border-2 border-dashed border-line-strong text-muted transition-colors hover:border-blue hover:text-blue"
          >
            <Plus className="size-5" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
