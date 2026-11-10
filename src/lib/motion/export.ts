"use client";

/**
 * Export: renders every frame at its exact timestamp with the same renderer
 * as the viewer, encodes with the browser's own encoders (WebCodecs) and
 * writes the file with Mediabunny. Nothing leaves this device.
 *
 * What's offered depends on what this browser can actually encode, checked
 * before export: MP4 is H.264 video (with AAC sound where the browser can
 * encode AAC, otherwise Opus, and the label says so); WebM is VP9 (or VP8)
 * with Opus. A file is only offered for download after the encoder has
 * finished and the file is complete.
 */

import { AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, ALL_FORMATS, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_VERY_HIGH, WebMOutputFormat, canEncodeAudio, canEncodeVideo, type AudioCodec, type VideoCodec } from "mediabunny";
import { drawWatermark } from "@/lib/editor/watermark";
import { applyPolicySize, type ExportPolicy } from "@/lib/plan-policy";
import { context2d, makeCanvas } from "@/lib/scene/backdrops";
import type { Drawable } from "@/lib/scene/draw";
import { ensureFonts, fontFamilies } from "@/lib/scene/fonts";
import { assetImage, loadAssetImages } from "@/lib/scene/resources";
import { mixdown, SAMPLE_RATE } from "./audio";
import { mediaBlob } from "./media";
import { outputSize, type ExportContainer, type ExportQuality, type ExportResolution, type Film, type FrameRate } from "./model";
import { validateFilm } from "./ops";
import { filmAssets, renderFrame, videoNeeds } from "./render";
import { filmDuration } from "./time";

export class ExportError extends Error {}

export interface Encoding {
  container: ExportContainer;
  video: VideoCodec;
  audio: AudioCodec | null;
  /** What the file contains, in words. */
  label: string;
  note: string | null;
}

/** What this browser can export at this size and frame rate. */
export async function exportOptions(width: number, height: number, fps: number): Promise<Encoding[]> {
  if (typeof VideoEncoder === "undefined") return [];
  const video = async (codec: VideoCodec) => canEncodeVideo(codec, { width, height, frameRate: fps }).catch(() => false);
  const audio = async (codec: AudioCodec) => canEncodeAudio(codec, { numberOfChannels: 2, sampleRate: SAMPLE_RATE }).catch(() => false);
  const [avc, vp9, vp8, aac, opus] = await Promise.all([video("avc"), video("vp9"), video("vp8"), audio("aac"), audio("opus")]);
  const out: Encoding[] = [];
  if (avc) {
    const a: AudioCodec | null = aac ? "aac" : opus ? "opus" : null;
    out.push({
      container: "mp4",
      video: "avc",
      audio: a,
      label: `MP4 · H.264${a === "aac" ? " + AAC" : a === "opus" ? " + Opus" : ""}`,
      note: a === "opus" ? "This browser can't encode AAC, so sound is Opus. Browsers, VLC and most editors play it; some players (such as QuickTime) don't. Export without sound, or use Chrome on macOS or Windows, for AAC." : null,
    });
  }
  const webmVideo: VideoCodec | null = vp9 ? "vp9" : vp8 ? "vp8" : null;
  if (webmVideo) out.push({ container: "webm", video: webmVideo, audio: opus ? "opus" : null, label: `WebM · ${webmVideo.toUpperCase()}${opus ? " + Opus" : ""}`, note: null });
  return out;
}

const QUALITY = { standard: QUALITY_MEDIUM, high: QUALITY_HIGH, max: QUALITY_VERY_HIGH } as const;

export interface ExportRequest {
  film: Film;
  encoding: Encoding;
  resolution: ExportResolution;
  quality: ExportQuality;
  includeAudio: boolean;
  fileName: string;
  /** The plan's rules: Free exports carry the watermark and are capped in size, like every other ISOLA export. */
  policy: ExportPolicy;
}

/** The pixel size an export will have, after the plan's limit (always even, as encoders require). */
export function exportSize(film: Pick<Film, "aspect">, resolution: ExportResolution, policy: ExportPolicy) {
  const full = outputSize(film.aspect, resolution);
  const capped = applyPolicySize(full.width, full.height, policy);
  return { width: Math.max(2, Math.floor(capped.width / 2) * 2), height: Math.max(2, Math.floor(capped.height / 2) * 2) };
}

export interface ExportProgress {
  phase: "preparing" | "mixing" | "rendering" | "finishing";
  /** 0..1, measured from frames encoded. */
  done: number;
  frame: number;
  frames: number;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  fps: FrameRate;
  duration: number;
  label: string;
  hasAudio: boolean;
}

export function safeName(name: string, ext: string) {
  const stem = name.trim().replace(/\.(mp4|webm|mov)$/i, "").replace(/[^\p{L}\p{N}\-_ .]+/gu, "").replace(/\s+/g, "-").slice(0, 80) || "isola-film";
  return `${stem}.${ext}`;
}

