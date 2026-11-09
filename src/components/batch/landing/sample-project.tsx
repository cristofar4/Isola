"use client";

import Link from "next/link";
import { ArrowRight, Check, Download } from "lucide-react";
import { zipSync } from "fflate";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/editor/export";
import { renderBatchBlob, renderBatchPreview, type BatchSources } from "@/lib/batch/render";
import { DEFAULT_BATCH_SETTINGS, type BatchSettings } from "@/lib/batch/settings";
import { exportPolicy } from "@/lib/plan-policy";
import { signInHref } from "@/lib/session-gate";
import { SAMPLE_ITEMS } from "./samples";

type Bg = "transparent" | "white" | "blue";
interface Look {
  bg: Bg;
  padding: number;
}

const BG: Array<{ id: Bg; label: string; color: string | null; swatch: string }> = [
  { id: "transparent", label: "Transparent", color: null, swatch: "checkerboard-sm" },
  { id: "white", label: "White", color: "#FFFFFF", swatch: "bg-white" },
  { id: "blue", label: "Blue", color: "#DDE6FB", swatch: "bg-[#DDE6FB]" },
];

/** The real Batch Studio settings for a look: square canvas, centred, PNG. */
function settingsFor(look: Look): BatchSettings {
  const color = BG.find((b) => b.id === look.bg)?.color;
  return {
    ...DEFAULT_BATCH_SETTINGS,
    background: color ? { kind: "color", color } : { kind: "transparent" },
    canvas: "square",
    fit: "contain",
    padding: look.padding,
    align: { x: 0.5, y: 0.5 },
  };
}

/** Subject bounds from the cutout's alpha, measured on a small copy. */
function boundsOf(bitmap: ImageBitmap) {
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  return { x: x0 / scale, y: y0 / scale, w: (x1 - x0 + 1) / scale, h: (y1 - y0 + 1) / scale };
}

/**
 * "Try it with sample images": the same settings model as Batch Studio (a
 * draft that you apply), drawn by the same compositor, with a real ZIP.
 */
