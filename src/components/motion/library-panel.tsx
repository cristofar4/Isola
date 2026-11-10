"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { AlertTriangle, Box, CircleCheck, Clapperboard, Film as FilmIcon, Images, Layers, Music, Plus, RefreshCw, Save, Sparkles, Trash2, Type, Upload, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { askName } from "@/components/studio/name-dialog";
import { useLibraryReady, useThumb } from "@/components/studio/library-hooks";
import { defaultPreset, usePresets } from "@/components/studio/use-presets";
import { cn } from "@/lib/cn";
import { commit, notify, useEditor } from "@/lib/motion/editor";
import { applyKitResult, buildFromStyle, defaultParams, extractStyle, KITS, layerSetFromFilm, type KitDefinition } from "@/lib/motion/kits";
import { MEDIA_ACCEPT, relinkMedia, MediaError, missingMedia } from "@/lib/motion/media";
import type { Film } from "@/lib/motion/model";
import { applySceneUpdate, diffScene, filmFromScene, sceneChangedSince, type SceneChange } from "@/lib/motion/scene-link";
import { deleteStyle, loadFilms, saveStyle, useFilms } from "@/lib/motion/store";
import { secs, filmDuration } from "@/lib/motion/time";
import { getScene, loadScenes, useScenes } from "@/lib/scene/store";
import type { Scene } from "@/lib/scene/model";
import { useLibrary, type Asset } from "@/lib/studio/library";
import { FilmPreview } from "./kit-preview";
import { addAssetClip, addEffectClip, addMediaClip, addTextClip, importFiles } from "./add-media";
import { DarkButton, Field, darkInput } from "./ui";

export type LibraryTab = "media" | "styles" | "scenes" | "text" | "audio" | "effects";
export const LIBRARY_TABS: Array<{ id: LibraryTab; label: string; icon: typeof Images }> = [
  { id: "media", label: "Media", icon: Images },
  { id: "styles", label: "Styles", icon: Sparkles },
  { id: "scenes", label: "Scenes", icon: Clapperboard },
  { id: "text", label: "Text", icon: Type },
  { id: "audio", label: "Audio", icon: Music },
  { id: "effects", label: "Effects", icon: Wand2 },
];

