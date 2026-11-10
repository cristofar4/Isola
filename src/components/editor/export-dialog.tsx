"use client";

import Link from "next/link";
import { CircleCheck, Download, Link2, Link2Off, Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { Sheet } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/cn";
import { formatBytes, formatNaira, planConfig } from "@/lib/config";
import { usePlan } from "@/lib/plan";
import { applyPolicySize, exportPolicy } from "@/lib/plan-policy";
import { checkExportSize, downloadBlob, exportFileName, renderExport, type ExportFormat } from "@/lib/editor/export";
import { recordExport } from "@/lib/studio/export-history";
import { cropOf, outputSizeOf, type BackgroundSpec } from "@/lib/editor/types";
import { compositeSources, updateSettings } from "@/lib/project/actions";
import type { ProjectImage } from "@/lib/project/store";
import { useEditorUI } from "./editor-ui-store";

const FORMATS: Array<{ value: ExportFormat; label: string; detail: string }> = [
  { value: "png-transparent", label: "Transparent PNG", detail: "Real alpha channel, no background" },
  { value: "png-background", label: "PNG with background", detail: "Lossless, with your chosen background" },
  { value: "jpeg", label: "JPEG", detail: "Smaller file, always opaque" },
];

export function ExportDialog({ image }: { image: ProjectImage }) {
  const open = useEditorUI((s) => s.exportOpen);
  // Mounting the form on open gives it fresh state from the current settings each time.
  return open ? <ExportForm image={image} /> : null;
}

function ExportForm({ image }: { image: ProjectImage }) {
  const open = useEditorUI((s) => s.exportOpen);
  const setOpen = useEditorUI((s) => s.setExportOpen);
  const { settings, width: W, height: H } = image;
  const crop = cropOf(settings, W, H);
  const ratio = crop.w / crop.h;
  const [format, setFormat] = useState<ExportFormat>(
    settings.background.kind === "transparent" ? "png-transparent" : "png-background",
  );
  const [matte, setMatte] = useState("#FFFFFF");
  const [quality, setQuality] = useState(92);
  const [size, setSize] = useState(() => outputSizeOf(settings, W, H));
  const [lock, setLock] = useState(true);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "rendering" } | { kind: "done"; name: string; bytes: number } | { kind: "error"; message: string }>({ kind: "idle" });
  const ids = { w: useId(), h: useId() };
  const plan = usePlan();
  // Free plan: watermarked, and scaled down to fit the preview size (see plan-policy.ts).
  const policy = exportPolicy(plan.pro);
  const limited = policy.watermark;
  const cap = policy.maxSide ?? planConfig.freeMaxExportSide;
  const out = applyPolicySize(size.width, size.height, policy);

  const editorBackground = settings.background.kind !== "transparent";
  const background: BackgroundSpec = editorBackground ? settings.background : { kind: "color", color: matte };
  const check = checkExportSize(out.width, out.height);
  const fileName = exportFileName(image.name, format);
  const scalePct = Math.round((size.width / crop.w) * 100);

  function setWidth(w: number) {
    setSize((s) => ({ width: w, height: lock ? Math.max(1, Math.round(w / ratio)) : s.height }));
  }
  function setHeight(h: number) {
    setSize((s) => ({ height: h, width: lock ? Math.max(1, Math.round(h * ratio)) : s.width }));
  }
  function preset(factor: number) {
    setSize({ width: Math.max(1, Math.round(crop.w * factor)), height: Math.max(1, Math.round(crop.h * factor)) });
  }

  async function run() {
    const sources = compositeSources(image.id);
    if (!sources || !check.ok) return;
    setState({ kind: "rendering" });
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const resized = size.width !== Math.round(crop.w) || size.height !== Math.round(crop.h);
      const wanted = resized ? size : null;
      if (JSON.stringify(wanted) !== JSON.stringify(settings.output)) updateSettings(image.id, "Resize", { output: wanted });
      const blob = await renderExport(sources, settings, {
        format,
        width: out.width,
        height: out.height,
        background,
        quality: quality / 100,
        watermark: policy.watermark,
      });
      downloadBlob(blob, fileName);
      setState({ kind: "done", name: fileName, bytes: blob.size });
      void recordExport({ title: image.name, fileName, source: "editor", files: 1, format: format === "jpeg" ? "JPEG" : "PNG", blob });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "Export failed." });
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title="Export image"
      description="Rendered at full resolution, not the preview size."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] tabular-nums text-muted" aria-live="polite">
            <span className="font-semibold text-ink">
              {out.width.toLocaleString("en-US")} × {out.height.toLocaleString("en-US")} px
            </span>{" "}
            · {FORMATS.find((f) => f.value === format)?.label}
          </p>
          <Button
            onClick={() => void run()}
            disabled={!check.ok || state.kind === "rendering"}
            icon={state.kind === "rendering" ? <Spinner /> : <Download className="size-4" aria-hidden="true" />}
          >
            {state.kind === "rendering" ? "Rendering…" : "Download"}
          </Button>
        </div>
      }
    >
      {limited && (
        <div className="mb-5 flex gap-3 rounded-[12px] border border-blue-100 bg-blue-50 px-3.5 py-3 text-[13px] leading-relaxed text-ink-3">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />
          <p>
            <span className="font-semibold text-ink">Free plan:</span> exports include an ISOLA watermark and are limited to{" "}
            {cap.toLocaleString("en-US")}px on the longest side.{" "}
            <Link href="/pricing" className="font-semibold text-blue-700 underline underline-offset-2">
              Upgrade to Pro for {formatNaira(planConfig.proPriceNgn)}/month
            </Link>{" "}
            for full resolution without a watermark.
          </p>
        </div>
      )}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-[13px] font-semibold text-ink">Format</legend>
        {FORMATS.map((f) => (
          <label
            key={f.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-[12px] border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue",
              format === f.value ? "border-blue bg-blue-50" : "border-line hover:bg-paper",
            )}
          >
            <input
              type="radio"
              name="export-format"
              value={f.value}
              checked={format === f.value}
              onChange={() => setFormat(f.value)}
              className="size-4 accent-[var(--color-blue)]"
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{f.label}</span>
              <span className="block text-xs text-muted">{f.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {format !== "png-transparent" && (
        <div className="mt-5 grid gap-2">
          <p className="text-[13px] font-semibold text-ink">Background</p>
          {editorBackground ? (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <span
                className="inline-block size-6 rounded-md border border-line"
                style={settings.background.kind === "color" ? { background: settings.background.color } : undefined}
              />
              {settings.background.kind === "color" ? `Colour ${settings.background.color}` : `Image: ${settings.background.kind === "image" ? settings.background.name : ""}`}
              <span className="text-xs">(from the Background panel)</span>
            </p>
          ) : (
            <label className="flex items-center justify-between text-[13px]">
              <span className="text-muted">
                No background is set in the editor{format === "jpeg" ? ", and JPEG can't be transparent" : ""}. Choose a colour:
              </span>
              <input
                type="color"
                value={matte}
                onChange={(e) => setMatte(e.target.value.toUpperCase())}
                aria-label="Export background colour"
                className="ml-3 h-8 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
              />
            </label>
          )}
        </div>
      )}

      {format === "jpeg" && (
        <Slider className="mt-5" label="JPEG quality" value={quality} min={50} max={100} onChange={setQuality} format={(v) => `${v}%`} />
      )}

      <div className="mt-5 grid gap-2">
        <p className="text-[13px] font-semibold text-ink">Size</p>
        <div className="flex items-end gap-2">
          <label className="grid flex-1 gap-1 text-xs text-muted" htmlFor={ids.w}>
            Width (px)
            <input
              id={ids.w}
              type="number"
              inputMode="numeric"
              min={1}
              value={size.width}
              onChange={(e) => setWidth(Math.max(0, Math.round(Number(e.target.value))))}
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm tabular-nums text-ink focus:border-blue focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setLock(!lock)}
            aria-pressed={lock}
            aria-label={lock ? "Unlock aspect ratio" : "Lock aspect ratio"}
            className="mb-0.5 inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"
          >
            {lock ? <Link2 className="size-4" aria-hidden="true" /> : <Link2Off className="size-4" aria-hidden="true" />}
          </button>
          <label className="grid flex-1 gap-1 text-xs text-muted" htmlFor={ids.h}>
            Height (px)
            <input
              id={ids.h}
              type="number"
              inputMode="numeric"
              min={1}
              value={size.height}
              onChange={(e) => setHeight(Math.max(0, Math.round(Number(e.target.value))))}
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm tabular-nums text-ink focus:border-blue focus:outline-none"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: settings.crop ? "Crop size" : "Original", f: 1 },
            { label: "50%", f: 0.5 },
            { label: "25%", f: 0.25 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => preset(p.f)}
              className={cn(
                "h-7 rounded-md border px-2.5 text-xs font-medium",
                Math.round(crop.w * p.f) === size.width ? "border-blue bg-blue-50 text-blue-700" : "border-line hover:bg-paper",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {scalePct === 100
            ? `Same pixel size as the ${settings.crop ? "crop" : "original"} (${Math.round(crop.w)} × ${Math.round(crop.h)} px).`
            : `${scalePct}% of the ${settings.crop ? "crop" : "original"} size.`}
        </p>
        {!check.ok && (
          <p role="alert" className="text-xs text-danger">
            {check.message}
          </p>
        )}
      </div>

      <p className="mt-5 text-xs text-muted">
        File name: <span className="font-mono text-ink">{fileName}</span>
      </p>

      {state.kind === "done" && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-success-50 px-3 py-2 text-[13px] text-success">
          <CircleCheck className="size-4" aria-hidden="true" />
          Saved {state.name} ({formatBytes(state.bytes)})
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger">
          {state.message}
        </p>
      )}
    </Sheet>
  );
}
