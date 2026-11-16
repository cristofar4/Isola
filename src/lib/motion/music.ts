/**
 * Music made by ISOLA: short instrumental beds composed and mixed in the
 * browser from code (oscillators, filtered noise and a generated reverb),
 * rendered with an OfflineAudioContext and saved as a WAV file. There are no
 * third-party recordings in them, so there's nothing to license. The same
 * style, length and variation always give the same track.
 */

export type MusicId = "calm-pad" | "lofi" | "uplift" | "minimal" | "luxe";

export interface MusicStyle {
  id: MusicId;
  name: string;
  mood: string;
  bpm: number;
  /** Which kinds of film it suits (shown as chips). */
  tags: string[];
}

export const MUSIC: MusicStyle[] = [
  { id: "calm-pad", name: "Calm pad", mood: "Slow, warm chords with a soft arpeggio", bpm: 70, tags: ["Calm", "Skincare"] },
  { id: "lofi", name: "Lo-fi pulse", mood: "Laid-back keys and a soft, swung beat", bpm: 84, tags: ["Social", "Everyday"] },
  { id: "uplift", name: "Uplift", mood: "Bright plucks over a steady four-on-the-floor", bpm: 116, tags: ["Launch", "Energetic"] },
  { id: "minimal", name: "Minimal pluck", mood: "Sparse mallet notes and a light shaker", bpm: 96, tags: ["Minimal", "Product"] },
  { id: "luxe", name: "Luxe ambient", mood: "Lush pads and slow bell tones", bpm: 60, tags: ["Luxury", "Cinematic"] },
];

const SR = 44100;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Chord progressions as MIDI notes (root position voicings around middle C), one chord per bar pair. */
const PROGRESSIONS: Record<MusicId, number[][]> = {
  // Cmaj7 – Am7 – Fmaj7 – G6
  "calm-pad": [
    [48, 55, 59, 64],
    [45, 52, 55, 60],
    [41, 48, 52, 57],
    [43, 50, 52, 59],
  ],
  // Am7 – Dm7 – G7 – Cmaj7
  lofi: [
    [45, 55, 60, 64],
    [50, 57, 60, 65],
    [43, 53, 59, 62],
    [48, 55, 59, 64],
  ],
  // G – D – Em – C
  uplift: [
    [43, 55, 59, 62],
    [50, 54, 57, 62],
    [40, 55, 59, 64],
    [48, 55, 60, 64],
  ],
  // Dm – Bb – F – C
  minimal: [
    [50, 57, 62, 65],
    [46, 53, 58, 62],
    [41, 53, 57, 60],
    [48, 55, 60, 64],
  ],
  // Ebmaj9 – Cm9 – Abmaj7 – Bb6
  luxe: [
    [39, 55, 58, 62, 65],
    [36, 55, 58, 62, 63],
    [44, 55, 60, 63, 67],
    [46, 53, 55, 62, 65],
  ],
};

interface Kit {
  ctx: OfflineAudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

function envelope(ctx: BaseAudioContext, at: number, attack: number, hold: number, release: number, peak: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, at + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
  return g;
}

/** A sustained, slightly detuned and filtered chord voice. */
function padVoice(k: Kit, midi: number, at: number, length: number, level: number, cutoff = 1400) {
  const { ctx } = k;
  const env = envelope(ctx, at, Math.min(1.4, length * 0.3), Math.max(0, length - 1.4), 1.8, level);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  filter.Q.value = 0.6;
  for (const detune of [-7, 6]) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = hz(midi);
    o.detune.value = detune;
    o.connect(filter);
    o.start(at);
    o.stop(at + length + 2);
  }
  filter.connect(env).connect(k.out);
}

/** A short plucked note (keys, mallets, synth pluck). */
function pluck(k: Kit, midi: number, at: number, level: number, decay: number, type: OscillatorType, cutoff: number) {
  const { ctx } = k;
  const env = envelope(ctx, at, 0.004, 0.01, decay, level);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.25), at + decay);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = hz(midi);
  o.connect(filter).connect(env).connect(k.out);
  o.start(at);
  o.stop(at + decay + 0.1);
}

