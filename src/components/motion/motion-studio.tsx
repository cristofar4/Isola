"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, CircleAlert, PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Redo2, Undo2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { NameDialogHost } from "@/components/studio/name-dialog";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { closeFilm, commit, flushSave, openFilm, redo, select, setPlayhead, setWorkspace, undo, useEditor, type Workspace } from "@/lib/motion/editor";
import { addMarker, deleteClips, duplicateClip, splitClip } from "@/lib/motion/ops";
import { sceneChangedSince } from "@/lib/motion/scene-link";
import { getFilm, loadFilms, useFilms } from "@/lib/motion/store";
import { filmDuration, toFrame } from "@/lib/motion/time";
import { creativeFontClasses } from "@/lib/scene/fonts";
import { loadScenes, useScenes } from "@/lib/scene/store";
import { useLibraryReady } from "@/components/studio/library-hooks";
import { importFiles } from "./add-media";
import { ColourPanel } from "./colour-panel";
import { DeliverPanel } from "./deliver-panel";
import { AnimatePanel, AssemblePanel } from "./inspector";
import { LIBRARY_TABS, LibraryPanel, UpdateDialog, type LibraryTab } from "./library-panel";
import { togglePlay, usePlayback } from "./playback";
import { SoundPanel } from "./sound-panel";
import { Storyboard } from "./storyboard";
import { Timeline } from "./timeline";
import { IconButton } from "./ui";
import { Viewer } from "./viewer";

const WORKSPACES: Array<{ id: Workspace; label: string; library: LibraryTab; inspector: string }> = [
  { id: "assemble", label: "Assemble", library: "media", inspector: "Inspector" },
  { id: "animate", label: "Animate", library: "styles", inspector: "Animate" },
  { id: "colour", label: "Colour", library: "media", inspector: "Colour" },
  { id: "sound", label: "Sound", library: "audio", inspector: "Sound" },
  { id: "deliver", label: "Deliver", library: "media", inspector: "Deliver" },
];

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

function readLayout() {
  try {
    const raw = JSON.parse(localStorage.getItem("isola-motion-layout") ?? "{}") as Partial<Layout>;
    return { ...DEFAULT_LAYOUT, ...raw };
  } catch {
    return DEFAULT_LAYOUT;
  }
}
interface Layout {
  left: number;
  right: number;
  bottom: number;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
}
const DEFAULT_LAYOUT: Layout = { left: 300, right: 320, bottom: 260, leftOpen: true, rightOpen: true, bottomOpen: true };

/** A drag handle between panels. */
function Splitter({ axis, onDrag, label, value, min, max }: { axis: "x" | "y"; onDrag: (delta: number) => void; label: string; value: number; min: number; max: number }) {
  const last = useRef<number | null>(null);
  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 12;
        if (axis === "x" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) onDrag(e.key === "ArrowRight" ? step : -step);
        if (axis === "y" && (e.key === "ArrowUp" || e.key === "ArrowDown")) onDrag(e.key === "ArrowDown" ? step : -step);
      }}
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
      className={cn("shrink-0 bg-white/[0.04] transition-colors hover:bg-[#8B9BFF]/40 focus:bg-[#8B9BFF]/50 focus:outline-none", axis === "x" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize")}
    />
  );
}

