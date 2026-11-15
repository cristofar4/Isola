import { describe, expect, it } from "vitest";
import { emptyFilm, migrateFilm, newClip, newShot, outputSize, type Film } from "@/lib/motion/model";
import { CAMERA_MOVES, addCameraKeyframes, addClip, addTransformKeyframes, applyCameraMove, cameraMoveKeys, describeCameraMove, scaleFilm, setAllTransitions, setLightSweep, shotSweeps, addShot, deleteClips, deleteShot, duplicateKeyframe, duplicateShot, moveClip, moveKeyframe, reorderShots, setKeyframe, setShotDuration, setTransition, splitClip, trimClip, validateFilm } from "@/lib/motion/ops";
import { clipRange, clipValue, cubicBezier, filmDuration, shotsAt, timecode, valueAt } from "@/lib/motion/time";

function film2(): Film {
  const f = emptyFilm("Test");
  const a = { ...f.shots[0], duration: 4, name: "A" };
  const b = { ...newShot("B", 3) };
  const product = f.tracks.find((t) => t.name === "Product")!;
  const clip = newClip({ trackId: product.id, shotId: a.id, start: 0, duration: 4, source: { kind: "image", assetId: "asset-1", aspect: 1 }, name: "Serum" });
  const clipB = newClip({ trackId: product.id, shotId: b.id, start: 0.5, duration: 2, source: { kind: "image", assetId: "asset-2", aspect: 1 }, name: "Jar" });
  return { ...f, shots: [a, b], clips: [clip, clipB] };
}

describe("easing and interpolation", () => {
  it("matches CSS cubic-bezier endpoints and symmetry", () => {
    const e = cubicBezier(0.42, 0, 0.58, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.5)).toBeCloseTo(0.5, 4);
    expect(e(0.25) + e(0.75)).toBeCloseTo(1, 4);
    expect(cubicBezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4);
  });
  it("interpolates between keyframes with each segment's ease and holds outside", () => {
    const kfs = [
      { id: "a", t: 1, v: 10, ease: "linear" as const },
      { id: "b", t: 3, v: 30, ease: "ease-in" as const },
      { id: "c", t: 5, v: 10, ease: "linear" as const },
    ];
    expect(valueAt(kfs, 0, 0)).toBe(10);
    expect(valueAt(kfs, 0, 2)).toBe(20);
    expect(valueAt(kfs, 0, 4)).toBeGreaterThan(20); // ease-in: slow start, still near 30
    expect(valueAt(kfs, 0, 9)).toBe(10);
    expect(valueAt(undefined, 7, 2)).toBe(7);
  });
  it("a custom curve changes the in-between values", () => {
    const base = [
      { id: "a", t: 0, v: 0, ease: "linear" as const },
      { id: "b", t: 1, v: 1, ease: "linear" as const },
    ];
    const custom = [{ ...base[0], ease: "custom" as const, bezier: [0.9, 0, 1, 0.1] as [number, number, number, number] }, base[1]];
    expect(valueAt(custom, 0, 0.5)).toBeLessThan(valueAt(base, 0, 0.5) - 0.3);
  });
});

describe("the film clock", () => {
  it("lays shots end to end and places shot clips relative to their shot", () => {
    const f = film2();
    expect(filmDuration(f)).toBe(7);
    expect(clipRange(f, f.clips[1])).toEqual({ start: 4.5, end: 6.5 });
  });
  it("centres transitions on the cut, never longer than half a shot", () => {
    let f = film2();
    f = setTransition(f, f.shots[1].id, "dissolve", 10).film;
    // Clamped to half the 3s shot = 1.5s, so 0.75s either side of the 4s cut.
    const before = shotsAt(f, 3.5);
    expect(before.b?.index).toBe(1);
    expect(before.progress).toBeCloseTo((3.5 - 3.25) / 1.5, 5);
    expect(shotsAt(f, 3.2).b).toBeUndefined();
    const after = shotsAt(f, 4.5);
    expect(after.a.index).toBe(0);
    expect(after.b?.local).toBeCloseTo(0.5, 5);
  });
  it("formats timecode with frames", () => {
    expect(timecode(4.2, 30)).toBe("00:04:06");
    expect(timecode(3725.48, 25)).toBe("01:02:05:12");
  });
});

