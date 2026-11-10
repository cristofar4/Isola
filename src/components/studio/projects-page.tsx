"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { ArrowUpRight, CircleAlert, CircleCheck, Copy, Download, Ellipsis, Folder, FolderInput, FolderPlus, LayoutGrid, List, LoaderCircle, Pencil, Plus, Search, Star, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/progress";
import { presetToBatchSettings } from "@/lib/brand-presets";
import { cn } from "@/lib/cn";
import { addAssets, createFolder, renameFolder, useLibrary, type Asset } from "@/lib/studio/library";
import { DEFAULT_LOOK, reviewProject, type Project } from "@/lib/studio/project-model";
import { createProject, duplicateProject, exportLinkedSet, moveProjects, renameProject, starProjects, trashProjects } from "@/lib/studio/projects";
import { useLibraryReady, useThumb } from "./library-hooks";
import { askName } from "./name-dialog";
import { editedText, useProjectPreview } from "./project-hooks";
import { defaultPreset, usePresets } from "./use-presets";

type Tab = "all" | "recent" | "starred";
type Sort = "edited" | "name" | "created";

export function StatusPill({ project }: { project: Project }) {
  const issues = project.status === "ready" ? reviewProject(project).filter((i) => i.severity === "warning").length : 0;
  if (project.status === "processing")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[12px] font-semibold text-blue-700">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" /> Processing
      </span>
    );
  if (project.status === "failed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-50 px-2 py-0.5 text-[12px] font-semibold text-danger">
        <CircleAlert className="size-3.5" aria-hidden="true" /> Failed
      </span>
    );
  if (issues)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[12px] font-semibold text-warn">
        <CircleAlert className="size-3.5" aria-hidden="true" /> Needs review
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[12px] font-semibold text-success">
      <CircleCheck className="size-3.5" aria-hidden="true" /> Ready
    </span>
  );
}

function ProjectMenu({ project, onMessage }: { project: Project; onMessage: (m: string) => void }) {
  const router = useRouter();
  const folders = useLibrary((s) => s.folders);
  const item = "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger aria-label={`More actions for ${project.name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
        <Ellipsis className="size-5" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[200px] animate-scale-in rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
          <DropdownMenu.Item className={item} onSelect={() => router.push(`/studio/projects/${project.id}`)}>
            <ArrowUpRight className="size-4 text-muted" aria-hidden="true" /> Open project
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={item}
            onSelect={async () => {
              const name = await askName("Rename project", { initial: project.name, action: "Rename" });
              if (name) await renameProject(project.id, name);
            }}
          >
            <Pencil className="size-4 text-muted" aria-hidden="true" /> Rename
          </DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => void duplicateProject(project.id).then(() => onMessage(`Duplicated “${project.name}”.`))}>
            <Copy className="size-4 text-muted" aria-hidden="true" /> Duplicate
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={cn(item, "data-[state=open]:bg-paper")}>
              <FolderInput className="size-4 text-muted" aria-hidden="true" /> Move to folder
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="z-50 min-w-[180px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
                <DropdownMenu.Item className={item} onSelect={() => void moveProjects([project.id], null)}>
                  No folder
                </DropdownMenu.Item>
                {folders.map((f) => (
                  <DropdownMenu.Item key={f.id} className={item} onSelect={() => void moveProjects([project.id], f.id).then(() => onMessage(`Moved to “${f.name}”.`))}>
                    <Folder className="size-4 text-muted" aria-hidden="true" /> {f.name}
                  </DropdownMenu.Item>
                ))}
                <DropdownMenu.Item
                  className={item}
                  onSelect={async () => {
                    const name = await askName("New folder", { label: "Folder name" });
                    if (!name) return;
                    const f = await createFolder(name);
                    await moveProjects([project.id], f.id);
                    onMessage(`Moved to the new folder “${f.name}”.`);
                  }}
                >
                  <FolderPlus className="size-4 text-muted" aria-hidden="true" /> New folder…
                </DropdownMenu.Item>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Item className={item} onSelect={() => void starProjects([project.id], !project.starred)}>
            <Star className="size-4 text-muted" aria-hidden="true" /> {project.starred ? "Remove star" : "Add to starred"}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item className={cn(item, "text-danger data-[highlighted]:bg-danger-50")} onSelect={() => void trashProjects([project.id]).then(() => onMessage(`Moved “${project.name}” to the trash.`))}>
            <Trash2 className="size-4" aria-hidden="true" /> Move to trash
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ProjectCard({ project, selected, onToggle, onMessage }: { project: Project; selected: boolean; onToggle: () => void; onMessage: (m: string) => void }) {
  const master = useProjectPreview(project, null, 520);
  const square = useProjectPreview(project, project.versions[0] ?? null, 260);
  const second = useProjectPreview(project, project.versions[1] ?? null, 260);
  return (
    <li data-project={project.name} className={cn("group relative overflow-hidden rounded-[18px] border bg-surface shadow-[var(--shadow-card)]", selected ? "border-blue ring-2 ring-blue/25" : "border-line hover:border-line-strong")}>
      <Link href={`/studio/projects/${project.id}`} className="block" aria-label={`Open ${project.name}`}>
        <span className="grid aspect-[16/9] grid-cols-[2fr_1fr] gap-1 bg-paper-2 p-1">
          <span className="checkerboard-sm relative overflow-hidden rounded-[12px]">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            {master && <img src={master} alt="" className="absolute inset-0 size-full object-contain p-2" />}
          </span>
          <span className="grid gap-1">
            {[square, second].map((u, i) => (
              <span key={i} className="relative overflow-hidden rounded-[10px] bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                {u && <img src={u} alt="" className="absolute inset-0 size-full object-contain" />}
              </span>
            ))}
          </span>
        </span>
      </Link>
      <label className="absolute left-3 top-3 inline-flex size-7 cursor-pointer items-center justify-center rounded-[8px] bg-white/95 shadow-sm">
        <input type="checkbox" className="size-[17px] cursor-pointer accent-blue" checked={selected} onChange={onToggle} aria-label={`Select ${project.name}`} />
      </label>
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-ink">{project.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            Project · {project.versions.length} version{project.versions.length === 1 ? "" : "s"} <StatusPill project={project} />
          </p>
          <p className="mt-1 text-[12px] text-muted">Edited {editedText(project.updatedAt)}</p>
        </div>
        <button type="button" aria-label={project.starred ? `Unstar ${project.name}` : `Star ${project.name}`} aria-pressed={project.starred} onClick={() => void starProjects([project.id], !project.starred)} className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-ink/5">
          <Star className={cn("size-[18px]", project.starred ? "fill-warn text-warn" : "text-muted")} aria-hidden="true" />
        </button>
        <ProjectMenu project={project} onMessage={onMessage} />
      </div>
    </li>
  );
}

