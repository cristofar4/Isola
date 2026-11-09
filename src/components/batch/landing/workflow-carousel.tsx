"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileArchive, Pause, Play, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { SAMPLE_ITEMS } from "./samples";

const STEPS = [
  {
    id: "upload",
    label: "Upload",
    title: "Bring in the whole set.",
    text: "Drop up to 50 photos at once. Each file is checked before anything is processed.",
  },
  {
    id: "remove",
    label: "Remove backgrounds",
    title: "Clean cutouts. Across your collection.",
    text: "Process your images together, then review each result.",
  },
  {
    id: "style",
    label: "Match your style",
    title: "One look for every image.",
    text: "Apply the same background, canvas and padding to the whole set, or only the images you select.",
  },
  {
    id: "export",
    label: "Export ZIP",
    title: "Everything in one download.",
    text: "Download one image or a ZIP of every finished image, at full resolution.",
  },
] as const;

const INTERVAL_MS = 6000;

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function Original({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[10px] bg-paper-2 shadow-[var(--shadow-card)]", className)}>
      <Image src={src} alt={alt} fill sizes="200px" className="object-cover" />
    </div>
  );
}

function ReadyBadge() {
  return (
    <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[12px] font-semibold text-success shadow-sm">
      <CheckCircle2 className="size-3.5" aria-hidden="true" /> Ready
    </span>
  );
}

