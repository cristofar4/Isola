"use client";

import { useEffect, useRef } from "react";
import { fontFamilies } from "@/lib/scene/fonts";
import { assetImage, loadAssetImages, onImagesChanged } from "@/lib/scene/resources";
import { ASPECTS, type Film } from "@/lib/motion/model";
import { filmAssets, renderFrame } from "@/lib/motion/render";
import { filmDuration } from "@/lib/motion/time";
import { cn } from "@/lib/cn";

/**
 * A live preview of a film (a motion style applied to your own layers),
 * drawn by the same renderer as the viewer and the export. It loops while
 * `playing`; otherwise it shows one representative frame.
 */
export function FilmPreview({ film, playing, className, label, still = 0.55 }: { film: Film; playing: boolean; className?: string; label: string; still?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    void loadAssetImages(filmAssets(film).images);
  }, [film]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = ASPECTS[film.aspect];
    const scale = Math.min(1, 360 / Math.max(width, height)) * Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(width * scale));
    const H = Math.max(2, Math.round(height * scale));
    canvas.width = W;
    canvas.height = H;
    const fonts = fontFamilies();
    const res = { image: assetImage, video: () => null, fonts };
    const D = filmDuration(film);
    let raf = 0;
    let t0 = performance.now();
    const draw = (t: number) => renderFrame(ctx, film, t, W, H, res, { showMissing: true });
    const loop = (now: number) => {
      draw(((now - t0) / 1000) % Math.max(0.1, D));
      raf = requestAnimationFrame(loop);
    };
    if (playing) {
      t0 = performance.now();
      raf = requestAnimationFrame(loop);
    } else draw(D * still);
    const off = onImagesChanged(() => {
      if (!playing) draw(D * still);
    });
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, [film, playing, still]);
  return <canvas ref={ref} role="img" aria-label={label} className={cn("block h-auto w-full bg-black", className)} />;
}
