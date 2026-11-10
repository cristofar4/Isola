"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { Box, Clapperboard, Copy, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { askName } from "@/components/studio/name-dialog";
import { editedText } from "@/components/studio/project-hooks";
import { useLibraryReady } from "@/components/studio/library-hooks";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { ASPECT_ORDER, ASPECTS, type Aspect, type Film } from "@/lib/motion/model";
import { createFilm, duplicateFilm, loadFilms, renameFilm, trashFilm, useFilms } from "@/lib/motion/store";
import { secs, filmDuration } from "@/lib/motion/time";
import { FilmPreview } from "./kit-preview";

function FilmCard({ film, onMessage }: { film: Film; onMessage: (t: string) => void }) {
  const [hover, setHover] = useState(false);
  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-ink outline-none data-[highlighted]:bg-paper";
  return (
    <li data-film={film.name} className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[var(--shadow-card)]" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Link href={`/motion/${film.id}`} aria-label={`Open ${film.name}`} className="block bg-black">
        <FilmPreview film={film} playing={hover} label={`${film.name} preview`} className="aspect-video object-contain" still={0.4} />
      </Link>
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link href={`/motion/${film.id}`} className="block truncate text-[16px] font-bold text-ink hover:text-blue-700">
            {film.name}
          </Link>
          <p className="truncate text-[13px] text-muted">
            {ASPECTS[film.aspect].label} · {secs(filmDuration(film))} · {film.shots.length} shot{film.shots.length === 1 ? "" : "s"} · edited {editedText(film.updatedAt)}
          </p>
          {film.source && <p className="truncate text-[12px] text-muted">From the scene “{film.source.sceneName}”</p>}
        </div>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger aria-label={`More actions for ${film.name}`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
            <Ellipsis className="size-4" aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[190px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
              <DropdownMenu.Item className={item} onSelect={() => void askName("Rename film", { label: "Film name", initial: film.name, action: "Rename" }).then((n) => { if (n) void renameFilm(film.id, n); })}>
                <Pencil className="size-4" aria-hidden="true" /> Rename
              </DropdownMenu.Item>
              <DropdownMenu.Item className={item} onSelect={() => void duplicateFilm(film.id).then((c) => c && onMessage(`Made “${c.name}”.`))}>
                <Copy className="size-4" aria-hidden="true" /> Duplicate
              </DropdownMenu.Item>
              <DropdownMenu.Item className={cn(item, "text-danger data-[highlighted]:bg-danger-50")} onSelect={() => void trashFilm(film.id).then(() => onMessage(`Moved “${film.name}” to the trash.`))}>
                <Trash2 className="size-4" aria-hidden="true" /> Move to trash
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </li>
  );
}

/** Motion Studio's home: your films, and how to start one. */
export function FilmsPage() {
  const router = useRouter();
  useLibraryReady();
  const status = useFilms((s) => s.status);
  const all = useFilms((s) => s.films);
  const films = useMemo(() => all.filter((f) => !f.trashedAt).sort((a, b) => b.updatedAt - a.updatedAt), [all]);
  const [busy, setBusy] = useState<Aspect | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void loadFilms().catch(() => undefined);
  }, []);
  async function start(aspect: Aspect) {
    setBusy(aspect);
    try {
      const f = await createFilm("Untitled film", aspect);
      router.push(`/motion/${f.id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The film couldn't be created.");
      setBusy(null);
    }
  }
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[34px] font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[40px]">Motion Studio</h1>
          <p className="mt-1 max-w-[680px] text-[15px] text-ink-3">Short product films from your scenes: motion styles, keyframes, colour, sound and video export, all on this device. Films are kept in this browser.</p>
        </div>
        <Link href="/studio/scenes" className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-blue px-4 text-[14px] font-semibold text-white shadow-[var(--shadow-blue)] hover:bg-blue-600">
          <Clapperboard className="size-4" aria-hidden="true" /> Animate a scene
        </Link>
      </header>
      <section aria-label="New film" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ASPECT_ORDER.map((a) => {
          const f = ASPECTS[a];
          return (
            <button key={a} type="button" onClick={() => void start(a)} disabled={!!busy || status !== "ready"} className="flex items-center gap-3 rounded-[14px] border-2 border-dashed border-line-strong bg-surface px-4 py-3 text-left hover:border-blue/60 disabled:opacity-60">
              <span className="inline-flex rounded-[5px] border-2 border-blue/50 bg-blue-50" style={{ width: (f.width / Math.max(f.width, f.height)) * 34, height: (f.height / Math.max(f.width, f.height)) * 34 }} aria-hidden="true" />
              <span>
                <span className="flex items-center gap-1.5 text-[14px] font-semibold text-ink">
                  {busy === a ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" aria-hidden="true" />} Empty {f.label}
                </span>
                <span className="text-[12px] text-muted">Start from your own media</span>
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
      <section aria-labelledby="your-films" className="mt-8">
        <h2 id="your-films" className="text-[20px] font-bold text-ink">
          Your films <span className="ml-1 rounded-full bg-paper-2 px-2 py-0.5 align-middle text-[13px] font-semibold text-muted">{films.length}</span>
        </h2>
        {status !== "ready" ? (
          <p className="mt-6 flex items-center gap-2 text-muted" role="status">
            <Spinner className="text-blue" /> Loading films…
          </p>
        ) : films.length === 0 ? (
          <div className="mt-4 grid place-items-center gap-2 rounded-[18px] border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
            <Box className="size-8 text-muted" aria-hidden="true" />
            <p className="text-[16px] font-semibold text-ink">No films yet</p>
            <p className="max-w-[460px] text-[14px] text-muted">Open a scene in Scene Studio and choose Animate scene, or start an empty film and import your own images, video and sound.</p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {films.map((f) => (
              <FilmCard key={f.id} film={f} onMessage={setMessage} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
