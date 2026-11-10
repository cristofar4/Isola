"use client";

/**
 * Sound in Motion Studio. The same scheduling code plays the film live (on
 * the AudioContext's clock, which is also the project clock while playing,
 * so picture and sound stay together) and renders the export mix in an
 * OfflineAudioContext. Meters read the actual signal.
 */

import { decodedAudio, sharedAudioContext } from "./media";
import type { Clip, Film } from "./model";
import { clipRange, filmDuration } from "./time";

export const SAMPLE_RATE = 48000;
export const dbToGain = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20));

/** Sound clips that are heard: muted tracks are silent, and if any track is solo only solo tracks play. */
export function audibleClips(film: Film): Clip[] {
  const audioTracks = film.tracks.filter((t) => t.kind === "audio");
  const solo = audioTracks.some((t) => t.solo);
  const heard = new Set(audioTracks.filter((t) => !t.muted && (!solo || t.solo)).map((t) => t.id));
  return film.clips.filter((c) => c.source.kind === "audio" && heard.has(c.trackId));
}

/**
 * Schedule every audible clip from film time `from` onwards, starting at
 * context time `when`, into `dest`. Returns the sources (to stop them).
 */
export function scheduleAudio(ctx: BaseAudioContext, dest: AudioNode, film: Film, buffers: Map<string, AudioBuffer>, from: number, when: number) {
  const end = filmDuration(film);
  const sources: AudioBufferSourceNode[] = [];
  for (const clip of audibleClips(film)) {
    if (clip.source.kind !== "audio") continue;
    const buffer = buffers.get(clip.source.mediaId);
    if (!buffer) continue;
    const r = clipRange(film, clip);
    const stop = Math.min(r.end, end);
    if (stop <= from) continue;
    const begin = Math.max(r.start, from);
    const offset = clip.source.in + (begin - r.start);
    if (offset >= buffer.duration) continue;
    const length = Math.min(stop - begin, buffer.duration - offset);
    const at = when + (begin - from);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const base = dbToGain(clip.audio?.gain ?? 0);
    const fadeIn = Math.min(clip.audio?.fadeIn ?? 0, r.end - r.start);
    const fadeOut = Math.min(clip.audio?.fadeOut ?? 0, r.end - r.start);
    // Gain at film time t inside the clip (fades are linear).
    const gainAt = (t: number) => {
      let v = base;
      if (fadeIn > 0 && t < r.start + fadeIn) v *= Math.max(0, (t - r.start) / fadeIn);
      if (fadeOut > 0 && t > r.end - fadeOut) v *= Math.max(0, (r.end - t) / fadeOut);
      return v;
    };
    const ctxTime = (t: number) => when + (t - from);
    g.gain.setValueAtTime(gainAt(begin), at);
    if (fadeIn > 0 && begin < r.start + fadeIn) g.gain.linearRampToValueAtTime(base, ctxTime(r.start + fadeIn));
    if (fadeOut > 0) {
      const fadeStart = Math.max(begin, r.end - fadeOut);
      g.gain.setValueAtTime(gainAt(fadeStart), ctxTime(fadeStart));
      g.gain.linearRampToValueAtTime(0, ctxTime(r.end));
    }
    src.connect(g).connect(dest);
    src.start(at, offset, length);
    sources.push(src);
  }
  return sources;
}

/** Decode the sound a film needs (the media files behind audible clips). Missing or undecodable files are left out. */
export async function loadFilmAudio(film: Film) {
  const ids = [...new Set(audibleClips(film).map((c) => (c.source.kind === "audio" ? c.source.mediaId : "")).filter(Boolean))];
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    ids.map(async (id) => {
      const b = await decodedAudio(id);
      if (b) buffers.set(id, b);
    }),
  );
  return buffers;
}

/** Mix the film's sound for export: stereo, 48 kHz, master gain applied. Null when nothing is audible. */
export async function mixdown(film: Film): Promise<AudioBuffer | null> {
  if (!audibleClips(film).length || typeof OfflineAudioContext === "undefined") return null;
  const buffers = await loadFilmAudio(film);
  if (!buffers.size) return null;
  const length = Math.max(1, Math.ceil(filmDuration(film) * SAMPLE_RATE));
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: SAMPLE_RATE });
  const master = ctx.createGain();
  master.gain.value = dbToGain(film.masterGain);
  master.connect(ctx.destination);
  scheduleAudio(ctx, master, film, buffers, 0, 0);
  return ctx.startRendering();
}

export interface Meter {
  peak: number;
  rms: number;
}

/** Live playback with real meters. */
export class FilmAudio {
  private ctx: AudioContext | null = sharedAudioContext();
  private master: GainNode | null = null;
  private analysers: AnalyserNode[] = [];
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0;
  private from = 0;
  private buf = new Float32Array(2048);

  get available() {
    return !!this.ctx;
  }

  private graph() {
    const ctx = this.ctx!;
    if (this.master) return this.master;
    this.master = ctx.createGain();
    const splitter = ctx.createChannelSplitter(2);
    this.analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
    this.analysers.forEach((a, i) => {
      a.fftSize = 2048;
      splitter.connect(a, i);
    });
    this.master.connect(splitter);
    this.master.connect(ctx.destination);
    return this.master;
  }

  setMaster(db: number) {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.02);
  }

  /** Start sound at film time `from`. Resolves with the clock origin once scheduled. */
  async play(film: Film, from: number, buffers: Map<string, AudioBuffer>) {
    this.stop();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume().catch(() => undefined);
    const master = this.graph();
    master.gain.value = dbToGain(film.masterGain);
    this.from = from;
    this.startedAt = ctx.currentTime + 0.06;
    this.sources = scheduleAudio(ctx, master, film, buffers, from, this.startedAt);
  }

  /** Film time now, from the audio clock (sample-accurate). */
  time() {
    if (!this.ctx) return this.from;
    return this.from + Math.max(0, this.ctx.currentTime - this.startedAt);
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    this.sources = [];
  }

  /** Left and right levels in dBFS from the master output. */
  meters(): [Meter, Meter] {
    const read = (a: AnalyserNode | undefined): Meter => {
      if (!a) return { peak: -Infinity, rms: -Infinity };
      a.getFloatTimeDomainData(this.buf);
      let peak = 0;
      let sum = 0;
      for (const v of this.buf) {
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this.buf.length);
      return { peak: peak > 0 ? 20 * Math.log10(peak) : -Infinity, rms: rms > 0 ? 20 * Math.log10(rms) : -Infinity };
    };
    return [read(this.analysers[0]), read(this.analysers[1])];
  }
}
