"use client";

import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, CircleAlert, Link2, Maximize2, Minimize2, Moon, PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, RefreshCw, Sun, Undo2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { closeFilm, commit, flushSave, openFilm, redo, select, setPlayhead, setWorkspace, undo, useEditor, type Workspace } from "@/lib/motion/editor";
import { addCameraKeyframes, addMarker, addTransformKeyframes, deleteClips, duplicateClip, splitClip, trimClip } from "@/lib/motion/ops";
import { sceneChangedSince } from "@/lib/motion/scene-link";
import { getFilm, loadFilms, useFilms } from "@/lib/motion/store";
import { filmDuration, secs, shotAt, toFrame } from "@/lib/motion/time";
import { creativeFontClasses } from "@/lib/scene/fonts";
import { loadScenes, useScenes } from "@/lib/scene/store";
import { useLibraryReady } from "@/components/studio/library-hooks";
import { setEditorOpen } from "@/components/studio/studio-place";
import { importFiles } from "./add-media";
import { ColourPanel } from "./colour-panel";
import { DeliverPanel } from "./deliver-panel";
import { LIBRARY_TABS, LibraryPanel, UpdateDialog, type LibraryTab } from "./library-panel";
import { togglePlay, usePlayback } from "./playback";
import { PhoneEditor } from "./mobile-editor";
import { MotionPanel, TextPanel } from "./quick-motion";
import { SoundPanel } from "./sound-panel";
import { Storyboard } from "./storyboard";
import { Timeline } from "./timeline";
import { IconButton } from "./ui";
import { Viewer } from "./viewer";

const INSPECTOR_TABS: Array<{ id: Workspace; label: string }> = [
  { id: "motion", label: "Motion" },
  { id: "colour", label: "Colour" },
  { id: "text", label: "Text" },
  { id: "sound", label: "Sound" },
  { id: "export", label: "Export" },
];

type Theme = "light" | "dark";
const themeListeners = new Set<() => void>();
function readTheme(): Theme {
  try {
    return localStorage.getItem("isola-motion-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
function writeTheme(theme: Theme) {
  try {
    localStorage.setItem("isola-motion-theme", theme);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
  document.documentElement.dataset.motionTheme = theme;
  themeListeners.forEach((l) => l());
}
/** Light by default (the studio's own look); a dark workspace for grading and long edits. Menus and dialogs follow it too. */
function useMotionTheme(): Theme {
  const theme = useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb);
      return () => themeListeners.delete(cb);
    },
    readTheme,
    () => "light" as Theme,
  );
  useEffect(() => {
    document.documentElement.dataset.motionTheme = theme;
    return () => {
      delete document.documentElement.dataset.motionTheme;
    };
  }, [theme]);
  return theme;
}

function useNarrow() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 1023px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 1023px)").matches,
    () => false,
  );
}

/**
 * Panel sizes for a first visit, from the window: on a laptop-height screen
 * a 260px timeline and two 300px side panels left the preview about 200px
 * across, so short and narrow windows start with slimmer panels.
 */
function defaultLayout(): Layout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  const h = window.innerHeight;
  const w = window.innerWidth;
  return {
    ...DEFAULT_LAYOUT,
    bottom: Math.round(Math.min(DEFAULT_LAYOUT.bottom, Math.max(150, h * 0.2))),
    // Below about 1000px tall the storyboard starts folded to one line; the timeline still shows every shot.
    storyOpen: h >= 1000,
    left: w < 1500 ? 264 : DEFAULT_LAYOUT.left,
    right: w < 1500 ? 296 : DEFAULT_LAYOUT.right,
  };
}

function readLayout() {
  const base = defaultLayout();
  try {
    const raw = JSON.parse(localStorage.getItem("isola-motion-layout") ?? "{}") as Partial<Layout>;
    return { ...base, ...raw };
  } catch {
    return base;
  }
}
interface Layout {
  left: number;
  right: number;
  bottom: number;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  /** The shot storyboard under the preview (folded to its heading when false). */
  storyOpen: boolean;
}
const DEFAULT_LAYOUT: Layout = { left: 300, right: 328, bottom: 260, leftOpen: true, rightOpen: true, bottomOpen: true, storyOpen: true };
/** Smallest and largest size of each panel, in pixels. */
const PANEL_LIMITS = { left: [240, 520], right: [280, 520], bottom: [140, 560] } as const;

