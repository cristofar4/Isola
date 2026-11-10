"use client";

import Link from "next/link";
import { Tabs } from "radix-ui";
import {
  ArrowDown,
  ArrowUp,
  Box,
  Check,
  CircleAlert,
  Clapperboard,
  Copy,
  Download,
  Eye,
  EyeOff,
  Hand,
  Image as ImageIcon,
  Lock,
  Magnet,
  Move,
  Plus,
  Redo2,
  RotateCw,
  Scaling,
  Search,
  ShieldCheck,
  SplitSquareHorizontal,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryReady, useThumb } from "@/components/studio/library-hooks";
import { defaultPreset, usePresets } from "@/components/studio/use-presets";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { backdropBitmap } from "@/lib/scene/backdrops";
import { downloadScene, type StillFormat } from "@/lib/scene/export";
import { creativeFontClasses } from "@/lib/scene/fonts";
import {
  BACKDROPS,
  backdropInfo,
  FONT_LABEL,
  FONT_WEIGHTS,
  FORMAT_ORDER,
  logoLayer,
  productLayer,
  SCENE_FORMATS,
  shadowLayer,
  standOnSurface,
  textLayer,
  type BackdropId,
  type FontId,
  type Scene,
  type SceneFormatId,
  type SceneLayer,
} from "@/lib/scene/model";
import { missingAssets, sceneAssetIds } from "@/lib/scene/render";
import { assetImage, loadAssetImages } from "@/lib/scene/resources";
import { getScene, loadScenes, saveScene, useScenes } from "@/lib/scene/store";
import { addAssets, makeCutout, useLibrary, type Asset } from "@/lib/studio/library";
import { LibraryStorageError } from "@/lib/studio/library-db";
import { AnimateDialog } from "./animate-dialog";
import { NumberField, RangeField, Section } from "./fields";
import { SceneCanvas, SceneThumb, type DragMode } from "./scene-canvas";

/* ------------------------------------------------------------- document --- */

type SaveState = { state: "saved" | "saving" | "unsaved" | "error"; error: string | null; at: number };

function useSceneDoc(initial: Scene) {
  const [doc, setDoc] = useState({ scene: initial, past: [] as Scene[], future: [] as Scene[] });
  const [save, setSave] = useState<SaveState>({ state: "saved", error: null, at: initial.updatedAt });
  const latest = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persist = useCallback(async () => {
    const s = latest.current;
    setSave((x) => ({ ...x, state: "saving" }));
    try {
      const stored = await saveScene(s);
      setSave(latest.current === s ? { state: "saved", error: null, at: stored.updatedAt } : (x) => ({ ...x, state: "unsaved" }));
    } catch (e) {
      setSave((x) => ({ ...x, state: "error", error: e instanceof LibraryStorageError ? e.message : "Saving failed in this browser." }));
    }
  }, []);

  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    setSave((x) => ({ ...x, state: "unsaved" }));
    timer.current = setTimeout(() => void persist(), 450);
  }, [persist]);

  useEffect(
    () => () => {
      // Leaving with changes not yet written: write them now.
      if (timer.current) {
        clearTimeout(timer.current);
        void saveScene(latest.current).catch(() => undefined);
      }
    },
    [],
  );

  const commit = useCallback(
    (next: Scene, base?: Scene) => {
      setDoc((d) => {
        const from = base ?? d.scene;
        if (JSON.stringify(from.layers) === JSON.stringify(next.layers) && from.name === next.name && from.format === next.format && from.formats.join() === next.formats.join()) return { ...d, scene: next };
        return { scene: next, past: [...d.past, from].slice(-80), future: [] };
      });
      latest.current = next;
      schedule();
    },
    [schedule],
  );
  const preview = useCallback((next: Scene) => setDoc((d) => ({ ...d, scene: next })), []);
  const undo = useCallback(() => {
    setDoc((d) => {
      const prev = d.past[d.past.length - 1];
      if (!prev) return d;
      latest.current = prev;
      return { scene: prev, past: d.past.slice(0, -1), future: [d.scene, ...d.future] };
    });
    schedule();
  }, [schedule]);
  const redo = useCallback(() => {
    setDoc((d) => {
      const next = d.future[0];
      if (!next) return d;
      latest.current = next;
      return { scene: next, past: [...d.past, d.scene], future: d.future.slice(1) };
    });
    schedule();
  }, [schedule]);
  return { ...doc, save, commit, preview, undo, redo, retry: persist };
}

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  if (save.state === "error")
    return (
      <span role="alert" className="inline-flex items-center gap-1.5 text-[13px] text-danger">
        <CircleAlert className="size-4" aria-hidden="true" /> Not saved: {save.error}{" "}
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Retry
        </button>
      </span>
    );
  if (save.state === "saving" || save.state === "unsaved")
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted" aria-live="polite">
        <Spinner className="size-3.5" /> Saving…
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-success" aria-live="polite" data-save-state="saved">
      <Check className="size-4" aria-hidden="true" /> Saved in this browser
    </span>
  );
}

/* --------------------------------------------------------------- panels --- */

