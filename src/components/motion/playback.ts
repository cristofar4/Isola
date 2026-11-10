"use client";

import { useEffect, useRef } from "react";
import type { Drawable } from "@/lib/scene/draw";
import { fontFamilies } from "@/lib/scene/fonts";
import { assetImage } from "@/lib/scene/resources";
import { FilmAudio, audibleClips, loadFilmAudio } from "@/lib/motion/audio";
import { useEditor } from "@/lib/motion/editor";
import { mediaBlob } from "@/lib/motion/media";
import type { FilmResources } from "@/lib/motion/render";
import { filmDuration } from "@/lib/motion/time";

/* --------------------------------------------------------- preview video --- */

/**
 * Video in the viewer: one muted <video> per file, kept on the project
 * clock (sound comes from the audio engine). Exports decode frames exactly
 * with Mediabunny instead, so a late preview frame never reaches a file.
 */
const videos = new Map<string, HTMLVideoElement>();
const loading = new Set<string>();
const listeners = new Set<() => void>();
export const missingVideos = new Set<string>();

export function onVideoFrame(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function ensureVideo(id: string) {
  if (videos.has(id) || loading.has(id) || missingVideos.has(id)) return;
  loading.add(id);
  void mediaBlob(id).then((blob) => {
    loading.delete(id);
    if (!blob) {
      missingVideos.add(id);
      listeners.forEach((l) => l());
      return;
    }
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = URL.createObjectURL(blob);
    const ping = () => listeners.forEach((l) => l());
    v.addEventListener("loadeddata", ping);
    v.addEventListener("seeked", ping);
    videos.set(id, v);
  });
}

export function pauseVideos() {
  videos.forEach((v) => v.pause());
}

function videoAt(id: string, time: number, playing: boolean): Drawable | null {
  ensureVideo(id);
  const v = videos.get(id);
  if (!v) return null;
  const t = Math.max(0, Math.min(time, (v.duration || time + 1) - 0.01));
  if (playing) {
    if (v.paused) {
      v.currentTime = t;
      void v.play().catch(() => undefined);
    } else if (Math.abs(v.currentTime - t) > 0.25) v.currentTime = t;
  } else {
    if (!v.paused) v.pause();
    if (Math.abs(v.currentTime - t) > 1 / 120 && !v.seeking) v.currentTime = t;
  }
  return v.readyState >= 2 ? Object.assign(v, { width: v.videoWidth, height: v.videoHeight }) : null;
}

/** Resources for drawing a frame in the viewer. */
export function previewResources(playing: boolean): FilmResources {
  return { image: assetImage, video: (id, time) => videoAt(id, time, playing), fonts: fontFamilies() };
}

/* -------------------------------------------------------------- playback --- */

export const filmAudio = typeof window !== "undefined" ? new FilmAudio() : null;

/**
 * Plays the film: the playhead follows the audio clock when there's sound
 * (so picture and sound stay together), otherwise the system clock.
 */
export function usePlayback() {
  const playing = useEditor((s) => s.playing);
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const st = useEditor.getState();
    const film = st.film;
    if (!film) return;
    let alive = true;
    const D = filmDuration(film);
    let from = st.playhead >= D - 1e-3 ? 0 : st.playhead;
    let clock: () => number = () => from;
    const start = async () => {
      const hasSound = audibleClips(film).length > 0 && !!filmAudio?.available;
      if (hasSound) {
        const buffers = await loadFilmAudio(film);
        if (!alive) return;
        await filmAudio!.play(film, from, buffers);
        clock = () => filmAudio!.time();
      } else {
        const t0 = performance.now();
        clock = () => from + (performance.now() - t0) / 1000;
      }
      const tick = () => {
        if (!alive) return;
        const { loop } = useEditor.getState();
        let t = clock();
        if (t >= D) {
          if (loop) {
            from = 0;
            void start();
            return;
          }
          t = D;
          useEditor.setState({ playhead: D, playing: false });
          return;
        }
        useEditor.setState({ playhead: t });
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    };
    void start();
    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
      filmAudio?.stop();
      pauseVideos();
    };
  }, [playing]);
}

export function togglePlay() {
  const st = useEditor.getState();
  if (!st.film) return;
  useEditor.setState({ playing: !st.playing });
}