/**
 * A drag handle between panels: a grip you can see, a tooltip saying how to
 * use it, arrow keys (Shift for bigger steps), Home/End for the smallest and
 * largest size, and a double-click to go back to the default.
 */
function Splitter({ axis, onDrag, onSet, label, value, min, max, reset }: { axis: "x" | "y"; onDrag: (delta: number) => void; onSet: (value: number) => void; label: string; value: number; min: number; max: number; reset: number }) {
  const last = useRef<number | null>(null);
  // For the inspector and timeline, dragging towards the editor's centre makes the panel bigger.
  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      title={`${label}: drag, or focus and use the arrow keys. Double-click to reset.`}
      tabIndex={0}
      data-splitter={label}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 12;
        if (axis === "x" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) onDrag(e.key === "ArrowRight" ? step : -step);
        else if (axis === "y" && (e.key === "ArrowUp" || e.key === "ArrowDown")) onDrag(e.key === "ArrowDown" ? step : -step);
        else if (e.key === "Home") onSet(min);
        else if (e.key === "End") onSet(max);
        else return;
        e.preventDefault();
      }}
      onDoubleClick={() => onSet(reset)}
      onPointerDown={(e: ReactPointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        last.current = axis === "x" ? e.clientX : e.clientY;
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        const v = axis === "x" ? e.clientX : e.clientY;
        onDrag(v - last.current);
        last.current = v;
      }}
      onPointerUp={() => (last.current = null)}
      className={cn(
        "group relative z-10 shrink-0 bg-m-ink/[0.06] transition-colors hover:bg-m-accent-2/40 focus-visible:bg-m-accent-2/60 focus-visible:outline-none",
        axis === "x" ? "-mx-[3px] w-[7px] cursor-col-resize border-x-[3px] border-transparent bg-clip-padding" : "-my-[3px] h-[7px] cursor-row-resize border-y-[3px] border-transparent bg-clip-padding",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-m-text-2/50 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
          axis === "x" ? "h-8 w-[3px]" : "h-[3px] w-8",
        )}
      />
    </div>
  );
}

function SaveBadge() {
  const save = useEditor((s) => s.save);
  if (save.state === "error")
    return (
      <span role="alert" className="inline-flex items-center gap-1 text-[12px] text-m-danger-text">
        <CircleAlert className="size-3.5" aria-hidden="true" /> Not saved
        <button type="button" onClick={() => void flushSave()} className="font-semibold underline" title={save.error ?? undefined}>
          Retry
        </button>
      </span>
    );
  if (save.state !== "saved")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-m-muted" aria-live="polite">
        <Spinner className="size-3" /> Saving…
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-m-success-text" aria-live="polite" data-save-state="saved" title="Saved in this browser (local draft, not synced to your account)">
      <Check className="size-3.5" aria-hidden="true" /> Saved in this browser
    </span>
  );
}

