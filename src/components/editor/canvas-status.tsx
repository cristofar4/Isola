"use client";

import Link from "next/link";
import { AlertTriangle, Info, Lock, RotateCcw, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { signInHref } from "@/lib/session-gate";
import { ActivityBar, ProgressBar, Spinner } from "@/components/ui/progress";
import { cancelProcessing, processImage } from "@/lib/project/actions";
import { useProject, type ProjectImage } from "@/lib/project/store";
import { useEngineState } from "@/lib/processing/registry";
import { engineSummary, phaseText } from "./engine-text";

export function CanvasStatus({ image }: { image: ProjectImage }) {
  const engineId = useProject((s) => s.engineId);
  const engine = useEngineState(engineId);
  const patchImage = useProject((s) => s.patchImage);
  const location = engineId.startsWith("server") ? "server" : "device";

  if (image.status === "decoding") {
    return (
      <StatusCard>
        <p className="flex items-center gap-2 text-sm font-medium" role="status">
          <Spinner /> Preparing image…
        </p>
      </StatusCard>
    );
  }

  if (image.status === "needs-auth") {
    return (
      <StatusCard>
        <div role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Lock className="size-4 text-blue" aria-hidden="true" /> Sign in to remove the background
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Background removal needs a free account. Your image stays here while you sign in, and it&apos;s still processed
            on this device.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={signInHref("/editor")} size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href={signInHref("/editor", "sign-up")} size="sm" variant="secondary">
              Create account
            </ButtonLink>
          </div>
        </div>
      </StatusCard>
    );
  }

  if (image.status === "queued" || image.status === "processing") {
    const text = phaseText(image.phase, engine, location);
    const downloading = engine.kind === "downloading" && engine.total;
    return (
      <StatusCard>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink" role="status" aria-live="polite">
              {text}
            </p>
            <div className="mt-2.5">
              {downloading ? (
                <ProgressBar value={engine.loaded} max={engine.total!} label="Model download" />
              ) : (
                <ActivityBar label="Processing" />
              )}
            </div>
            {downloading && (
              <p className="mt-2 text-xs text-muted">One-time download. The model is cached in this browser for next time.</p>
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={() => cancelProcessing(image.id)} icon={<X className="size-3.5" aria-hidden="true" />}>
            Cancel
          </Button>
        </div>
      </StatusCard>
    );
  }

  if ((image.status === "error" || image.status === "cancelled") && image.status !== undefined) {
    const error = image.error;
    const missing = error?.code === "model-missing" || error?.code === "not-configured";
    return (
      <StatusCard tone={image.status === "error" ? "danger" : "neutral"}>
        <div role="alert">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            {image.status === "error" ? <AlertTriangle className="size-4 text-danger" aria-hidden="true" /> : <Info className="size-4 text-muted" aria-hidden="true" />}
            {image.status === "cancelled" ? "Processing cancelled." : error?.message ?? "Background removal failed."}
          </p>
          {missing && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Background removal needs a segmentation model that this deployment doesn&apos;t serve yet.{" "}
              <Link href="/developers#models" className="font-medium text-blue-700 underline underline-offset-2">
                How to install it
              </Link>
            </p>
          )}
          {error?.detail && (
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer select-none">Technical details</summary>
              <p className="mt-1 break-words font-mono">{error.detail}</p>
            </details>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void processImage(image.id)} icon={<RotateCcw className="size-3.5" aria-hidden="true" />}>
              Try again
            </Button>
            <span className="text-xs text-muted">Your original image is kept for retries.</span>
          </div>
        </div>
      </StatusCard>
    );
  }

  if (image.status === "ready" && (image.notice || image.error)) {
    return (
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
        <div className="pointer-events-auto flex max-w-lg items-start gap-2 rounded-xl border border-warn/25 bg-warn-50 px-3 py-2 text-[13px] text-warn shadow-[var(--shadow-card)]" role="status">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="flex-1">{image.error ? `Reprocessing failed: ${image.error.message} Your previous result is unchanged.` : image.notice}</p>
          <button
            type="button"
            aria-label="Dismiss"
            className="-mr-1 rounded p-0.5 hover:bg-warn/10"
            onClick={() => patchImage(image.id, { notice: null, error: null })}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return <span className="sr-only" aria-live="polite">{image.status === "ready" ? `Background removed. ${engineSummary(engine)}` : ""}</span>;
}

function StatusCard({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
      <div
        className={`pointer-events-auto w-full max-w-md animate-fade-up rounded-[14px] border bg-surface/95 px-4 py-3.5 shadow-[var(--shadow-float)] backdrop-blur ${
          tone === "danger" ? "border-danger/25" : "border-line"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
