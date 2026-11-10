"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RangeField } from "@/components/scene/fields";
import { cn } from "@/lib/cn";
import { computeScopes, type Scopes } from "@/lib/motion/colour";
import { commit, preview, useEditor } from "@/lib/motion/editor";
import { NEUTRAL, type ColourAdjust, type Film } from "@/lib/motion/model";
import { updateClip } from "@/lib/motion/ops";
import { DarkButton } from "./ui";
import { onViewerFrame, viewerCanvas } from "./viewer";

const SLIDERS: Array<{ key: keyof ColourAdjust; label: string; min: number; max: number; step: number; fmt: (v: number) => string }> = [
  { key: "exposure", label: "Exposure", min: -2, max: 2, step: 0.05, fmt: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} stops` },
  { key: "contrast", label: "Contrast", min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: "saturation", label: "Saturation", min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: "temperature", label: "Temperature", min: -1, max: 1, step: 0.01, fmt: (v) => (v === 0 ? "0" : `${v > 0 ? "Warmer" : "Cooler"} ${Math.abs(Math.round(v * 100))}`) },
  { key: "tint", label: "Tint", min: -1, max: 1, step: 0.01, fmt: (v) => (v === 0 ? "0" : `${v > 0 ? "Magenta" : "Green"} ${Math.abs(Math.round(v * 100))}`) },
  { key: "highlights", label: "Highlights", min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: "shadows", label: "Shadows", min: -1, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
];

type Scope = "background" | "frame" | "layer";

function currentAdjust(film: Film, scope: Scope, clipId: string | null): ColourAdjust {
  if (scope === "frame") return film.grade.frame;
  if (scope === "background") return film.grade.background;
  return film.clips.find((c) => c.id === clipId)?.grade ?? NEUTRAL;
}

function withAdjust(film: Film, scope: Scope, clipId: string | null, adjust: ColourAdjust): Film {
  if (scope === "frame") return { ...film, grade: { ...film.grade, frame: adjust } };
  if (scope === "background") return { ...film, grade: { ...film.grade, background: adjust } };
  return clipId ? updateClip(film, clipId, (c) => ({ ...c, grade: adjust })).film : film;
}

/** RGB parade and luma histogram, computed from the viewer's actual pixels. */
function ScopesView() {
  const parade = useRef<HTMLCanvasElement>(null);
  const hist = useRef<HTMLCanvasElement>(null);
  const [scopes, setScopes] = useState<Scopes | null>(null);
  useEffect(() => {
    let pending = false;
    let last = 0;
    const sample = document.createElement("canvas");
    const run = () => {
      pending = false;
      last = performance.now();
      const src = viewerCanvas.current;
      if (!src || !src.width) return;
      const w = 192;
      const h = Math.max(1, Math.round((src.height / src.width) * w));
      sample.width = w;
      sample.height = h;
      const ctx = sample.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(src, 0, 0, w, h);
      setScopes(computeScopes(ctx.getImageData(0, 0, w, h).data, w, h));
    };
    run();
    return onViewerFrame(() => {
      if (pending) return;
      pending = true;
      setTimeout(run, Math.max(0, 150 - (performance.now() - last)));
    });
  }, []);
  useEffect(() => {
    const c = parade.current;
    if (!c || !scopes) return;
    const { width, levels, r, g, b } = scopes.parade;
    c.width = width * 3;
    c.height = levels;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(width * 3, levels);
    [r, g, b].forEach((ch, ci) => {
      for (let x = 0; x < width; x++) {
        for (let l = 0; l < levels; l++) {
          const v = ch[x * levels + l];
          const i = ((levels - 1 - l) * width * 3 + ci * width + x) * 4;
          img.data[i] = ci === 0 ? 255 : 40;
          img.data[i + 1] = ci === 1 ? 230 : 50;
          img.data[i + 2] = ci === 2 ? 255 : 60;
          img.data[i + 3] = Math.round(v * 255);
        }
      }
    });
    ctx.putImageData(img, 0, 0);
    const hc = hist.current;
    if (!hc) return;
    hc.width = 256;
    hc.height = 60;
    const h2 = hc.getContext("2d");
    if (!h2) return;
    h2.clearRect(0, 0, 256, 60);
    h2.fillStyle = "rgba(220,224,235,0.75)";
    scopes.histogram.forEach((v, i) => h2.fillRect(i, 60 - v * 58, 1, v * 58));
  }, [scopes]);
  return (
    <div className="grid gap-2" data-scopes>
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#C9CEDA]">Colour scopes</h3>
        <span className="text-[11px] text-[#8890A2]">From the preview</span>
      </div>
      <figure className="grid gap-1">
        <canvas ref={parade} role="img" aria-label="RGB parade" className="h-[96px] w-full rounded-[6px] bg-black [image-rendering:pixelated]" />
        <figcaption className="flex justify-between text-[10px] text-[#8890A2]">
          <span>RGB parade: red, green, blue across the frame</span>
        </figcaption>
      </figure>
      <figure className="grid gap-1">
        <canvas ref={hist} role="img" aria-label="Luma histogram" className="h-[56px] w-full rounded-[6px] bg-black" />
        <figcaption className="text-[10px] text-[#8890A2]">
          Luma histogram
          {scopes && (scopes.clipped.black > 0.005 || scopes.clipped.white > 0.005) ? ` · clipped: ${(scopes.clipped.black * 100).toFixed(1)}% black, ${(scopes.clipped.white * 100).toFixed(1)}% white` : ""}
        </figcaption>
      </figure>
    </div>
  );
}

export function ColourPanel() {
  const film = useEditor((s) => s.film)!;
  const selection = useEditor((s) => s.selection);
  const clip = selection.clipIds.length === 1 ? film.clips.find((c) => c.id === selection.clipIds[0] && c.source.kind !== "audio") : null;
  const [scope, setScope] = useState<Scope>("background");
  const effective: Scope = scope === "layer" && !clip ? "background" : scope;
  const base = useRef<Film | null>(null);
  const adjust = currentAdjust(film, effective, clip?.id ?? null);
  const live = (patch: Partial<ColourAdjust>) => {
    base.current ??= film;
    preview(withAdjust(film, effective, clip?.id ?? null, { ...adjust, ...patch }));
  };
  const done = () => {
    if (base.current) commit(useEditor.getState().film!, { base: base.current });
    base.current = null;
  };
  const scopeLabel = { background: "Background layers", frame: "Whole frame", layer: clip ? `“${clip.name}” only` : "Selected layer" };
  return (
    <div className="grid gap-3 px-3 pb-4" data-colour-panel>
      <div role="radiogroup" aria-label="Apply colour to" className="grid gap-1">
        {(["background", "frame", "layer"] as Scope[]).map((s) => (
          <button key={s} type="button" role="radio" aria-checked={effective === s} disabled={s === "layer" && !clip} onClick={() => setScope(s)} className={cn("flex h-9 items-center justify-between rounded-[9px] px-3 text-left text-[13px] disabled:opacity-35", effective === s ? "bg-[#6F7FF7]/20 text-white ring-1 ring-[#8B9BFF]/60" : "bg-white/[0.04] text-[#C9CEDA] hover:bg-white/[0.07]")}>
            {scopeLabel[s]}
            {s === "frame" && <span className="text-[11px] text-[#F5D58A]">includes the product</span>}
            {s === "background" && <span className="text-[11px] text-[#9AE6B4]">product untouched</span>}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-snug text-[#8890A2]">
        {effective === "background" ? "Backdrops, background images and background video only. Product cutouts, shadows and titles keep their colours." : effective === "frame" ? "Everything in the frame, including your product. Use it lightly if colour accuracy matters." : "Just this layer. Adjustments never change the source file."}
      </p>
      {SLIDERS.map((s) => (
        <RangeField key={s.key} tone="dark" label={s.label} value={adjust[s.key]} min={s.min} max={s.max} step={s.step} format={s.fmt} onChange={(v) => live({ [s.key]: v })} onCommit={done} />
      ))}
      <RangeField
        tone="dark"
        label="Vignette (whole frame)"
        value={film.grade.vignette}
        min={0}
        max={1}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(v) => {
          base.current ??= film;
          preview({ ...film, grade: { ...film.grade, vignette: v } });
        }}
        onCommit={done}
      />
      <DarkButton size="sm" tone="ghost" icon={<RotateCcw className="size-3.5" aria-hidden="true" />} onClick={() => commit(withAdjust(film, effective, clip?.id ?? null, { ...NEUTRAL }))}>
        Reset {scopeLabel[effective].toLowerCase()}
      </DarkButton>
      <div className="border-t border-white/[0.08] pt-3">
        <ScopesView />
      </div>
    </div>
  );
}
