"use client";

/**
 * Video and sound for Motion Studio. Files are checked with Mediabunny (the
 * container, the codec and whether this browser can decode it), stored in
 * this browser's library database, and decoded on this device. Nothing is
 * uploaded. Images go to the asset library instead, so they can be reused.
 */

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import * as db from "@/lib/studio/library-db";
import { uid, type MediaItem } from "./model";

export const MEDIA_LIMITS = { videoBytes: 400 * 1024 * 1024, audioBytes: 120 * 1024 * 1024, maxDuration: 600 };
export const MEDIA_ACCEPT = "video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/x-wav,audio/wave,audio/mp4,audio/aac,audio/x-m4a,audio/ogg,audio/webm,audio/flac,.mp4,.m4v,.mov,.webm,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac";

export const mediaKey = (id: string) => `media:${id}`;

export class MediaError extends Error {}

function kindOf(file: File): "video" | "audio" | "image" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "m4v", "mov", "webm", "mkv"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "oga", "opus", "flac"].includes(ext)) return "audio";
  if (["png", "jpg", "jpeg", "webp", "svg"].includes(ext)) return "image";
  return null;
}

/** Tell images (for the asset library) from video and sound (for Motion Studio). */
export function classify(files: File[]) {
  const images: File[] = [];
  const media: File[] = [];
  const rejected: Array<{ name: string; message: string }> = [];
  for (const f of files) {
    const k = kindOf(f);
    if (k === "image") images.push(f);
    else if (k) media.push(f);
    else rejected.push({ name: f.name, message: "isn't an image, video or sound file ISOLA can use." });
  }
  return { images, media, rejected };
}

let audioCtx: AudioContext | null = null;
export function sharedAudioContext() {
  if (!audioCtx && typeof AudioContext !== "undefined") audioCtx = new AudioContext({ latencyHint: "interactive" });
  return audioCtx;
}

/** About 1,000 peak values (0..1) across the whole sound, for drawing a waveform. */
export function computePeaks(buffer: AudioBuffer, points = 1000): number[] {
  const len = buffer.length;
  const step = Math.max(1, Math.floor(len / points));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const out: number[] = [];
  for (let p = 0; p < points; p++) {
    const from = p * step;
    if (from >= len) break;
    const to = Math.min(len, from + step);
    let peak = 0;
    for (const ch of channels) for (let i = from; i < to; i += 4) peak = Math.max(peak, Math.abs(ch[i]));
    out.push(Math.round(Math.min(1, peak) * 1000) / 1000);
  }
  return out;
}

const decoded = new Map<string, Promise<AudioBuffer | null>>();

/** The decoded sound of a media file (cached). Null when the file has no sound or it can't be decoded here. */
export function decodedAudio(id: string): Promise<AudioBuffer | null> {
  let job = decoded.get(id);
  if (!job) {
    job = (async () => {
      const blob = await db.getBlob(mediaKey(id));
      const ctx = sharedAudioContext();
      if (!blob || !ctx) return null;
      try {
        return await ctx.decodeAudioData(await blob.arrayBuffer());
      } catch {
        return null;
      }
    })();
    decoded.set(id, job);
  }
  return job;
}

export function forgetDecoded(id: string) {
  decoded.delete(id);
}

/**
 * Check, store and describe a video or sound file. Throws a MediaError with a
 * plain explanation when the file can't be used in this browser.
 */
export async function importMedia(file: File): Promise<MediaItem> {
  const kind = kindOf(file);
  if (kind !== "video" && kind !== "audio") throw new MediaError(`${file.name} isn't a video or sound file.`);
  const limit = kind === "video" ? MEDIA_LIMITS.videoBytes : MEDIA_LIMITS.audioBytes;
  if (file.size > limit) throw new MediaError(`${file.name} is larger than ${Math.round(limit / 1024 / 1024)} MB. Shorten or compress it first.`);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  let width: number | null = null;
  let height: number | null = null;
  let duration = 0;
  let hasVideo = false;
  try {
    if (!(await input.canRead())) throw new MediaError(`${file.name}: this file format isn't supported. Use MP4 (H.264), WebM, MP3, WAV, M4A, OGG or FLAC.`);
    const video = await input.getPrimaryVideoTrack();
    if (kind === "video" && !video) throw new MediaError(`${file.name} has no video in it.`);
    if (video) {
      if (!(await video.canDecode())) {
        const codec = (await video.getCodec()) ?? "an unknown codec";
        throw new MediaError(`${file.name} uses ${String(codec).toUpperCase()} video, which this browser can't decode. Convert it to H.264 MP4 or VP9 WebM.`);
      }
      hasVideo = true;
      width = await video.getDisplayWidth();
      height = await video.getDisplayHeight();
    }
    duration = await input.computeDuration();
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(`${file.name} couldn't be read. It may be damaged, or in a format this browser doesn't support.`);
  } finally {
    input.dispose?.();
  }
  if (!(duration > 0)) throw new MediaError(`${file.name} has no playable length.`);
  if (duration > MEDIA_LIMITS.maxDuration) throw new MediaError(`${file.name} is longer than 10 minutes.`);
  const id = uid();
  // Sound: decode once for the waveform (and to know there is sound at all).
  let peaks: number[] | null = null;
  let hasAudio = false;
  const ctx = sharedAudioContext();
  if (ctx) {
    try {
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      peaks = computePeaks(buffer);
      hasAudio = buffer.length > 0;
      decoded.set(id, Promise.resolve(buffer));
    } catch {
      if (!hasVideo) throw new MediaError(`${file.name}: this browser can't decode the sound in this file. Try MP3, WAV or M4A.`);
    }
  }
  const item: MediaItem = {
    id,
    kind: hasVideo ? "video" : "audio",
    name: file.name.slice(0, 120),
    mime: file.type || (hasVideo ? "video/mp4" : "audio/mpeg"),
    bytes: file.size,
    duration,
    width,
    height,
    hasAudio,
    peaks,
    createdAt: Date.now(),
  };
  await db.write({ blobs: [[mediaKey(id), file]] });
  return item;
}

export async function mediaBlob(id: string) {
  return db.getBlob(mediaKey(id));
}

/** Which media files a film refers to are missing from this browser. */
export async function missingMedia(ids: string[]): Promise<Set<string>> {
  const keys = new Set(await db.blobKeys().catch(() => [] as string[]));
  return new Set(ids.filter((id) => !keys.has(mediaKey(id))));
}

/** Replace a missing (or any) media file with another, keeping its id so clips stay put. */
export async function relinkMedia(item: MediaItem, file: File): Promise<MediaItem> {
  const fresh = await importMedia(file);
  const blob = await db.getBlob(mediaKey(fresh.id));
  if (!blob) throw new MediaError("The new file couldn't be stored.");
  await db.write({ blobs: [[mediaKey(item.id), blob]], remove: [["blobs", mediaKey(fresh.id)]] });
  forgetDecoded(item.id);
  forgetDecoded(fresh.id);
  return { ...fresh, id: item.id };
}
