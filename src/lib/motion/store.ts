"use client";

import { create } from "zustand";
import type { Scene } from "@/lib/scene/model";
import * as db from "@/lib/studio/library-db";
import { buildFromStyle, applyKitResult, layerSetFromScene, migrateStyle, type MotionStyle } from "./kits";
import { mediaKey } from "./media";
import { emptyFilm, migrateFilm, uid, type Aspect, type Film } from "./model";
import { filmFromScene, ASPECT_FOR_FORMAT } from "./scene-link";

/**
 * Films and saved motion styles live in this browser (IndexedDB), next to
 * the asset library. They aren't synced to the account. Writes resolve only
 * once the browser has stored them.
 */

export const useFilms = create<{ status: "idle" | "loading" | "ready" | "unavailable"; films: Film[]; styles: MotionStyle[] }>(() => ({ status: "idle", films: [], styles: [] }));

let loading: Promise<void> | null = null;

export function loadFilms(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    useFilms.setState({ status: "loading" });
    if (!(await db.openLibrary())) {
      useFilms.setState({ status: "unavailable" });
      return;
    }
    const [raw, rawStyles] = await Promise.all([db.getAll<unknown>("films"), db.getAll<unknown>("motionStyles")]);
    useFilms.setState({
      status: "ready",
      films: raw.map(migrateFilm).filter((f): f is Film => f !== null),
      styles: rawStyles.map(migrateStyle).filter((s): s is MotionStyle => s !== null),
    });
  })().catch((error) => {
    loading = null;
    useFilms.setState({ status: "unavailable" });
    throw error;
  });
  return loading;
}

export function getFilm(id: string) {
  return useFilms.getState().films.find((f) => f.id === id) ?? null;
}

function put(film: Film) {
  useFilms.setState((s) => ({ films: s.films.some((f) => f.id === film.id) ? s.films.map((f) => (f.id === film.id ? film : f)) : [film, ...s.films] }));
}

/** Store a film. Resolves once it's written; throws LibraryStorageError (e.g. storage full) otherwise. */
export async function saveFilm(film: Film): Promise<Film> {
  const next = { ...film, updatedAt: Date.now() };
  await db.write({ put: [["films", next]] });
  put(next);
  return next;
}

export async function createFilm(name = "Untitled film", aspect: Aspect = "16:9") {
  await loadFilms();
  return saveFilm(emptyFilm(name, aspect));
}

/** "Animate scene": a new film from a scene's layers with a motion style (built-in kit or saved style). */
export async function createFilmFromScene(scene: Scene, styleId: string, opts: { brand?: string[]; params?: Record<string, number> } = {}) {
  await loadFilms();
  const saved = useFilms.getState().styles.find((s) => s.id === styleId);
  let film: Film;
  if (saved) {
    film = emptyFilm(scene.name, ASPECT_FOR_FORMAT[scene.format]);
    film = { ...applyKitResult(film, buildFromStyle(saved, layerSetFromScene(scene)), saved.id), source: { sceneId: scene.id, sceneName: scene.name, revision: scene.revision, format: scene.format } };
  } else film = filmFromScene(scene, { kitId: styleId, brand: opts.brand ?? [], params: opts.params });
  return saveFilm(film);
}

export async function duplicateFilm(id: string) {
  const f = getFilm(id);
  if (!f) return null;
  const now = Date.now();
  return saveFilm({ ...structuredClone(f), id: uid(), name: `${f.name} copy`.slice(0, 80), createdAt: now, trashedAt: null });
}

export async function renameFilm(id: string, name: string) {
  const f = getFilm(id);
  if (f) await saveFilm({ ...f, name: name.trim().slice(0, 80) || f.name });
}

export async function trashFilm(id: string) {
  const f = getFilm(id);
  if (f) await saveFilm({ ...f, trashedAt: Date.now() });
}

export async function restoreFilm(id: string) {
  const f = getFilm(id);
  if (f) await saveFilm({ ...f, trashedAt: null });
}

/** Delete a film and the video/sound files only it used. */
export async function deleteFilmForever(id: string) {
  const f = getFilm(id);
  if (!f) return;
  const others = useFilms.getState().films.filter((x) => x.id !== id);
  const stillUsed = new Set(others.flatMap((x) => x.media.map((m) => m.id)));
  const blobs = f.media.filter((m) => !stillUsed.has(m.id)).map((m) => ["blobs", mediaKey(m.id)] as ["blobs", string]);
  await db.write({ remove: [["films", id], ...blobs] });
  useFilms.setState((s) => ({ films: s.films.filter((x) => x.id !== id) }));
}

export async function saveStyle(style: MotionStyle) {
  await db.write({ put: [["motionStyles", style]] });
  useFilms.setState((s) => ({ styles: [style, ...s.styles.filter((x) => x.id !== style.id)] }));
}

export async function deleteStyle(id: string) {
  await db.write({ remove: [["motionStyles", id]] });
  useFilms.setState((s) => ({ styles: s.styles.filter((x) => x.id !== id) }));
}
