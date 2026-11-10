"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DropdownMenu, Popover } from "radix-ui";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  Ellipsis,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  List,
  Palette,
  Pencil,
  Plus,
  Scissors,
  Search,
  Star,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/progress";
import { useFileDrop } from "@/components/upload/use-file-drop";
import { STARTER_PRESET } from "@/lib/brand-presets";
import { cn } from "@/lib/cn";
import { importFiles } from "@/lib/project/actions";
import {
  KIND_LABEL,
  addAssets,
  addTag,
  addToCollection,
  allTags,
  assetFile,
  createCollection,
  downloadAssets,
  makeCutout,
  matchesQuery,
  removeFromCollection,
  removeTag,
  trashAssets,
  updateAssets,
  useLibrary,
  type AddResult,
  type Asset,
  type AssetKind,
} from "@/lib/studio/library";
import { createProject } from "@/lib/studio/projects";
import { DEFAULT_LOOK } from "@/lib/studio/project-model";
import { presetToBatchSettings } from "@/lib/brand-presets";
import { bytes, formatOf, useLibraryReady, useThumb } from "./library-hooks";
import { askName } from "./name-dialog";
import { defaultPreset, usePresets } from "./use-presets";

type Tab = "all" | AssetKind | "starred";
const TABS: Array<[Tab, string]> = [
  ["all", "All assets"],
  ["original", "Originals"],
  ["cutout", "Cutouts"],
  ["background", "Backgrounds"],
  ["logo", "Logos"],
  ["starred", "Starred"],
];
type Sort = "recent" | "name" | "size" | "pixels";
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml,.svg";

function Thumb({ asset, className, fit = "contain" }: { asset: Asset; className?: string; fit?: "contain" | "cover" }) {
  const url = useThumb(asset.id);
  return (
    <span className={cn("relative block overflow-hidden", asset.hasAlpha ? "checkerboard-sm" : "bg-paper-2", className)}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- local object URL from this browser's storage
        <img src={url} alt="" className={cn("absolute inset-0 size-full", fit === "cover" ? "object-cover" : "object-contain p-2")} draggable={false} />
      )}
    </span>
  );
}

const kindTone: Record<AssetKind, string> = {
  original: "bg-paper-2 text-ink-3",
  cutout: "bg-blue-50 text-blue-700",
  background: "bg-success-50 text-success",
  logo: "bg-warn-50 text-warn",
};

function KindBadge({ kind }: { kind: AssetKind }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-semibold", kindTone[kind])}>{KIND_LABEL[kind]}</span>;
}

