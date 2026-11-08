"use client";

import Image from "next/image";
import { Lock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { useFileDrop } from "@/components/upload/use-file-drop";
import { useUpload } from "@/components/upload/use-upload";
import { FORMAT_LABEL, formatBytes, uploadLimits } from "@/lib/config";
import { cn } from "@/lib/cn";
import { SAMPLES } from "@/lib/samples";

export function UploadPanel({ className }: { className?: string }) {
  const upload = useUpload();
  const drop = useFileDrop((files) => void upload.handleFiles(files), upload.busy);

  return (
    <section
      aria-labelledby="upload-heading"
      className={cn(
        "relative flex flex-col items-center rounded-[18px] border bg-surface px-6 py-7 text-center shadow-[var(--shadow-card)] transition-[border-color,background-color,box-shadow] duration-200",
        drop.dragging ? "border-2 border-dashed border-blue bg-blue-50 shadow-[var(--shadow-float)]" : "border-line",
        className,
      )}
      {...drop.bind}
    >
      <input {...upload.inputProps} />
      <span
        className={cn(
          "inline-flex size-12 items-center justify-center rounded-full text-blue transition-transform duration-300",
          drop.dragging ? "-translate-y-1 scale-110 bg-blue text-white" : "bg-blue-50",
        )}
        aria-hidden="true"
      >
        <Upload className="size-6" strokeWidth={2.2} />
      </span>
      <h2 id="upload-heading" className="mt-4 font-display text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-ink">
        {drop.dragging ? (
          "Drop to open the editor"
        ) : (
          <>
            Drop an image.
            <br />
            See the difference.
          </>
        )}
      </h2>

      <Button
        size="lg"
        className="mt-6 w-full"
        onClick={upload.openPicker}
        disabled={upload.busy}
        icon={upload.busy ? <Spinner className="size-5" /> : <Upload className="size-[18px]" aria-hidden="true" />}
      >
        {upload.state === "opening" ? "Opening editor…" : upload.state === "checking" ? "Checking image…" : "Upload image"}
      </Button>
      <p className="mt-3 text-sm text-ink">or drag and drop</p>
      <p className="mt-1 text-[13px] text-muted">
        {FORMAT_LABEL} · up to {formatBytes(uploadLimits.maxFileBytes)}
      </p>

      {upload.issues.length > 0 && (
        <div role="alert" className="mt-4 w-full rounded-lg border border-danger/25 bg-danger-50 px-3 py-2 text-left text-[13px] text-danger">
          {upload.issues.map((issue) => (
            <p key={issue.name + issue.message}>
              <span className="font-semibold">{issue.name}:</span> {issue.message}
            </p>
          ))}
        </div>
      )}

      <div className="mt-6 w-full border-t border-line pt-5">
        <p className="text-[13px] text-muted">Try an example</p>
        <ul className="mt-3 flex justify-center gap-3 sm:gap-4">
          {SAMPLES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                onClick={() => void upload.trySample(sample)}
                disabled={upload.busy}
                aria-label={`Try the ${sample.label.toLowerCase()} example`}
                className="group relative block size-[68px] overflow-hidden rounded-full border-2 border-white shadow-[var(--shadow-card)] ring-1 ring-line transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:ring-blue focus-visible:ring-blue disabled:opacity-60 sm:size-[74px]"
              >
                <Image src={sample.src} alt="" fill sizes="80px" className="object-cover transition-transform duration-300 group-hover:scale-105" />
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted">
          <Lock className="size-3.5" aria-hidden="true" />
          Free account required. Processed in your browser; your image isn&apos;t uploaded.
        </p>
      </div>
    </section>
  );
}