/** A bell: a sine with a slightly inharmonic overtone and a long tail. */
function bell(k: Kit, midi: number, at: number, level: number) {
  const { ctx } = k;
  for (const [ratio, amp, decay] of [
    [1, 1, 3.2],
    [2.76, 0.28, 1.4],
    [5.4, 0.1, 0.7],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz(midi) * ratio;
    const env = envelope(ctx, at, 0.006, 0, decay, level * amp);
    o.connect(env).connect(k.out);
    o.start(at);
    o.stop(at + decay + 0.1);
  }
}

function bass(k: Kit, midi: number, at: number, length: number, level: number) {
  const { ctx } = k;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = hz(midi);
  const env = envelope(ctx, at, 0.02, Math.max(0, length - 0.15), 0.18, level);
  o.connect(env).connect(k.out);
  o.start(at);
  o.stop(at + length + 0.3);
}

function kick(k: Kit, at: number, level: number) {
  const { ctx } = k;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(130, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.14);
  const env = envelope(ctx, at, 0.002, 0.02, 0.32, level);
  o.connect(env).connect(k.out);
  o.start(at);
  o.stop(at + 0.4);
}

function noiseHit(k: Kit, at: number, level: number, decay: number, type: BiquadFilterType, freq: number) {
  const { ctx } = k;
  const src = ctx.createBufferSource();
  src.buffer = k.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = type === "bandpass" ? 0.9 : 0.7;
  const env = envelope(ctx, at, 0.001, 0.005, decay, level);
  src.connect(filter).connect(env).connect(k.out);
  // Start somewhere different in the noise each hit, but the same every render.
  src.start(at, (at * 7.31) % 0.5);
  src.stop(at + decay + 0.05);
}

function snare(k: Kit, at: number, level: number) {
  noiseHit(k, at, level, 0.16, "bandpass", 1900);
  const { ctx } = k;
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.setValueAtTime(220, at);
  o.frequency.exponentialRampToValueAtTime(140, at + 0.08);
  const env = envelope(ctx, at, 0.001, 0.01, 0.09, level * 0.5);
  o.connect(env).connect(k.out);
  o.start(at);
  o.stop(at + 0.15);
}

/** A soft room: a stereo impulse of decaying noise, made from the seed. */
function impulse(ctx: BaseAudioContext, seconds: number, seed: number) {
  const rand = mulberry32(seed);
  const length = Math.floor(SR * seconds);
  const buffer = ctx.createBuffer(2, length, SR);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (rand() * 2 - 1) * Math.pow(1 - i / length, 3.2);
  }
  return buffer;
}

function whiteNoise(ctx: BaseAudioContext, seed: number) {
  const rand = mulberry32(seed);
  const buffer = ctx.createBuffer(1, SR, SR);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  return buffer;
}