function AssetCard({ asset, selected, active, onToggle, onOpen }: { asset: Asset; selected: boolean; active: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li
      data-asset={asset.name}
      className={cn(
        "group relative overflow-hidden rounded-[16px] border bg-surface shadow-[var(--shadow-card)] transition-[border-color,box-shadow]",
        active ? "border-blue ring-2 ring-blue/25" : selected ? "border-blue/60" : "border-line hover:border-line-strong",
      )}
    >
      <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Show details for ${asset.name}`}>
        <Thumb asset={asset} className="aspect-[4/3] w-full" fit={asset.kind === "background" || (!asset.hasAlpha && asset.kind === "original") ? "cover" : "contain"} />
        <span className="flex items-start gap-2 px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-ink">{asset.name}</span>
            <span className="block text-[12px] tabular-nums text-muted">
              {formatOf(asset.mime)} · {asset.width} × {asset.height}
            </span>
          </span>
          <KindBadge kind={asset.kind} />
        </span>
      </button>
      <label className={cn("absolute left-2.5 top-2.5 inline-flex size-7 cursor-pointer items-center justify-center rounded-[8px] bg-white/95 shadow-sm", !selected && "opacity-90")}>
        <input type="checkbox" className="size-[17px] cursor-pointer accent-blue" checked={selected} onChange={onToggle} aria-label={`Select ${asset.name}`} />
      </label>
      {asset.starred && <Star className="absolute right-3 top-3 size-4 fill-warn text-warn" aria-label="Starred" />}
    </li>
  );
}

function AssetRow({ asset, selected, active, onToggle, onOpen }: { asset: Asset; selected: boolean; active: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <li data-asset={asset.name} className={cn("flex items-center gap-3 rounded-[12px] border px-3 py-2", active ? "border-blue bg-blue-50/40" : "border-transparent hover:bg-surface")}>
      <input type="checkbox" className="size-[17px] cursor-pointer accent-blue" checked={selected} onChange={onToggle} aria-label={`Select ${asset.name}`} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={`Show details for ${asset.name}`}>
        <Thumb asset={asset} className="size-12 shrink-0 rounded-[8px] border border-line" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-ink">{asset.name}</span>
          <span className="block truncate text-[12px] text-muted">{[...asset.tags, ...asset.autoTags].slice(0, 5).join(" · ")}</span>
        </span>
        <span className="hidden w-28 text-[12px] tabular-nums text-muted sm:block">
          {asset.width} × {asset.height}
        </span>
        <span className="hidden w-16 text-[12px] text-muted md:block">{bytes(asset.bytes)}</span>
        <KindBadge kind={asset.kind} />
      </button>
    </li>
  );
}

const filterSelect =
  "h-10 rounded-[10px] border border-line bg-surface pl-3 pr-8 text-[14px] text-ink hover:border-line-strong focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15";

function TagPopover({ onAdd, suggestions, label = "Apply tags" }: { onAdd: (tag: string) => void; suggestions: string[]; label?: string }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const shown = suggestions.filter((t) => t.toLowerCase().includes(value.trim().toLowerCase())).slice(0, 8);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="secondary" icon={<Tag className="size-4" aria-hidden="true" />}>
          {label}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} className="z-50 w-[260px] animate-scale-in rounded-[14px] border border-line bg-surface p-3 shadow-[var(--shadow-float)]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) onAdd(value);
              setValue("");
              setOpen(false);
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              aria-label="Tag"
              value={value}
              maxLength={32}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. Spring"
              className="h-9 min-w-0 flex-1 rounded-[9px] border border-line px-2.5 text-[14px] focus:border-blue focus:outline-none"
            />
            <Button type="submit" size="sm">
              Add
            </Button>
          </form>
          {shown.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {shown.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onAdd(t);
                    setOpen(false);
                  }}
                  className="rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-3 hover:border-blue/40 hover:text-ink"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CollectionMenu({ ids, onDone }: { ids: string[]; onDone: (msg: string) => void }) {
  const collections = useLibrary((s) => s.collections);
  const item = "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button size="sm" variant="secondary" icon={<FolderPlus className="size-4" aria-hidden="true" />}>
          Add to collection
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={8} className="z-50 min-w-[220px] animate-scale-in rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
          {collections.map((c) => (
            <DropdownMenu.Item
              key={c.id}
              className={item}
              onSelect={async () => {
                await addToCollection(ids, c.id);
                onDone(`Added to “${c.name}”.`);
              }}
            >
              <FolderOpen className="size-4 text-muted" aria-hidden="true" /> {c.name}
            </DropdownMenu.Item>
          ))}
          {collections.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-line" />}
          <DropdownMenu.Item
            className={item}
            onSelect={async () => {
              const name = await askName("New collection", { label: "Collection name" });
              if (!name) return;
              const c = await createCollection(name);
              await addToCollection(ids, c.id);
              onDone(`Added to the new collection “${c.name}”.`);
            }}
          >
            <Plus className="size-4 text-muted" aria-hidden="true" /> New collection…
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Details({ asset, onClose, onSelect }: { asset: Asset; onClose?: () => void; onSelect: (id: string) => void }) {
  const router = useRouter();
  const assets = useLibrary((s) => s.assets);
  const projects = useLibrary((s) => s.projects);
  const collections = useLibrary((s) => s.collections);
  const presets = usePresets((s) => s.presets);
  const loadPresets = usePresets((s) => s.load);
  const savePreset = usePresets((s) => s.save);
  const url = useThumb(asset.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string; href?: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const usedIn = projects.filter((p) => p.sourceAssetId === asset.id && !p.trashedAt);
  const source = asset.sourceId ? assets.find((a) => a.id === asset.sourceId) : null;
  const cutouts = assets.filter((a) => a.sourceId === asset.id && !a.trashedAt);
  const suggestions = allTags(assets).filter((t) => !asset.tags.includes(t));

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setNote(null);
    try {
      await fn();
    } catch (error) {
      setNote({ tone: "error", text: error instanceof Error ? error.message : "That didn't work. Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5" data-asset-details={asset.name}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[20px] font-bold text-ink">Asset details</h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close details" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5">
            <X className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={cn("relative aspect-[4/3] overflow-hidden rounded-[14px] border border-line", asset.hasAlpha ? "checkerboard" : "bg-paper-2")}>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={url} alt={asset.name} className="absolute inset-0 size-full object-contain p-3" />
        )}
        {asset.hasAlpha && <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-ink shadow-sm">Transparent</span>}
      </div>
      <div className="flex items-start gap-2">
        {renaming ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              if (name) await updateAssets([asset.id], () => ({ name: name.slice(0, 120) }));
              setRenaming(false);
            }}
          >
            <input name="name" aria-label="Asset name" defaultValue={asset.name} autoFocus className="h-9 min-w-0 flex-1 rounded-[9px] border border-line px-2.5 text-[14px] focus:border-blue focus:outline-none" />
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>
        ) : (
          <p className="min-w-0 flex-1 break-words text-[17px] font-bold text-ink">{asset.name}</p>
        )}
        <button
          type="button"
          aria-label={asset.starred ? "Unstar" : "Star"}
          aria-pressed={asset.starred}
          onClick={() => void updateAssets([asset.id], (a) => ({ starred: !a.starred }))}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-ink/5"
        >
          <Star className={cn("size-5", asset.starred ? "fill-warn text-warn" : "text-muted")} aria-hidden="true" />
        </button>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger aria-label="More actions" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-ink/5">
            <Ellipsis className="size-5" aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[200px] animate-scale-in rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
              <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => setRenaming(true)}>
                <Pencil className="size-4 text-muted" aria-hidden="true" /> Rename
              </DropdownMenu.Item>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper data-[state=open]:bg-paper">
                  <Copy className="size-4 text-muted" aria-hidden="true" /> Change type
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="z-50 min-w-[160px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
                    {(Object.keys(KIND_LABEL) as AssetKind[]).map((k) => (
                      <DropdownMenu.Item key={k} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void updateAssets([asset.id], () => ({ kind: k }))}>
                        {asset.kind === k ? <Check className="size-4 text-blue" aria-hidden="true" /> : <span className="size-4" />} {KIND_LABEL[k]}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] text-danger outline-none data-[highlighted]:bg-danger-50"
                onSelect={() => void trashAssets([asset.id]).then(() => onClose?.())}
              >
                <Trash2 className="size-4" aria-hidden="true" /> Move to trash
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-y-2 text-[14px]">
        <dt className="text-muted">Dimensions</dt>
        <dd className="tabular-nums text-ink">
          {asset.width} × {asset.height}
        </dd>
        <dt className="text-muted">Format</dt>
        <dd className="text-ink">
          {formatOf(asset.mime)} · {bytes(asset.bytes)}
        </dd>
        <dt className="text-muted">Transparency</dt>
        <dd className="text-ink">{asset.hasAlpha ? "Yes" : "No"}</dd>
        <dt className="text-muted">Source</dt>
        <dd className="text-ink">
          {source ? (
            <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => onSelect(source.id)}>
              Made from {source.name}
            </button>
          ) : asset.origin === "isola" ? (
            "Made in ISOLA"
          ) : (
            "Uploaded original"
          )}
        </dd>
      </dl>

      {asset.swatches.length > 0 && (
        <section aria-labelledby={`colours-${asset.id}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 id={`colours-${asset.id}`} className="text-[14px] font-semibold text-ink">
              Colours
            </h3>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 hover:underline disabled:opacity-50"
              disabled={busy !== null}
              onClick={() =>
                void run("palette", async () => {
                  if (!presets) await loadPresets();
                  const colors = asset.swatches.slice(0, 6).map((s, i) => ({ name: `${s.name}${asset.swatches.findIndex((x) => x.name === s.name) < i ? ` ${i + 1}` : ""}`, hex: s.hex }));
                  const result = await savePreset({ ...STARTER_PRESET, name: `${asset.name.replace(/\.[^.]+$/, "")} colours`.slice(0, 60), colors, layout: { ...STARTER_PRESET.layout, background: { kind: "brand", index: 0 } } });
                  if (!result.ok) throw new Error(result.message);
                  setNote({ tone: "ok", text: `Saved ${colors.length} colours as the brand preset “${result.preset.name}”.`, href: "/studio/presets" });
                })
              }
            >
              <Palette className="size-3.5" aria-hidden="true" /> Save as brand colours
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="Main colours">
            {asset.swatches.map((s) => (
              <li key={s.hex} className="flex items-center gap-1.5 rounded-full border border-line py-1 pl-1 pr-2.5 text-[12px] text-ink-3" title={`${s.hex} · ${Math.round(s.share * 100)}%`}>
                <span className="size-5 rounded-full border border-ink/10" style={{ background: s.hex }} aria-hidden="true" />
                {s.name} <span className="font-mono text-[11px] text-muted">{s.hex}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`tags-${asset.id}`}>
        <h3 id={`tags-${asset.id}`} className="text-[14px] font-semibold text-ink">
          Tags
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Your tags">
          {asset.tags.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-paper-2 py-1 pl-3 pr-1.5 text-[13px] font-medium text-ink">
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => void removeTag(asset.id, t)} className="rounded-full p-0.5 text-muted hover:bg-ink/10 hover:text-ink">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
          <li>
            <TagPopover label="Add tag" suggestions={suggestions} onAdd={(t) => void addTag([asset.id], t)} />
          </li>
        </ul>
        {asset.autoTags.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <span className="font-semibold">Smart tags:</span>
            {asset.autoTags.map((t) => (
              <span key={t} className="rounded-full border border-dashed border-line-strong px-2 py-0.5">
                {t}
              </span>
            ))}
          </p>
        )}
      </section>

      <section aria-labelledby={`used-${asset.id}`}>
        <h3 id={`used-${asset.id}`} className="text-[14px] font-semibold text-ink">
          Used in
        </h3>
        {usedIn.length === 0 && cutouts.length === 0 && asset.collectionIds.length === 0 ? (
          <p className="mt-1 text-[13px] text-muted">Not used in a project or collection yet.</p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-[14px]">
            {usedIn.map((p) => (
              <li key={p.id}>
                <Link href={`/studio/projects/${p.id}`} className="inline-flex items-center gap-2 font-medium text-blue-700 hover:underline">
                  <FolderOpen className="size-4" aria-hidden="true" /> {p.name} <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
            {cutouts.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onSelect(c.id)} className="inline-flex items-center gap-2 font-medium text-blue-700 hover:underline">
                  <Scissors className="size-4" aria-hidden="true" /> Cutout: {c.name}
                </button>
              </li>
            ))}
            {asset.collectionIds.map((cid) => {
              const c = collections.find((x) => x.id === cid);
              return c ? (
                <li key={cid} className="inline-flex items-center gap-2 text-ink-3">
                  <FolderOpen className="size-4 text-muted" aria-hidden="true" /> {c.name}
                  <button type="button" onClick={() => void removeFromCollection([asset.id], cid)} aria-label={`Remove from ${c.name}`} className="rounded p-0.5 text-muted hover:text-ink">
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ) : null;
            })}
          </ul>
        )}
      </section>

      {note && (
        <p role={note.tone === "error" ? "alert" : "status"} className={cn("text-[13px]", note.tone === "error" ? "text-danger" : "text-success")}>
          {note.text}{" "}
          {note.href && (
            <Link href={note.href} className="font-semibold underline">
              Open
            </Link>
          )}
        </p>
      )}

      <div className="grid gap-2">
        <Button
          size="lg"
          disabled={busy !== null}
          icon={busy === "project" ? <Spinner className="size-5" /> : <ArrowUpRight className="size-4" aria-hidden="true" />}
          onClick={() =>
            void run("project", async () => {
              if (!presets) await loadPresets();
              const preset = defaultPreset(usePresets.getState().presets);
              const id = await createProject(asset.id, { look: preset ? presetToBatchSettings(preset, DEFAULT_LOOK) : DEFAULT_LOOK });
              router.push(`/studio/projects/${id}`);
            })
          }
        >
          Use in project
        </Button>
        {!asset.hasAlpha && (
          <Button
            variant="outline-blue"
            disabled={busy !== null}
            icon={busy === "cutout" ? <Spinner /> : <Scissors className="size-4" aria-hidden="true" />}
            onClick={() =>
              void run("cutout", async () => {
                const made = await makeCutout(asset.id);
                setNote({ tone: "ok", text: `Made ${made.name}.` });
                onSelect(made.id);
              })
            }
          >
            {busy === "cutout" ? "Removing the background…" : "Make a cutout"}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={busy !== null || asset.mime === "image/svg+xml"}
          title={asset.mime === "image/svg+xml" ? "SVG logos can't be opened in the editor" : undefined}
          icon={<Pencil className="size-4" aria-hidden="true" />}
          onClick={() =>
            void run("editor", async () => {
              const file = await assetFile(asset.id);
              if (!file) throw new Error("This file is no longer stored in this browser.");
              await importFiles([file]);
              router.push("/editor");
            })
          }
        >
          Open in editor
        </Button>
        <Button variant="ghost" disabled={busy !== null} icon={<Download className="size-4" aria-hidden="true" />} onClick={() => void run("download", async () => void (await downloadAssets([asset.id])))}>
          Download
        </Button>
      </div>
    </div>
  );
}

/** The asset library: everything you've uploaded or made, kept in this browser. */
export function AssetLibrary() {
  const status = useLibraryReady();
  const assets = useLibrary((s) => s.assets);
  const collections = useLibrary((s) => s.collections);
  const [tab, setTab] = useState<Tab>("all");
  const [type, setType] = useState("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileDetails, setMobileDetails] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<AddResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // ⌘K opens a specific asset with ?asset=<id>.
  const wanted = useSearchParams().get("asset");
  const [handledAsset, setHandledAsset] = useState<string | null>(null);
  if (wanted && wanted !== handledAsset && assets.some((a) => a.id === wanted)) {
    setHandledAsset(wanted);
    setActiveId(wanted);
  }

  const live = useMemo(() => assets.filter((a) => !a.trashedAt), [assets]);
  const tags = useMemo(() => allTags(live), [live]);
  const visible = useMemo(() => {
    const list = live.filter(
      (a) =>
        (tab === "all" || (tab === "starred" ? a.starred : a.kind === tab)) &&
        (type === "all" || formatOf(a.mime) === type) &&
        (tag === "all" || a.tags.includes(tag) || a.autoTags.includes(tag)) &&
        (!collection || a.collectionIds.includes(collection)) &&
        matchesQuery(a, query),
    );
    const by: Record<Sort, (a: Asset, b: Asset) => number> = {
      recent: (a, b) => b.createdAt - a.createdAt,
      name: (a, b) => a.name.localeCompare(b.name),
      size: (a, b) => b.bytes - a.bytes,
      pixels: (a, b) => b.width * b.height - a.width * a.height,
    };
    return [...list].sort(by[sort]);
  }, [live, tab, type, tag, collection, query, sort]);

  const active = live.find((a) => a.id === activeId) ?? null;
  const chosen = new Set(selected);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allVisibleSelected = visible.length > 0 && visible.every((a) => chosen.has(a.id));
  const open = (id: string) => {
    setActiveId(id);
    if (!window.matchMedia("(min-width: 1280px)").matches) setMobileDetails(true);
  };

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    setMessage(null);
    const kind = tab === "background" || tab === "logo" ? tab : undefined;
    const result = await addAssets(files, { kind, collectionId: collection ?? undefined });
    setUploading(false);
    setReport(result);
    if (result.added[0]) setActiveId(result.added[0].id);
  }
  const drop = useFileDrop((files) => void upload(files));

  if (status === "unavailable") {
    return (
      <p role="alert" className="m-8 rounded-[14px] border border-warn/25 bg-warn-50 px-4 py-3 text-sm text-warn">
        This browser isn&apos;t letting ISOLA store files (private browsing can do this), so the asset library can&apos;t be used here.
      </p>
    );
  }

  return (
    <div className="mx-auto grid max-w-[1600px] xl:grid-cols-[minmax(0,1fr)_360px]" {...drop.bind}>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        id="library-files"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void upload(files);
        }}
      />
      <div className="min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pt-8">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[40px]">Asset library</h1>
            <p className="mt-2 text-[16px] text-ink-3">Your originals, cutouts and creative building blocks, kept in this browser.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => input.current?.click()} disabled={uploading} icon={uploading ? <Spinner className="size-5" /> : <Upload className="size-4" aria-hidden="true" />}>
              {uploading ? "Adding…" : "Upload assets"}
            </Button>
            <Button
              size="lg"
              variant="secondary"
              icon={<Plus className="size-4" aria-hidden="true" />}
              onClick={async () => {
                const name = await askName("New collection", { label: "Collection name" });
                if (name) setCollection((await createCollection(name)).id);
              }}
            >
              New collection
            </Button>
          </div>
        </header>

        <div role="tablist" aria-label="Asset types" className="mt-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
          {TABS.map(([value, label]) => {
            const count = value === "all" ? live.length : value === "starred" ? live.filter((a) => a.starred).length : live.filter((a) => a.kind === value).length;
            return (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn("-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[15px] font-medium", tab === value ? "border-blue bg-blue-50/60 text-blue-700" : "border-transparent text-ink-3 hover:text-ink")}
              >
                {label} <span className="text-[12px] text-muted">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Search assets</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, tags and colours"
              className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-muted focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15"
            />
          </label>
          <label className="relative">
            <span className="sr-only">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className={filterSelect} aria-label="Type">
              <option value="all">All types</option>
              {["PNG", "JPG", "WEBP", "SVG"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={filterSelect} aria-label="Tags">
            <option value="all">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={filterSelect} aria-label="Sort">
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="size">File size</option>
            <option value="pixels">Dimensions</option>
          </select>
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
        </div>

        {collections.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Collections">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={collection === c.id}
                onClick={() => setCollection(collection === c.id ? null : c.id)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[14px] font-medium",
                  collection === c.id ? "border-blue bg-blue-50 text-blue-700" : "border-line bg-surface text-ink hover:border-line-strong",
                )}
              >
                <FolderOpen className="size-4" aria-hidden="true" /> {c.name}
                <span className="text-[12px] text-muted">{live.filter((a) => a.collectionIds.includes(c.id)).length}</span>
              </button>
            ))}
          </div>
        )}

        {report && (report.duplicates.length > 0 || report.rejected.length > 0 || report.added.length > 0) && (
          <div role="status" className="mt-4 grid gap-2 rounded-[14px] border border-line bg-surface px-4 py-3 text-[13px] shadow-[var(--shadow-card)]" data-upload-report>
            {report.added.length > 0 && (
              <p className="text-success">
                Added {report.added.length} asset{report.added.length === 1 ? "" : "s"}, with smart tags from their colours and shape.
              </p>
            )}
            {report.duplicates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-warn">
                <Copy className="size-4" aria-hidden="true" />
                <span className="flex-1">
                  {report.duplicates.length === 1
                    ? `${report.duplicates[0].asset.name} looks like ${report.duplicates[0].of.name}, which is already in your library.`
                    : `${report.duplicates.length} new assets look like ones already in your library.`}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await trashAssets(report.duplicates.map((d) => d.asset.id));
                    setReport({ ...report, duplicates: [] });
                    setMessage("Moved the duplicates to the trash.");
                  }}
                >
                  Move the copies to trash
                </Button>
              </div>
            )}
            {report.rejected.map((r) => (
              <p key={r.name} className="text-danger">
                {r.name}: {r.reason}
              </p>
            ))}
            <button type="button" onClick={() => setReport(null)} className="justify-self-start text-[12px] font-semibold text-muted hover:text-ink">
              Dismiss
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="mt-3 text-[13px] font-medium text-success">
            {message}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3 text-[14px]">
          <label className="inline-flex items-center gap-2 text-ink-3">
            <input type="checkbox" className="size-[17px] accent-blue" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? [] : visible.map((a) => a.id))} disabled={!visible.length} />
            Select all
          </label>
          {selected.length > 0 && <span className="font-semibold text-blue-700">{selected.length} selected</span>}
          <span className="ml-auto text-[13px] text-muted">
            Showing {visible.length} of {live.length}
          </span>
        </div>

        {status !== "ready" ? (
          <p className="mt-10 flex items-center justify-center gap-2 text-muted">
            <Spinner /> Loading your library…
          </p>
        ) : visible.length === 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn("mt-4 flex w-full flex-col items-center gap-3 rounded-[18px] border-2 border-dashed px-6 py-16 text-center", drop.dragging ? "border-blue bg-blue-50" : "border-line-strong hover:border-blue/60")}
          >
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue">
              <Upload className="size-6" aria-hidden="true" />
            </span>
            <span className="text-[16px] font-semibold text-ink">{live.length ? "No assets match these filters" : "Your library is empty"}</span>
            <span className="max-w-[460px] text-[14px] text-muted">
              Drop product photos, cutouts, backgrounds or logos (PNG, JPG, WebP, SVG). They stay in this browser; ISOLA tags them by colour, shape and
              resolution and spots duplicates.
            </span>
          </button>
        ) : view === "grid" ? (
          <ul className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))" }} aria-label="Assets">
            {visible.map((a) => (
              <AssetCard key={a.id} asset={a} selected={chosen.has(a.id)} active={a.id === activeId} onToggle={() => toggle(a.id)} onOpen={() => open(a.id)} />
            ))}
          </ul>
        ) : (
          <ul className="mt-4 grid gap-1" aria-label="Assets">
            {visible.map((a) => (
              <AssetRow key={a.id} asset={a} selected={chosen.has(a.id)} active={a.id === activeId} onToggle={() => toggle(a.id)} onOpen={() => open(a.id)} />
            ))}
          </ul>
        )}
        {drop.dragging && visible.length > 0 && (
          <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-blue/10 backdrop-blur-[1px]">
            <p className="rounded-[14px] bg-surface px-6 py-4 text-[16px] font-semibold text-blue-700 shadow-[var(--shadow-float)]">Drop to add to your library</p>
          </div>
        )}
      </div>

      <aside aria-label="Asset details" className="hidden border-l border-line bg-surface xl:block">
        <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto px-5 py-6 [scrollbar-width:thin]">
          {active ? (
            <Details asset={active} onSelect={setActiveId} />
          ) : (
            <div className="grid gap-2 pt-10 text-center">
              <p className="text-[16px] font-semibold text-ink">No asset selected</p>
              <p className="text-[14px] text-muted">Choose an asset to see its details, colours, tags and where it&apos;s used.</p>
            </div>
          )}
        </div>
      </aside>

      <Sheet open={mobileDetails && Boolean(active)} onOpenChange={setMobileDetails} title={active?.name ?? "Asset"} className="xl:hidden">
        {active && <Details asset={active} onSelect={setActiveId} onClose={() => setMobileDetails(false)} />}
      </Sheet>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 xl:right-[360px] lg:left-[256px]">
          <div role="toolbar" aria-label="Selected assets" className="flex max-w-full flex-wrap items-center gap-2 rounded-[16px] border border-line bg-surface px-4 py-3 shadow-[var(--shadow-float)]" data-bulk-bar>
            <span className="mr-2 text-[15px] font-bold text-ink">
              {selected.length} asset{selected.length === 1 ? "" : "s"} selected
            </span>
            <CollectionMenu ids={selected} onDone={setMessage} />
            <TagPopover
              suggestions={tags}
              onAdd={async (t) => {
                await addTag(selected, t);
                setMessage(`Tagged ${selected.length} asset${selected.length === 1 ? "" : "s"} “${t}”.`);
              }}
            />
            <Button size="sm" variant="secondary" icon={<Download className="size-4" aria-hidden="true" />} onClick={() => void downloadAssets(selected).then((n) => setMessage(`Downloaded ${n}.`))}>
              Download
            </Button>
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <Button size="sm" variant="secondary" icon={<ChevronDown className="size-4" aria-hidden="true" />}>
                  More
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content sideOffset={8} className="z-50 min-w-[220px] animate-scale-in rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
                  <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void updateAssets(selected, () => ({ starred: true }))}>
                    <Star className="size-4 text-muted" aria-hidden="true" /> Star
                  </DropdownMenu.Item>
                  {collection && (
                    <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] outline-none data-[highlighted]:bg-paper" onSelect={() => void removeFromCollection(selected, collection)}>
                      <X className="size-4 text-muted" aria-hidden="true" /> Remove from this collection
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-line" />
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[14px] text-danger outline-none data-[highlighted]:bg-danger-50"
                    onSelect={async () => {
                      const n = selected.length;
                      await trashAssets(selected);
                      setSelected([]);
                      setMessage(`Moved ${n} asset${n === 1 ? "" : "s"} to the trash. Restore them from Trash within 30 days.`);
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" /> Move to trash
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button type="button" onClick={() => setSelected([])} aria-label="Clear selection" className="ml-1 inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