function BackdropTile({ id, name, selected, onPick }: { id: BackdropId; name: string; selected: boolean; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = 240;
    c.height = 180;
    const ctx = c.getContext("2d");
    if (ctx) ctx.drawImage(backdropBitmap(id, 240, 180, null), 0, 0);
  }, [id]);
  return (
    <button type="button" onClick={onPick} aria-pressed={selected} data-backdrop={id} className="group grid gap-1.5 text-left">
      <span className={cn("relative block overflow-hidden rounded-[12px] border-2", selected ? "border-blue" : "border-transparent group-hover:border-line-strong")}>
        <canvas ref={ref} aria-hidden="true" className="block aspect-[4/3] w-full" />
        {selected && (
          <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-blue text-white">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="text-[13px] font-medium text-ink">{name}</span>
    </button>
  );
}

function AssetTile({ asset, onPick }: { asset: Asset; onPick: () => void }) {
  const url = useThumb(asset.id);
  return (
    <button type="button" onClick={onPick} data-scene-asset={asset.name} className="group grid gap-1 text-left" title={asset.hasAlpha ? `Add ${asset.name}` : `${asset.name} has no transparency: make a cutout first`}>
      <span className="checkerboard-sm relative block aspect-square overflow-hidden rounded-[10px] border border-line group-hover:border-blue/50">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        {url && <img src={url} alt="" className="size-full object-contain p-1.5" />}
        {!asset.hasAlpha && <span className="absolute inset-x-1 bottom-1 rounded bg-warn-50 px-1 text-center text-[10px] font-semibold text-warn">No cutout</span>}
      </span>
      <span className="truncate text-[12px] text-ink-3">{asset.name}</span>
    </button>
  );
}

type Category = "All" | "Studio" | "Natural" | "Interior";

function LeftPanel({ scene, onAddAsset, onBackdrop, notice }: { scene: Scene; onAddAsset: (a: Asset, as: "product" | "logo" | "background") => void; onBackdrop: (id: BackdropId) => void; notice: (text: string, tone?: "ok" | "error") => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category>("All");
  const [cutting, setCutting] = useState<string | null>(null);
  const assets = useLibrary((s) => s.assets);
  const inputRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const backdrop = scene.layers.find((l) => l.kind === "backdrop");
  const current = backdrop?.kind === "backdrop" ? backdrop.backdrop : null;
  const q = query.trim().toLowerCase();
  const tiles = BACKDROPS.filter((b) => (cat === "All" || b.category === cat) && (!q || `${b.name} ${b.keywords} ${b.category}`.toLowerCase().includes(q)));
  const usable = useMemo(() => assets.filter((a) => !a.trashedAt && a.kind !== "background").sort((a, b) => Number(b.hasAlpha) - Number(a.hasAlpha) || b.createdAt - a.createdAt), [assets]);
  const backgrounds = useMemo(() => assets.filter((a) => !a.trashedAt && a.kind === "background"), [assets]);

  async function upload(files: File[], as: "product" | "background") {
    if (!files.length) return;
    const { added, duplicates, rejected } = await addAssets(files, as === "background" ? { kind: "background" } : {});
    if (rejected.length) notice(`${rejected[0].name}: ${rejected[0].reason}`, "error");
    const first = added[0] ?? duplicates[0]?.asset;
    if (!first) return;
    if (as === "background") return onAddAsset(first, "background");
    if (first.hasAlpha || first.kind === "logo") onAddAsset(first, first.kind === "logo" ? "logo" : "product");
    else notice(`${first.name} is in your library. It has no transparency yet: choose it below to make a cutout.`);
  }

  async function pick(a: Asset) {
    if (a.kind === "logo") return onAddAsset(a, "logo");
    if (a.hasAlpha) return onAddAsset(a, "product");
    setCutting(a.id);
    try {
      const cut = await makeCutout(a.id);
      onAddAsset(cut, "product");
      notice(`Made a cutout of ${a.name} on this device and added it.`);
    } catch (e) {
      notice(e instanceof Error ? e.message : "The background couldn't be removed.", "error");
    } finally {
      setCutting(null);
    }
  }

  return (
    <Tabs.Root defaultValue="scenes" className="flex min-h-0 flex-col">
      <Tabs.List aria-label="Scene library" className="flex border-b border-line px-3">
        {(["scenes", "assets"] as const).map((v) => (
          <Tabs.Trigger key={v} value={v} className="relative px-3 py-3 text-[15px] font-semibold capitalize text-muted data-[state=active]:text-blue-700 data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-blue">
            {v === "scenes" ? "Scenes" : "Assets"}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="scenes" className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3 [scrollbar-width:thin]">
        <label className="relative block">
          <span className="sr-only">Find a backdrop</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a backdrop" className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-blue focus:ring-3 focus:ring-blue/15" />
        </label>
        <div role="group" aria-label="Backdrop type" className="flex flex-wrap gap-1.5">
          {(["All", "Studio", "Natural", "Interior"] as Category[]).map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={cn("h-8 rounded-full px-3 text-[13px] font-medium", cat === c ? "bg-blue-50 text-blue-700 ring-1 ring-blue/20" : "border border-line text-ink-3 hover:text-ink")}>
              {c}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((b) => (
            <BackdropTile key={b.id} id={b.id} name={b.name} selected={current === b.id && !(backdrop?.kind === "backdrop" && backdrop.imageAssetId)} onPick={() => onBackdrop(b.id)} />
          ))}
          {!tiles.length && <p className="col-span-2 py-6 text-center text-[13px] text-muted">No backdrops match “{query}”.</p>}
        </div>
        <p className="text-[12px] leading-relaxed text-muted">Backdrops are drawn by ISOLA at any size, so they stay sharp in every format.</p>
        {backgrounds.length > 0 && (
          <div className="grid gap-2">
            <p className="text-[13px] font-semibold text-ink">Your backgrounds</p>
            <div className="grid grid-cols-3 gap-2">
              {backgrounds.map((a) => (
                <AssetTile key={a.id} asset={{ ...a, hasAlpha: true }} onPick={() => onAddAsset(a, "background")} />
              ))}
            </div>
          </div>
        )}
        <input ref={bgRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void upload(Array.from(e.target.files ?? []), "background").finally(() => (e.target.value = ""))} />
        <Button variant="secondary" onClick={() => bgRef.current?.click()} icon={<Upload className="size-4" aria-hidden="true" />}>
          Upload background
        </Button>
      </Tabs.Content>
      <Tabs.Content value="assets" className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3 [scrollbar-width:thin]">
        <input ref={inputRef} id="scene-asset-files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void upload(Array.from(e.target.files ?? []), "product").finally(() => (e.target.value = ""))} />
        <Button variant="secondary" onClick={() => inputRef.current?.click()} icon={<Plus className="size-4" aria-hidden="true" />}>
          Add product
        </Button>
        <p className="text-[12px] leading-relaxed text-muted">Cutouts and logos from your asset library. A photo without transparency gets its background removed on this device first.</p>
        {cutting && (
          <p role="status" className="flex items-center gap-2 rounded-[10px] bg-blue-50 px-3 py-2 text-[13px] text-blue-700">
            <Spinner className="size-4" /> Removing the background…
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {usable.map((a) => (
            <AssetTile key={a.id} asset={a} onPick={() => void pick(a)} />
          ))}
        </div>
        {!usable.length && <p className="py-6 text-center text-[13px] text-muted">Your library is empty. Add a product photo or cutout.</p>}
      </Tabs.Content>
    </Tabs.Root>
  );
}

const TINTS = [
  { name: "Ivory", hex: "#EFE6D6" },
  { name: "Sage", hex: "#B9C7B0" },
  { name: "Blush", hex: "#E9CFC8" },
  { name: "Slate", hex: "#9AA7B3" },
];

function LayerRow({ layer, selected, onSelect, onToggle, onLock, onUp, onDown, onDelete }: { layer: SceneLayer; selected: boolean; onSelect: () => void; onToggle: () => void; onLock: () => void; onUp?: () => void; onDown?: () => void; onDelete?: () => void }) {
  const icon = layer.kind === "text" ? Type : layer.kind === "backdrop" ? ImageIcon : layer.kind === "shadow" ? Box : layer.kind === "logo" ? ShieldCheck : Box;
  const Icon = icon;
  const iconBtn = "inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-30";
  return (
    <li data-layer={layer.name} className={cn("flex items-center gap-1 rounded-[10px] px-1.5 py-1", selected ? "bg-blue-50" : "hover:bg-paper")}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1 text-left text-[13px] text-ink">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className={cn("truncate", !layer.visible && "text-subtle line-through")}>{layer.name}</span>
      </button>
      {onUp && (
        <button type="button" className={iconBtn} onClick={onUp} aria-label={`Bring ${layer.name} forward`}>
          <ArrowUp className="size-3.5" aria-hidden="true" />
        </button>
      )}
      {onDown && (
        <button type="button" className={iconBtn} onClick={onDown} aria-label={`Send ${layer.name} backward`}>
          <ArrowDown className="size-3.5" aria-hidden="true" />
        </button>
      )}
      <button type="button" className={iconBtn} onClick={onLock} aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`} aria-pressed={layer.locked}>
        {layer.locked ? <Lock className="size-3.5" aria-hidden="true" /> : <Unlock className="size-3.5" aria-hidden="true" />}
      </button>
      <button type="button" className={iconBtn} onClick={onToggle} aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`} aria-pressed={!layer.visible}>
        {layer.visible ? <Eye className="size-3.5" aria-hidden="true" /> : <EyeOff className="size-3.5" aria-hidden="true" />}
      </button>
      {onDelete && (
        <button type="button" className={iconBtn} onClick={onDelete} aria-label={`Delete ${layer.name}`}>
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/* --------------------------------------------------------------- editor --- */

function Loaded({ initial }: { initial: Scene }) {
  const doc = useSceneDoc(initial);
  const { scene, commit, preview, undo, redo } = doc;
  const presets = usePresets((s) => s.presets);
  const [selectedId, setSelectedId] = useState<string | null>(initial.layers.find((l) => l.kind === "product")?.id ?? null);
  const [mode, setMode] = useState<DragMode>("move");
  const [snap, setSnap] = useState(true);
  const [compare, setCompare] = useState(false);
  const [tab, setTab] = useState<"scene" | "layer" | "export">("layer");
  const [animate, setAnimate] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [exportFormats, setExportFormats] = useState<SceneFormatId[]>([initial.format]);
  const [stillType, setStillType] = useState<StillFormat>("png");
  const [exporting, setExporting] = useState(false);
  const liveBase = useRef<Scene | null>(null);
  const f = SCENE_FORMATS[scene.format];
  const selected = scene.layers.find((l) => l.id === selectedId) ?? null;
  const backdrop = scene.layers.find((l) => l.kind === "backdrop");
  const surfaceY = backdrop?.kind === "backdrop" ? (backdropInfo(backdrop.backdrop)?.surfaceY ?? 0.78) : 0.78;
  const brand = defaultPreset(presets)?.colors ?? [];
  const missing = missingAssets(scene, { image: assetImage });
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  useEffect(() => {
    if (!usePresets.getState().presets) void usePresets.getState().load();
  }, []);
  useEffect(() => {
    let alive = true;
    void loadAssetImages(sceneAssetIds(scene)).then(() => alive && setAssetsLoaded(true));
    return () => {
      alive = false;
    };
  }, [scene]);

  const notice = useCallback((text: string, tone: "ok" | "error" = "ok") => setMessage({ text, tone }), []);

  const apply = useCallback((fn: (s: Scene) => Scene) => commit(fn(scene), scene), [commit, scene]);
  const patch = (id: string, p: Partial<SceneLayer>) => apply((s) => ({ ...s, layers: s.layers.map((l) => (l.id === id ? ({ ...l, ...p } as SceneLayer) : l)) }));
  /** Live slider edits: preview while dragging, one undo step when let go. */
  const live = (id: string, p: Partial<SceneLayer>) => {
    liveBase.current ??= scene;
    preview({ ...scene, layers: scene.layers.map((l) => (l.id === id ? ({ ...l, ...p } as SceneLayer) : l)) });
  };
  const endLive = () => {
    if (liveBase.current) commit(scene, liveBase.current);
    liveBase.current = null;
  };

  function addAsset(a: Asset, as: "product" | "logo" | "background") {
    if (as === "background") {
      apply((s) => ({ ...s, layers: s.layers.map((l) => (l.kind === "backdrop" ? { ...l, imageAssetId: a.id } : l)) }));
      notice(`${a.name} is now the background.`);
      return;
    }
    const aspect = a.width / Math.max(1, a.height);
    if (as === "logo") {
      const logo = logoLayer(a.id, aspect);
      logo.name = a.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Logo";
      apply((s) => ({ ...s, layers: [...s.layers, logo] }));
      setSelectedId(logo.id);
      return;
    }
    const count = scene.layers.filter((l) => l.kind === "product").length;
    const x = count === 0 ? 0.5 : Math.min(0.85, 0.35 + count * 0.18);
    const prod = standOnSurface(productLayer(a.id, a.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Product", aspect, { x, scale: count ? 0.34 : 0.46 }), surfaceY, f.width, f.height);
    apply((s) => ({ ...s, layers: [...s.layers, shadowLayer(prod), prod] }));
    setSelectedId(prod.id);
    setTab("layer");
  }

  function setBackdrop(id: BackdropId) {
    apply((s) => ({ ...s, layers: s.layers.map((l) => (l.kind === "backdrop" ? { ...l, backdrop: id, imageAssetId: null } : l)) }));
  }

  function removeLayer(id: string) {
    apply((s) => ({ ...s, layers: s.layers.filter((l) => l.id !== id && !(l.kind === "shadow" && l.targetId === id)) }));
    if (selectedId === id) setSelectedId(null);
  }

  function moveLayer(id: string, dir: 1 | -1) {
    apply((s) => {
      const i = s.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 1 || j >= s.layers.length) return s; // the backdrop stays at the bottom
      const layers = [...s.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...s, layers };
    });
  }

  function duplicateLayer(id: string) {
    const l = scene.layers.find((x) => x.id === id);
    if (!l || l.kind === "backdrop" || l.kind === "shadow") return;
    const copy = { ...structuredClone(l), id: crypto.randomUUID(), name: `${l.name} copy`.slice(0, 80), x: Math.min(0.95, l.x + 0.04) } as SceneLayer;
    const extra: SceneLayer[] = [];
    if (l.kind === "product") {
      const sh = scene.layers.find((x) => x.kind === "shadow" && x.targetId === l.id);
      if (sh && sh.kind === "shadow") extra.push({ ...sh, id: crypto.randomUUID(), targetId: copy.id, name: `${copy.name} shadow` });
    }
    apply((s) => ({ ...s, layers: [...s.layers, ...extra, copy] }));
    setSelectedId(copy.id);
  }

  // Keyboard: undo/redo, delete, nudge.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (!selected || selected.kind === "backdrop" || selected.locked) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeLayer(selected.id);
      }
      const step = (e.shiftKey ? 10 : 1) / Math.min(f.width, f.height);
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) {
        e.preventDefault();
        patch(selected.id, { x: selected.x + d[0] * (Math.min(f.width, f.height) / f.width), y: selected.y + d[1] * (Math.min(f.width, f.height) / f.height) });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function runExport() {
    setExporting(true);
    setMessage(null);
    try {
      const name = await downloadScene(scene, exportFormats, stillType);
      notice(`Downloaded ${name}.`);
    } catch (e) {
      notice(e instanceof Error ? e.message : "The export failed.", "error");
    } finally {
      setExporting(false);
    }
  }

  const shadow = selected?.kind === "product" ? scene.layers.find((l) => l.kind === "shadow" && l.targetId === selected.id) : null;
  const toolBtn = (active: boolean) => cn("inline-flex h-9 items-center gap-2 rounded-[10px] px-3 text-[14px] font-medium", active ? "bg-blue-50 text-blue-700 ring-1 ring-blue/20" : "text-ink-3 hover:bg-ink/5 hover:text-ink");
  const layersTopFirst = [...scene.layers].reverse();

  return (
    <div className={cn("flex min-h-[calc(100dvh-4rem)] flex-col", creativeFontClasses)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <label className="sr-only" htmlFor="scene-name">
          Scene name
        </label>
        <input
          id="scene-name"
          defaultValue={scene.name}
          key={scene.name}
          maxLength={80}
          onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== scene.name && apply((s) => ({ ...s, name: e.target.value.trim() }))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-9 w-[200px] min-w-0 rounded-[9px] border border-transparent px-2 text-[16px] font-semibold text-ink hover:border-line focus:border-blue focus:outline-none"
        />
        <span className="hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
        <div role="group" aria-label="Drag mode" className="flex items-center gap-1">
          <button type="button" className={toolBtn(mode === "move")} aria-pressed={mode === "move"} onClick={() => setMode("move")}>
            <Move className="size-4" aria-hidden="true" /> <span className="hidden md:inline">Move</span>
          </button>
          <button type="button" className={toolBtn(mode === "rotate")} aria-pressed={mode === "rotate"} onClick={() => setMode("rotate")}>
            <RotateCw className="size-4" aria-hidden="true" /> <span className="hidden md:inline">Rotate</span>
          </button>
          <button type="button" className={toolBtn(mode === "scale")} aria-pressed={mode === "scale"} onClick={() => setMode("scale")}>
            <Scaling className="size-4" aria-hidden="true" /> <span className="hidden md:inline">Scale</span>
          </button>
          <button type="button" className={toolBtn(snap)} aria-pressed={snap} onClick={() => setSnap((s) => !s)} title="Snap to centre, thirds, other layers and the surface (hold Alt to ignore)">
            <Magnet className="size-4" aria-hidden="true" /> <span className="hidden md:inline">Snap</span>
          </button>
          <button type="button" className={toolBtn(compare)} aria-pressed={compare} onClick={() => setCompare((c) => !c)} title="Show the products without the set">
            <SplitSquareHorizontal className="size-4" aria-hidden="true" /> <span className="hidden md:inline">Compare</span>
          </button>
          <button type="button" className={toolBtn(false)} onClick={() => apply((s) => ({ ...s, layers: [...s.layers, textLayer({ color: brand[1]?.hex ?? "#20292D" })] }))}>
            <Type className="size-4" aria-hidden="true" /> <span className="hidden md:inline">Text</span>
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SaveStatus save={doc.save} onRetry={() => void doc.retry()} />
          <Button variant="secondary" size="sm" onClick={undo} disabled={!doc.past.length} aria-label="Undo" title="Undo (Ctrl+Z)" icon={<Undo2 className="size-4" aria-hidden="true" />} />
          <Button variant="secondary" size="sm" onClick={redo} disabled={!doc.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" icon={<Redo2 className="size-4" aria-hidden="true" />} />
          <Button variant="secondary" size="sm" onClick={() => setTab("export")} icon={<Download className="size-4" aria-hidden="true" />}>
            Export scene
          </Button>
          <Button size="sm" onClick={() => setAnimate(true)} disabled={!scene.layers.some((l) => l.kind === "product")} title={scene.layers.some((l) => l.kind === "product") ? undefined : "Add a product first"} icon={<Clapperboard className="size-4" aria-hidden="true" />}>
            Animate scene
          </Button>
        </div>
      </div>

      {message && (
        <div role={message.tone === "error" ? "alert" : "status"} className={cn("flex items-center gap-2 border-b px-4 py-2 text-[13px]", message.tone === "error" ? "border-danger/20 bg-danger-50 text-danger" : "border-success/20 bg-success-50 text-success")}>
          <span className="flex-1">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss" className="rounded p-1 hover:bg-ink/5">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {assetsLoaded && missing.length > 0 && (
        <p role="alert" className="border-b border-warn/25 bg-warn-50 px-4 py-2 text-[13px] text-warn">
          {missing.length} image{missing.length === 1 ? " this scene uses is" : "s this scene uses are"} missing from this browser&apos;s library (marked in the scene). Delete the layer or add the image again.
        </p>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside aria-label="Backdrops and assets" className="order-2 flex min-h-[320px] flex-col border-t border-line bg-surface lg:order-none lg:max-h-[calc(100dvh-7.5rem)] lg:border-r lg:border-t-0">
          <LeftPanel scene={scene} onAddAsset={addAsset} onBackdrop={setBackdrop} notice={notice} />
        </aside>

        <div className="flex min-h-[420px] min-w-0 flex-col bg-paper-2/60">
          <div className="min-h-[360px] flex-1">
            <SceneCanvas scene={scene} format={scene.format} selectedId={selectedId} mode={mode} snap={snap} compare={compare} onSelect={setSelectedId} onPreview={preview} onCommit={(next, base) => commit(next, base)} />
          </div>
          {/* Linked formats */}
          <div className="flex items-stretch gap-3 overflow-x-auto border-t border-line bg-surface px-3 py-3" role="group" aria-label="Formats">
            {scene.formats.map((id) => (
              <div key={id} className="relative shrink-0">
                <button type="button" onClick={() => apply((s) => ({ ...s, format: id }))} aria-pressed={scene.format === id} data-format={id} className={cn("grid gap-1.5 rounded-[12px] border-2 p-1.5 text-left", scene.format === id ? "border-blue" : "border-transparent hover:border-line-strong")}>
                  <SceneThumb scene={scene} format={id} label={`${SCENE_FORMATS[id].label} preview`} className="block h-[84px] w-auto rounded-[8px]" />
                  <span className="px-0.5 text-[12px] font-medium text-ink">{SCENE_FORMATS[id].label}</span>
                </button>
                {scene.formats.length > 1 && (
                  <button type="button" onClick={() => apply((s) => ({ ...s, formats: s.formats.filter((x) => x !== id), format: s.format === id ? s.formats.find((x) => x !== id)! : s.format }))} aria-label={`Remove ${SCENE_FORMATS[id].label}`} className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink">
                    <X className="size-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
            {FORMAT_ORDER.filter((id) => !scene.formats.includes(id)).map((id) => (
              <button key={id} type="button" onClick={() => apply((s) => ({ ...s, formats: [...s.formats, id], format: id }))} className="grid min-w-[96px] shrink-0 place-items-center gap-1 rounded-[12px] border-2 border-dashed border-line-strong px-3 text-[12px] font-medium text-muted hover:border-blue/50 hover:text-ink">
                <Plus className="size-4" aria-hidden="true" />
                Add {SCENE_FORMATS[id].label}
              </button>
            ))}
          </div>
        </div>

        <aside aria-label="Scene settings" className="order-3 border-t border-line bg-surface lg:max-h-[calc(100dvh-7.5rem)] lg:overflow-y-auto lg:border-l lg:border-t-0 [scrollbar-width:thin]">
          <Tabs.Root value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <Tabs.List aria-label="Settings" className="sticky top-0 z-10 flex border-b border-line bg-surface px-3">
              {(
                [
                  ["scene", "Scene"],
                  ["layer", selected?.kind === "text" ? "Text" : selected?.kind === "logo" ? "Logo" : "Product"],
                  ["export", "Export"],
                ] as const
              ).map(([v, label]) => (
                <Tabs.Trigger key={v} value={v} className="relative flex-1 px-2 py-3 text-[15px] font-semibold text-muted data-[state=active]:text-blue-700 data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:bg-blue">
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="scene" className="px-4">
              <Section title="Background">
                <div role="radiogroup" aria-label="Set colour" className="flex flex-wrap gap-2">
                  {[{ name: "Original", hex: null as string | null }, ...TINTS, ...brand.slice(0, 3).map((c) => ({ name: c.name, hex: c.hex }))].map((t) => {
                    const on = backdrop?.kind === "backdrop" && (backdrop.tint ?? null) === t.hex;
                    return (
                      <button key={t.name + (t.hex ?? "")} type="button" role="radio" aria-checked={on} onClick={() => backdrop && patch(backdrop.id, { tint: t.hex } as Partial<SceneLayer>)} className={cn("flex h-9 items-center gap-2 rounded-[10px] border px-2.5 text-[13px]", on ? "border-blue bg-blue-50 text-blue-700" : "border-line text-ink-3 hover:border-line-strong")}>
                        <span className={cn("size-4 rounded-[5px] border border-ink/10", !t.hex && "checkerboard-sm")} style={t.hex ? { background: t.hex } : undefined} aria-hidden="true" />
                        {t.name}
                      </button>
                    );
                  })}
                  <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[10px] border border-line px-2.5 text-[13px] text-ink-3 hover:border-line-strong">
                    <span className="size-4 rounded-[5px] border border-ink/10 bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" aria-hidden="true" />
                    Custom
                    <input type="color" aria-label="Custom set colour" className="sr-only" onChange={(e) => backdrop && patch(backdrop.id, { tint: e.target.value.toUpperCase() } as Partial<SceneLayer>)} />
                  </label>
                </div>
                {backdrop?.kind === "backdrop" && backdrop.imageAssetId && (
                  <Button variant="secondary" size="sm" onClick={() => patch(backdrop.id, { imageAssetId: null } as Partial<SceneLayer>)}>
                    Use a drawn backdrop again
                  </Button>
                )}
              </Section>
              <Section title="Scene layers" action={<span className="text-[12px] text-muted">Top is in front</span>}>
                <ul className="grid gap-0.5" aria-label="Scene layers">
                  {layersTopFirst.map((l) => {
                    const i = scene.layers.indexOf(l);
                    return (
                      <LayerRow
                        key={l.id}
                        layer={l}
                        selected={l.id === selectedId}
                        onSelect={() => {
                          setSelectedId(l.id);
                          if (l.kind !== "backdrop") setTab("layer");
                        }}
                        onToggle={() => patch(l.id, { visible: !l.visible })}
                        onLock={() => patch(l.id, { locked: !l.locked })}
                        onUp={l.kind !== "backdrop" && i < scene.layers.length - 1 ? () => moveLayer(l.id, 1) : undefined}
                        onDown={l.kind !== "backdrop" && i > 1 ? () => moveLayer(l.id, -1) : undefined}
                        onDelete={l.kind !== "backdrop" ? () => removeLayer(l.id) : undefined}
                      />
                    );
                  })}
                </ul>
              </Section>
            </Tabs.Content>

            <Tabs.Content value="layer" className="px-4" data-layer-panel>
              {!selected || selected.kind === "backdrop" || selected.kind === "shadow" ? (
                <p className="py-8 text-center text-[13px] text-muted">
                  <Hand className="mx-auto mb-2 size-5" aria-hidden="true" />
                  Select a product, text or logo in the scene to adjust it.
                </p>
              ) : (
                <>
                  <Section title={selected.name} action={<div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => duplicateLayer(selected.id)} aria-label={`Duplicate ${selected.name}`} icon={<Copy className="size-4" aria-hidden="true" />} /><Button variant="ghost" size="sm" onClick={() => removeLayer(selected.id)} aria-label={`Delete ${selected.name}`} icon={<Trash2 className="size-4" aria-hidden="true" />} /></div>}>
                    {selected.kind === "product" && (
                      <p className="flex items-start gap-2 rounded-[10px] bg-blue-50 px-3 py-2 text-[12px] leading-relaxed text-blue-700">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>
                          <strong className="font-semibold">Original appearance protected.</strong> Placement changes don&apos;t alter the product&apos;s pixels.
                        </span>
                      </p>
                    )}
                    <NumberField label="Position X" unit="px" value={selected.x * f.width} onChange={(v) => patch(selected.id, { x: v / f.width })} />
                    <NumberField label="Position Y" unit="px" value={selected.y * f.height} onChange={(v) => patch(selected.id, { y: v / f.height })} />
                    <NumberField label="Scale" unit="%" value={selected.scale * 100} min={2} max={400} onChange={(v) => patch(selected.id, { scale: v / 100 })} />
                    <NumberField label="Rotation" unit="°" value={selected.rotation} decimals={1} step={1} min={-360} max={360} onChange={(v) => patch(selected.id, { rotation: v })} />
                    <RangeField label="Opacity" value={selected.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => live(selected.id, { opacity: v })} onCommit={endLive} />
                    {selected.kind === "product" && (
                      <Button variant="secondary" size="sm" onClick={() => patch(selected.id, standOnSurface(selected, surfaceY, f.width, f.height))}>
                        Stand on the surface
                      </Button>
                    )}
                  </Section>
                  {selected.kind === "product" && shadow?.kind === "shadow" && (
                    <Section title="Shadow" action={<button type="button" onClick={() => patch(shadow.id, { visible: !shadow.visible })} className="text-[12px] font-semibold text-blue-700">{shadow.visible ? "Hide" : "Show"}</button>}>
                      <RangeField label="Opacity" value={shadow.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => live(shadow.id, { opacity: v })} onCommit={endLive} />
                      <RangeField label="Softness" value={shadow.softness} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => live(shadow.id, { softness: v } as Partial<SceneLayer>)} onCommit={endLive} />
                      <RangeField label="Direction" value={shadow.direction} min={-75} max={75} step={1} format={(v) => `${Math.round(v)}°`} onChange={(v) => live(shadow.id, { direction: v } as Partial<SceneLayer>)} onCommit={endLive} />
                      <RangeField label="Length" value={shadow.length} min={0} max={1} step={0.01} format={(v) => (v < 0.02 ? "Contact only" : `${Math.round(v * 100)}%`)} onChange={(v) => live(shadow.id, { length: v } as Partial<SceneLayer>)} onCommit={endLive} />
                    </Section>
                  )}
                  {selected.kind === "product" && !shadow && (
                    <Section title="Shadow">
                      <Button variant="secondary" size="sm" onClick={() => apply((s) => ({ ...s, layers: s.layers.flatMap((l) => (l.id === selected.id ? [shadowLayer(selected), l] : [l])) }))}>
                        Add a shadow
                      </Button>
                    </Section>
                  )}
                  {selected.kind === "product" && (
                    <Section title="Lighting">
                      <label className="flex items-start justify-between gap-3 text-[13px] text-ink">
                        <span>
                          Match scene light
                          <span className="block text-[12px] text-muted">Adds the backdrop&apos;s warm key light over the product. This changes how the product looks, so it&apos;s off by default.</span>
                        </span>
                        <input type="checkbox" role="switch" checked={selected.light} onChange={(e) => patch(selected.id, { light: e.target.checked } as Partial<SceneLayer>)} className="mt-1 size-5 accent-blue" />
                      </label>
                    </Section>
                  )}
                  {selected.kind === "text" && (
                    <Section title="Text">
                      <label className="grid gap-1.5 text-[13px] text-ink-3">
                        Words
                        <textarea defaultValue={selected.text} key={selected.id} rows={2} maxLength={400} onBlur={(e) => e.target.value !== selected.text && patch(selected.id, { text: e.target.value } as Partial<SceneLayer>)} className="rounded-[10px] border border-line px-3 py-2 text-[14px] text-ink outline-none focus:border-blue focus:ring-3 focus:ring-blue/15" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1 text-[12px] text-ink-3">
                          Font
                          <select value={selected.font} onChange={(e) => { const font = e.target.value as FontId; patch(selected.id, { font, weight: FONT_WEIGHTS[font].includes(selected.weight) ? selected.weight : FONT_WEIGHTS[font][FONT_WEIGHTS[font].length - 1] } as Partial<SceneLayer>); }} className="h-9 rounded-[9px] border border-line bg-surface px-2 text-[13px]">
                            {(Object.keys(FONT_LABEL) as FontId[]).map((id) => (
                              <option key={id} value={id}>
                                {FONT_LABEL[id]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-1 text-[12px] text-ink-3">
                          Weight
                          <select value={selected.weight} onChange={(e) => patch(selected.id, { weight: Number(e.target.value) } as Partial<SceneLayer>)} className="h-9 rounded-[9px] border border-line bg-surface px-2 text-[13px]">
                            {FONT_WEIGHTS[selected.font].map((w) => (
                              <option key={w} value={w}>
                                {w}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <NumberField label="Size" unit="%" decimals={1} step={0.5} min={1} max={50} value={selected.size * 100} onChange={(v) => patch(selected.id, { size: v / 100 } as Partial<SceneLayer>)} />
                      <NumberField label="Letter spacing" unit="em" decimals={2} step={0.01} min={-0.1} max={1} value={selected.letterSpacing} onChange={(v) => patch(selected.id, { letterSpacing: v } as Partial<SceneLayer>)} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] text-ink-3">Colour</span>
                        <div className="flex items-center gap-1.5">
                          {["#20292D", "#FFFFFF", ...brand.slice(0, 3).map((c) => c.hex)].map((hex) => (
                            <button key={hex} type="button" aria-label={`Colour ${hex}`} aria-pressed={selected.color === hex.toUpperCase()} onClick={() => patch(selected.id, { color: hex.toUpperCase() } as Partial<SceneLayer>)} className={cn("size-7 rounded-full border border-ink/15", selected.color === hex.toUpperCase() && "ring-2 ring-blue ring-offset-1")} style={{ background: hex }} />
                          ))}
                          <input type="color" aria-label="Custom text colour" value={selected.color.toLowerCase()} onChange={(e) => patch(selected.id, { color: e.target.value.toUpperCase() } as Partial<SceneLayer>)} className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0" />
                        </div>
                      </div>
                      <div role="radiogroup" aria-label="Alignment" className="flex gap-1">
                        {(["left", "center", "right"] as const).map((a) => (
                          <button key={a} type="button" role="radio" aria-checked={selected.align === a} onClick={() => patch(selected.id, { align: a } as Partial<SceneLayer>)} className={cn("h-8 flex-1 rounded-[8px] text-[13px] capitalize", selected.align === a ? "bg-blue-50 font-semibold text-blue-700" : "border border-line text-ink-3")}>
                            {a === "center" ? "Centre" : a}
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center justify-between text-[13px] text-ink-3">
                        Capitals
                        <input type="checkbox" checked={selected.uppercase} onChange={(e) => patch(selected.id, { uppercase: e.target.checked } as Partial<SceneLayer>)} className="size-4 accent-blue" />
                      </label>
                      <p className="text-[12px] text-muted">ISOLA never writes product claims for you: titles say only what you type.</p>
                    </Section>
                  )}
                </>
              )}
            </Tabs.Content>

            <Tabs.Content value="export" className="px-4">
              <Section title="Formats">
                <div className="grid gap-1.5">
                  {scene.formats.map((id) => (
                    <label key={id} className="flex items-center gap-2 text-[14px] text-ink">
                      <input type="checkbox" className="size-4 accent-blue" checked={exportFormats.includes(id)} onChange={(e) => setExportFormats((fs) => (e.target.checked ? [...fs, id] : fs.filter((x) => x !== id)))} />
                      {SCENE_FORMATS[id].label}
                      <span className="ml-auto text-[12px] tabular-nums text-muted">
                        {SCENE_FORMATS[id].width} × {SCENE_FORMATS[id].height}
                      </span>
                    </label>
                  ))}
                </div>
                <div role="radiogroup" aria-label="File type" className="flex gap-1">
                  {(["png", "jpeg"] as const).map((t) => (
                    <button key={t} type="button" role="radio" aria-checked={stillType === t} onClick={() => setStillType(t)} className={cn("h-9 flex-1 rounded-[9px] text-[13px] font-semibold uppercase", stillType === t ? "bg-blue-50 text-blue-700 ring-1 ring-blue/20" : "border border-line text-ink-3")}>
                      {t === "jpeg" ? "JPEG" : "PNG"}
                    </button>
                  ))}
                </div>
                <p className="text-[12px] text-muted">Free plan: ISOLA watermark, up to 1,000px on the longest side. Pro: full size, no watermark.</p>
                <Button onClick={() => void runExport()} disabled={!exportFormats.length || exporting} icon={exporting ? <Spinner className="size-4" /> : <Download className="size-4" aria-hidden="true" />}>
                  {exportFormats.length > 1 ? `Download ${exportFormats.length} formats (ZIP)` : "Download scene"}
                </Button>
              </Section>
              <Section title="Animate">
                <p className="text-[13px] text-muted">Turn this scene into a short film. Its layers stay separate in Motion Studio, linked to this scene.</p>
                <Button variant="outline-blue" onClick={() => setAnimate(true)} disabled={!scene.layers.some((l) => l.kind === "product")} icon={<Clapperboard className="size-4" aria-hidden="true" />}>
                  Animate scene
                </Button>
              </Section>
            </Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>
      <AnimateDialog scene={scene} open={animate} onOpenChange={setAnimate} />
    </div>
  );
}

/** Scene Studio's editor for one scene (loads the scene and the library from this browser). */
export function SceneEditor({ id }: { id: string }) {
  const libStatus = useLibraryReady();
  const status = useScenes((s) => s.status);
  const exists = useScenes((s) => s.scenes.some((x) => x.id === id));
  useEffect(() => {
    void loadScenes().catch(() => undefined);
  }, []);
  if (status === "unavailable" || libStatus === "unavailable")
    return <p className="m-8 rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 text-sm text-warn">This browser isn&apos;t letting ISOLA store scenes (private browsing can do this).</p>;
  if (status !== "ready" || libStatus !== "ready")
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted" role="status">
        <Spinner className="mr-2 text-blue" /> Opening the scene…
      </div>
    );
  const scene = getScene(id);
  if (!exists || !scene || scene.trashedAt)
    return (
      <div className="m-8 grid max-w-md gap-3">
        <p className="text-[15px] text-ink">This scene isn&apos;t in this browser{scene?.trashedAt ? " (it's in the trash)" : ""}.</p>
        <Link href="/studio/scenes" className="text-[14px] font-semibold text-blue-700 hover:underline">
          Back to Scene Studio
        </Link>
      </div>
    );
  return <Loaded key={id} initial={scene} />;
}