/** Render one style to an AudioBuffer of `seconds` (5–120). `variation` picks a different arrangement of the same style. */
export async function renderMusic(id: MusicId, seconds: number, variation = 0): Promise<AudioBuffer> {
  const style = MUSIC.find((m) => m.id === id) ?? MUSIC[0];
  const length = Math.min(120, Math.max(5, seconds));
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * length), SR);
  const rand = mulberry32(1000 + MUSIC.indexOf(style) * 97 + variation * 7919);

  // Mix: instruments → dry + reverb → glue compressor → master fade.
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.9, 0.4);
  master.gain.setValueAtTime(0.9, Math.max(0.5, length - 2.2));
  master.gain.linearRampToValueAtTime(0, length);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  const bus = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = id === "luxe" || id === "calm-pad" ? 0.38 : 0.2;
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, id === "luxe" ? 3.4 : 2.2, 77 + variation);
  bus.connect(comp);
  bus.connect(verb).connect(wet).connect(comp);
  comp.connect(master).connect(ctx.destination);
  const kit: Kit = { ctx, out: bus, noise: whiteNoise(ctx, 5 + variation) };

  const beat = 60 / style.bpm;
  const bar = beat * 4;
  const chords = PROGRESSIONS[style.id];
  const barsPerChord = style.bpm < 80 ? 1 : 2;
  const chordLength = bar * barsPerChord;
  const offset = variation % chords.length;
  for (let t = 0, n = 0; t < length; t += chordLength, n++) {
    const chord = chords[(n + offset) % chords.length];
    const root = chord[0];
    const tones = chord.slice(1);
    switch (style.id) {
      case "calm-pad": {
        for (const m of tones) padVoice(kit, m, t, chordLength, 0.045, 1300);
        bass(kit, root - 12, t, chordLength * 0.95, 0.22);
        for (let s = 0; s < chordLength / (beat / 2); s++) {
          if (rand() < 0.55) pluck(kit, tones[Math.floor(rand() * tones.length)] + 12, t + s * (beat / 2), 0.05, 0.9, "triangle", 2600);
        }
        break;
      }
      case "lofi": {
        for (const at of [0, beat * 1.5, bar, bar + beat * 2.5]) {
          if (at < chordLength) for (const m of tones) pluck(kit, m, t + at, 0.06, 1.3, "triangle", 1800);
        }
        bass(kit, root - 12, t, beat * 1.4, 0.24);
        bass(kit, root - 12, t + bar, beat * 1.4, 0.22);
        for (let b = 0; b < chordLength / beat; b++) {
          const at = t + b * beat;
          if (b % 4 === 0) kick(kit, at, 0.55);
          if (b % 4 === 2) kick(kit, at + beat * 0.5, 0.4);
          if (b % 2 === 1) snare(kit, at, 0.18);
          noiseHit(kit, at, 0.06, 0.05, "highpass", 7000);
          noiseHit(kit, at + beat * 0.58, 0.035, 0.04, "highpass", 7500);
        }
        if (rand() < 0.6) pluck(kit, tones[tones.length - 1] + 12, t + beat * 3, 0.04, 1.6, "sine", 3000);
        break;
      }
      case "uplift": {
        for (const m of tones) padVoice(kit, m, t, chordLength, 0.028, 1800);
        const arp = [...tones, tones[1] + 12];
        for (let s = 0; s < chordLength / (beat / 4); s++) {
          pluck(kit, arp[s % arp.length] + 12, t + s * (beat / 4), s % 4 === 0 ? 0.06 : 0.04, 0.22, "sawtooth", 3200);
        }
        for (let b = 0; b < chordLength / beat; b++) {
          const at = t + b * beat;
          kick(kit, at, 0.6);
          bass(kit, root - 12, at + beat / 2, beat * 0.42, 0.2);
          if (b % 2 === 1) snare(kit, at, 0.22);
          noiseHit(kit, at + beat / 2, 0.05, 0.06, "highpass", 8000);
        }
        break;
      }
      case "minimal": {
        for (let s = 0; s < chordLength / (beat / 2); s++) {
          if (s === 0 || rand() < 0.38) {
            const m = tones[Math.floor(rand() * tones.length)] + (rand() < 0.3 ? 12 : 0);
            pluck(kit, m, t + s * (beat / 2), 0.075, 0.6, "sine", 4000);
            pluck(kit, m + 12, t + s * (beat / 2), 0.02, 0.25, "sine", 6000);
          }
        }
        bass(kit, root - 12, t, chordLength * 0.9, 0.16);
        for (let b = 0; b < chordLength / beat; b++) {
          const at = t + b * beat;
          if (b % 4 === 0) kick(kit, at, 0.42);
          noiseHit(kit, at + beat / 2, 0.04, 0.07, "bandpass", 6000);
        }
        break;
      }
      case "luxe": {
        for (const m of tones) padVoice(kit, m, t, chordLength, 0.04, 1100);
        bass(kit, root - 12, t, chordLength * 0.95, 0.18);
        for (let b = 0; b < chordLength / beat; b++) {
          if (rand() < 0.35) bell(kit, tones[Math.floor(rand() * tones.length)] + 12, t + b * beat + (rand() < 0.5 ? beat / 2 : 0), 0.05);
        }
        break;
      }
    }
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV from an AudioBuffer. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view.buffer], { type: "audio/wav" });
}

/** A ready-to-import WAV file of one style. */
export async function musicFile(id: MusicId, seconds: number, variation = 0): Promise<File> {
  const style = MUSIC.find((m) => m.id === id) ?? MUSIC[0];
  const buffer = await renderMusic(id, seconds, variation);
  return new File([encodeWav(buffer)], `${style.name}${variation ? ` ${variation + 1}` : ""} (ISOLA).wav`, { type: "audio/wav" });
}