describe("editing rules", () => {
  it("never lets clips overlap on a track: moves snap to a free gap or are refused", () => {
    const f = film2();
    const product = f.tracks.find((t) => t.name === "Product")!;
    // Moving the jar into shot A, where the serum fills the whole shot: no room.
    const refused = moveClip(f, f.clips[1].id, product.id, 1);
    expect(refused.problem).toBeTruthy();
    expect(refused.film).toBe(f);
    // On another track it fits, re-homed into shot A at 1s.
    const typography = f.tracks.find((t) => t.name === "Typography")!;
    const moved = moveClip(f, f.clips[1].id, typography.id, 1).film;
    const jar = moved.clips.find((c) => c.id === f.clips[1].id)!;
    expect(jar.shotId).toBe(f.shots[0].id);
    expect(clipRange(moved, jar)).toEqual({ start: 1, end: 3 });
    expect(validateFilm(moved)).toEqual([]);
  });
  it("trims without going below the minimum length, past neighbours or past the media", () => {
    let f = film2();
    const id = f.clips[1].id;
    f = trimClip(f, id, "end", 4.4).film; // can't end before start + 0.1
    expect(clipRange(f, f.clips[1]).end).toBeCloseTo(4.6, 5);
    f = trimClip(f, id, "end", 99).film; // can't run past its shot
    expect(clipRange(f, f.clips[1]).end).toBe(7);
    f = trimClip(f, id, "start", 2).film; // can't leave its shot
    expect(clipRange(f, f.clips[1]).start).toBe(4);
    expect(validateFilm(f)).toEqual([]);
  });
  it("trimming the start of video moves its in-point and keeps keyframes on the film clock", () => {
    let f = emptyFilm();
    const v = f.tracks[1];
    const clip = newClip({ trackId: v.id, shotId: f.shots[0].id, start: 0, duration: 4, source: { kind: "video", mediaId: "m", in: 0, aspect: 1.77 }, name: "Clip" });
    f = { ...f, media: [{ id: "m", kind: "video", name: "m.mp4", mime: "video/mp4", bytes: 1, duration: 4, width: 1920, height: 1080, hasAudio: false, peaks: null, createdAt: 0 }], clips: [clip] };
    f = setKeyframe(f, { kind: "clip", clipId: clip.id, prop: "opacity" }, 2, 0.5).film;
    f = trimClip(f, clip.id, "start", 1).film;
    const c = f.clips[0];
    expect(c.source.kind === "video" && c.source.in).toBe(1);
    expect(c.keyframes.opacity![0].t).toBe(1); // still at 2s on the film clock
    // The end can't go past the end of the media (in 1 + 3s = 4s).
    f = trimClip(f, clip.id, "end", 10).film;
    expect(f.clips[0].duration).toBe(3);
  });
  it("splits a clip so both halves play exactly as before", () => {
    let f = film2();
    const id = f.clips[0].id;
    f = setKeyframe(f, { kind: "clip", clipId: id, prop: "scale" }, 0, 1).film;
    f = setKeyframe(f, { kind: "clip", clipId: id, prop: "scale" }, 4, 2).film;
    const before = clipValue(f.clips[0], "scale", 3);
    f = splitClip(f, id, 2).film;
    const right = f.clips.find((c) => c.id !== id && c.shotId === f.shots[0].id)!;
    expect(clipRange(f, right)).toEqual({ start: 2, end: 4 });
    expect(clipValue(right, "scale", 1)).toBeCloseTo(before, 6);
    expect(splitClip(f, id, 0.05).problem).toBeTruthy();
  });
  it("shots: reorder carries clips, duplicate copies them, delete keeps one shot", () => {
    let f = film2();
    f = reorderShots(f, 1, 0).film;
    expect(clipRange(f, f.clips.find((c) => c.name === "Jar")!).start).toBe(0.5);
    expect(clipRange(f, f.clips.find((c) => c.name === "Serum")!).start).toBe(3);
    f = duplicateShot(f, f.shots[0].id).film;
    expect(f.shots).toHaveLength(3);
    expect(f.clips.filter((c) => c.name === "Jar")).toHaveLength(2);
    f = deleteShot(f, f.shots[0].id).film;
    f = deleteShot(f, f.shots[0].id).film;
    expect(deleteShot(f, f.shots[0].id).problem).toBeTruthy();
    expect(validateFilm(f)).toEqual([]);
  });
  it("changing a shot's length stretches full-length clips and trims the rest", () => {
    let f = film2();
    f = setShotDuration(f, f.shots[0].id, 6).film;
    expect(f.clips[0].duration).toBe(6);
    f = setShotDuration(f, f.shots[1].id, 1).film;
    const jar = f.clips[1];
    expect(jar.start + jar.duration).toBeLessThanOrEqual(1 + 1e-9);
    expect(jar.duration).toBeGreaterThanOrEqual(0.1);
    expect(setShotDuration(f, f.shots[1].id, -5).film.shots[1].duration).toBe(0.2);
    expect(validateFilm(f)).toEqual([]);
  });
  it("keyframes: one per frame time, moves refuse collisions, duplicates land where asked", () => {
    let f = film2();
    const target = { kind: "clip" as const, clipId: f.clips[0].id, prop: "x" as const };
    f = setKeyframe(f, target, 1, 0.2).film;
    f = setKeyframe(f, target, 1.01, 0.3).film; // within half a frame at 30fps: updates
    expect(f.clips[0].keyframes.x).toHaveLength(1);
    expect(f.clips[0].keyframes.x![0].v).toBe(0.3);
    f = setKeyframe(f, target, 2, 0.8).film;
    const [k1, k2] = f.clips[0].keyframes.x!;
    expect(moveKeyframe(f, target, k1.id, 2).problem).toBeTruthy();
    f = duplicateKeyframe(f, target, k2.id, 3).film;
    expect(f.clips[0].keyframes.x!.map((k) => k.t)).toEqual([1, 2, 3]);
  });
  it("adding clips finds room or refuses; deleting a product removes its shadow", () => {
    let f = film2();
    const product = f.tracks.find((t) => t.name === "Product")!;
    const extra = newClip({ trackId: product.id, shotId: f.shots[1].id, start: 0, duration: 0.4, source: { kind: "image", assetId: "x", aspect: 1 }, name: "Extra" });
    expect(addClip(f, { ...extra, duration: 1 }).problem).toBeTruthy(); // only 0.5s gaps left in shot B
    const added = addClip(f, extra);
    expect(added.problem).toBeUndefined();
    expect(validateFilm(added.film)).toEqual([]);
    const shadowTrack = f.tracks.find((t) => t.name === "Backdrop")!;
    f = addClip(f, newClip({ trackId: shadowTrack.id, shotId: f.shots[0].id, start: 0, duration: 4, source: { kind: "shadow", targetClipId: f.clips[0].id, softness: 0.4, direction: 30, length: 0.2 }, name: "Shadow" })).film;
    f = deleteClips(f, [f.clips[0].id]).film;
    expect(f.clips.some((c) => c.source.kind === "shadow")).toBe(false);
  });
  it("adding a shot after the current one keeps the order", () => {
    const f = addShot(film2(), 0, 2).film;
    expect(f.shots.map((s) => s.name)).toEqual(["A", "Shot 3", "B"]);
  });
});

