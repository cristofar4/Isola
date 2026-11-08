"use client";

import Image from "next/image";
import { Lock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { useUpload } from "@/components/upload/use-upload";
import { FORMAT_LABEL, limitsSummary } from "@/lib/config";
import { SAMPLES } from "@/lib/samples";

export function EmptyState() {
  const upload = useUpload({ navigateTo: null });
  return (
    <div className="flex h-full items-center justify-center p-4">
      <input {...upload.inputProps} />
      <div className="w-full max-w-md animate-scale-in rounded-[20px] border border-dashed border-line-strong bg-surface p-8 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue" aria-hidden="true">
          <Upload className="size-6" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">Start with a photo</h2>
        <p className="mt-2 text-sm text-muted">Drop images here, paste from your clipboard, or choose files.</p>
        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={upload.openPicker}
          disabled={upload.busy}
          icon={upload.busy ? <Spinner className="size-5" /> : <Upload className="size-[18px]" aria-hidden="true" />}
        >
          Upload images
        </Button>
        <p className="mt-3 text-xs text-muted">
          {FORMAT_LABEL} · {limitsSummary()}
        </p>
        {upload.issues.length > 0 && (
          <div role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger-50 px-3 py-2 text-left text-[13px] text-danger">
            {upload.issues.map((issue) => (
              <p key={issue.name + issue.message}>
                <span className="font-semibold">{issue.name}:</span> {issue.message}
              </p>
            ))}
          </div>
        )}
        <div className="mt-6 border-t border-line pt-5">
          <p className="text-[13px] text-muted">Or try an example</p>
          <div className="mt-3 flex justify-center gap-3">
            {SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                disabled={upload.busy}
                onClick={() => void upload.trySample(sample)}
                aria-label={`Try the ${sample.label.toLowerCase()} example`}
                className="relative size-16 overflow-hidden rounded-full border-2 border-white shadow-[var(--shadow-card)] ring-1 ring-line transition-transform hover:-translate-y-0.5 hover:ring-blue"
              >
                <Image src={sample.src} alt="" fill sizes="64px" className="object-cover" />
              </button>
            ))}
          </div>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted">
            <Lock className="size-3.5" aria-hidden="true" /> Processed in your browser. Images aren&apos;t uploaded.
          </p>
        </div>
      </div>
    </div>
  );
}
