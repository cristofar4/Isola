"use client";

import { addAssets, getAsset, type Asset } from "@/lib/studio/library";
import { commit, notify, useEditor } from "@/lib/motion/editor";
import { classify, importMedia, MediaError } from "@/lib/motion/media";
import { ASPECTS, newClip, newTrack, type Clip, type Film, type MediaItem } from "@/lib/motion/model";
import { addClip } from "@/lib/motion/ops";
import { filmDuration, shotAt } from "@/lib/motion/time";
import { DEFAULT_TEXT, sanitiseText, type TextStyle } from "@/lib/scene/model";

/** Scale (height ÷ short side) at which a picture of this aspect covers the whole frame. */
export function coverScale(film: Film, aspect: number) {
  const { width: W, height: H } = ASPECTS[film.aspect];
  const S = Math.min(W, H);
  return Math.max(H, W / aspect) / S;
}

/** Put a visual clip into the shot under the playhead, on a fresh track in front (so it never collides). */
export function placeVisual(film: Film, make: (shotId: string, start: number, room: number, trackId: string) => Clip, trackName: string): Film {
  const at = shotAt(film, Math.min(useEditor.getState().playhead, Math.max(0, filmDuration(film) - 0.05)));
  const start = Math.max(0, Math.min(at.local, at.shot.duration - 0.2));
  const track = newTrack("visual", trackName.slice(0, 40));
  const withTrack: Film = { ...film, tracks: [track, ...film.tracks] };
  const r = addClip(withTrack, make(at.shot.id, start, at.shot.duration - start, track.id));
  if (r.problem) notify(r.problem, "error");
  return r.film;
}

function placeAudio(film: Film, media: MediaItem, opts: { shotId?: string; start?: number; duration?: number; name?: string } = {}): Film {
  const playhead = useEditor.getState().playhead;
  const D = filmDuration(film);
  const start = opts.start ?? (playhead >= D - 0.05 ? 0 : playhead);
  const duration = Math.max(0.1, Math.min(media.duration, opts.duration ?? (opts.shotId ? media.duration : Math.max(media.duration, 0.1))));
  const clip = newClip({ trackId: "", shotId: opts.shotId ?? null, start, duration, source: { kind: "audio", mediaId: media.id, in: 0 }, name: opts.name ?? media.name.replace(/\.[^.]+$/, "") });
  // The first audio track with room, or a new one.
  for (const t of film.tracks.filter((x) => x.kind === "audio" && !x.locked)) {
    const r = addClip(film, { ...clip, trackId: t.id });
    if (!r.problem && Math.abs((r.film.clips.at(-1)?.start ?? -1) - start) < 1e-6) return r.film;
  }
  const track = newTrack("audio", `Audio ${film.tracks.filter((x) => x.kind === "audio").length + 1}`);
  return addClip({ ...film, tracks: [...film.tracks, track] }, { ...clip, trackId: track.id }).film;
}

/** A library image as a clip: cutouts stand in the frame as products; photos fill it as backgrounds. */
export function addAssetClip(asset: Asset) {
  const film = useEditor.getState().film;
  if (!film) return;
  const aspect = asset.width / Math.max(1, asset.height);
  const product = asset.hasAlpha || asset.kind === "cutout" || asset.kind === "logo";
  const next = placeVisual(
    film,
    (shotId, start, room, trackId) =>
      newClip({
        trackId,
        shotId,
        start,
        duration: room,
        source: { kind: "image", assetId: asset.id, aspect },
        name: asset.name.replace(/\.[^.]+$/, ""),
        role: product ? (asset.kind === "logo" ? "overlay" : "product") : "background",
        depth: asset.kind === "logo" ? 0 : 1,
        transform: { x: 0.5, y: 0.5, scale: product ? (asset.kind === "logo" ? 0.14 : 0.5) : coverScale(film, aspect), rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 },
      }),
    asset.name.replace(/\.[^.]+$/, ""),
  );
  commit(next);
}