describe("stored films", () => {
  it("migrates and repairs stored data", () => {
    const f = film2();
    const raw = JSON.parse(JSON.stringify(f));
    raw.clips[0].duration = -3;
    raw.clips.push({ id: "orphan", trackId: "nope", source: { kind: "image", assetId: "a", aspect: 1 } });
    raw.fps = 17;
    raw.shots[0].transition = { kind: "zoom-blur", duration: 99 };
    const m = migrateFilm(raw)!;
    expect(m.clips).toHaveLength(2);
    expect(m.clips[0].duration).toBe(0.1);
    expect(m.fps).toBe(30);
    expect(m.shots[0].transition).toEqual({ kind: "cut", duration: 5 });
    expect(migrateFilm({ nope: true })).toBeNull();
  });
  it("output sizes are even and follow the aspect", () => {
    expect(outputSize("16:9", 1080)).toEqual({ width: 1920, height: 1080 });
    expect(outputSize("9:16", 720)).toEqual({ width: 720, height: 1280 });
    expect(outputSize("4:5", 2160)).toEqual({ width: 2160, height: 2700 });
  });
});

import { emptyScene, productLayer, shadowLayer, textLayer, type ProductLayer } from "@/lib/scene/model";
import { KIT_MOODS, KITS, buildFromStyle, defaultParams, extractStyle, layerSetFromScene } from "@/lib/motion/kits";
import { applySceneUpdate, diffScene, filmFromScene } from "@/lib/motion/scene-link";

