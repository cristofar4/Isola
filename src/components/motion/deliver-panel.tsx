"use client";

import { CircleAlert, CircleCheck, Download, Film as FilmIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob } from "@/lib/editor/export";
import { usePlan } from "@/lib/plan";
import { exportPolicy } from "@/lib/plan-policy";
import { cn } from "@/lib/cn";
import { audibleClips } from "@/lib/motion/audio";
import { commit, useEditor } from "@/lib/motion/editor";
import { exportFilm, exportOptions, exportSize, safeName, ExportError, type Encoding, type ExportProgress, type ExportResult } from "@/lib/motion/export";
import { ASPECTS, ASPECT_ORDER, FRAME_RATES, type Aspect, type ExportQuality, type ExportResolution, type FrameRate } from "@/lib/motion/model";
import { validateFilm } from "@/lib/motion/ops";
import { filmAssets } from "@/lib/motion/render";
import { filmDuration, secs } from "@/lib/motion/time";
import { recordExport } from "@/lib/studio/export-history";
import { assetImage } from "@/lib/scene/resources";
import { missingVideos } from "./playback";
import { DarkButton, Field, darkInput, darkSelect } from "./ui";
import { viewerCanvas } from "./viewer";

const PHASE: Record<ExportProgress["phase"], string> = { preparing: "Preparing media and fonts", mixing: "Mixing sound", rendering: "Rendering frames", finishing: "Finishing the file" };

async function posterFrame(): Promise<Blob | null> {
  const c = viewerCanvas.current;
  if (!c) return null;
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.85));
}