function UploadVisual() {
  return (
    <div className="grid h-full items-center gap-5 md:grid-cols-[1.1fr_1fr]">
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4 rounded-[14px] border-2 border-dashed border-blue/50 bg-blue-50/60 p-5 sm:min-h-[300px]">
        <div className="flex -space-x-6">
          {SAMPLE_ITEMS.map((s, i) => (
            <Original
              key={s.id}
              src={s.original}
              alt=""
              className={cn("size-24 animate-fade-up border-2 border-white sm:size-28", i === 1 && "-translate-y-2")}
            />
          ))}
        </div>
        <p className="flex items-center gap-2 text-[14px] font-semibold text-blue-700">
          <Upload className="size-4" aria-hidden="true" /> Drop to add to the batch
        </p>
      </div>
      <ul className="grid gap-2" aria-label="Files added">
        {SAMPLE_ITEMS.map((s, i) => (
          <li key={s.id} className="flex animate-fade-up items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5" style={{ animationDelay: `${i * 120}ms` }}>
            <Original src={s.original} alt="" className="size-10 shrink-0 rounded-md shadow-none" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">{s.file}</span>
              <span className="block text-[12px] text-muted">JPEG · checked</span>
            </span>
            <Check className="size-4 text-success" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RemoveVisual() {
  return (
    <div className="grid h-full items-center gap-4 sm:grid-cols-[150px_auto_1fr] lg:grid-cols-[190px_auto_1fr]">
      <div className="hidden gap-2 sm:grid">
        {SAMPLE_ITEMS.map((s) => (
          <Original key={s.id} src={s.original} alt={`${s.name}, original`} className="aspect-[4/3]" />
        ))}
      </div>
      <ArrowRight className="hidden size-7 text-blue sm:block" aria-hidden="true" />
      <div className="grid grid-cols-3 gap-3">
        {SAMPLE_ITEMS.map((s, i) => (
          <div key={s.id} className="checkerboard relative aspect-[4/5] animate-fade-in overflow-hidden rounded-[12px] border border-line" style={{ animationDelay: `${i * 150}ms` }}>
            <Image src={s.cutout} alt={`${s.name}, background removed`} fill sizes="220px" className="object-contain p-4 pb-10" />
            <ReadyBadge />
          </div>
        ))}
      </div>
    </div>
  );
}

function StyleVisual() {
  return (
    <div className="grid h-full content-center gap-4">
      <div className="grid grid-cols-3 gap-3">
        {SAMPLE_ITEMS.map((s, i) => (
          <div key={s.id} className="relative aspect-square animate-scale-in overflow-hidden rounded-[12px] border border-line bg-white p-[10%] shadow-[var(--shadow-card)]" style={{ animationDelay: `${i * 120}ms` }}>
            <div className="relative size-full">
              <Image src={s.cutout} alt={`${s.name} on white, square`} fill sizes="220px" className="object-contain" />
            </div>
          </div>
        ))}
      </div>
      <p className="flex flex-wrap items-center justify-center gap-2 text-[13px]">
        {["Background: White", "Canvas: Square 1:1", "Padding: 10%", "Applied to 3 images"].map((t) => (
          <span key={t} className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink-3">
            {t}
          </span>
        ))}
      </p>
    </div>
  );
}

function ExportVisual() {
  return (
    <div className="grid h-full items-center gap-5 md:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col items-center gap-3 rounded-[16px] bg-ink px-6 py-8 text-center text-white shadow-[var(--shadow-float)]">
        <FileArchive className="size-12 text-[#9fb4ff]" strokeWidth={1.5} aria-hidden="true" />
        <p className="font-display text-[20px] font-bold">spring-collection.zip</p>
        <p className="text-[13px] text-white/70">3 images · PNG · full resolution</p>
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold">
          <CheckCircle2 className="size-4 text-[#7be0a8]" aria-hidden="true" /> Downloaded
        </span>
      </div>
      <ul className="grid gap-2" aria-label="Files in the ZIP">
        {SAMPLE_ITEMS.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5">
            <span className="checkerboard-sm relative size-11 shrink-0 overflow-hidden rounded-md border border-line">
              <Image src={s.cutout} alt="" fill sizes="44px" className="object-contain p-1" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-ink">{s.file.replace(/\.jpg$/, ".png")}</span>
              <span className="block text-[12px] text-muted">Transparent PNG</span>
            </span>
          </li>
        ))}
        <li className="px-1 text-[12px] text-muted">Unfinished or failed images are left out and listed by name.</li>
      </ul>
    </div>
  );
}

const VISUALS = { upload: UploadVisual, remove: RemoveVisual, style: StyleVisual, export: ExportVisual };

/**
 * "See how Batch Studio works": four steps shown with the sample images. Plays
 * on its own unless paused, hovered, focused, or the visitor prefers reduced motion.
 */
export function WorkflowCarousel() {
  const [index, setIndex] = useState(1);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const reduceMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  const id = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const playing = !paused && !held && !reduceMotion;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % STEPS.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  const step = STEPS[index];
  const Visual = VISUALS[step.id];
  const go = (i: number, focus = false) => {
    const next = (i + STEPS.length) % STEPS.length;
    setIndex(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  return (
    <section
      id="how-it-works"
      aria-roledescription="carousel"
      aria-label="How Batch Studio works"
      className="scroll-mt-24 rounded-[22px] border border-blue-100 bg-[linear-gradient(180deg,#e4ebfd,#eef2fe)] p-3 sm:p-4"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1 sm:px-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink">See how Batch Studio works</h2>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-[12px] font-semibold text-blue-700">Product preview</span>
      </div>
      <div className="overflow-hidden rounded-[16px] bg-surface shadow-[var(--shadow-card)]">
        <div
          role="tablist"
          aria-label="Steps"
          className="flex overflow-x-auto border-b border-line px-2 [scrollbar-width:none] sm:justify-center sm:px-6"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(index + 1, true);
            if (e.key === "ArrowLeft") go(index - 1, true);
          }}
        >
          {STEPS.map((s, i) => {
            const active = i === index;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${i}`}
                aria-selected={active}
                aria-controls={`${id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => go(i)}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-4 text-[15px] transition-colors sm:px-5",
                  active ? "font-semibold text-blue-700" : "text-ink-3 hover:text-ink",
                )}
              >
                <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                {s.label}
                <span className={cn("absolute inset-x-2 bottom-0 h-[3px] rounded-full transition-colors", active ? "bg-blue" : "bg-transparent")} aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-roledescription="slide"
          aria-labelledby={`${id}-tab-${index}`}
          aria-live={playing ? "off" : "polite"}
          className="px-4 pb-4 pt-5 sm:px-6"
        >
          <div key={step.id} className="animate-fade-in sm:min-h-[300px]">
            <Visual />
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[30px]">{step.title}</p>
              <p className="mt-1 text-[15px] text-ink-3">{step.text}</p>
            </div>
            <p className="shrink-0 text-[15px] tabular-nums text-muted" aria-hidden="true">
              <span className="font-semibold text-blue-700">{String(index + 1).padStart(2, "0")}</span> / {String(STEPS.length).padStart(2, "0")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-3 sm:px-6">
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous step" className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-ink hover:bg-paper">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="hidden text-[13px] italic text-muted sm:inline">Illustrative preview with sample images</span>
          <div className="mx-auto flex items-center gap-2">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show step ${i + 1}: ${s.label}`}
                aria-current={i === index ? "step" : undefined}
                className={cn("size-2.5 rounded-full transition-all", i === index ? "w-6 bg-blue" : "bg-line-strong hover:bg-subtle")}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPaused(!paused)}
            disabled={reduceMotion}
            aria-label={paused || reduceMotion ? "Play the walkthrough" : "Pause the walkthrough"}
            title={reduceMotion ? "Autoplay is off because your device asks for reduced motion" : undefined}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-ink hover:bg-paper disabled:opacity-40"
          >
            {paused || reduceMotion ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next step" className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-ink hover:bg-paper">
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