/** Render and encode a film. Throws ExportError with a plain reason; an aborted signal cancels cleanly. */
export async function exportFilm(req: ExportRequest, onProgress: (p: ExportProgress) => void, signal: AbortSignal): Promise<ExportResult> {
  const { film, encoding } = req;
  const problems = validateFilm(film);
  if (problems.length) throw new ExportError(problems[0]);
  const { width: W, height: H } = exportSize(film, req.resolution, req.policy);
  const fps = film.fps;
  const duration = filmDuration(film);
  const frames = Math.max(1, Math.round(duration * fps));
  onProgress({ phase: "preparing", done: 0, frame: 0, frames });

  // Everything the film draws must be here: no silent gaps in the export.
  const { images, videos } = filmAssets(film);
  await loadAssetImages(images);
  const missingImages = images.filter((id) => !assetImage(id));
  if (missingImages.length) throw new ExportError(`${missingImages.length} image${missingImages.length === 1 ? " is" : "s are"} missing from this browser's library. Replace or remove ${missingImages.length === 1 ? "it" : "them"} first (marked “Missing” in the timeline).`);
  const texts = film.clips.flatMap((c) => (c.source.kind === "text" ? [{ font: c.source.style.font, weight: c.source.style.weight }] : []));
  await ensureFonts(texts);
  const fonts = fontFamilies();

  // Video decoding: one sink per file, frames fetched in film order.
  const sinks = new Map<string, CanvasSink>();
  const inputs: Input[] = [];
  for (const id of videos) {
    const blob = await mediaBlob(id);
    if (!blob) throw new ExportError(`A video (${film.media.find((m) => m.id === id)?.name ?? "unknown"}) is missing from this browser. Relink it in Media first.`);
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    inputs.push(input);
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new ExportError(`This browser can't decode ${film.media.find((m) => m.id === id)?.name ?? "a video"}.`);
    sinks.set(id, new CanvasSink(track, { poolSize: 0 }));
  }

  let audio: AudioBuffer | null = null;
  if (req.includeAudio && encoding.audio) {
    onProgress({ phase: "mixing", done: 0, frame: 0, frames });
    audio = await mixdown(film);
  }
  if (signal.aborted) throw new DOMException("Export cancelled.", "AbortError");

  const canvas = makeCanvas(W, H);
  const ctx = context2d(canvas);
  const output = new Output({
    format: encoding.container === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, { codec: encoding.video, quality: QUALITY[req.quality], keyFrameInterval: 2 });
  output.addVideoTrack(videoSource, { frameRate: fps });
  const audioSource = audio && encoding.audio ? new AudioBufferSource({ codec: encoding.audio, quality: QUALITY[req.quality] }) : null;
  if (audioSource) output.addAudioTrack(audioSource);
  const cleanup = () => inputs.forEach((i) => i.dispose?.());
  try {
    await output.start();
    let audioSent = 0;
    const sendAudio = async (until: number) => {
      if (!audio || !audioSource) return;
      const to = Math.min(audio.length, Math.round(until * SAMPLE_RATE));
      if (to <= audioSent) return;
      const chunk = new AudioBuffer({ length: to - audioSent, numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate });
      for (let ch = 0; ch < audio.numberOfChannels; ch++) chunk.copyToChannel(audio.getChannelData(ch).subarray(audioSent, to), ch);
      audioSent = to;
      await audioSource.add(chunk);
    };
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new DOMException("Export cancelled.", "AbortError");
      const t = i / fps;
      // Decode the video frames this film frame needs, then draw.
      const needs = videoNeeds(film, t);
      const frameMap = new Map<string, Drawable>();
      for (const n of needs) {
        const sink = sinks.get(n.mediaId);
        const wrapped = sink ? await sink.getCanvas(Math.max(0, n.time)) : null;
        if (wrapped) frameMap.set(`${n.mediaId}@${n.time.toFixed(4)}`, wrapped.canvas as Drawable);
      }
      renderFrame(ctx, film, t, W, H, {
        image: assetImage,
        video: (id, time) => frameMap.get(`${id}@${time.toFixed(4)}`) ?? null,
        fonts,
      });
      if (req.policy.watermark) drawWatermark(ctx, W, H);
      await videoSource.add(t, 1 / fps);
      if (i % fps === 0) await sendAudio(t + 1);
      onProgress({ phase: "rendering", done: (i + 1) / frames, frame: i + 1, frames });
    }
    await sendAudio(duration + 1);
    videoSource.close();
    audioSource?.close();
    onProgress({ phase: "finishing", done: 1, frame: frames, frames });
    await output.finalize();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) throw new ExportError("The encoder didn't produce a file.");
    const ext = encoding.container;
    return {
      blob: new Blob([buffer], { type: ext === "mp4" ? "video/mp4" : "video/webm" }),
      fileName: safeName(req.fileName || film.name, ext),
      width: W,
      height: H,
      fps,
      duration,
      label: encoding.label,
      hasAudio: !!audioSource,
    };
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => undefined);
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (error instanceof ExportError) throw error;
    throw new ExportError(error instanceof Error ? `The export stopped: ${error.message}` : "The export stopped unexpectedly.");
  } finally {
    cleanup();
  }
}