export function DeliverPanel() {
  const film = useEditor((s) => s.film)!;
  const plan = usePlan();
  const policy = exportPolicy(plan.pro);
  const settings = film.export;
  const size = exportSize(film, settings.resolution, policy);
  const [found, setFound] = useState<{ key: string; options: Encoding[] } | null>(null);
  const optionsKey = `${size.width}x${size.height}@${film.fps}`;
  const options = found?.key === optionsKey ? found.options : null;
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const D = filmDuration(film);
  const hasSound = audibleClips(film).length > 0;

  useEffect(() => {
    let alive = true;
    void exportOptions(size.width, size.height, film.fps).then((o) => alive && setFound({ key: `${size.width}x${size.height}@${film.fps}`, options: o }));
    return () => {
      alive = false;
    };
  }, [size.width, size.height, film.fps]);

  const encoding = options?.find((o) => o.container === settings.container) ?? options?.[0] ?? null;
  const problems = useMemo(() => {
    const list = validateFilm(film);
    const { images, videos } = filmAssets(film);
    const missingImages = images.filter((id) => !assetImage(id)).length;
    if (missingImages) list.push(`${missingImages} image${missingImages === 1 ? " is" : "s are"} missing (marked on the timeline).`);
    const gone = videos.filter((id) => missingVideos.has(id) || !film.media.some((m) => m.id === id)).length;
    if (gone) list.push(`${gone} video file${gone === 1 ? " is" : "s are"} missing.`);
    return list;
  }, [film]);

  const set = (patch: Partial<typeof settings>) => commit({ ...film, export: { ...settings, ...patch } });

  async function render() {
    if (!encoding) return;
    setError(null);
    setResult(null);
    const controller = new AbortController();
    abort.current = controller;
    setProgress({ phase: "preparing", done: 0, frame: 0, frames: Math.round(D * film.fps) });
    try {
      const r = await exportFilm({ film, encoding, resolution: settings.resolution, quality: settings.quality, includeAudio: settings.includeAudio && hasSound, fileName: settings.fileName || film.name, policy }, setProgress, controller.signal);
      setResult(r);
      void recordExport({ title: film.name, fileName: r.fileName, source: "motion", files: 1, format: r.label, blob: r.blob, preview: await posterFrame(), destinations: [`${ASPECTS[film.aspect].label} · ${r.width}×${r.height} · ${r.fps} fps`] });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") setError("Export cancelled. Nothing was saved.");
      else setError(e instanceof ExportError ? e.message : e instanceof Error ? e.message : "The export failed.");
    } finally {
      setProgress(null);
      abort.current = null;
    }
  }

  const busy = progress !== null;
  return (
    <div className="grid gap-3 px-3 pb-4" data-deliver>
      <Field label="Aspect ratio">
        <select value={film.aspect} disabled={busy} onChange={(e) => commit({ ...film, aspect: e.target.value as Aspect })} className={darkSelect} aria-label="Aspect ratio">
          {ASPECT_ORDER.map((a) => (
            <option key={a} value={a}>
              {ASPECTS[a].label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Resolution">
          <select value={settings.resolution} disabled={busy} onChange={(e) => set({ resolution: Number(e.target.value) as ExportResolution })} className={darkSelect} aria-label="Resolution">
            <option value={720}>720p</option>
            <option value={1080}>1080p</option>
            <option value={2160}>4K (2160p)</option>
          </select>
        </Field>
        <Field label="Frame rate">
          <select value={film.fps} disabled={busy} onChange={(e) => commit({ ...film, fps: Number(e.target.value) as FrameRate })} className={darkSelect} aria-label="Frame rate">
            {FRAME_RATES.map((f) => (
              <option key={f} value={f}>
                {f} fps
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-[12px] text-[#C9CEDA]" data-output-size>
        Output: {size.width} × {size.height} · {secs(D)} · {Math.round(D * film.fps)} frames
      </p>
      {policy.watermark && <p className="rounded-[8px] bg-white/[0.04] px-2.5 py-2 text-[11px] leading-snug text-[#C9CEDA]">Free plan: ISOLA watermark, up to 1,000px on the longest side (like every Free export). Pro exports full size without the watermark.</p>}
      <Field label="Format" hint={options && !options.length ? undefined : encoding?.note ?? undefined}>
        {options === null ? (
          <p className="text-[12px] text-[#8890A2]">Checking what this browser can encode…</p>
        ) : options.length === 0 ? (
          <p role="alert" className="text-[12px] text-[#FFB4AD]">This browser can&apos;t encode video at {size.width} × {size.height} and {film.fps} fps. Try a lower resolution or frame rate, or Chrome or Edge (WebCodecs).</p>
        ) : (
          <div role="radiogroup" aria-label="Format" className="grid gap-1">
            {options.map((o) => (
              <button key={o.container} type="button" role="radio" aria-checked={encoding?.container === o.container} disabled={busy} onClick={() => set({ container: o.container })} className={cn("flex h-9 items-center justify-between rounded-[8px] px-2.5 text-[13px]", encoding?.container === o.container ? "bg-[#6F7FF7]/20 text-white ring-1 ring-[#8B9BFF]/60" : "bg-white/[0.04] text-[#C9CEDA]")}>
                {o.label}
                <span className="text-[11px] text-[#8890A2]">.{o.container}</span>
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label="Quality">
        <select value={settings.quality} disabled={busy} onChange={(e) => set({ quality: e.target.value as ExportQuality })} className={darkSelect} aria-label="Quality">
          <option value="standard">Standard (smaller file)</option>
          <option value="high">High</option>
          <option value="max">Maximum (larger file)</option>
        </select>
      </Field>
      <label className="flex items-center justify-between gap-2 text-[13px] text-[#C9CEDA]">
        <span>
          Include sound
          {!hasSound && <span className="block text-[11px] text-[#8890A2]">No audible sound clips.</span>}
          {hasSound && encoding && !encoding.audio && <span className="block text-[11px] text-[#F5D58A]">This browser can&apos;t encode sound for this format.</span>}
        </span>
        <input type="checkbox" checked={settings.includeAudio && hasSound && !!encoding?.audio} disabled={!hasSound || !encoding?.audio || busy} onChange={(e) => set({ includeAudio: e.target.checked })} className="size-4 accent-[#8B9BFF]" />
      </label>
      <Field label="File name">
        <input value={settings.fileName} placeholder={safeName(film.name, encoding?.container ?? "mp4")} disabled={busy} onChange={(e) => commit({ ...film, export: { ...settings, fileName: e.target.value.slice(0, 120) } }, { coalesce: "export-name" })} className={darkInput} aria-label="File name" />
      </Field>

      {problems.length > 0 && (
        <ul role="alert" className="grid gap-1 rounded-[8px] border border-[#F07167]/30 bg-[#F07167]/10 px-2.5 py-2 text-[12px] text-[#FFB4AD]">
          {problems.slice(0, 4).map((p) => (
            <li key={p} className="flex gap-1.5">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
      )}

      {busy ? (
        <div className="grid gap-2 rounded-[10px] bg-white/[0.04] p-3" role="status" aria-live="polite" data-export-progress>
          <div className="flex items-center justify-between text-[12px] text-[#C9CEDA]">
            <span>{PHASE[progress.phase]}</span>
            <span className="tabular-nums">{progress.phase === "rendering" ? `${progress.frame} / ${progress.frames} frames · ${Math.round(progress.done * 100)}%` : ""}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#8B9BFF] transition-[width]" style={{ width: `${Math.round(progress.done * 100)}%` }} />
          </div>
          <DarkButton size="sm" tone="danger" icon={<X className="size-3.5" aria-hidden="true" />} onClick={() => abort.current?.abort()}>
            Cancel export
          </DarkButton>
        </div>
      ) : (
        <DarkButton tone="primary" icon={<FilmIcon className="size-4" aria-hidden="true" />} disabled={!encoding || problems.length > 0} onClick={() => void render()}>
          Export film
        </DarkButton>
      )}
      {error && (
        <p role="alert" className="text-[12px] text-[#FFB4AD]">
          {error}
        </p>
      )}
      {result && (
        <div className="grid gap-2 rounded-[10px] border border-[#3BB273]/40 bg-[#3BB273]/10 p-3" data-export-ready>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#9AE6B4]">
            <CircleCheck className="size-4" aria-hidden="true" /> Ready: {result.fileName}
          </p>
          <p className="text-[12px] text-[#C9CEDA]">
            {result.label}
            {!result.hasAudio ? " (no sound)" : ""} · {result.width} × {result.height} · {result.fps} fps · {secs(result.duration)} · {(result.blob.size / 1024 / 1024).toFixed(1)} MB
          </p>
          <DarkButton tone="primary" icon={<Download className="size-4" aria-hidden="true" />} onClick={() => downloadBlob(result.blob, result.fileName)}>
            Download
          </DarkButton>
          <p className="text-[11px] text-[#8890A2]">Also kept in Downloads in this browser while it fits.</p>
        </div>
      )}
      <p className="text-[11px] leading-snug text-[#8890A2]">Rendered on this device frame by frame with the same renderer as the viewer, then encoded by your browser. Nothing is uploaded.</p>
    </div>
  );
}
