"use client";

import { create } from "zustand";
import * as db from "@/lib/studio/library-db";
import { emptyScene, migrateScene, newId, type Scene, type SceneFormatId } from "./model";

/**
 * Scenes are kept in this browser (IndexedDB, the same database as the asset
 * library), like projects. `saveScene` resolves only after the write has
 * landed, so the editor can say "Saved" truthfully.
 */

export const useScenes = create<{ status: "idle" | "loading" | "ready" | "unavailable"; scenes: Scene[] }>(() => ({ status: "idle", scenes: [] }));

let loading: Promise<void> | null = null;

export function loadScenes(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    useScenes.setState({ status: "loading" });
    if (!(await db.openLibrary())) {
      useScenes.setState({ status: "unavailable" });
      return;
    }
    const raw = await db.getAll<unknown>("scenes");
    const scenes = raw.map(migrateScene).filter((s): s is Scene => s !== null);
    useScenes.setState({ status: "ready", scenes });
  })().catch((error) => {
    loading = null;
    useScenes.setState({ status: "unavailable" });
    throw error;
  });
  return loading;
}

export function getScene(id: string) {
  return useScenes.getState().scenes.find((s) => s.id === id) ?? null;
}

function put(scene: Scene) {
  useScenes.setState((st) => ({ scenes: st.scenes.some((s) => s.id === scene.id) ? st.scenes.map((s) => (s.id === scene.id ? scene : s)) : [scene, ...st.scenes] }));
}

/** Saves a changed scene (new revision). Throws a LibraryStorageError if the browser refuses. */
export async function saveScene(scene: Scene): Promise<Scene> {
  const prev = getScene(scene.id);
  const next: Scene = { ...scene, revision: Math.max(scene.revision, prev?.revision ?? 0) + 1, updatedAt: Date.now() };
  await db.write({ put: [["scenes", next]] });
  put(next);
  return next;
}

export async function createScene(name?: string, format: SceneFormatId = "square"): Promise<Scene> {
  await loadScenes();
  const scene = emptyScene(name?.trim() || "Untitled scene", format);
  await db.write({ put: [["scenes", scene]] });
  put(scene);
  return scene;
}

export async function duplicateScene(id: string): Promise<Scene | null> {
  const s = getScene(id);
  if (!s) return null;
  const now = Date.now();
  const copy: Scene = { ...structuredClone(s), id: newId(), name: `${s.name} copy`.slice(0, 80), createdAt: now, updatedAt: now, revision: 1, trashedAt: null };
  await db.write({ put: [["scenes", copy]] });
  put(copy);
  return copy;
}

async function patch(id: string, fn: (s: Scene) => Scene) {
  const s = getScene(id);
  if (!s) return;
  const next = fn(s);
  await db.write({ put: [["scenes", next]] });
  put(next);
}

export const renameScene = (id: string, name: string) => patch(id, (s) => ({ ...s, name: name.trim().slice(0, 80) || s.name, updatedAt: Date.now(), revision: s.revision + 1 }));
export const trashScene = (id: string) => patch(id, (s) => ({ ...s, trashedAt: Date.now() }));
export const restoreScene = (id: string) => patch(id, (s) => ({ ...s, trashedAt: null }));

export async function deleteSceneForever(id: string) {
  await db.write({ remove: [["scenes", id]] });
  useScenes.setState((st) => ({ scenes: st.scenes.filter((s) => s.id !== id) }));
}
