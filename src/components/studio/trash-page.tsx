"use client";

import { AlertDialog } from "radix-ui";
import { FolderOpen, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { TRASH_DAYS, deleteAssetsForever, restoreAssets, useLibrary, type Asset } from "@/lib/studio/library";
import type { Project } from "@/lib/studio/project-model";
import { deleteProjectsForever, restoreProjects } from "@/lib/studio/projects";
import { useLibraryReady, useThumb } from "./library-hooks";

const purgeDate = (trashedAt: number) => new Date(trashedAt + TRASH_DAYS * 86_400_000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Confirm({ label, title, detail, onConfirm, danger = true }: { label: string; title: string; detail: string; onConfirm: () => void; danger?: boolean }) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <Button size="sm" variant={danger ? "danger" : "secondary"} icon={<Trash2 className="size-4" aria-hidden="true" />}>
          {label}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-[18px] bg-surface p-6 shadow-[var(--shadow-float)]">
          <AlertDialog.Title className="font-display text-lg font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1.5 text-sm text-muted">{detail}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                Delete for good
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function AssetRow({ asset, onMessage }: { asset: Asset; onMessage: (m: string) => void }) {
  const url = useThumb(asset.id);
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-trash-item={asset.name}>
      <span className="checkerboard-sm relative size-12 shrink-0 overflow-hidden rounded-[8px] border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        {url && <img src={url} alt="" className="absolute inset-0 size-full object-contain" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{asset.name}</p>
        <p className="text-[12px] text-muted">Asset · deleted for good on {purgeDate(asset.trashedAt!)}</p>
      </div>
      <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" aria-hidden="true" />} onClick={() => void restoreAssets([asset.id]).then(() => onMessage(`Restored ${asset.name}.`))}>
        Restore
      </Button>
      <Confirm
        label="Delete"
        title={`Delete ${asset.name} for good?`}
        detail="It's removed from this browser and can't be recovered."
        onConfirm={() =>
          void deleteAssetsForever([asset.id]).then(({ kept }) => onMessage(kept.length ? `${asset.name} is still the source of a project, so it was kept. Delete that project first.` : `Deleted ${asset.name}.`))
        }
      />
    </li>
  );
}

function ProjectRow({ project, onMessage }: { project: Project; onMessage: (m: string) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-trash-item={project.name}>
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[8px] bg-paper-2 text-ink-3">
        <FolderOpen className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{project.name}</p>
        <p className="text-[12px] text-muted">
          Project · {project.versions.length} versions · deleted for good on {purgeDate(project.trashedAt!)}
        </p>
      </div>
      <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" aria-hidden="true" />} onClick={() => void restoreProjects([project.id]).then(() => onMessage(`Restored “${project.name}”.`))}>
        Restore
      </Button>
      <Confirm label="Delete" title={`Delete “${project.name}” for good?`} detail="Its versions and history are removed. The source image stays in your library." onConfirm={() => void deleteProjectsForever([project.id]).then(() => onMessage(`Deleted “${project.name}”.`))} />
    </li>
  );
}

/** Trashed assets and projects, restorable for 30 days. */
export function TrashPage() {
  const status = useLibraryReady();
  // Select the stored arrays and filter after: a selector that builds a new array each time re-renders forever.
  const allAssets = useLibrary((s) => s.assets);
  const allProjects = useLibrary((s) => s.projects);
  const assets = useMemo(() => allAssets.filter((a) => a.trashedAt), [allAssets]);
  const projects = useMemo(() => allProjects.filter((p) => p.trashedAt), [allProjects]);
  const [message, setMessage] = useState<string | null>(null);
  const empty = assets.length + projects.length === 0;
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[40px]">Trash</h1>
          <p className="mt-2 text-[16px] text-ink-3">Restore anything here within {TRASH_DAYS} days; after that it&apos;s deleted for good.</p>
        </div>
        {!empty && (
          <Confirm
            label="Empty trash"
            title="Empty the trash?"
            detail="Everything in the trash is removed from this browser for good. Assets still used by a project are kept."
            onConfirm={async () => {
              await deleteProjectsForever(projects.map((p) => p.id));
              const { kept } = await deleteAssetsForever(assets.map((a) => a.id));
              setMessage(kept.length ? `Emptied the trash. ${kept.length} asset${kept.length === 1 ? " is" : "s are"} still used by a project and stayed.` : "Emptied the trash.");
            }}
          />
        )}
      </header>
      {message && (
        <p role="status" className="mt-4 text-[13px] font-medium text-success">
          {message}
        </p>
      )}
      {status !== "ready" ? (
        <p className="mt-10 flex items-center justify-center gap-2 text-muted">
          <Spinner /> Loading…
        </p>
      ) : empty ? (
        <div className="mt-6 rounded-[18px] border-2 border-dashed border-line-strong px-6 py-14 text-center">
          <ImageIcon className="mx-auto size-8 text-subtle" aria-hidden="true" />
          <p className="mt-2 text-[16px] font-semibold text-ink">The trash is empty</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-[16px] border border-line bg-surface" aria-label="Trash">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} onMessage={setMessage} />
          ))}
          {assets.map((a) => (
            <AssetRow key={a.id} asset={a} onMessage={setMessage} />
          ))}
        </ul>
      )}
    </div>
  );
}