function scene() {
  const s = emptyScene("Skincare launch", "wide");
  const serum = productLayer("asset-serum", "Serum", 0.4, { surfaceY: 0.7, x: 0.45, scale: 0.5 });
  const jar = productLayer("asset-jar", "Cream jar", 1.2, { surfaceY: 0.7, x: 0.62, scale: 0.3 });
  s.layers.push(shadowLayer(serum), serum, shadowLayer(jar), jar, textLayer({ text: "Radiant renewal" }));
  return s;
}

describe("motion kits", () => {
  it("every kit builds a valid, editable film from a scene's layers", () => {
    const sc = scene();
    for (const kit of KITS) {
      expect(kit.check(layerSetFromScene(sc))).toBeNull();
      const film = filmFromScene(sc, { kitId: kit.id });
      expect(validateFilm(film), kit.id).toEqual([]);
      expect(film.styleId).toBe(kit.id);
      // Products stay separate clips with their own shadows.
      const products = film.clips.filter((c) => c.role === "product" && c.source.kind === "image");
      expect(products.length).toBeGreaterThanOrEqual(2);
      expect(film.clips.some((c) => c.source.kind === "shadow")).toBe(true);
      // Something actually moves or changes over time.
      const animated = film.clips.some((c) => Object.keys(c.keyframes).length) || film.shots.some((s) => Object.keys(s.camera).length) || film.shots.length > 1;
      expect(animated, kit.id).toBe(true);
    }
  });
  it("kits are genuinely different (pace, structure, transitions)", () => {
    const sc = scene();
    const sig = KITS.map((k) => {
      const f = filmFromScene(sc, { kitId: k.id });
      const kinds = [...new Set(f.clips.map((c) => c.source.kind))].sort().join(",");
      const cam = [...new Set(f.shots.flatMap((s) => Object.keys(s.camera)))].sort().join(",");
      return `${f.shots.length}:${f.shots.map((s) => s.transition.kind).join(",")}:${Math.round(filmDuration(f))}:${kinds}:${cam}:${f.grade.vignette}`;
    });
    expect(new Set(sig).size).toBe(KITS.length);
  });
  it("editable timings change the result", () => {
    const sc = scene();
    const kit = KITS.find((k) => k.id === "slow-reveal")!;
    const short = filmFromScene(sc, { kitId: kit.id, params: { ...defaultParams(kit), duration: 4 } });
    const long = filmFromScene(sc, { kitId: kit.id, params: { ...defaultParams(kit), duration: 12 } });
    expect(filmDuration(short)).toBe(4);
    expect(filmDuration(long)).toBe(12);
  });
  it("parallax needs separate backdrop and product layers", () => {
    const s = emptyScene("No products");
    expect(KITS.find((k) => k.id === "layered-parallax")!.check(layerSetFromScene(s))).toMatch(/backdrop and a product/);
  });
  it("a customised film saves as a style and applies to another scene", () => {
    const film = filmFromScene(scene(), { kitId: "editorial-cut" });
    const style = extractStyle(film, "My cut");
    const other = emptyScene("Other");
    other.layers.push(productLayer("asset-x", "Bag", 1, { scale: 0.5 }));
    const built = buildFromStyle(JSON.parse(JSON.stringify(style)), layerSetFromScene(other));
    expect(built.shots.map((s) => s.duration)).toEqual(film.shots.map((s) => s.duration));
    expect(built.clips.some((c) => c.source.kind === "image" && c.source.assetId === "asset-x")).toBe(true);
    expect(built.clips.some((c) => c.source.kind === "image" && c.source.assetId === "asset-jar")).toBe(false);
  });
});