export function addTextClip(preset: "title" | "subtitle" | "caption" | "cta", brand: string[] = []) {
  const film = useEditor.getState().film;
  if (!film) return;
  const styles: Record<typeof preset, Partial<TextStyle> & { y: number; name: string }> = {
    title: { text: film.name, font: "display", weight: 700, size: 0.08, y: 0.18, name: "Title" },
    subtitle: { text: "Your subtitle", font: "sans", weight: 500, size: 0.04, y: 0.27, name: "Subtitle" },
    caption: { text: "YOUR CAPTION", font: "condensed", weight: 400, size: 0.1, uppercase: true, y: 0.82, name: "Caption" },
    cta: { text: "Shop now", font: "display", weight: 700, size: 0.06, y: 0.86, name: "Call to action", color: brand[0] ?? DEFAULT_TEXT.color },
  };
  const { y, name, ...style } = styles[preset];
  commit(
    placeVisual(
      film,
      (shotId, start, room, trackId) =>
        newClip({ trackId, shotId, start, duration: room, source: { kind: "text", style: sanitiseText({ ...DEFAULT_TEXT, ...style }), anim: { in: { kind: preset === "caption" ? "slide" : "fade", duration: 0.6 }, out: { kind: "none", duration: 0.4 }, by: "word" } }, name, role: "overlay", depth: 0, transform: { x: 0.5, y, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 } }),
      name,
    ),
  );
}

export function addEffectClip(kind: "spotlight" | "sweep" | "glow" | "solid", color = "#20292D") {
  const film = useEditor.getState().film;
  if (!film) return;
  const name = kind === "solid" ? "Solid colour" : kind === "spotlight" ? "Spotlight" : kind === "sweep" ? "Light sweep" : "Glow";
  commit(
    placeVisual(
      film,
      (shotId, start, room, trackId) =>
        newClip({
          trackId,
          shotId,
          start,
          duration: room,
          source: kind === "solid" ? { kind: "solid", color } : { kind: "light", style: kind, color: "#FFF1DC" },
          name,
          role: "overlay",
          depth: 0,
          transform: { x: 0.5, y: 0.5, scale: kind === "solid" ? 1 : 0.5, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 },
        }),
      name,
    ),
  );
}

/** Add an already-imported video or sound to the timeline at the playhead. */
export function addMediaClip(media: MediaItem) {
  const film = useEditor.getState().film;
  if (!film) return;
  if (media.kind === "audio") return commit(placeAudio(film, media));
  const aspect = media.width && media.height ? media.width / media.height : 16 / 9;
  let shotId = "";
  let start = 0;
  let next = placeVisual(
    film,
    (sid, st, room, trackId) => {
      shotId = sid;
      start = st;
      return newClip({ trackId, shotId: sid, start: st, duration: Math.min(room, media.duration), source: { kind: "video", mediaId: media.id, in: 0, aspect }, name: media.name.replace(/\.[^.]+$/, ""), role: "background", transform: { x: 0.5, y: 0.5, scale: coverScale(film, aspect), rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 } });
    },
    media.name.replace(/\.[^.]+$/, ""),
  );
  // Its own sound goes on an audio track and belongs to the same shot, so it moves with the picture.
  if (media.hasAudio) {
    const video = next.clips.find((c) => c.source.kind === "video" && c.source.mediaId === media.id && c.shotId === shotId && Math.abs(c.start - start) < 1e-6);
    if (video) next = placeAudio(next, media, { shotId, start: video.start, duration: video.duration, name: `${video.name} sound` });
  }
  commit(next);
}

/** Import files from a picker or drop: images to the asset library, video and sound to this film. */
export async function importFiles(files: File[], onBusy: (label: string | null) => void) {
  const { images, media, rejected } = classify(files);
  rejected.forEach((r) => notify(`${r.name} ${r.message}`, "error"));
  if (images.length) {
    onBusy("Adding images to your library…");
    const { added, duplicates, rejected: bad } = await addAssets(images);
    bad.forEach((b) => notify(`${b.name}: ${b.reason}`, "error"));
    for (const a of [...added, ...duplicates.map((d) => d.of)]) addAssetClip(getAsset(a.id) ?? a);
  }
  for (const file of media) {
    onBusy(`Checking ${file.name}…`);
    try {
      const item = await importMedia(file);
      const film = useEditor.getState().film;
      if (!film) break;
      commit({ ...film, media: [...film.media, item] });
      addMediaClip(item);
      notify(`Added ${file.name}.`);
    } catch (e) {
      notify(e instanceof MediaError ? e.message : `${file.name} couldn't be added.`, "error");
    }
  }
  onBusy(null);
}
