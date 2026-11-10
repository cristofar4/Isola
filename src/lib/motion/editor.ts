"use client";

import { create } from "zustand";
import { LibraryStorageError } from "@/lib/studio/library-db";
import type { Film } from "./model";
import type { EditResult, KeyTarget } from "./ops";
import { saveFilm } from "./store";
import { filmDuration } from "./time";

/**
 * The open film in Motion Studio: the film itself, undo/redo history, what's
 * selected, the playhead and whether the latest change has been saved.
 *
 * - `preview(film)` shows a change while dragging (no history, no save).
 * - `commit(film)` records it: one undo step, saved shortly after.
 * "Saved" is only shown once the browser has actually stored the film.
 */

export type Workspace = "assemble" | "animate" | "colour" | "sound" | "deliver";

export interface Selection {
  clipIds: string[];
  shotId: string | null;
  keyframe: { target: KeyTarget; id: string } | null;
}

interface EditorState {
  film: Film | null;
  past: Film[];
  future: Film[];
  selection: Selection;
  playhead: number;
  playing: boolean;
  loop: boolean;
  workspace: Workspace;
  save: { state: "saved" | "saving" | "unsaved" | "error"; error: string | null; at: number | null };
  notice: { tone: "ok" | "error"; text: string; at: number } | null;
}

const LIMIT = 100;
const empty: Selection = { clipIds: [], shotId: null, keyframe: null };

export const useEditor = create<EditorState>(() => ({
  film: null,
  past: [],
  future: [],
  selection: empty,
  playhead: 0,
  playing: false,
  loop: false,
  workspace: "assemble",
  save: { state: "saved", error: null, at: null },
  notice: null,
}));

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | null = null;
let lastCoalesce: { key: string; at: number } | null = null;

export function openFilm(film: Film) {
  clearTimeout(saveTimer);
  useEditor.setState({ film, past: [], future: [], selection: { ...empty, shotId: film.shots[0]?.id ?? null }, playhead: 0, playing: false, save: { state: "saved", error: null, at: film.updatedAt }, notice: null });
}

export function closeFilm() {
  void flushSave();
  useEditor.setState({ film: null, past: [], future: [], selection: empty, playing: false });
}

async function persist() {
  const film = useEditor.getState().film;
  if (!film) return;
  useEditor.setState((s) => ({ save: { ...s.save, state: "saving", error: null } }));
  try {
    const stored = await saveFilm(film);
    // Only "saved" if nothing changed while writing.
    if (useEditor.getState().film === film) useEditor.setState({ save: { state: "saved", error: null, at: stored.updatedAt } });
    else useEditor.setState((s) => ({ save: { ...s.save, state: "unsaved" } }));
  } catch (error) {
    useEditor.setState({ save: { state: "error", error: error instanceof LibraryStorageError ? error.message : "Saving failed in this browser.", at: useEditor.getState().save.at } });
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  useEditor.setState((s) => ({ save: { ...s.save, state: "unsaved" } }));
  saveTimer = setTimeout(() => {
    saving = persist().finally(() => {
      saving = null;
      if (useEditor.getState().save.state === "unsaved") scheduleSave();
    });
  }, 450);
}

/** Save now (before leaving the page, or "Retry"). */
export async function flushSave() {
  clearTimeout(saveTimer);
  if (saving) await saving;
  const st = useEditor.getState().save.state;
  if (st === "unsaved" || st === "error") await persist();
}

/** Show an in-progress change (dragging) without recording it. */
export function preview(film: Film) {
  useEditor.setState({ film });
}

/**
 * Record a change as one undo step. Pass an EditResult from ops to show its
 * problem (if refused). Changes with the same `coalesce` key within a moment
 * merge into one step (typing in a field, nudging with arrow keys).
 */
export function commit(next: Film | EditResult, opts: { coalesce?: string; base?: Film } = {}) {
  const result: EditResult = "film" in next && "shots" in (next as EditResult).film ? (next as EditResult) : { film: next as Film };
  const st = useEditor.getState();
  if (result.problem) notify(result.problem, "error");
  const base = opts.base ?? st.film;
  if (!base || result.film === base) {
    if (st.film !== base && base) useEditor.setState({ film: base });
    return false;
  }
  const now = Date.now();
  const merge = !!opts.coalesce && lastCoalesce?.key === opts.coalesce && now - lastCoalesce.at < 1200 && st.past.length > 0;
  lastCoalesce = opts.coalesce ? { key: opts.coalesce, at: now } : null;
  const past = merge ? st.past : [...st.past, base].slice(-LIMIT);
  const duration = filmDuration(result.film);
  useEditor.setState({ film: result.film, past, future: [], playhead: Math.min(st.playhead, duration) });
  pruneSelection();
  scheduleSave();
  return true;
}

function pruneSelection() {
  const { film, selection } = useEditor.getState();
  if (!film) return;
  const ids = new Set(film.clips.map((c) => c.id));
  const clipIds = selection.clipIds.filter((id) => ids.has(id));
  const shotId = selection.shotId && film.shots.some((s) => s.id === selection.shotId) ? selection.shotId : (film.shots[0]?.id ?? null);
  if (clipIds.length !== selection.clipIds.length || shotId !== selection.shotId) useEditor.setState({ selection: { clipIds, shotId, keyframe: clipIds.length ? selection.keyframe : null } });
}

export function undo() {
  const st = useEditor.getState();
  const prev = st.past[st.past.length - 1];
  if (!prev || !st.film) return;
  lastCoalesce = null;
  useEditor.setState({ film: prev, past: st.past.slice(0, -1), future: [st.film, ...st.future].slice(0, LIMIT) });
  pruneSelection();
  scheduleSave();
}

export function redo() {
  const st = useEditor.getState();
  const next = st.future[0];
  if (!next || !st.film) return;
  lastCoalesce = null;
  useEditor.setState({ film: next, past: [...st.past, st.film].slice(-LIMIT), future: st.future.slice(1) });
  pruneSelection();
  scheduleSave();
}

export function select(patch: Partial<Selection>) {
  useEditor.setState((s) => ({ selection: { ...s.selection, ...patch } }));
}

export function setPlayhead(t: number) {
  const film = useEditor.getState().film;
  if (!film) return;
  const d = filmDuration(film);
  useEditor.setState({ playhead: Math.min(Math.max(0, t), d) });
}

export function notify(text: string, tone: "ok" | "error" = "ok") {
  useEditor.setState({ notice: { tone, text, at: Date.now() } });
}

export function setWorkspace(workspace: Workspace) {
  useEditor.setState({ workspace });
}
