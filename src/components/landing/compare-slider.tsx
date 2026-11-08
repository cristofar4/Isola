"use client";

import Image from "next/image";
import { ChevronsLeftRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Accessible before/after comparison. Both layers use identical sizing and
 * object-position so they stay pixel-aligned at every breakpoint.
 */
export function CompareSlider({
  before,
  after,
  alt,
  objectPosition = "50% 30%",
  initial = 46,
  className,
  sizes = "(min-width: 1024px) 620px, 100vw",
  priority,
  caption,
}: {
  before: string;
  after: string;
  alt: string;
  objectPosition?: string;
  initial?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  caption?: React.ReactNode;
}) {
  const [position, setPosition] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  const setFromClientX = useCallback((clientX: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }, []);

  // A single gentle sweep on first view hints that the divider moves.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now();
    const from = initial + 14;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100);
      const eased = 1 - Math.pow(1 - t, 3);
      setPosition(from + (initial - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timer = window.setTimeout(() => (raf = requestAnimationFrame(tick)), 350);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [initial]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setFromClientX(event.clientX);
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 2;
    const next =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? position - step
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? position + step
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? 100
              : event.key === "PageDown"
                ? position - 20
                : event.key === "PageUp"
                  ? position + 20
                  : null;
    if (next === null) return;
    event.preventDefault();
    setPosition(Math.min(100, Math.max(0, next)));
  }

  return (
    <div
      ref={frame}
      className={cn("group relative select-none overflow-hidden rounded-[18px] bg-paper-2 touch-pan-y", className)}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => dragging && setFromClientX(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <Image src={before} alt={`${alt} — original`} fill priority={priority} sizes={sizes} className="object-cover" style={{ objectPosition }} draggable={false} />
      <div
        className="checkerboard absolute inset-0"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        aria-hidden="true"
      >
        <Image src={after} alt="" fill priority={priority} sizes={sizes} className="object-cover" style={{ objectPosition }} draggable={false} />
      </div>

      <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[13px] font-semibold text-ink shadow-sm">
        Original
      </span>
      <span className="pointer-events-none absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[13px] font-semibold text-ink shadow-sm">
        Removed
      </span>
      {caption && <div className="pointer-events-none absolute bottom-4 right-4 text-right">{caption}</div>}

      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-blue"
        style={{ left: `${position}%` }}
        aria-hidden="true"
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label="Comparison divider: drag to compare the original and the result"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`${Math.round(position)}% original visible`}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute top-1/2 inline-flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-blue text-white shadow-[var(--shadow-blue)] transition-transform duration-150",
          dragging ? "scale-110" : "group-hover:scale-105",
        )}
        style={{ left: `${position}%` }}
      >
        <ChevronsLeftRight className="size-5" aria-hidden="true" />
      </div>
    </div>
  );
}
