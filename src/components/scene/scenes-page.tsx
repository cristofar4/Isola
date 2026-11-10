"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { Box, Clapperboard, Copy, Ellipsis, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { askName } from "@/components/studio/name-dialog";
import { editedText } from "@/components/studio/project-hooks";
import { useLibraryReady } from "@/components/studio/library-hooks";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { FORMAT_ORDER, SCENE_FORMATS, type Scene, type SceneFormatId } from "@/lib/scene/model";
import { createSampleScene } from "@/lib/scene/sample";
import { createScene, duplicateScene, loadScenes, renameScene, trashScene, useScenes } from "@/lib/scene/store";
import { AnimateDialog } from "./animate-dialog";
import { SceneThumb } from "./scene-canvas";

function SceneCard({ scene, onAnimate, onMessage }: { scene: Scene; onAnimate: () => void; onMessage: (t: string) => void }) {
  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-ink outline-none data-[highlighted]:bg-paper";
  return (
    <li data-scene={scene.name} className="group overflow-hidden rounded-[16px] border border-line bg-surface shadow-[var(--shadow-card)]">
      <Link href={`/studio/scenes/${scene.id}`} className="block bg-paper-2" aria-label={`Open ${scene.name}`}>
        <SceneThumb scene={scene} format={scene.format} label={`${scene.name} preview`} className="mx-auto block aspect-[4/3] h-auto w-full object-contain" />
      </Link>
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link href={`/studio/scenes/${scene.id}`} className="block truncate text-[16px] font-bold text-ink hover:text-blue-700">
            {scene.name}
          </Link>
          <p className="truncate text-[13px] text-muted">
            {scene.formats.map((f) => SCENE_FORMATS[f].ratio).join(" · ")} · {scene.layers.filter((l) => l.kind === "product").length} product{scene.layers.filter((l) => l.kind === "product").length === 1 ? "" : "s"} · edited {editedText(scene.updatedAt)}
          </p>
        </div>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger aria-label={`More actions for ${scene.name}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
            <Ellipsis className="size-4" aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[200px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
              <DropdownMenu.Item className={item} onSelect={onAnimate}>
                <Clapperboard className="size-4 text-blue" aria-hidden="true" /> Animate scene
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={item}
                onSelect={() =>
                  void askName("Rename scene", { label: "Scene name", initial: scene.name, action: "Rename" }).then((n) => {
                    if (n) void renameScene(scene.id, n);
                  })
                }
              >
                <Pencil className="size-4" aria-hidden="true" /> Rename
              </DropdownMenu.Item>
              <DropdownMenu.Item className={item} onSelect={() => void duplicateScene(scene.id).then((c) => c && onMessage(`Made “${c.name}”.`))}>
                <Copy className="size-4" aria-hidden="true" /> Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item className={cn(item, "text-danger data-[highlighted]:bg-danger-50")} onSelect={() => void trashScene(scene.id).then(() => onMessage(`Moved “${scene.name}” to the trash.`))}>
                <Trash2 className="size-4" aria-hidden="true" /> Move to trash
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </li>
  );
}

/** Scene Studio: product compositions on drawn backdrops, ready to export or animate. */
export function ScenesPage() {
  const router = useRouter();
  const libStatus = useLibraryReady();
  const status = useScenes((s) => s.status);
  const all = useScenes((s) => s.scenes);
  const scenes = useMemo(() => all.filter((s) => !s.trashedAt).sort((a, b) => b.updatedAt - a.updatedAt), [all]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [animating, setAnimating] = useState<Scene | null>(null);

  useEffect(() => {
    void loadScenes().catch(() => undefined);
  }, []);

  async function start(format: SceneFormatId) {
    setBusy(format);
    try {
      const s = await createScene("Untitled scene", format);
      router.push(`/studio/scenes/${s.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The scene couldn't be created.");
      setBusy(null);
    }
  }

  async function sample() {
    setBusy("sample");
    try {
      const s = await createSampleScene();
      router.push(`/studio/scenes/${s.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The sample couldn't be created.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[34px] font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[40px]">Scene Studio</h1>
          <p className="mt-1 max-w-[640px] text-[15px] text-ink-3">Place your cutouts on a backdrop with real shadows, export every format, or animate the scene in Motion Studio. Scenes are kept in this browser.</p>
        </div>
        <Button variant="secondary" onClick={() => void sample()} disabled={!!busy || libStatus !== "ready"} icon={busy === "sample" ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden="true" />}>
          Sample scene
        </Button>
      </header>

      <section aria-label="New scene" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FORMAT_ORDER.map((id) => {
          const f = SCENE_FORMATS[id];
          return (
            <button key={id} type="button" onClick={() => void start(id)} disabled={!!busy || status !== "ready"} className="flex items-center gap-3 rounded-[14px] border-2 border-dashed border-line-strong bg-surface px-4 py-3 text-left hover:border-blue/60 disabled:opacity-60">
              <span className="inline-flex items-center justify-center rounded-[6px] border-2 border-blue/50 bg-blue-50" style={{ width: (f.width / Math.max(f.width, f.height)) * 34, height: (f.height / Math.max(f.width, f.height)) * 34 }} aria-hidden="true" />
              <span>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                  {busy === id ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" aria-hidden="true" />} New {f.label}
                </span>
                <span className="text-[12px] text-muted">
                  {f.width} × {f.height}
                </span>
              </span>
            </button>
          );
        })}
      </section>

      {message && (
        <p role="status" className="mt-4 text-[13px] text-success">
          {message}
        </p>
      )}

      <section aria-labelledby="your-scenes" className="mt-8">
        <h2 id="your-scenes" className="text-[20px] font-bold text-ink">
          Your scenes <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 align-middle text-[13px] font-semibold text-muted">{scenes.length}</span>
        </h2>
        {status !== "ready" ? (
          <p className="mt-6 flex items-center gap-2 text-muted" role="status">
            <Spinner className="text-blue" /> Loading scenes…
          </p>
        ) : scenes.length === 0 ? (
          <div className="mt-4 grid place-items-center gap-2 rounded-[18px] border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <Box className="size-8 text-muted" aria-hidden="true" />
            <p className="text-[16px] font-semibold text-ink">No scenes yet</p>
            <p className="max-w-[420px] text-[14px] text-muted">Start one in any format above, or open the sample scene to see how layers, shadows and formats work.</p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {scenes.map((s) => (
              <SceneCard key={s.id} scene={s} onAnimate={() => setAnimating(s)} onMessage={setMessage} />
            ))}
          </ul>
        )}
      </section>
      {animating && <AnimateDialog scene={animating} open onOpenChange={(o) => !o && setAnimating(null)} />}
    </div>
  );
}