describe("update from scene", () => {
  it("reports what changed and keeps animation when a layer moves", () => {
    const sc = scene();
    const film = filmFromScene(sc, { kitId: "social-launch" });
    const serum = sc.layers.find((l) => l.name === "Serum") as ProductLayer;
    const moved = { ...sc, revision: sc.revision + 1, layers: sc.layers.map((l) => (l.id === serum.id ? { ...l, x: l.x + 0.1 } : l.kind === "text" ? { ...l, text: "New words" } : l)) };
    const changes = diffScene(film, moved);
    expect(changes.find((c) => c.kind === "changed" && c.name === "Serum")).toMatchObject({ fields: [{ field: "Position", conflict: false }] });
    expect(changes.find((c) => c.kind === "changed" && c.layerKind === "text")).toBeTruthy();
    const updated = applySceneUpdate(film, moved, { conflicts: {}, addNew: false, removeMissing: false });
    const before = film.clips.filter((c) => c.link?.layerId === serum.id);
    const after = updated.clips.filter((c) => c.link?.layerId === serum.id);
    expect(after[0].transform.x).toBeCloseTo(before[0].transform.x + 0.1, 6);
    const bounced = after.find((c) => c.keyframes.scale);
    expect(bounced?.keyframes.scale?.length).toBe(before.find((c) => c.keyframes.scale)?.keyframes.scale?.length);
    expect(updated.source?.revision).toBe(moved.revision);
    expect(diffScene(updated, moved)).toEqual([]);
  });
  it("never overwrites an edit made in Motion Studio without asking", () => {
    const sc = scene();
    let film = filmFromScene(sc, { kitId: "slow-reveal" });
    const serum = sc.layers.find((l) => l.name === "Serum")!;
    const clip = film.clips.find((c) => c.link?.layerId === serum.id)!;
    film = { ...film, clips: film.clips.map((c) => (c.id === clip.id ? { ...c, transform: { ...c.transform, x: 0.2 } } : c)) };
    const moved = { ...sc, revision: 9, layers: sc.layers.map((l) => (l.id === serum.id ? { ...l, x: 0.7 } : l)) };
    const change = diffScene(film, moved).find((c) => c.kind === "changed");
    expect(change && change.kind === "changed" && change.fields[0].conflict).toBe(true);
    const kept = applySceneUpdate(film, moved, { conflicts: {}, addNew: false, removeMissing: false });
    expect(kept.clips.find((c) => c.id === clip.id)!.transform.x).toBe(0.2);
    const taken = applySceneUpdate(film, moved, { conflicts: { [`${serum.id}:Position`]: "scene" }, addNew: false, removeMissing: false });
    expect(taken.clips.find((c) => c.id === clip.id)!.transform.x).toBeCloseTo(0.2 + (0.7 - (serum as ProductLayer).x), 6);
  });
  it("new layers can be added and deleted layers detached or removed", () => {
    const sc = scene();
    const film = filmFromScene(sc, { kitId: "slow-reveal" });
    const jar = sc.layers.find((l) => l.name === "Cream jar")!;
    const logo = textLayer({ text: "ISOLA" });
    const next = { ...sc, revision: 5, layers: [...sc.layers.filter((l) => l.id !== jar.id), logo] };
    const changes = diffScene(film, next);
    expect(changes.some((c) => c.kind === "removed" && c.name === "Cream jar")).toBe(true);
    expect(changes.some((c) => c.kind === "added" && c.layerId === logo.id)).toBe(true);
    const detached = applySceneUpdate(film, next, { conflicts: {}, addNew: true, removeMissing: false });
    expect(detached.clips.filter((c) => c.link?.layerId === jar.id).every((c) => c.link!.detached)).toBe(true);
    expect(detached.clips.some((c) => c.link?.layerId === logo.id)).toBe(true);
    expect(validateFilm(detached)).toEqual([]);
    const removed = applySceneUpdate(film, next, { conflicts: {}, addNew: false, removeMissing: true });
    expect(removed.clips.some((c) => c.link?.layerId === jar.id)).toBe(false);
  });
});