export function SampleProject({ preset = null }: { preset?: "catalogue" | null }) {
  const ids = { padding: useId() };
  const initial: Look = preset === "catalogue" ? { bg: "white", padding: 10 } : { bg: "transparent", padding: 8 };
  const [draft, setDraft] = useState<Look>(initial);
  const [applied, setApplied] = useState<Look>(initial);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [zipping, setZipping] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const sources = useRef<Map<string, BatchSources>>(new Map());
  const changed = draft.bg !== applied.bg || draft.padding !== applied.padding;

  // Load the sample cutouts once, then redraw previews whenever a look is applied.
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    (async () => {
      if (sources.current.size === 0) {
        for (const s of SAMPLE_ITEMS) {
          const bitmap = await createImageBitmap(await (await fetch(s.cutout)).blob());
          sources.current.set(s.id, { width: bitmap.width, height: bitmap.height, cutout: bitmap, bounds: boundsOf(bitmap), backgroundImage: null });
        }
      }
      const next: Record<string, string> = {};
      for (const s of SAMPLE_ITEMS) {
        const src = sources.current.get(s.id);
        if (!src) continue;
        const url = URL.createObjectURL(await renderBatchPreview(src, settingsFor(applied), exportPolicy(true), 420));
        made.push(url);
        next[s.id] = url;
      }
      if (alive) setPreviews(next);
    })().catch(() => {
      if (alive) setMessage({ tone: "error", text: "The samples couldn't be drawn in this browser." });
    });
    return () => {
      alive = false;
      // Revoke after the next previews have replaced these.
      window.setTimeout(() => made.forEach((u) => URL.revokeObjectURL(u)), 1000);
    };
  }, [applied]);

  async function downloadZip() {
    setZipping(true);
    setMessage(null);
    try {
      const files: Record<string, Uint8Array> = {};
      for (const s of SAMPLE_ITEMS) {
        const src = sources.current.get(s.id);
        if (!src) continue;
        const { blob } = await renderBatchBlob(src, settingsFor(applied), exportPolicy(true));
        files[`${s.id}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      downloadBlob(new Blob([zipSync(files, { level: 0 }) as BlobPart], { type: "application/zip" }), "isola-sample.zip");
      setMessage({ tone: "ok", text: "Downloaded isola-sample.zip with 3 PNGs." });
    } catch {
      setMessage({ tone: "error", text: "The ZIP couldn't be created in this browser." });
    }
    setZipping(false);
  }

  return (
    <section aria-labelledby="sample-title" className="scroll-mt-24" id="try-it">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="sample-title" className="font-display text-[30px] font-bold tracking-tight text-ink sm:text-[34px]">
            Try it with sample images.
          </h2>
          <p className="mt-1 text-[17px] text-ink-3">Explore the controls before creating an account.</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[13px] font-semibold text-blue-700">Sample project</span>
      </div>

      <div className="mt-5 grid gap-6 rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="grid content-start gap-3">
          <ul className="grid grid-cols-3 gap-3" aria-label="Sample images" data-sample-grid>
            {SAMPLE_ITEMS.map((s) => (
              <li key={s.id} className={cn("relative aspect-square overflow-hidden rounded-[12px] border border-line", applied.bg === "transparent" && "checkerboard")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previews[s.id] ?? s.cutout}
                  alt={`${s.name}, ${BG.find((b) => b.id === applied.bg)?.label.toLowerCase()} background, ${applied.padding}% padding`}
                  data-sample-preview={previews[s.id] ? "rendered" : "loading"}
                  className={cn("absolute inset-0 size-full object-contain", !previews[s.id] && "p-4 opacity-70")}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 text-[14px]">
            <button
              type="button"
              onClick={() => void downloadZip()}
              disabled={zipping || Object.keys(previews).length === 0}
              className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline disabled:opacity-50"
            >
              {zipping ? <Spinner /> : <Download className="size-4" aria-hidden="true" />} Download sample ZIP
            </button>
            <span className="h-4 w-px bg-line" aria-hidden="true" />
            <span className="text-muted">Sample assets only</span>
          </div>
          <p aria-live="polite" className={cn("min-h-5 text-[13px]", message?.tone === "error" ? "text-danger" : "text-success")}>
            {message?.text}
          </p>
        </div>

        <div className="grid content-start gap-5 lg:border-l lg:border-line lg:pl-6">
          <fieldset>
            <legend className="mb-2 text-[15px] font-semibold text-ink">Background</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Background">
              {BG.map((b) => {
                const on = draft.bg === b.id;
                return (
                  <button key={b.id} type="button" role="radio" aria-checked={on} onClick={() => setDraft({ ...draft, bg: b.id })} className="grid justify-items-center gap-1.5 text-[13px] text-ink-3">
                    <span className={cn("relative h-12 w-full rounded-[10px] border", b.swatch, on ? "border-blue shadow-[0_0_0_1px_var(--color-blue)]" : "border-line hover:border-line-strong")}>
                      {on && (
                        <span className="absolute inset-0 m-auto inline-flex size-5 items-center justify-center rounded-full bg-blue text-white">
                          <Check className="size-3" aria-hidden="true" />
                        </span>
                      )}
                    </span>
                    <span className={cn(on && "font-semibold text-ink")}>{b.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label htmlFor={ids.padding} className="text-[15px] font-semibold text-ink">
              Padding
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id={ids.padding}
                type="range"
                min={0}
                max={30}
                value={draft.padding}
                onChange={(e) => setDraft({ ...draft, padding: Number(e.target.value) })}
                className="h-1.5 flex-1 cursor-pointer accent-[var(--color-blue)]"
              />
              <output htmlFor={ids.padding} className="w-14 rounded-lg border border-line px-2 py-1 text-center text-[14px] tabular-nums text-ink">
                {draft.padding}%
              </output>
            </div>
            <p className="mt-1 text-[12px] text-muted">Space around each subject on a square canvas, as in Batch Studio.</p>
          </div>
          <Button size="lg" disabled={!changed} onClick={() => setApplied(draft)}>
            {changed ? "Apply to samples" : "Applied to samples"}
          </Button>
        </div>
      </div>

      <p className="mt-5 text-center">
        <Link href={signInHref("/batch")} className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-blue-700 hover:underline">
          Sign in to upload your images <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}