function AssetTile({ asset }: { asset: Asset }) {
  const url = useThumb(asset.id);
  return (
    <button type="button" onClick={() => addAssetClip(asset)} data-motion-asset={asset.name} title={`Add ${asset.name} at the playhead`} className="group grid gap-1 text-left">
      <span className={cn("block aspect-square overflow-hidden rounded-[8px] border border-white/10 group-hover:border-[#8B9BFF]/60", asset.hasAlpha ? "checkerboard-sm" : "bg-black")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        {url && <img src={url} alt="" className="size-full object-contain" />}
      </span>
      <span className="truncate text-[11px] text-[#9AA1B2]">{asset.name}</span>
    </button>
  );
}

function MediaTab() {
  const film = useEditor((s) => s.film)!;
  const status = useLibraryReady();
  const assets = useLibrary((s) => s.assets);
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  const mediaKey = film.media.map((m) => m.id).join();
  useEffect(() => {
    let alive = true;
    void missingMedia(mediaKey ? mediaKey.split(",") : []).then((s) => alive && setMissing(s));
    return () => {
      alive = false;
    };
  }, [mediaKey]);
  const usable = useMemo(() => assets.filter((a) => !a.trashedAt).sort((a, b) => Number(b.hasAlpha) - Number(a.hasAlpha) || b.createdAt - a.createdAt).slice(0, 60), [assets]);
  return (
    <div className="grid gap-3">
      <input ref={input} id="motion-files" type="file" multiple accept={`image/png,image/jpeg,image/webp,image/svg+xml,${MEDIA_ACCEPT}`} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void importFiles(Array.from(e.target.files ?? []), setBusy).finally(() => (e.target.value = ""))} />
      <DarkButton icon={<Upload className="size-4" aria-hidden="true" />} onClick={() => input.current?.click()} disabled={!!busy}>
        Import images, video or sound
      </DarkButton>
      {busy && <p role="status" className="text-[12px] text-[#A4B1FF]">{busy}</p>}
      <p className="text-[11px] leading-snug text-[#8890A2]">Video: MP4 (H.264), WebM, MOV your browser can decode. Sound: MP3, WAV, M4A, OGG, FLAC. Images go to your asset library.</p>
      {film.media.length > 0 && (
        <ul className="grid gap-1" aria-label="Video and sound in this film">
          {film.media.map((m) => (
            <li key={m.id} className={cn("flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px]", missing.has(m.id) ? "bg-[#F07167]/10 text-[#FFB4AD]" : "bg-white/[0.03] text-[#C9CEDA]")} data-media={m.name}>
              {m.kind === "video" ? <FilmIcon className="size-3.5 shrink-0" aria-hidden="true" /> : <Music className="size-3.5 shrink-0" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">{m.name}</span>
              {missing.has(m.id) ? (
                <label className="cursor-pointer font-semibold underline">
                  Relink
                  <input
                    type="file"
                    accept={MEDIA_ACCEPT}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void relinkMedia(m, file)
                        .then((item) => {
                          const f = useEditor.getState().film!;
                          commit({ ...f, media: f.media.map((x) => (x.id === m.id ? item : x)) });
                          setMissing((s) => new Set([...s].filter((x) => x !== m.id)));
                          notify(`Relinked ${file.name}.`);
                        })
                        .catch((err) => notify(err instanceof MediaError ? err.message : "That file couldn't be used.", "error"));
                    }}
                  />
                </label>
              ) : (
                <>
                  <span className="tabular-nums text-[#8890A2]">{secs(m.duration)}</span>
                  <button type="button" aria-label={`Add ${m.name} at the playhead`} onClick={() => addMediaClip(m)} className="inline-flex size-6 items-center justify-center rounded hover:bg-white/10">
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2">
        <p className="text-[12px] font-semibold text-[#C9CEDA]">From your ISOLA library</p>
        {status !== "ready" ? (
          <p className="text-[12px] text-[#8890A2]">Loading…</p>
        ) : usable.length ? (
          <div className="grid grid-cols-3 gap-2">
            {usable.map((a) => (
              <AssetTile key={a.id} asset={a} />
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[#8890A2]">Your asset library is empty.</p>
        )}
      </div>
    </div>
  );
}

function StyleCard({ film, kit, onApply, brand }: { film: Film; kit: KitDefinition; onApply: (params: Record<string, number>) => void; brand: string[] }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [params, setParams] = useState(defaultParams(kit));
  const set = useMemo(() => layerSetFromFilm(film), [film]);
  const problem = kit.check(set);
  const previewFilm = useMemo(() => (problem ? null : applyKitResult(film, kit.build({ set, aspect: film.aspect, brand }, params), kit.id)), [film, kit, set, params, brand, problem]);
  return (
    <li className={cn("overflow-hidden rounded-[10px] border bg-[#1D222B]", film.styleId === kit.id ? "border-[#8B9BFF]/70" : "border-white/[0.08]")} data-kit={kit.id} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {previewFilm ? <FilmPreview film={previewFilm} playing={hover || open} label={`${kit.name} on this film`} className="aspect-video object-contain" /> : <div className="grid aspect-video place-items-center bg-black px-3 text-center text-[11px] text-[#F5D58A]">{problem}</div>}
      <div className="grid gap-1.5 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[#E8EAF0]">{kit.name}</span>
          <span className="rounded-full bg-white/[0.06] px-1.5 text-[10px] font-semibold text-[#9AA1B2]">{kit.pace}</span>
          {previewFilm && <span className="ml-auto text-[11px] tabular-nums text-[#8890A2]">{secs(filmDuration(previewFilm))}</span>}
        </div>
        <p className="text-[11px] leading-snug text-[#9AA1B2]">{kit.summary}</p>
        {open && (
          <div className="grid gap-2 pt-1">
            <ul className="grid gap-0.5 text-[11px] text-[#C9CEDA]">
              {kit.details.map((d) => (
                <li key={d}>• {d}</li>
              ))}
            </ul>
            {kit.params.map((p) => (
              <label key={p.id} className="grid gap-1 text-[11px] text-[#9AA1B2]">
                <span className="flex justify-between">
                  {p.label}
                  <span className="tabular-nums">{p.unit === "s" ? `${params[p.id].toFixed(1)}s` : p.max <= 1 ? `${Math.round(params[p.id] * 100)}%` : params[p.id].toFixed(2)}</span>
                </span>
                <input type="range" min={p.min} max={p.max} step={p.step} value={params[p.id]} onChange={(e) => setParams((x) => ({ ...x, [p.id]: Number(e.target.value) }))} className="accent-[#8B9BFF]" />
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <DarkButton size="sm" tone="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Less" : "Customise"}
          </DarkButton>
          <DarkButton size="sm" tone="primary" className="ml-auto" disabled={!!problem} onClick={() => onApply(params)}>
            Apply
          </DarkButton>
        </div>
      </div>
    </li>
  );
}

function StylesTab() {
  const film = useEditor((s) => s.film)!;
  const styles = useFilms((s) => s.styles);
  const presets = usePresets((s) => s.presets);
  const brand = useMemo(() => defaultPreset(presets)?.colors.map((c) => c.hex) ?? [], [presets]);
  useEffect(() => {
    void loadFilms().catch(() => undefined);
    if (!usePresets.getState().presets) void usePresets.getState().load();
  }, []);
  const set = useMemo(() => layerSetFromFilm(film), [film]);
  return (
    <div className="grid gap-3">
      <p className="text-[11px] leading-snug text-[#8890A2]">Previews are your own layers through the real renderer. Applying a style replaces the shots and visual clips (sound is kept) and can be undone.</p>
      <ul className="grid gap-2">
        {KITS.map((k) => (
          <StyleCard
            key={k.id}
            film={film}
            kit={k}
            brand={brand}
            onApply={(params) => {
              commit(applyKitResult(film, k.build({ set, aspect: film.aspect, brand }, params), k.id));
              notify(`Applied ${k.name}. Undo brings your previous edit back.`);
            }}
          />
        ))}
      </ul>
      <div className="grid gap-2 border-t border-white/[0.08] pt-3">
        <p className="text-[12px] font-semibold text-[#C9CEDA]">Your styles</p>
        <DarkButton
          size="sm"
          icon={<Save className="size-3.5" aria-hidden="true" />}
          onClick={() =>
            void askName("Save as a style", { label: "Style name", initial: `${film.name} style`, action: "Save" }).then(async (name) => {
              if (!name) return;
              try {
                await saveStyle(extractStyle(film, name));
                notify(`Saved “${name}”. It's in your styles here and when animating a scene.`);
              } catch {
                notify("The style couldn't be saved in this browser.", "error");
              }
            })
          }
        >
          Save this film as a style
        </DarkButton>
        {styles.length === 0 ? (
          <p className="text-[11px] text-[#8890A2]">Shot timings, framing, keyframes, transitions and text animation are saved; your images and sound aren&apos;t.</p>
        ) : (
          <ul className="grid gap-1">
            {styles.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-[8px] bg-white/[0.03] px-2 py-1.5 text-[12px] text-[#C9CEDA]" data-saved-style={s.name}>
                <Layers className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <DarkButton
                  size="sm"
                  tone="ghost"
                  onClick={() => {
                    commit(applyKitResult(film, buildFromStyle(s, set), s.id));
                    notify(`Applied ${s.name}.`);
                  }}
                >
                  Apply
                </DarkButton>
                <button type="button" aria-label={`Delete ${s.name}`} onClick={() => void deleteStyle(s.id)} className="inline-flex size-6 items-center justify-center rounded hover:bg-white/10">
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Review of what "Update from scene" will change, with a choice wherever a clip was also edited here. */
export function UpdateDialog({ film, scene, open, onOpenChange }: { film: Film; scene: Scene; open: boolean; onOpenChange: (o: boolean) => void }) {
  const changes = useMemo(() => diffScene(film, scene), [film, scene]);
  const [conflicts, setConflicts] = useState<Record<string, "scene" | "film">>({});
  const [addNew, setAddNew] = useState(true);
  const [removeMissing, setRemoveMissing] = useState(false);
  const describe = (c: SceneChange) => (c.kind === "added" ? `New ${c.layerKind} layer` : c.kind === "removed" ? "Deleted or hidden in the scene" : null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-[8vh] z-50 flex max-h-[84vh] w-[min(94vw,560px)] -translate-x-1/2 flex-col overflow-hidden rounded-[16px] border border-white/10 bg-[#161A21] text-[#E8EAF0] shadow-2xl focus:outline-none" aria-describedby="update-desc">
          <div className="flex items-start gap-3 border-b border-white/[0.08] px-5 py-4">
            <RefreshCw className="mt-1 size-5 text-[#A4B1FF]" aria-hidden="true" />
            <div className="flex-1">
              <Dialog.Title className="text-[17px] font-bold">Update from “{scene.name}”</Dialog.Title>
              <p id="update-desc" className="text-[12px] text-[#9AA1B2]">
                Linked clips take the scene&apos;s changes and keep their animation and timing. Nothing you changed here is overwritten unless you choose it.
              </p>
            </div>
            <Dialog.Close aria-label="Close" className="rounded p-1 text-[#9AA1B2] hover:bg-white/10">
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="grid min-h-0 gap-2 overflow-y-auto px-5 py-4" data-update-changes>
            {changes.length === 0 && <p className="text-[13px] text-[#9AE6B4]">Everything linked is up to date.</p>}
            {changes.map((c) => (
              <div key={c.layerId + c.kind} className="rounded-[10px] bg-white/[0.04] px-3 py-2">
                <p className="text-[13px] font-semibold">{c.name}</p>
                {describe(c) && <p className="text-[12px] text-[#9AA1B2]">{describe(c)}</p>}
                {c.kind === "changed" &&
                  c.fields.map((f) => (
                    <div key={f.field} className="mt-1 grid gap-1">
                      <p className="text-[12px] text-[#C9CEDA]">
                        <span className="font-semibold">{f.field}:</span> {f.detail}
                      </p>
                      {f.conflict && (
                        <div role="radiogroup" aria-label={`${c.name} ${f.field}`} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <AlertTriangle className="size-3.5 text-[#F5B942]" aria-hidden="true" />
                          <span className="text-[#F5D58A]">Also changed in Motion Studio:</span>
                          {(["film", "scene"] as const).map((v) => {
                            const key = `${c.layerId}:${f.field}`;
                            const on = (conflicts[key] ?? "film") === v;
                            return (
                              <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setConflicts((x) => ({ ...x, [key]: v }))} className={cn("rounded-full px-2 py-0.5", on ? "bg-[#5465E6] text-white" : "bg-white/[0.06] text-[#C9CEDA]")}>
                                {v === "film" ? "Keep my edit" : "Take the scene's"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            ))}
            {changes.some((c) => c.kind === "added") && (
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} className="size-4 accent-[#8B9BFF]" /> Add new layers to every shot
              </label>
            )}
            {changes.some((c) => c.kind === "removed") && (
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} className="size-4 accent-[#8B9BFF]" /> Remove clips whose layer is gone (otherwise they&apos;re kept and detached)
              </label>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-white/[0.08] px-5 py-3">
            <DarkButton tone="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </DarkButton>
            <DarkButton
              tone="primary"
              onClick={() => {
                commit(applySceneUpdate(film, scene, { conflicts, addNew, removeMissing }));
                notify(`Updated from “${scene.name}”.`);
                onOpenChange(false);
              }}
            >
              {changes.length ? "Update film" : "Mark as up to date"}
            </DarkButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ScenesTab() {
  const film = useEditor((s) => s.film)!;
  const status = useScenes((s) => s.status);
  const scenes = useScenes((s) => s.scenes);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    void loadScenes().catch(() => undefined);
  }, []);
  const source = film.source ? getScene(film.source.sceneId) : null;
  const changed = sceneChangedSince(film, source);
  const others = scenes.filter((s) => !s.trashedAt && s.id !== film.source?.sceneId);
  return (
    <div className="grid gap-3">
      {film.source ? (
        <div className="grid gap-2 rounded-[10px] bg-white/[0.04] p-3">
          <p className="text-[12px] text-[#9AA1B2]">Made from</p>
          <p className="text-[14px] font-semibold text-[#E8EAF0]">{film.source.sceneName}</p>
          {status === "ready" && !source && <p className="text-[12px] text-[#F5D58A]">That scene isn&apos;t in this browser any more. Linked clips keep working with what they have.</p>}
          {source && (changed ? <p className="flex items-center gap-1.5 text-[12px] text-[#F5D58A]"><AlertTriangle className="size-3.5" aria-hidden="true" /> The scene has changed since.</p> : <p className="flex items-center gap-1.5 text-[12px] text-[#9AE6B4]"><CircleCheck className="size-3.5" aria-hidden="true" /> Up to date with the scene.</p>)}
          <div className="flex flex-wrap gap-1.5">
            {source && (
              <DarkButton size="sm" tone={changed ? "primary" : "plain"} icon={<RefreshCw className="size-3.5" aria-hidden="true" />} onClick={() => setUpdating(true)}>
                Update from scene
              </DarkButton>
            )}
            {source && (
              <Link href={`/studio/scenes/${source.id}`} className="inline-flex h-8 items-center rounded-[9px] px-2.5 text-[13px] font-semibold text-[#C9CEDA] hover:bg-white/[0.07]">
                Open in Scene Studio
              </Link>
            )}
          </div>
          {source && <UpdateDialog film={film} scene={source} open={updating} onOpenChange={setUpdating} />}
        </div>
      ) : (
        <p className="text-[12px] text-[#8890A2]">This film wasn&apos;t made from a scene. You can still add a scene&apos;s layers as new shots.</p>
      )}
      <div className="grid gap-1.5">
        <p className="text-[12px] font-semibold text-[#C9CEDA]">Add a scene as shots</p>
        {others.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              const extra = filmFromScene(s, { kitId: "slow-reveal", aspect: film.aspect });
              commit({ ...film, shots: [...film.shots, ...extra.shots], tracks: [...extra.tracks.filter((t) => t.kind === "visual"), ...film.tracks], clips: [...film.clips, ...extra.clips.filter((c) => c.source.kind !== "audio")] });
              notify(`Added “${s.name}” as ${extra.shots.length} shot${extra.shots.length === 1 ? "" : "s"} at the end.`);
            }}
            className="flex items-center gap-2 rounded-[8px] bg-white/[0.03] px-2.5 py-2 text-left text-[12px] text-[#C9CEDA] hover:bg-white/[0.07]"
          >
            <Box className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <Plus className="size-3.5" aria-hidden="true" />
          </button>
        ))}
        {status === "ready" && others.length === 0 && <p className="text-[11px] text-[#8890A2]">No other scenes. Make one in Scene Studio.</p>}
        <Link href="/studio/scenes" className="text-[12px] font-semibold text-[#A4B1FF] hover:underline">
          Go to Scene Studio
        </Link>
      </div>
    </div>
  );
}

function TextTab() {
  const presets = usePresets((s) => s.presets);
  const brand = defaultPreset(presets)?.colors.map((c) => c.hex) ?? [];
  const item = "flex items-center gap-2 rounded-[8px] bg-white/[0.04] px-3 py-2.5 text-left text-[13px] text-[#E8EAF0] hover:bg-white/[0.08]";
  return (
    <div className="grid gap-2">
      <button type="button" className={item} onClick={() => addTextClip("title", brand)}>
        <Type className="size-4" aria-hidden="true" /> <span className="font-display text-[16px] font-bold">Title</span>
      </button>
      <button type="button" className={item} onClick={() => addTextClip("subtitle", brand)}>
        <Type className="size-4" aria-hidden="true" /> Subtitle
      </button>
      <button type="button" className={item} onClick={() => addTextClip("caption", brand)}>
        <Type className="size-4" aria-hidden="true" /> <span className="uppercase tracking-wide">Bold caption</span>
      </button>
      <button type="button" className={item} onClick={() => addTextClip("cta", brand)}>
        <Type className="size-4" aria-hidden="true" /> Call to action
      </button>
      <button
        type="button"
        className={item}
        onClick={() => {
          addEffectClip("solid", brand[0] ?? "#20292D");
          addTextClip("cta", ["#FFFFFF"]);
        }}
      >
        <Layers className="size-4" aria-hidden="true" /> End card (brand colour + call to action)
      </button>
      <p className="text-[11px] leading-snug text-[#8890A2]">Added at the playhead, in the current shot, on its own track. Text says only what you type; edit it in the inspector. Animations: fade, slide, reveal and stagger.</p>
    </div>
  );
}

function EffectsTab() {
  const film = useEditor((s) => s.film)!;
  const item = "flex items-center gap-2 rounded-[8px] bg-white/[0.04] px-3 py-2.5 text-left text-[13px] text-[#E8EAF0] hover:bg-white/[0.08]";
  return (
    <div className="grid gap-2">
      <button type="button" className={item} onClick={() => addEffectClip("spotlight")}>
        <Sparkles className="size-4" aria-hidden="true" /> Spotlight
      </button>
      <button type="button" className={item} onClick={() => addEffectClip("sweep")}>
        <Sparkles className="size-4" aria-hidden="true" /> Light sweep
      </button>
      <button type="button" className={item} onClick={() => addEffectClip("glow")}>
        <Sparkles className="size-4" aria-hidden="true" /> Glow
      </button>
      <button type="button" className={item} onClick={() => addEffectClip("solid")}>
        <Layers className="size-4" aria-hidden="true" /> Solid colour
      </button>
      <div className="grid gap-2 border-t border-white/[0.08] pt-3">
        <p className="text-[12px] font-semibold text-[#C9CEDA]">Film fades</p>
        <Field label="Fade in from black (s)">
          <input type="number" min={0} max={10} step={0.1} value={film.fadeIn} onChange={(e) => commit({ ...film, fadeIn: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }, { coalesce: "fadein" })} className={darkInput} aria-label="Fade in from black, seconds" />
        </Field>
        <Field label="Fade out to black (s)">
          <input type="number" min={0} max={10} step={0.1} value={film.fadeOut} onChange={(e) => commit({ ...film, fadeOut: Math.max(0, Math.min(10, Number(e.target.value) || 0)) }, { coalesce: "fadeout" })} className={darkInput} aria-label="Fade out to black, seconds" />
        </Field>
      </div>
      <p className="text-[11px] leading-snug text-[#8890A2]">Light layers sit on their own tracks over the scene. They change how the frame looks, never the product image itself. Colour grading is in Colour.</p>
    </div>
  );
}

export function LibraryPanel({ tab }: { tab: LibraryTab }) {
  return (
    <div className="grid content-start gap-2 p-3" data-library={tab}>
      {tab === "media" && <MediaTab />}
      {tab === "styles" && <StylesTab />}
      {tab === "scenes" && <ScenesTab />}
      {tab === "text" && <TextTab />}
      {tab === "audio" && <AudioTab />}
      {tab === "effects" && <EffectsTab />}
    </div>
  );
}

function AudioTab() {
  const film = useEditor((s) => s.film)!;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const sounds = film.media.filter((m) => m.hasAudio);
  return (
    <div className="grid gap-2">
      <input ref={input} type="file" multiple accept={MEDIA_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void importFiles(Array.from(e.target.files ?? []), setBusy).finally(() => (e.target.value = ""))} />
      <DarkButton icon={<Upload className="size-4" aria-hidden="true" />} onClick={() => input.current?.click()} disabled={!!busy}>
        Add sound
      </DarkButton>
      {busy && <p role="status" className="text-[12px] text-[#A4B1FF]">{busy}</p>}
      {sounds.map((m) => (
        <div key={m.id} className="grid gap-1 rounded-[8px] bg-white/[0.03] p-2">
          <div className="flex items-center gap-2 text-[12px] text-[#C9CEDA]">
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <span className="tabular-nums text-[#8890A2]">{secs(m.duration)}</span>
            <button type="button" aria-label={`Add ${m.name} at the playhead`} onClick={() => addMediaClip({ ...m, kind: "audio" })} className="inline-flex size-6 items-center justify-center rounded hover:bg-white/10">
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          {m.peaks && (
            <svg viewBox={`0 0 ${m.peaks.length} 20`} preserveAspectRatio="none" className="h-6 w-full" aria-hidden="true">
              <path d={m.peaks.map((p, i) => `M${i} ${10 - p * 10}V${10 + p * 10}`).join("")} stroke="#7FD3DC" strokeWidth={1} />
            </svg>
          )}
        </div>
      ))}
      <p className="text-[11px] leading-snug text-[#8890A2]">ISOLA doesn&apos;t include music. Add sound you have the rights to use. Beat markers aren&apos;t offered because ISOLA doesn&apos;t detect beats.</p>
    </div>
  );
}
