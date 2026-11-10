"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import {
  ArrowLeftRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Download,
  Ellipsis,
  History as HistoryIcon,
  Info,
  LayoutGrid,
  Link2,
  List,
  LoaderCircle,
  Maximize,
  Minus,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Scan,
  ScanSearch,
  Trash2,
  Undo2,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { BATCH_WHITE, MAX_PADDING, type BatchSettings } from "@/lib/batch/settings";
import { presetToBatchSettings } from "@/lib/brand-presets";
import { cn } from "@/lib/cn";
import { DESTINATIONS, destinationById } from "@/lib/export-sets";
import { getAsset, useLibrary } from "@/lib/studio/library";
import { isLinked, reviewProject, versionSettings, type Project, type ProjectIssue, type ProjectVersion } from "@/lib/studio/project-model";
import {
  addVersion,
  canStep,
  exportLinkedSet,
  exportVersion,
  loadHistory,
  matchToMaster,
  openProjectInEditor,
  prepareMaster,
  removeVersion,
  renameProject,
  restoreSnapshot,
  setLook,
  setOverrides,
  stepHistory,
  useHistory,
} from "@/lib/studio/projects";
import { useLibraryReady, useThumb } from "./library-hooks";
import { askName } from "./name-dialog";
import { StatusPill } from "./projects-page";
import { editedText, useProjectPreview } from "./project-hooks";
import { defaultPreset, usePresets } from "./use-presets";

type Panel = "properties" | "review" | "history";
const card = "rounded-[16px] border bg-surface shadow-[var(--shadow-card)]";