function Notice() {
  const notice = useEditor((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useEditor.setState((s) => (s.notice?.at === notice.at ? { notice: null } : s)), notice.tone === "error" ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto fixed bottom-[92px] left-1/2 z-[60] lg:bottom-4 flex max-w-[min(92vw,560px)] -translate-x-1/2 items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] shadow-2xl", notice.tone === "error" ? "bg-[#4A1F1C] text-[#FFD2CC]" : "bg-[#1E2A24] text-[#C8F2D8]")}>
      <span className="flex-1">{notice.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => useEditor.setState({ notice: null })} className="rounded p-0.5 hover:bg-white/10">
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Inspector({ workspace }: { workspace: Workspace }) {
  switch (workspace) {
    case "colour":
      return <ColourPanel />;
    case "text":
      return <TextPanel />;
    case "sound":
      return <SoundPanel />;
    case "export":
      return <DeliverPanel />;
    default:
      return <MotionPanel />;
  }
}

/** A row of tabs heading a side panel. */
function PanelTabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Array<{ id: T; label: string; icon?: typeof Upload }>; value: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" aria-label={label} className="@container flex shrink-0 gap-0.5 overflow-x-auto border-b border-m-line px-2 [scrollbar-width:none]">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn("relative inline-flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-semibold", value === t.id ? "text-m-accent-text after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-m-accent" : "text-m-muted hover:text-m-strong")}
        >
          {t.icon && <t.icon className="hidden size-4 @[330px]:block" aria-hidden="true" />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const mod = e.metaKey || e.ctrlKey;
      // While typing, keys belong to the field. Dropdowns, sliders and tick boxes keep their own
      // plain keys (arrows, space, letters) but let undo, redo and duplicate through.
      const control = !!el && (el.tagName === "SELECT" || (el.tagName === "INPUT" && /^(range|checkbox|radio|color|file|button)$/.test((el as HTMLInputElement).type)));
      const typing = !!el && !control && (el.isContentEditable || /^(INPUT|TEXTAREA)$/.test(el.tagName));
      if ((typing || (control && !mod)) && e.key !== "Escape") return;
      if (document.querySelector("[role=dialog]")) return;
      const st = useEditor.getState();
      const film = st.film;
      if (!film) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (st.selection.clipIds[0]) commit(duplicateClip(film, st.selection.clipIds[0]));
      } else if (e.key === " " && !mod) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const d = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 1 : 1 / film.fps);
        setPlayhead(toFrame(st.playhead + d, film.fps));
      } else if (e.key === "Home") setPlayhead(0);
      else if (e.key === "End") setPlayhead(filmDuration(film));
      else if ((e.key === "Delete" || e.key === "Backspace") && st.selection.clipIds.length) {
        e.preventDefault();
        commit(deleteClips(film, st.selection.clipIds));
      } else if (e.key.toLowerCase() === "s" && !mod) {
        const ids = st.selection.clipIds;
        if (!ids.length) return;
        let next = film;
        for (const id of ids) next = splitClip(next, id, st.playhead).film;
        commit(next === film ? { film, problem: "Move the playhead inside the selected clip to split it." } : next);
      } else if (e.key.toLowerCase() === "m" && !mod) commit(addMarker(film, st.playhead, `Marker ${film.markers.length + 1}`));
      else if (e.key.toLowerCase() === "k" && !mod) {
        const id = st.selection.clipIds.length === 1 ? st.selection.clipIds[0] : null;
        const at = shotAt(film, Math.min(st.playhead, Math.max(0, filmDuration(film) - 1e-3)));
        commit(id ? addTransformKeyframes(film, id, st.playhead) : addCameraKeyframes(film, at.shot.id, at.local));
      } else if ((e.key.toLowerCase() === "q" || e.key.toLowerCase() === "w") && !mod) {
        const id = st.selection.clipIds.length === 1 ? st.selection.clipIds[0] : null;
        if (!id) return;
        commit(trimClip(film, id, e.key.toLowerCase() === "q" ? "start" : "end", st.playhead));
      }
      else if (e.key === "Escape") select({ clipIds: [], keyframe: null });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Editor() {
  const film = useEditor((s) => s.film)!;
  const workspace = useEditor((s) => s.workspace);
  const saveState = useEditor((s) => s.save.state);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const narrow = useNarrow();
  const theme = useMotionTheme();
  const [layout, setLayout] = useState<Layout>(readLayout);
  // Focus on the preview: hides the library, inspector and timeline together, and brings them back as they were.
  const [focus, setFocus] = useState(false);
  const show = { left: layout.leftOpen && !focus, right: layout.rightOpen && !focus, bottom: layout.bottomOpen && !focus };
  const [tab, setTab] = useState<LibraryTab>("styles");
  const [updating, setUpdating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const scenes = useScenes((s) => s.scenes);
  usePlayback();
  useShortcuts();
  // On desktop the studio's sidebar folds to icons while you edit, so the preview gets the room (Expand brings it back).
  useEffect(() => {
    if (narrow) return;
    setEditorOpen(true);
    return () => setEditorOpen(false);
  }, [narrow]);

  useEffect(() => {
    void loadScenes().catch(() => undefined);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("isola-motion-layout", JSON.stringify(layout));
    } catch {
      /* private mode */
    }
  }, [layout]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().save.state !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const source = film.source ? (scenes.find((s) => s.id === film.source!.sceneId) ?? null) : null;
  const sceneChanged = sceneChangedSince(film, source);
  const resize = useCallback((key: "left" | "right" | "bottom", delta: number) => {
    setLayout((l) => {
      const [lo, hi] = PANEL_LIMITS[key];
      return { ...l, [key]: Math.min(hi, Math.max(lo, l[key] + delta)) };
    });
  }, []);
  const setSize = useCallback((key: "left" | "right" | "bottom", value: number) => {
    const [lo, hi] = PANEL_LIMITS[key];
    setLayout((l) => ({ ...l, [key]: Math.min(hi, Math.max(lo, value)) }));
  }, []);
  const openInspector = (id: Workspace) => {
    setWorkspace(id);
    setFocus(false);
    setLayout((l) => ({ ...l, rightOpen: true }));
    // The library follows along: sound files beside Sound, titles and lights beside Text.
    if (id === "sound") setTab("audio");
    if (id === "text") setTab("elements");
  };

  const library = (
    <aside aria-label="Library" className="flex min-h-0 flex-1 flex-col bg-m-panel">
      <PanelTabs label="Library" tabs={LIBRARY_TABS} value={tab} onChange={setTab} />
      <div role="tabpanel" aria-label={LIBRARY_TABS.find((t) => t.id === tab)?.label} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <LibraryPanel tab={tab} />
      </div>
    </aside>
  );

  const inspector = (
    <aside aria-label="Inspector" className="flex min-h-0 flex-1 flex-col bg-m-panel">
      <PanelTabs label="Inspector" tabs={INSPECTOR_TABS} value={workspace} onChange={openInspector} />
      <div role="tabpanel" aria-label={INSPECTOR_TABS.find((t) => t.id === workspace)?.label} className="min-h-0 flex-1 overflow-y-auto pt-3 [scrollbar-width:thin]" data-inspector-panel={workspace}>
        <Inspector workspace={workspace} />
      </div>
    </aside>
  );

  const statusBar = (
    <div className="flex shrink-0 items-center gap-3 border-t border-m-line bg-m-chrome px-3 py-1 text-[11px] text-m-subtle" data-status-bar>
      <span className="inline-flex min-w-0 items-center gap-1.5" data-linked-source>
        <Link2 className="size-3.5 shrink-0" aria-hidden="true" />
        {film.source ? (
          <>
            <span className="shrink-0">Linked source:</span>
            {source ? (
              <Link href={`/studio/scenes/${source.id}`} className="truncate font-semibold text-m-text-2 hover:text-m-accent-text hover:underline">
                {source.name}
              </Link>
            ) : (
              <span className="truncate font-semibold text-m-text-2">{film.source.sceneName} (not in this browser)</span>
            )}
          </>
        ) : (
          <span>Not linked to a scene</span>
        )}
      </span>
      <span className="hidden shrink-0 tabular-nums sm:inline">
        {secs(filmDuration(film))} · {film.fps} fps · {film.aspect}
      </span>
      <span className="ml-auto hidden truncate lg:inline">Space play · ←/→ frame · S split · K keyframe · Q/W trim · M marker · Ctrl+Z undo · Ctrl+D duplicate</span>
    </div>
  );

  return (
    <div
      className={cn("flex h-[calc(100dvh-4rem)] min-h-[520px] flex-col overflow-hidden bg-m-bg text-m-text", theme === "dark" ? "[color-scheme:dark]" : "[color-scheme:light]", creativeFontClasses)}
      data-motion-studio={theme}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void importFiles(Array.from(e.dataTransfer.files), setImporting);
      }}
    >
      <h1 className="sr-only">Motion Studio: {film.name}</h1>
      {/* Film bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-m-line bg-m-chrome px-3 py-1.5" data-film-bar>
        <nav aria-label="Film" className="flex min-w-0 items-center gap-1 text-[13px]">
          <Link href={source ? `/studio/scenes/${source.id}` : "/studio/scenes"} className="hidden shrink-0 rounded-md px-1.5 py-1 text-m-muted hover:bg-m-ink/[0.06] hover:text-m-strong sm:inline" title={source ? `Open “${source.name}” in Scene Studio` : "Scene Studio"}>
            Scene Studio
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-m-subtle sm:block" aria-hidden="true" />
          <Link href="/studio/motion" className="shrink-0 rounded-md px-1.5 py-1 font-semibold text-m-text-2 hover:bg-m-ink/[0.06] hover:text-m-strong" title="All films">
            Motion Studio
          </Link>
          <span className="text-m-subtle" aria-hidden="true">
            /
          </span>
          <label htmlFor="film-name" className="sr-only">
            Film name
          </label>
          <input
            id="film-name"
            key={film.name}
            defaultValue={film.name}
            maxLength={80}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== film.name && commit({ ...film, name: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="h-8 w-[200px] min-w-0 rounded-[8px] border border-transparent bg-transparent px-2 text-[14px] font-semibold text-m-strong hover:border-m-line-strong focus:border-m-accent-2 focus:outline-none"
          />
        </nav>
        <SaveBadge />
        <div className="ml-auto flex items-center gap-1">
          {film.source && source && (
            <button
              type="button"
              onClick={() => setUpdating(true)}
              title={sceneChanged ? "The scene has changed since this film last took it in" : "The film is up to date with its scene"}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-[9px] border px-2.5 text-[13px] font-semibold", sceneChanged ? "border-m-key/60 bg-m-warn-bg text-m-warn-text" : "border-m-line text-m-text-2 hover:bg-m-ink/[0.06]")}
              data-update-from-scene={sceneChanged ? "changed" : "current"}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              <span className="hidden md:inline">Update from scene</span>
              <span className="md:hidden">Update</span>
            </button>
          )}
          <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
            <Redo2 className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label={theme === "dark" ? "Use the light workspace" : "Use the dark workspace"} onClick={() => writeTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
          </IconButton>
          <button type="button" onClick={() => openInspector("export")} className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-m-accent px-3 text-[13px] font-semibold text-white shadow-[0_6px_14px_-8px_var(--color-m-accent)] hover:bg-m-accent-hover">
            <Upload className="size-3.5" aria-hidden="true" /> Export video
          </button>
        </div>
      </div>

      {(sceneChanged || saveState === "error") && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-m-line bg-m-warn-bg px-3 py-1.5 text-[12px] text-m-warn-text" role="status">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {saveState === "error" ? (
            <span>{useEditor.getState().save.error ?? "This film couldn't be saved in this browser."}</span>
          ) : (
            <>
              <span>“{film.source?.sceneName}” has changed in Scene Studio since this film last took it in.</span>
              <button type="button" onClick={() => setUpdating(true)} className="font-semibold underline">
                Review update
              </button>
            </>
          )}
        </div>
      )}
      {source && <UpdateDialog film={film} scene={source} open={updating} onOpenChange={setUpdating} />}

      {narrow ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="h-[38dvh] min-h-[220px] shrink-0 border-b border-m-line">
            <Viewer />
          </div>
          <PhoneEditor />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {show.left && (
              <>
                <div className="flex min-h-0 shrink-0 flex-col border-r border-m-line" style={{ width: layout.left }}>
                  {library}
                </div>
                <Splitter axis="x" label="Resize library" value={layout.left} min={PANEL_LIMITS.left[0]} max={PANEL_LIMITS.left[1]} reset={defaultLayout().left} onDrag={(d) => resize("left", d)} onSet={(v) => setSize("left", v)} />
              </>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <Viewer />
              </div>
              {!focus && (
                <div className="shrink-0 border-t border-m-line bg-m-chrome">
                  <Storyboard open={layout.storyOpen} onToggle={() => setLayout((l) => ({ ...l, storyOpen: !l.storyOpen }))} />
                </div>
              )}
            </div>
            {show.right && (
              <>
                <Splitter axis="x" label="Resize inspector" value={layout.right} min={PANEL_LIMITS.right[0]} max={PANEL_LIMITS.right[1]} reset={defaultLayout().right} onDrag={(d) => resize("right", -d)} onSet={(v) => setSize("right", v)} />
                <div className="flex min-h-0 shrink-0 flex-col border-l border-m-line" style={{ width: layout.right }}>
                  {inspector}
                </div>
              </>
            )}
          </div>
          {show.bottom && <Splitter axis="y" label="Resize timeline" value={layout.bottom} min={PANEL_LIMITS.bottom[0]} max={PANEL_LIMITS.bottom[1]} reset={defaultLayout().bottom} onDrag={(d) => resize("bottom", -d)} onSet={(v) => setSize("bottom", v)} />}
          <div className="flex shrink-0 items-center gap-1 border-t border-m-line bg-m-chrome px-2 py-0.5">
            <IconButton label={show.left ? "Hide library" : "Show library"} onClick={() => (setFocus(false), setLayout((l) => ({ ...l, leftOpen: !show.left })))}>
              {show.left ? <PanelLeftClose className="size-4" aria-hidden="true" /> : <PanelLeftOpen className="size-4" aria-hidden="true" />}
            </IconButton>
            <IconButton label={show.bottom ? "Hide timeline" : "Show timeline"} onClick={() => (setFocus(false), setLayout((l) => ({ ...l, bottomOpen: !show.bottom })))}>
              {show.bottom ? <PanelBottomClose className="size-4" aria-hidden="true" /> : <PanelBottomOpen className="size-4" aria-hidden="true" />}
            </IconButton>
            <IconButton label={show.right ? "Hide inspector" : "Show inspector"} onClick={() => (setFocus(false), setLayout((l) => ({ ...l, rightOpen: !show.right })))}>
              {show.right ? <PanelRightClose className="size-4" aria-hidden="true" /> : <PanelRightOpen className="size-4" aria-hidden="true" />}
            </IconButton>
            <IconButton label={focus ? "Show all panels" : "Focus on the preview"} onClick={() => setFocus((f) => !f)}>
              {focus ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
            </IconButton>
            <span className="ml-1 text-[12px] font-semibold text-m-text-2">Timeline</span>
          </div>
          {show.bottom && (
            <div className="shrink-0 bg-m-chrome" style={{ height: layout.bottom }}>
              <Timeline />
            </div>
          )}
          {statusBar}
        </div>
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-[70] grid place-items-center rounded-[18px] border-2 border-dashed border-m-accent-2 bg-m-bg/80 text-[16px] font-semibold text-m-strong">Drop images, video or sound to add them</div>
      )}
      {importing && (
        <div role="status" className="fixed right-4 top-20 z-[60] flex items-center gap-2 rounded-[10px] border border-m-line bg-m-raised px-3 py-2 text-[13px] text-m-text-2 shadow-xl">
          <Spinner className="size-4" /> {importing}
        </div>
      )}
      <Notice />
    </div>
  );
}

/** Motion Studio for one film: loads it from this browser and opens the editor. */
export function MotionStudio({ id }: { id: string }) {
  const status = useFilms((s) => s.status);
  const libStatus = useLibraryReady();
  const loaded = useEditor((s) => s.film?.id === id);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadFilms()
      .catch(() => undefined)
      .then(() => {
        if (!alive) return;
        const f = getFilm(id);
        if (f && !f.trashedAt) openFilm(f);
        else setMissing(true);
      });
    return () => {
      alive = false;
      void flushSave();
      closeFilm();
    };
  }, [id]);
  if (status === "unavailable") return <Shell>This browser isn&apos;t letting ISOLA store films (private browsing can do this).</Shell>;
  if (missing)
    return (
      <Shell>
        This film isn&apos;t in this browser.{" "}
        <Link href="/studio/motion" className="font-semibold text-blue-700 underline">
          See your films
        </Link>
      </Shell>
    );
  if (!loaded || libStatus === "loading" || libStatus === "idle")
    return (
      <Shell>
        <Spinner className="mr-2 text-blue" /> Opening Motion Studio…
      </Shell>
    );
  return <Editor />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-6 text-center text-[14px] text-muted" role="status">
      {children}
    </div>
  );
}