function SourcePicker({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const assets = useLibrary((s) => s.assets);
  const presets = usePresets((s) => s.presets);
  const loadPresets = usePresets((s) => s.load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sources = assets.filter((a) => !a.trashedAt && a.kind !== "background").sort((a, b) => b.createdAt - a.createdAt);

  async function start(asset: Asset) {
    setBusy(true);
    setError(null);
    try {
      if (!presets) await loadPresets();
      const preset = defaultPreset(usePresets.getState().presets);
      const id = await createProject(asset.id, { look: preset ? presetToBatchSettings(preset, DEFAULT_LOOK) : DEFAULT_LOOK });
      onOpenChange(false);
      router.push(`/studio/projects/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The project couldn't be created.");
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} size="lg" title="New project" description="Choose the image it starts from. Your default brand preset sets its look; Square, Portrait and Wide versions are added for you.">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        id="project-source-file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          const added = await addAssets([file]);
          if (added.added[0]) await start(added.added[0]);
          else {
            setError(added.rejected[0]?.reason ?? "That file couldn't be added.");
            setBusy(false);
          }
        }}
      />
      <div className="grid gap-4" data-source-picker>
        <Button onClick={() => input.current?.click()} disabled={busy} icon={busy ? <Spinner /> : <Upload className="size-4" aria-hidden="true" />}>
          Upload a photo
        </Button>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        {sources.length > 0 && (
          <>
            <p className="text-[13px] font-semibold text-ink">Or start from your library</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sources.slice(0, 24).map((a) => (
                <SourceTile key={a.id} asset={a} disabled={busy} onPick={() => void start(a)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}

function SourceTile({ asset, onPick, disabled }: { asset: Asset; onPick: () => void; disabled: boolean }) {
  const url = useThumb(asset.id);
  return (
    <li>
      <button type="button" disabled={disabled} onClick={onPick} className="w-full overflow-hidden rounded-[12px] border border-line text-left hover:border-blue/50 disabled:opacity-50" aria-label={`Start from ${asset.name}`}>
        <span className={cn("relative block aspect-[4/3]", asset.hasAlpha ? "checkerboard-sm" : "bg-paper-2")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {url && <img src={url} alt="" className="absolute inset-0 size-full object-contain p-1.5" />}
        </span>
        <span className="block truncate px-2.5 py-2 text-[13px] font-medium text-ink">{asset.name}</span>
      </button>
    </li>
  );
}

function FolderCard({ id, name, projects, active, onOpen }: { id: string; name: string; projects: Project[]; active: boolean; onOpen: () => void }) {
  const preview = useProjectPreview(projects[0] ?? null, null, 160);
  return (
    <li>
      <div className={cn("flex items-center gap-3 rounded-[16px] border bg-surface p-4 shadow-[var(--shadow-card)]", active ? "border-blue ring-2 ring-blue/20" : "border-line")}>
        <button type="button" onClick={onOpen} aria-pressed={active} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Folder className="size-7 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold text-ink">{name}</span>
            <span className="block text-[13px] text-muted">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
          </span>
          <span className="checkerboard-sm relative size-14 shrink-0 overflow-hidden rounded-[10px] border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            {preview && <img src={preview} alt="" className="absolute inset-0 size-full object-contain" />}
          </span>
        </button>
        <button
          type="button"
          aria-label={`Rename folder ${name}`}
          onClick={async () => {
            const next = await askName("Rename folder", { initial: name, action: "Rename" });
            if (next) await renameFolder(id, next);
          }}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

/** All projects, organised in folders, ready to continue. */
export function ProjectsPage() {
  const status = useLibraryReady();
  const projects = useLibrary((s) => s.projects);
  const folders = useLibrary((s) => s.folders);
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<Sort>("edited");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  // "New project" from the Create menu or ⌘K arrives as ?new=1.
  const wantsNew = params.get("new") === "1";
  const [handledNew, setHandledNew] = useState(false);
  if (wantsNew && !handledNew) {
    setHandledNew(true);
    setPicker(true);
  }
  useEffect(() => {
    if (handledNew && wantsNew) router.replace("/studio/projects", { scroll: false });
  }, [handledNew, wantsNew, router]);

  const live = useMemo(() => projects.filter((p) => !p.trashedAt), [projects]);
  const visible = useMemo(() => {
    // "Recent" is the eight most recently edited projects.
    const recent = new Set([...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).map((p) => p.id));
    const q = query.trim().toLowerCase();
    const list = live.filter((p) => (tab === "all" || (tab === "starred" ? p.starred : recent.has(p.id))) && (!folder || p.folderId === folder) && (!q || p.name.toLowerCase().includes(q)));
    const by: Record<Sort, (a: Project, b: Project) => number> = {
      edited: (a, b) => b.updatedAt - a.updatedAt,
      name: (a, b) => a.name.localeCompare(b.name),
      created: (a, b) => b.createdAt - a.createdAt,
    };
    return [...list].sort(by[sort]);
  }, [live, tab, folder, query, sort]);
  const chosen = new Set(selected);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[40px]">Projects</h1>
          <p className="mt-2 text-[16px] text-ink-3">Every collection, organised and ready to continue.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="lg"
            variant="secondary"
            icon={<Plus className="size-4" aria-hidden="true" />}
            onClick={async () => {
              const name = await askName("New folder", { label: "Folder name" });
              if (name) setFolder((await createFolder(name)).id);
            }}
          >
            New folder
          </Button>
          <Button size="lg" icon={<Plus className="size-4" aria-hidden="true" />} onClick={() => setPicker(true)}>
            New project
          </Button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3 border-b border-line">
        <div role="tablist" aria-label="Show" className="flex gap-1">
          {(
            [
              ["all", "All projects"],
              ["recent", "Recent"],
              ["starred", "Starred"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} role="tab" type="button" aria-selected={tab === value} onClick={() => setTab(value)} className={cn("-mb-px border-b-2 px-4 py-2.5 text-[15px] font-medium", tab === value ? "border-blue text-blue-700" : "border-transparent text-ink-3 hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
        <div className="mb-2 ml-auto flex items-center gap-2">
          <div className="flex rounded-[10px] border border-line bg-surface p-0.5" role="group" aria-label="Layout">
            {(
              [
                ["grid", "Grid", LayoutGrid],
                ["list", "List", List],
              ] as const
            ).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-label={label} aria-pressed={view === value} onClick={() => setView(value)} className={cn("inline-flex size-9 items-center justify-center rounded-lg", view === value ? "bg-blue-50 text-blue-700" : "text-muted hover:text-ink")}>
                <Icon className="size-4" aria-hidden="true" />
              </button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="h-10 rounded-[10px] border border-line bg-surface pl-3 pr-8 text-[14px]">
            <option value="edited">Last edited</option>
            <option value="created">Newest</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      {folders.length > 0 && (
        <section aria-labelledby="folders-title" className="mt-6">
          <h2 id="folders-title" className="text-[18px] font-bold text-ink">
            Your folders
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {folders.map((f) => (
              <FolderCard key={f.id} id={f.id} name={f.name} projects={live.filter((p) => p.folderId === f.id)} active={folder === f.id} onOpen={() => setFolder(folder === f.id ? null : f.id)} />
            ))}
          </ul>
        </section>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-[22px] font-bold text-ink">
          {folder ? folders.find((f) => f.id === folder)?.name : "All projects"}
          <span className="rounded-full bg-paper-2 px-2 text-[13px] font-semibold text-ink-3">{visible.length}</span>
        </h2>
        {folder && (
          <button type="button" onClick={() => setFolder(null)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 hover:underline">
            <X className="size-3.5" aria-hidden="true" /> Show all folders
          </button>
        )}
        <label className="relative ml-auto w-full sm:w-72">
          <span className="sr-only">Search within projects</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search within projects" className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] placeholder:text-muted focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15" />
        </label>
      </div>
      {message && (
        <p role="status" className="mt-3 text-[13px] font-medium text-success">
          {message}
        </p>
      )}

      {status !== "ready" ? (
        <p className="mt-10 flex items-center justify-center gap-2 text-muted">
          <Spinner /> Loading projects…
        </p>
      ) : visible.length === 0 ? (
        <div className="mt-5 rounded-[18px] border-2 border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-[17px] font-semibold text-ink">{live.length ? "No projects match" : "No projects yet"}</p>
          <p className="mx-auto mt-1 max-w-[480px] text-[14px] text-muted">
            A project turns one photo into a master cutout and linked versions for every format. Change the master once and every version follows.
          </p>
          <Button className="mt-4" onClick={() => setPicker(true)} icon={<Plus className="size-4" aria-hidden="true" />}>
            New project
          </Button>
        </div>
      ) : view === "grid" ? (
        <ul className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Projects">
          {visible.map((p) => (
            <ProjectCard key={p.id} project={p} selected={chosen.has(p.id)} onToggle={() => toggle(p.id)} onMessage={setMessage} />
          ))}
        </ul>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-[16px] border border-line bg-surface" aria-label="Projects">
          {visible.map((p) => (
            <li key={p.id} data-project={p.name} className="flex items-center gap-3 px-4 py-3">
              <input type="checkbox" className="size-[17px] accent-blue" checked={chosen.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
              <Link href={`/studio/projects/${p.id}`} className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink hover:text-blue-700">
                {p.name}
              </Link>
              <span className="hidden text-[13px] text-muted sm:inline">{p.versions.length} versions</span>
              <StatusPill project={p} />
              <span className="hidden w-32 text-right text-[13px] text-muted md:inline">{editedText(p.updatedAt)}</span>
              <ProjectMenu project={p} onMessage={setMessage} />
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:left-[256px]">
          <div role="toolbar" aria-label="Selected projects" className="flex max-w-full flex-wrap items-center gap-2 rounded-[16px] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-float)]">
            <span className="mr-2 text-[15px] font-bold text-ink">
              {selected.length} project{selected.length === 1 ? "" : "s"} selected
            </span>
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <Button size="sm" variant="secondary" icon={<FolderInput className="size-4" aria-hidden="true" />}>
                  Move
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content sideOffset={8} className="z-50 min-w-[200px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
                  <DropdownMenu.Item className="cursor-pointer rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void moveProjects(selected, null)}>
                    No folder
                  </DropdownMenu.Item>
                  {folders.map((f) => (
                    <DropdownMenu.Item key={f.id} className="cursor-pointer rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void moveProjects(selected, f.id).then(() => setMessage(`Moved to “${f.name}”.`))}>
                      {f.name}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Button size="sm" variant="secondary" icon={<Copy className="size-4" aria-hidden="true" />} onClick={async () => {
              for (const id of selected) await duplicateProject(id);
              setMessage(`Duplicated ${selected.length} project${selected.length === 1 ? "" : "s"}.`);
            }}>
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={exporting}
              icon={exporting ? <Spinner /> : <Download className="size-4" aria-hidden="true" />}
              onClick={async () => {
                setExporting(true);
                try {
                  for (const id of selected) await exportLinkedSet(id);
                  setMessage(`Exported ${selected.length} linked set${selected.length === 1 ? "" : "s"}.`);
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "Export failed.");
                }
                setExporting(false);
              }}
            >
              Export
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={async () => {
              const n = selected.length;
              await trashProjects(selected);
              setSelected([]);
              setMessage(`Moved ${n} project${n === 1 ? "" : "s"} to the trash.`);
            }}>
              Trash
            </Button>
            <button type="button" onClick={() => setSelected([])} className="ml-1 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-ink">
              <X className="size-4" aria-hidden="true" /> Clear selection
            </button>
          </div>
        </div>
      )}

      <SourcePicker open={picker} onOpenChange={setPicker} />
    </div>
  );
}