function MasterCard({ project, selected, onSelect, compare }: { project: Project; selected: boolean; onSelect: () => void; compare: boolean }) {
  const router = useRouter();
  const cutout = useProjectPreview(project, null, 640);
  const original = useThumb(project.sourceAssetId);
  const [split, setSplit] = useState(50);
  const source = getAsset(project.sourceAssetId);
  const busy = useHistory((h) => h.busy[project.id]);
  return (
    <article data-master className={cn(card, "w-full max-w-[400px] shrink-0 p-4 lg:w-[42%] lg:max-w-[360px]", selected ? "border-blue ring-2 ring-blue/25" : "border-line")} aria-label="Master">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-blue-700">Master</span>
        <span className="min-w-0 flex-1 truncate text-[14px] text-ink-3">/ {source?.name ?? "source"}</span>
        <StatusPill project={project} />
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger aria-label="Master actions" className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5">
            <Ellipsis className="size-5" aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[220px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
              <DropdownMenu.Item disabled={project.status !== "ready"} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-paper" onSelect={() => void openProjectInEditor(project.id).then((ok) => ok && router.push("/editor"))}>
                <Wand2 className="size-4 text-muted" aria-hidden="true" /> Refine in editor
              </DropdownMenu.Item>
              <DropdownMenu.Item disabled={project.status !== "ready"} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-paper" onSelect={() => void exportVersion(project.id, null)}>
                <Download className="size-4 text-muted" aria-hidden="true" /> Download cutout
              </DropdownMenu.Item>
              <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void prepareMaster(project.id)}>
                <RotateCcw className="size-4 text-muted" aria-hidden="true" /> Remove background again
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <button type="button" onClick={onSelect} aria-label="Select the master" className="mt-3 block w-full">
        <span className="checkerboard relative block aspect-[4/3] overflow-hidden rounded-[12px] border border-line">
          {project.status === "processing" && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface/80 text-[13px] font-medium text-ink-3">
              <LoaderCircle className="size-6 animate-spin text-blue" aria-hidden="true" />
              {busy ?? "Preparing the master"}…
            </span>
          )}
          {project.status === "failed" && <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-[13px] text-danger">{project.error}</span>}
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {cutout && <img src={cutout} alt={`${project.name} master cutout`} className="absolute inset-0 size-full object-contain p-2" />}
          {compare && original && (
            <span className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={original} alt="" className="absolute inset-0 size-full object-contain p-2" />
            </span>
          )}
          {compare && original && <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-blue" style={{ left: `${split}%` }} aria-hidden="true" />}
        </span>
      </button>
      {compare && original && (
        <label className="mt-2 flex items-center gap-2 text-[12px] text-muted">
          Original
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="flex-1 accent-blue" aria-label="Compare the original and the cutout" />
          Cutout
        </label>
      )}
    </article>
  );
}

function VersionCard({ project, version, selected, issues, onSelect }: { project: Project; version: ProjectVersion; selected: boolean; issues: ProjectIssue[]; onSelect: () => void }) {
  const preview = useProjectPreview(project, version, 360);
  const dest = destinationById(version.destination);
  const linked = isLinked(version);
  const warn = issues.some((i) => i.versionId === version.id && i.severity === "warning");
  if (!dest) return null;
  return (
    <article data-version={dest.label} className={cn(card, "flex w-full gap-4 p-3", selected ? "border-blue ring-2 ring-blue/25" : "border-line")}>
      <button type="button" onClick={onSelect} aria-label={`Select ${dest.label}`} className="flex size-[104px] shrink-0 items-center justify-center rounded-[10px] bg-paper">
        <span className="checkerboard-sm relative overflow-hidden rounded-[6px] border border-line" style={{ width: dest.width >= dest.height ? "92%" : `${Math.round((92 * dest.width) / dest.height)}%`, aspectRatio: `${dest.width} / ${dest.height}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          {preview && <img src={preview} alt={`${project.name} as ${dest.label}`} className="absolute inset-0 size-full object-contain" />}
        </span>
      </button>
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate whitespace-nowrap text-[16px] font-bold text-ink">{dest.label}</p>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger aria-label={`${dest.label} actions`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-ink/5">
              <Ellipsis className="size-5" aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[200px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
                {!linked && (
                  <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void matchToMaster(project.id, version.id)}>
                    <Link2 className="size-4 text-muted" aria-hidden="true" /> Match to master
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item disabled={project.status !== "ready"} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-paper" onSelect={() => void exportVersion(project.id, version.id)}>
                  <Download className="size-4 text-muted" aria-hidden="true" /> Download
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] text-danger outline-none data-[highlighted]:bg-danger-50" onSelect={() => void removeVersion(project.id, version.id)}>
                  <Trash2 className="size-4" aria-hidden="true" /> Remove version
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
        <p className="whitespace-nowrap text-[14px] tabular-nums text-muted">
          {dest.width} × {dest.height} px
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[13px] text-ink-3">
          <Link2 className={cn("size-3.5", linked ? "text-blue" : "text-muted")} aria-hidden="true" /> {linked ? "Linked to master" : "Custom adjustments"}
        </p>
        <p className="mt-2">
          {project.status !== "ready" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[12px] font-semibold text-blue-700">Waiting for master</span>
          ) : warn ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-[12px] font-semibold text-warn">
              <CircleAlert className="size-3.5" aria-hidden="true" /> Needs review
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[12px] font-semibold text-success">
              <CircleCheck className="size-3.5" aria-hidden="true" /> Ready
            </span>
          )}
        </p>
      </div>
    </article>
  );
}

const ALIGNS: Array<{ x: 0 | 0.5 | 1; y: 0 | 0.5 | 1; label: string }> = [0, 0.5, 1].flatMap((y) =>
  [0, 0.5, 1].map((x) => ({ x: x as 0 | 0.5 | 1, y: y as 0 | 0.5 | 1, label: `${["Top", "Middle", "Bottom"][y * 2]} ${["left", "centre", "right"][x * 2]}` })),
);

function AlignGrid({ value, onChange }: { value: { x: number; y: number }; onChange: (v: { x: 0 | 0.5 | 1; y: 0 | 0.5 | 1 }) => void }) {
  return (
    <div role="radiogroup" aria-label="Position" className="grid w-[108px] grid-cols-3 gap-1 rounded-[10px] border border-line p-1">
      {ALIGNS.map((a) => (
        <button
          key={a.label}
          type="button"
          role="radio"
          aria-checked={value.x === a.x && value.y === a.y}
          aria-label={a.label}
          onClick={() => onChange({ x: a.x, y: a.y })}
          className={cn("inline-flex size-8 items-center justify-center rounded-md", value.x === a.x && value.y === a.y ? "bg-blue text-white" : "hover:bg-paper")}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function backgroundValue(look: BatchSettings) {
  if (look.background.kind === "transparent") return "transparent";
  if (look.background.kind === "color") return look.background.color.toUpperCase();
  return "transparent";
}

/**
 * A range input that saves once you let go: right away for a drag, and after
 * a short pause for arrow keys, so six presses are one change, not six. The
 * value you set stays on screen until the save has landed.
 */
function useSavedSlider(saved: number, save: (value: number) => Promise<unknown>) {
  const [draft, setDraft] = useState<number | null>(null);
  const pending = useRef<{ timer: number; value: number } | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(
    () => () => {
      // Leaving the panel mid-pause still saves what was set.
      const p = pending.current;
      if (p) {
        window.clearTimeout(p.timer);
        void saveRef.current(p.value);
      }
    },
    [],
  );
  function commit(delay: number) {
    if (draft === null) return;
    const value = draft;
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = {
      value,
      timer: window.setTimeout(() => {
        pending.current = null;
        void saveRef.current(value).finally(() => setDraft((d) => (d === value ? null : d)));
      }, delay),
    };
  }
  return {
    value: draft ?? saved,
    onChange: (e: ChangeEvent<HTMLInputElement>) => setDraft(Number(e.target.value)),
    onPointerUp: () => commit(0),
    onKeyUp: () => commit(450),
  };
}

function Properties({ project, version }: { project: Project; version: ProjectVersion | null }) {
  const presets = usePresets((s) => s.presets);
  const brand = defaultPreset(presets)?.colors ?? [];
  const look = project.look;
  const bg = backgroundValue(look);
  const colours = [{ name: "White", hex: BATCH_WHITE }, ...brand.filter((c) => c.hex.toUpperCase() !== BATCH_WHITE)];
  const versionPadding = useSavedSlider(version ? versionSettings(look, version).padding : 0, (padding) =>
    version ? setOverrides(project.id, version.id, { ...version.overrides, padding }, `${destinationById(version.destination)?.label}: padding ${padding}%`) : Promise.resolve(false),
  );
  const masterPadding = useSavedSlider(look.padding, (padding) => setLook(project.id, { padding }));

  if (version) {
    const dest = destinationById(version.destination);
    const own = versionSettings(look, version);
    const o = version.overrides;
    const set = (next: ProjectVersion["overrides"], label: string) => setOverrides(project.id, version.id, next, `${dest?.label}: ${label}`);
    return (
      <div className="grid gap-5" data-properties="version">
        <div>
          <p className="text-[16px] font-bold text-ink">{dest?.label}</p>
          <p className="text-[13px] text-muted">
            {dest?.width} × {dest?.height} px · {dest?.use}
          </p>
        </div>
        <p className={cn("flex items-center gap-2 rounded-[12px] px-3 py-2.5 text-[13px]", isLinked(version) ? "bg-blue-50 text-blue-700" : "bg-warn-50 text-warn")}>
          <Link2 className="size-4" aria-hidden="true" />
          {isLinked(version) ? "Linked: follows every change to the master." : "Has its own adjustments; the rest still follows the master."}
        </p>
        <div className="grid gap-2">
          <label htmlFor="version-padding" className="flex items-center justify-between text-[14px] font-medium text-ink">
            Padding
            <span className="tabular-nums text-muted">
              {versionPadding.value}%{o.padding === undefined ? " · from master" : ""}
            </span>
          </label>
          <input
            id="version-padding"
            type="range"
            min={0}
            max={MAX_PADDING}
            {...versionPadding}
            className="w-full accent-blue"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-medium text-ink">Shadow</span>
          <select aria-label="Version shadow" className="h-9 rounded-[9px] border border-line bg-surface px-2 text-[14px]" value={o.shadow === undefined ? "master" : o.shadow ? "on" : "off"} onChange={(e) => {
            const v = e.target.value;
            const { shadow: _, ...rest } = o;
            void _;
            set(v === "master" ? rest : { ...o, shadow: v === "on" }, `shadow ${v === "master" ? "from master" : v}`);
          }}>
            <option value="master">As master ({look.shadow ? "on" : "off"})</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-medium text-ink">Position</span>
          <AlignGrid value={own.align} onChange={(align) => set({ ...o, align }, "position")} />
        </div>
        {!isLinked(version) && (
          <Button variant="outline-blue" icon={<Link2 className="size-4" aria-hidden="true" />} onClick={() => void matchToMaster(project.id, version.id)}>
            Match to master
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-5" data-properties="master">
      <p className="text-[13px] text-ink-3">Changes to the master apply to every linked version at once.</p>
      <div className="grid gap-2">
        <span className="text-[14px] font-medium text-ink">Background</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Background">
          <button type="button" role="radio" aria-checked={bg === "transparent"} aria-label="Transparent" onClick={() => void setLook(project.id, { background: { kind: "transparent" }, format: "png" })} className={cn("checkerboard-sm size-10 rounded-[10px] border", bg === "transparent" ? "ring-2 ring-blue ring-offset-2" : "border-line")} />
          {colours.map((c) => (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={bg === c.hex.toUpperCase()}
              aria-label={`${c.name} ${c.hex}`}
              title={`${c.name} ${c.hex}`}
              onClick={() => void setLook(project.id, { background: { kind: "color", color: c.hex.toUpperCase() }, matte: c.hex.toUpperCase() })}
              className={cn("size-10 rounded-[10px] border border-ink/10", bg === c.hex.toUpperCase() && "ring-2 ring-blue ring-offset-2")}
              style={{ background: c.hex }}
            />
          ))}
          <label className="relative inline-flex size-10 cursor-pointer items-center justify-center rounded-[10px] border border-dashed border-line-strong text-muted" title="Custom colour">
            <Plus className="size-4" aria-hidden="true" />
            <input
              type="color"
              aria-label="Custom background colour"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={(e) => {
                const hex = e.target.value.toUpperCase();
                void setLook(project.id, { background: { kind: "color", color: hex }, matte: hex });
              }}
            />
          </label>
        </div>
      </div>
      <div className="grid gap-2">
        <label htmlFor="master-padding" className="flex items-center justify-between text-[14px] font-medium text-ink">
          Padding <span className="tabular-nums text-muted">{masterPadding.value}%</span>
        </label>
        <input
          id="master-padding"
          type="range"
          min={0}
          max={MAX_PADDING}
          {...masterPadding}
          className="w-full accent-blue"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="master-shadow" className="text-[14px] font-medium text-ink">
          Soft shadow
        </label>
        <input id="master-shadow" type="checkbox" role="switch" className="size-5 accent-blue" checked={look.shadow} onChange={(e) => void setLook(project.id, { shadow: e.target.checked })} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-medium text-ink">Position</span>
        <AlignGrid value={look.align} onChange={(align) => void setLook(project.id, { align }, "Position changed")} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="master-format" className="text-[14px] font-medium text-ink">
          Format
        </label>
        <select id="master-format" className="h-9 rounded-[9px] border border-line bg-surface px-2 text-[14px]" value={look.format} onChange={(e) => void setLook(project.id, { format: e.target.value as "png" | "jpeg", matte: look.background.kind === "color" ? look.background.color : BATCH_WHITE })}>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
        </select>
      </div>
    </div>
  );
}

function Review({ project, issues }: { project: Project; issues: ProjectIssue[] }) {
  const router = useRouter();
  return (
    <div className="grid gap-3" data-review>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-ink">Quality review</h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", issues.length ? "bg-warn-50 text-warn" : "bg-success-50 text-success")}>
          {issues.length ? `${issues.length} suggestion${issues.length === 1 ? "" : "s"}` : "All good"}
        </span>
      </div>
      {issues.length === 0 ? (
        <p className="flex items-center gap-2 rounded-[12px] bg-success-50 px-3 py-3 text-[14px] text-success">
          <CircleCheck className="size-4" aria-hidden="true" /> Every version matches the master.
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {issues.map((i) => (
            <li key={i.key} className="flex items-start gap-3 rounded-[12px] border border-line p-3" data-issue={i.kind}>
              {i.severity === "warning" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" /> : <Info className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{i.title}</p>
                <p className="text-[13px] leading-snug text-ink-3">{i.detail}</p>
              </div>
              {i.fix && (
                <Button
                  size="sm"
                  variant="outline-blue"
                  onClick={() => {
                    const fix = i.fix!;
                    if (fix.kind === "match") void matchToMaster(project.id, fix.versionId);
                    else if (fix.kind === "padding") {
                      const v = project.versions.find((x) => x.id === fix.versionId);
                      if (v) void setOverrides(project.id, v.id, { ...v.overrides, padding: fix.padding }, `${destinationById(v.destination)?.label}: padding ${fix.padding}%`);
                    } else void openProjectInEditor(project.id).then((ok) => ok && router.push("/editor"));
                  }}
                >
                  {i.fix.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="flex items-center gap-2 text-[12px] text-muted">
        <Info className="size-3.5" aria-hidden="true" /> Suggestions need your approval; nothing changes until you choose a fix.
      </p>
    </div>
  );
}

function HistoryList({ project }: { project: Project }) {
  const snapshots = useHistory((h) => h.snapshots[project.id]);
  const cursor = useHistory((h) => h.cursor[project.id] ?? null);
  const list = [...(snapshots ?? [])].reverse();
  const current = cursor ?? list[0]?.id;
  return (
    <div className="grid gap-3" data-history>
      <h2 className="text-[18px] font-bold text-ink">Version history</h2>
      {!snapshots ? (
        <p className="flex items-center gap-2 text-[14px] text-muted">
          <Spinner /> Loading…
        </p>
      ) : list.length === 0 ? (
        <p className="text-[14px] text-muted">Changes appear here as you make them.</p>
      ) : (
        <ol className="grid gap-2">
          {list.map((s) => (
            <li key={s.id} className={cn("flex items-center gap-3 rounded-[12px] border px-3 py-2.5", s.id === current ? "border-blue/40 bg-blue-50/50" : "border-line")}>
              <HistoryIcon className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{s.label}</p>
                <p className="text-[12px] text-muted">{editedText(s.createdAt)}</p>
              </div>
              {s.id === current ? (
                <span className="text-[12px] font-semibold text-blue-700">Current</span>
              ) : (
                <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" aria-hidden="true" />} onClick={() => void restoreSnapshot(project.id, s.id)} aria-label={`Restore ${s.label}`}>
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** One project: the master, its linked versions, review, history and export. */
export function ProjectBoard({ id }: { id: string }) {
  const router = useRouter();
  const status = useLibraryReady();
  const project = useLibrary((s) => s.projects.find((p) => p.id === id) ?? null);
  const others = useLibrary((s) => s.projects);
  const presets = usePresets((s) => s.presets);
  const loadPresets = usePresets((s) => s.load);
  const busy = useHistory((h) => h.busy[id] ?? null);
  const canUndo = useHistory((h) => canStep(id, -1, h));
  const canRedo = useHistory((h) => canStep(id, 1, h));
  const [view, setView] = useState<"board" | "grid" | "list">("board");
  const [panel, setPanel] = useState<Panel>("properties");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [compare, setCompare] = useState(false);
  const [format, setFormat] = useState<"set" | "png" | "jpeg">("set");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const issues = useMemo(() => (project && project.status === "ready" ? reviewProject(project) : []), [project]);
  const version = project?.versions.find((v) => v.id === selectedId) ?? null;
  const missing = DESTINATIONS.filter((d) => !project?.versions.some((v) => v.destination === d.id));

  useEffect(() => {
    void loadHistory(id);
    if (!usePresets.getState().presets) void loadPresets();
  }, [id, loadPresets]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (typing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      void stepHistory(id, e.shiftKey ? 1 : -1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setMessage(null);
    try {
      const result = await fn();
      setMessage({ tone: "ok", text: ok ?? (typeof result === "string" ? `Downloaded ${result}.` : "Done.") });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : "That didn't work." });
    }
  }

  if (status !== "ready") {
    return (
      <p className="flex min-h-[60vh] items-center justify-center gap-2 text-muted">
        <Spinner /> Loading the project…
      </p>
    );
  }
  if (!project || project.trashedAt) {
    return (
      <div className="m-8 rounded-[18px] border border-line bg-surface p-8 text-center">
        <p className="text-[17px] font-semibold text-ink">{project ? "This project is in the trash" : "This project isn't in this browser"}</p>
        <p className="mt-1 text-[14px] text-muted">Projects are kept in the browser they were made in.</p>
        <Link href={project ? "/studio/trash" : "/studio/projects"} className="mt-4 inline-flex text-[14px] font-semibold text-blue-700 hover:underline">
          {project ? "Open Trash" : "See your projects"}
        </Link>
      </div>
    );
  }

  const exportLabel = version ? `Download ${destinationById(version.destination)?.label}` : "Download cutout";
  const versionCards = project.versions.map((v) => <VersionCard key={v.id} project={project} version={v} selected={selectedId === v.id} issues={issues} onSelect={() => setSelectedId(v.id)} />);

  return (
    <div className="mx-auto grid max-w-[1600px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
      <div className="min-w-0">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[30px] font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[36px]">{project.name}</h1>
              <button
                type="button"
                aria-label="Rename project"
                onClick={async () => {
                  const name = await askName("Rename project", { initial: project.name, action: "Rename" });
                  if (name) await renameProject(project.id, name);
                }}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-ink-3">
              A consistent collection, from first cutout to final export.
              <span className="inline-flex items-center gap-1 text-[13px] text-success">
                <CircleCheck className="size-3.5" aria-hidden="true" /> Saved in this browser · edited {editedText(project.updatedAt)}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 rounded-[12px] border border-line bg-surface p-1" role="group" aria-label="View">
            {(
              [
                ["board", "Board", Scan],
                ["grid", "Grid", LayoutGrid],
                ["list", "List", List],
              ] as const
            ).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)} className={cn("inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[14px] font-medium", view === value ? "bg-blue text-white" : "text-ink-3 hover:text-ink")}>
                <Icon className="size-4" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </header>

        <div role="toolbar" aria-label="Project tools" className={cn(card, "mt-5 flex flex-wrap items-center gap-2 border-line px-3 py-2.5")}>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" disabled={missing.length === 0} icon={<Plus className="size-4" aria-hidden="true" />}>
                Add version <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content sideOffset={6} className="z-50 min-w-[260px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
                {missing.map((d) => (
                  <DropdownMenu.Item key={d.id} className="cursor-pointer rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper" onSelect={() => void addVersion(project.id, d.id)}>
                    <span className="block text-[14px] font-medium text-ink">{d.label}</span>
                    <span className="block text-[12px] text-muted">
                      {d.width} × {d.height} · {d.use}
                    </span>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <Button variant="ghost" icon={<Wand2 className="size-4" aria-hidden="true" />} disabled={project.status !== "ready"} onClick={() => void openProjectInEditor(project.id).then((ok) => ok && router.push("/editor"))}>
            Refine edges
          </Button>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" icon={<Palette className="size-4" aria-hidden="true" />}>
                Apply preset <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content sideOffset={6} className="z-50 min-w-[220px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
                {(presets ?? []).map((p) => (
                  <DropdownMenu.Item key={p.id} className="cursor-pointer rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void setLook(project.id, presetToBatchSettings(p, project.look), `Preset “${p.name}” applied`)}>
                    {p.name}
                    {p.isDefault ? " (default)" : ""}
                  </DropdownMenu.Item>
                ))}
                {presets?.length === 0 && (
                  <DropdownMenu.Item className="cursor-pointer rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => router.push("/studio/presets?new=1")}>
                    Create a brand preset…
                  </DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <Button variant="ghost" icon={<ScanSearch className="size-4" aria-hidden="true" />} onClick={() => setPanel("review")}>
            Review quality{issues.length ? ` (${issues.length})` : ""}
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <div className="flex items-center rounded-[10px] border border-line">
              <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} className="inline-flex size-9 items-center justify-center text-ink-3 hover:text-ink">
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <span className="w-12 text-center text-[13px] tabular-nums text-ink" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} className="inline-flex size-9 items-center justify-center text-ink-3 hover:text-ink">
                <Plus className="size-4" aria-hidden="true" />
              </button>
            </div>
            <Button variant="ghost" size="sm" icon={<Maximize className="size-4" aria-hidden="true" />} onClick={() => setZoom(1)}>
              Fit
            </Button>
          </div>
        </div>

        {busy && (
          <p role="status" className="mt-3 flex items-center gap-2 text-[13px] text-blue-700">
            <Spinner /> {busy}…
          </p>
        )}
        {message && (
          <p role={message.tone === "error" ? "alert" : "status"} className={cn("mt-3 text-[13px] font-medium", message.tone === "error" ? "text-danger" : "text-success")}>
            {message.text}
          </p>
        )}

        <section aria-label="Board" className="mt-4 overflow-x-auto rounded-[18px] border border-line bg-[radial-gradient(circle,rgb(32_41_45/0.08)_1px,transparent_1px)] bg-[length:18px_18px] p-5">
          <div style={{ zoom }}>
            {view === "board" ? (
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-0">
                <MasterCard project={project} selected={!selectedId} onSelect={() => setSelectedId(null)} compare={compare} />
                <div className="hidden shrink-0 items-center lg:flex" aria-hidden="true">
                  <span className="h-0.5 w-3 bg-blue/70" />
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-blue/30 bg-blue-50 px-2.5 py-1 text-[12px] font-semibold text-blue-700">
                    <Link2 className="size-3.5" /> Linked
                  </span>
                  <span className="h-0.5 w-3 bg-blue/70" />
                </div>
                <ul className="w-full min-w-0 max-w-[460px] lg:min-w-[300px] lg:flex-1" aria-label="Linked versions">
                  {versionCards.map((c, i) => (
                    <li
                      key={project.versions[i].id}
                      className="relative py-2 lg:pl-6 lg:before:absolute lg:before:left-0 lg:before:top-1/2 lg:before:h-0.5 lg:before:w-6 lg:before:bg-blue/70 lg:after:absolute lg:after:bottom-0 lg:after:left-0 lg:after:top-0 lg:after:w-0.5 lg:after:bg-blue/70 lg:first:after:top-1/2 lg:last:after:bottom-1/2"
                    >
                      {c}
                    </li>
                  ))}
                  {project.versions.length === 0 && <li className="py-6 text-center text-[14px] text-muted">No versions yet. Use Add version to create one.</li>}
                </ul>
              </div>
            ) : view === "grid" ? (
              <ul className="grid gap-4 md:grid-cols-2">
                <li className="flex justify-center">
                  <MasterCard project={project} selected={!selectedId} onSelect={() => setSelectedId(null)} compare={compare} />
                </li>
                {versionCards.map((c, i) => (
                  <li key={project.versions[i].id}>{c}</li>
                ))}
              </ul>
            ) : (
              <table className="w-full text-left text-[14px]">
                <thead className="text-[12px] uppercase tracking-[0.08em] text-muted">
                  <tr>
                    <th className="py-2 font-semibold">Version</th>
                    <th className="py-2 font-semibold">Size</th>
                    <th className="py-2 font-semibold">Link</th>
                    <th className="py-2 font-semibold">Padding</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {project.versions.map((v) => {
                    const d = destinationById(v.destination);
                    const s = versionSettings(project.look, v);
                    return (
                      <tr key={v.id} className={cn(selectedId === v.id && "bg-blue-50/50")}>
                        <td className="py-2.5 font-semibold text-ink">
                          <button type="button" onClick={() => setSelectedId(v.id)} className="hover:text-blue-700">
                            {d?.label}
                          </button>
                        </td>
                        <td className="py-2.5 tabular-nums text-ink-3">
                          {d?.width} × {d?.height}
                        </td>
                        <td className="py-2.5 text-ink-3">{isLinked(v) ? "Linked" : "Custom"}</td>
                        <td className="py-2.5 tabular-nums text-ink-3">{s.padding}%</td>
                        <td className="py-2.5 text-right">
                          <Button size="sm" variant="secondary" disabled={project.status !== "ready"} onClick={() => void run(() => exportVersion(project.id, v.id))} icon={<Download className="size-3.5" aria-hidden="true" />}>
                            Download
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2" role="toolbar" aria-label="Board controls">
            <Button size="sm" variant="secondary" disabled={!canUndo} onClick={() => void stepHistory(project.id, -1)} icon={<Undo2 className="size-4" aria-hidden="true" />} title="Undo (Ctrl+Z)">
              Undo
            </Button>
            <Button size="sm" variant="secondary" disabled={!canRedo} onClick={() => void stepHistory(project.id, 1)} icon={<Redo2 className="size-4" aria-hidden="true" />} title="Redo (Ctrl+Shift+Z)">
              Redo
            </Button>
            <Button size="sm" variant={compare ? "outline-blue" : "secondary"} aria-pressed={compare} onClick={() => setCompare((c) => !c)} icon={<ArrowLeftRight className="size-4" aria-hidden="true" />}>
              Compare
            </Button>
            <span className="ml-auto text-[13px] text-muted">
              1 source · {project.versions.length} linked version{project.versions.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>

        {others.filter((p) => p.id !== project.id && !p.trashedAt).length > 0 && (
          <section aria-labelledby="queue-title" className={cn(card, "mt-5 border-line p-4")}>
            <h2 id="queue-title" className="text-[18px] font-bold text-ink">
              Other projects
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {others
                .filter((p) => p.id !== project.id && !p.trashedAt)
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, 3)
                .map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-[12px] border border-line p-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/studio/projects/${p.id}`} className="block truncate text-[14px] font-semibold text-ink hover:text-blue-700">
                        {p.name}
                      </Link>
                      <StatusPill project={p} />
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </div>

      <aside aria-label="Project details" className={cn(card, "h-fit border-line lg:sticky lg:top-20")}>
        <div role="tablist" aria-label="Panels" className="grid grid-cols-3 border-b border-line">
          {(
            [
              ["properties", "Properties"],
              ["review", issues.length ? `Review (${issues.length})` : "Review"],
              ["history", "History"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} role="tab" type="button" aria-selected={panel === value} onClick={() => setPanel(value)} className={cn("-mb-px border-b-2 py-3 text-[14px] font-medium", panel === value ? "border-blue bg-blue-50/60 text-blue-700" : "border-transparent text-ink-3 hover:text-ink")}>
              {label}
            </button>
          ))}
        </div>
        <div className="p-5">
          {panel === "properties" ? <Properties key={selectedId ?? "master"} project={project} version={version} /> : panel === "review" ? <Review project={project} issues={issues} /> : <HistoryList project={project} />}
        </div>
        <div className="grid gap-3 border-t border-line p-5" data-export>
          <h2 className="text-[16px] font-bold text-ink">Export</h2>
          <label className="flex items-center justify-between gap-3 text-[14px] text-ink-3">
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} aria-label="Export format" className="h-9 rounded-[9px] border border-line bg-surface px-2 text-[14px] text-ink">
              <option value="set">As set ({project.look.format.toUpperCase()})</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
          <Button disabled={project.status !== "ready" || busy !== null} icon={<Download className="size-4" aria-hidden="true" />} onClick={() => void run(() => exportVersion(project.id, version?.id ?? null, format === "set" ? null : format))}>
            {exportLabel}
          </Button>
          <Button variant="outline-blue" disabled={project.status !== "ready" || busy !== null || project.versions.length === 0} icon={<Link2 className="size-4" aria-hidden="true" />} onClick={() => void run(() => exportLinkedSet(project.id, format === "set" ? null : format))}>
            Export linked set
          </Button>
          {project.status === "failed" && (
            <Button variant="secondary" onClick={() => void prepareMaster(project.id)} icon={<RotateCcw className="size-4" aria-hidden="true" />}>
              Try the master again
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}