describe("quick motion", () => {
  it("camera moves are ordinary keyframes at the shot's ends, and are recognised again", () => {
    const f = film2();
    const shot = f.shots[0];
    for (const move of CAMERA_MOVES.slice(1)) {
      const next = applyCameraMove(f, shot.id, move, 0.6, "ease-out").film;
      const s = next.shots[0];
      const lists = Object.values(s.camera);
      expect(lists.length).toBeGreaterThan(0);
      for (const list of lists) {
        expect(list!.map((k) => k.t)).toEqual([0, shot.duration]);
        expect(list!.every((k) => k.ease === "ease-out")).toBe(true);
      }
      expect(describeCameraMove(s)).toEqual({ move, intensity: 0.6, ease: "ease-out" });
      expect(validateFilm(next)).toEqual([]);
    }
    expect(describeCameraMove(shot).move).toBe("none");
    expect(applyCameraMove(applyCameraMove(f, shot.id, "push-in", 1).film, shot.id, "none", 1).film.shots[0].camera).toEqual({});
  });
  it("a push in zooms more with intensity; pans keep enough zoom that the set's edges never show", () => {
    const zoomEnd = (i: number) => cameraMoveKeys(4, "push-in", i).zoom![1].v;
    expect(zoomEnd(1)).toBeGreaterThan(zoomEnd(0.3));
    expect(cameraMoveKeys(4, "push-in", 0.5).zoom![0].v).toBe(1);
    for (const move of ["pan-left", "pan-right", "rise", "drift"] as const) {
      for (const i of [0.05, 0.4, 1]) {
        const cam = cameraMoveKeys(4, move, i);
        for (const end of [0, 1]) {
          const zoom = cam.zoom![end].v;
          const pan = Math.abs((cam.panX ?? cam.panY)![end].v);
          // A frame-filling layer at depth 1 stays inside the frame while |pan| ≤ (1 − 1/zoom) / 2.
          expect(pan).toBeLessThanOrEqual((1 - 1 / zoom) / 2 + 1e-9);
        }
      }
    }
  });
  it("hand-edited camera keyframes read as custom, never as a preset", () => {
    const f = film2();
    const moved = applyCameraMove(f, f.shots[0].id, "push-in", 0.5).film;
    const edited = setKeyframe(moved, { kind: "camera", shotId: f.shots[0].id, prop: "zoom" }, 2, 1.5).film;
    expect(describeCameraMove(edited.shots[0]).move).toBe("custom");
    const odd = setKeyframe(setKeyframe(f, { kind: "camera", shotId: f.shots[0].id, prop: "rotate" }, 0, 0).film, { kind: "camera", shotId: f.shots[0].id, prop: "rotate" }, 4, 5).film;
    expect(describeCameraMove(odd.shots[0]).move).toBe("custom");
  });
  it("a lighting sweep is its own keyframed overlay clip for the shot, and comes off again", () => {
    const f = film2();
    const on = setLightSweep(f, f.shots[1].id, true).film;
    const sweeps = shotSweeps(on, f.shots[1].id);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]).toMatchObject({ start: 0, duration: 3, role: "overlay", depth: 0 });
    expect(sweeps[0].keyframes.lightX!.map((k) => k.t)).toEqual([0, 3]);
    expect(sweeps[0].keyframes.lightX![0].v).toBeLessThan(0);
    expect(sweeps[0].keyframes.lightX![1].v).toBeGreaterThan(1);
    expect(shotSweeps(on, f.shots[0].id)).toHaveLength(0);
    expect(on.clips.filter((c) => c.source.kind === "image")).toEqual(f.clips); // product clips untouched
    expect(validateFilm(on)).toEqual([]);
    expect(setLightSweep(on, f.shots[1].id, true).film).toBe(on); // already on
    // A second shot's sweep shares the lighting track.
    const both = setLightSweep(on, f.shots[0].id, true).film;
    expect(both.tracks.length).toBe(on.tracks.length);
    const off = setLightSweep(both, f.shots[1].id, false).film;
    expect(shotSweeps(off, f.shots[1].id)).toHaveLength(0);
    expect(shotSweeps(off, f.shots[0].id)).toHaveLength(1);
  });
  it("Add keyframe pins a clip's position and scale at the playhead; the camera when nothing is selected", () => {
    const f = film2();
    const jar = f.clips[1]; // in shot B (starts at 4s), 0.5s in, 2s long
    expect(addTransformKeyframes(f, jar.id, 1).problem).toMatch(/playhead/);
    const pinned = addTransformKeyframes(f, jar.id, 5).film.clips[1];
    expect(Object.keys(pinned.keyframes).sort()).toEqual(["scale", "x", "y"]);
    expect(pinned.keyframes.x).toHaveLength(1);
    expect(pinned.keyframes.x![0]).toMatchObject({ t: 0.5, v: jar.transform.x });
    // Pinning leaves the picture as it was.
    for (const prop of ["x", "y", "scale"] as const) expect(clipValue(pinned, prop, 1.2)).toBe(clipValue(jar, prop, 1.2));
    const cam = addCameraKeyframes(f, f.shots[0].id, 1.5).film.shots[0].camera;
    expect(cam.zoom).toMatchObject([{ t: 1.5, v: 1 }]);
    expect(cam.panX).toMatchObject([{ t: 1.5, v: 0 }]);
    expect(cam.rotate).toBeUndefined();
  });
  it("one transition for every cut, and the film's length scales shots, clips and keyframes together", () => {
    const f = film2();
    const all = setAllTransitions(f, "dissolve", 0.6).film;
    expect(all.shots.map((s) => s.transition.kind)).toEqual(["cut", "dissolve"]);
    expect(setAllTransitions(all, "cut").film.shots[1].transition).toEqual({ kind: "cut", duration: 0 });
    const keyed = setKeyframe(f, { kind: "clip", clipId: f.clips[0].id, prop: "x" }, 2, 0.7).film;
    const doubled = scaleFilm(keyed, 2).film;
    expect(filmDuration(doubled)).toBe(14);
    expect(doubled.clips[0].duration).toBe(8);
    expect(doubled.clips[0].keyframes.x![0].t).toBe(4);
    expect(scaleFilm(f, 0.01).problem).toBeTruthy();
  });
  it("every built-in style is tagged with at least one mood used by the library filter", () => {
    for (const kit of KITS) {
      expect(kit.moods.length).toBeGreaterThan(0);
      expect(kit.moods.every((m) => KIT_MOODS.includes(m))).toBe(true);
    }
    for (const mood of KIT_MOODS) expect(KITS.some((k) => k.moods.includes(mood))).toBe(true);
  });
});