function SaveBadge() {
  const save = useEditor((s) => s.save);
  if (save.state === "error")
    return (
      <span role="alert" className="inline-flex items-center gap-1 text-[12px] text-[#FFB4AD]">
        <CircleAlert className="size-3.5" aria-hidden="true" /> Not saved
        <button type="button" onClick={() => void flushSave()} className="font-semibold underline" title={save.error ?? undefined}>
          Retry
        </button>
      </span>
    );
  if (save.state !== "saved")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-[#9AA1B2]" aria-live="polite">
        <Spinner className="size-3" /> Saving…
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-[#9AE6B4]" aria-live="polite" data-save-state="saved" title="Saved in this browser (local draft, not synced to your account)">
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
    <div role={notice.tone === "error" ? "alert" : "status"} className={cn("pointer-events-auto fixed bottom-4 left-1/2 z-[60] flex max-w-[min(92vw,560px)] -translate-x-1/2 items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] shadow-2xl", notice.tone === "error" ? "bg-[#4A1F1C] text-[#FFD2CC]" : "bg-[#1E2A24] text-[#C8F2D8]")}>
      <span className="flex-1">{notice.text}</span>
      <button type="button" aria-label="Dismiss" onClick={() => useEditor.setState({ notice: null })} className="rounded p-0.5 hover:bg-white/10">
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function Inspector({ workspace }: { workspace: Workspace }) {
  switch (workspace) {
    case "animate":
      return <AnimatePanel />;
    case "colour":
      return <ColourPanel />;
    case "sound":
      return <SoundPanel />;
    case "deliver":
      return <DeliverPanel />;
    default:
      return <AssemblePanel />;
  }
}

function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !(e.key === "Escape")) return;
      if (document.querySelector("[role=dialog]")) return;
      const st = useEditor.getState();
      const film = st.film;
      if (!film) return;
      const mod = e.metaKey || e.ctrlKey;
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
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [tab, setTab] = useState<LibraryTab>("media");
  const [mobilePanel, setMobilePanel] = useState<"timeline" | "storyboard" | "library" | "inspector">("timeline");
  const [updating, setUpdating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const scenes = useScenes((s) => s.scenes);
  usePlayback();
  useShortcuts();

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
  const ws = WORKSPACES.find((w) => w.id === workspace)!;
  const resize = useCallback((key: "left" | "right" | "bottom", delta: number) => {
    setLayout((l) => {
      const limits = { left: [220, 520], right: [260, 520], bottom: [140, 560] } as const;
      const [lo, hi] = limits[key];
      return { ...l, [key]: Math.min(hi, Math.max(lo, l[key] + delta)) };
    });
  }, []);

  const libraryRail = (
    <nav aria-label="Creative library" className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-white/[0.08] bg-[#12151B] py-2">
      {LIBRARY_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            setTab(t.id);
            setLayout((l) => ({ ...l, leftOpen: true }));
            if (narrow) setMobilePanel("library");
          }}
          aria-pressed={tab === t.id && (layout.leftOpen || narrow)}
          className={cn("grid w-[52px] place-items-center gap-0.5 rounded-[8px] py-1.5 text-[10px] font-medium", tab === t.id ? "bg-white/[0.08] text-white" : "text-[#9AA1B2] hover:bg-white/[0.05] hover:text-white")}
        >
          <t.icon className="size-[18px]" aria-hidden="true" />
          {t.label}
        </button>
      ))}
    </nav>
  );

  const library = (
    <aside aria-label={`Library: ${LIBRARY_TABS.find((t) => t.id === tab)?.label}`} className="min-h-0 overflow-y-auto bg-[#161A21] [scrollbar-width:thin]">
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#C9CEDA]">{tab === "styles" ? "Motion styles" : LIBRARY_TABS.find((t) => t.id === tab)?.label}</h2>
      </div>
      <LibraryPanel tab={tab} />
    </aside>
  );

  const inspector = (
    <aside aria-label={ws.inspector} className="min-h-0 overflow-y-auto bg-[#161A21] [scrollbar-width:thin]" data-inspector-panel={workspace}>
      <div className="sticky top-0 z-10 flex items-center justify-between bg-[#161A21] px-3 pb-2 pt-3">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#C9CEDA]">{ws.inspector}</h2>
      </div>
      <Inspector workspace={workspace} />
    </aside>
  );

  return (
    <div
      className={cn("flex h-dvh flex-col overflow-hidden bg-[#101318] text-[#E8EAF0] [color-scheme:dark]", creativeFontClasses)}
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
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.08] bg-[#12151B] px-3 py-2">
        <Link href="/studio/motion" aria-label="Back to Motion Studio films" className="inline-flex size-8 items-center justify-center rounded-[8px] text-[#C9CEDA] hover:bg-white/[0.08]">
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <span className="hidden leading-none sm:block">
          <span className="block font-display text-[16px] font-extrabold tracking-[0.22em] text-white">ISOLA</span>
          <span className="block text-[9px] font-semibold tracking-[0.24em] text-[#9AA1B2]">MOTION STUDIO</span>
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
          className="h-8 w-[180px] min-w-0 rounded-[8px] border border-transparent bg-transparent px-2 text-[14px] font-semibold text-white hover:border-white/10 focus:border-[#8B9BFF] focus:outline-none"
        />
        <nav aria-label="Workspaces" className="order-last flex w-full gap-1 overflow-x-auto rounded-[10px] bg-white/[0.04] p-1 md:order-none md:mx-auto md:w-auto">
          {WORKSPACES.map((w) => (
            <button
              key={w.id}
              type="button"
              aria-current={workspace === w.id ? "page" : undefined}
              onClick={() => {
                setWorkspace(w.id);
                setTab(w.library);
                if (narrow) setMobilePanel("inspector");
              }}
              className={cn("h-8 shrink-0 rounded-[8px] px-3.5 text-[13px] font-semibold", workspace === w.id ? "bg-[#5465E6] text-white" : "text-[#C9CEDA] hover:bg-white/[0.06]")}
            >
              {w.label}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <SaveBadge />
          <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 className="size-4" aria-hidden="true" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
            <Redo2 className="size-4" aria-hidden="true" />
          </IconButton>
          <button type="button" onClick={() => setWorkspace("deliver")} className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[#5465E6] px-3 text-[13px] font-semibold text-white hover:bg-[#4757D9]">
            <Upload className="size-3.5" aria-hidden="true" /> Export film
          </button>
        </div>
      </header>

      {(sceneChanged || saveState === "error") && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#2A2414] px-3 py-1.5 text-[12px] text-[#F5D58A]" role="status">
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
        <main id="main" className="flex min-h-0 flex-1 flex-col">
          <h1 className="sr-only">Motion Studio: {film.name}</h1>
          <div className="h-[46dvh] min-h-[240px] shrink-0 border-b border-white/[0.08]">
            <Viewer />
          </div>
          <div role="tablist" aria-label="Panels" className="flex shrink-0 gap-1 border-b border-white/[0.08] px-2 py-1">
            {(["timeline", "storyboard", "library", "inspector"] as const).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={mobilePanel === p} onClick={() => setMobilePanel(p)} className={cn("h-8 flex-1 rounded-[8px] text-[12px] font-semibold capitalize", mobilePanel === p ? "bg-white/[0.1] text-white" : "text-[#9AA1B2]")}>
                {p === "inspector" ? ws.inspector : p}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {mobilePanel === "timeline" && <Timeline />}
            {mobilePanel === "storyboard" && <Storyboard />}
            {mobilePanel === "library" && (
              <div className="flex h-full">
                {libraryRail}
                <div className="min-w-0 flex-1 overflow-y-auto">{library}</div>
              </div>
            )}
            {mobilePanel === "inspector" && <div className="h-full overflow-y-auto">{inspector}</div>}
          </div>
        </main>
      ) : (
        <main id="main" className="flex min-h-0 flex-1 flex-col">
          <h1 className="sr-only">Motion Studio: {film.name}</h1>
          <div className="flex min-h-0 flex-1">
            {libraryRail}
            {layout.leftOpen && (
              <>
                <div className="flex min-h-0 shrink-0 flex-col" style={{ width: layout.left }}>
                  {library}
                </div>
                <Splitter axis="x" label="Resize library" value={layout.left} min={220} max={520} onDrag={(d) => resize("left", d)} />
              </>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <Viewer />
              </div>
              <div className="shrink-0 border-t border-white/[0.08] bg-[#12151B]">
                <Storyboard />
              </div>
            </div>
            {layout.rightOpen && (
              <>
                <Splitter axis="x" label="Resize inspector" value={layout.right} min={260} max={520} onDrag={(d) => resize("right", -d)} />
                <div className="flex min-h-0 shrink-0 flex-col" style={{ width: layout.right }}>
                  {inspector}
                </div>
              </>
            )}
          </div>
          {layout.bottomOpen && <Splitter axis="y" label="Resize timeline" value={layout.bottom} min={140} max={560} onDrag={(d) => resize("bottom", -d)} />}
          <div className="flex shrink-0 items-center gap-1 border-t border-white/[0.08] bg-[#12151B] px-2 py-0.5">
            <IconButton label={layout.leftOpen ? "Hide library" : "Show library"} onClick={() => setLayout((l) => ({ ...l, leftOpen: !l.leftOpen }))}>
              {layout.leftOpen ? <PanelLeftClose className="size-4" aria-hidden="true" /> : <PanelLeftOpen className="size-4" aria-hidden="true" />}
            </IconButton>
            <IconButton label={layout.bottomOpen ? "Hide timeline" : "Show timeline"} onClick={() => setLayout((l) => ({ ...l, bottomOpen: !l.bottomOpen }))}>
              {layout.bottomOpen ? <PanelBottomClose className="size-4" aria-hidden="true" /> : <PanelBottomOpen className="size-4" aria-hidden="true" />}
            </IconButton>
            <IconButton label={layout.rightOpen ? "Hide inspector" : "Show inspector"} onClick={() => setLayout((l) => ({ ...l, rightOpen: !l.rightOpen }))}>
              {layout.rightOpen ? <PanelRightClose className="size-4" aria-hidden="true" /> : <PanelRightOpen className="size-4" aria-hidden="true" />}
            </IconButton>
            <span className="ml-2 truncate text-[11px] text-[#8890A2]">Space play · ←/→ frame · S split · M marker · Delete · Ctrl+Z/Shift+Z · Ctrl+D duplicate</span>
          </div>
          {layout.bottomOpen && (
            <div className="shrink-0 bg-[#13161C]" style={{ height: layout.bottom }}>
              <Timeline />
            </div>
          )}
        </main>
      )}
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-[70] grid place-items-center rounded-[18px] border-2 border-dashed border-[#8B9BFF] bg-[#101318]/80 text-[16px] font-semibold text-white">Drop images, video or sound to add them</div>
      )}
      {importing && (
        <div role="status" className="fixed right-4 top-16 z-[60] flex items-center gap-2 rounded-[10px] bg-[#1D222B] px-3 py-2 text-[13px] text-[#C9CEDA] shadow-xl">
          <Spinner className="size-4" /> {importing}
        </div>
      )}
      <Notice />
      <NameDialogHost />
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
        <Link href="/studio/motion" className="font-semibold text-[#A4B1FF] underline">
          See your films
        </Link>
      </Shell>
    );
  if (!loaded || libStatus === "loading" || libStatus === "idle")
    return (
      <Shell>
        <Spinner className="mr-2 text-[#8B9BFF]" /> Opening Motion Studio…
      </Shell>
    );
  return <Editor />;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex h-dvh items-center justify-center bg-[#101318] px-6 text-center text-[14px] text-[#C9CEDA]" role="status">
      {children}
    </main>
  );
}

