"use client";

import { Dialog } from "radix-ui";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DOC_PAGES } from "@/lib/docs";
import { cn } from "@/lib/cn";
import { loadLibrary, useLibrary } from "@/lib/studio/library";
import { loadSnapshot } from "@/lib/studio/snapshot";
import { usePresets } from "./use-presets";

interface Command {
  id: string;
  group: "Actions" | "Projects" | "Assets" | "Go to" | "Brand presets" | "Batch images" | "Developer docs";
  label: string;
  hint?: string;
  href: string;
  keywords?: string;
}

const STATIC: Command[] = [
  { id: "new-project", group: "Actions", label: "New project", hint: "Projects", href: "/studio/projects?new=1", keywords: "master linked versions formats" },
  { id: "upload-assets", group: "Actions", label: "Upload assets", hint: "Asset library", href: "/studio/assets", keywords: "library logos backgrounds originals cutouts" },
  { id: "remove", group: "Actions", label: "Remove a background", hint: "Editor", href: "/editor", keywords: "cutout upload image single" },
  { id: "batch", group: "Actions", label: "Start a batch", hint: "Batch Studio", href: "/batch", keywords: "many bulk collection upload" },
  { id: "check", group: "Actions", label: "Check consistency", hint: "Batch Studio", href: "/batch?check=consistency", keywords: "quality review amazon instagram marketplace" },
  { id: "export-set", group: "Actions", label: "Create an export set", hint: "Batch Studio", href: "/batch?export=set", keywords: "sizes destinations square portrait story wide zip" },
  { id: "preset-new", group: "Actions", label: "New brand preset", hint: "Brand presets", href: "/studio/presets?new=1", keywords: "colours colors brand kit style" },
  { id: "restore", group: "Actions", label: "Restore & erase", hint: "Editor", href: "/editor?tool=restore", keywords: "brush refine edges" },
  { id: "background", group: "Actions", label: "Change background", hint: "Editor", href: "/editor?panel=background", keywords: "colour scene backdrop" },
  { id: "crop", group: "Actions", label: "Resize & crop", hint: "Editor", href: "/editor?tool=crop", keywords: "size canvas" },
  { id: "home", group: "Go to", label: "Studio home", href: "/studio", keywords: "dashboard overview" },
  { id: "projects", group: "Go to", label: "Projects", href: "/studio/projects", keywords: "folders starred" },
  { id: "assets", group: "Go to", label: "Asset library", href: "/studio/assets", keywords: "library logos backgrounds cutouts tags" },
  { id: "presets", group: "Go to", label: "Brand presets", href: "/studio/presets", keywords: "colours style" },
  { id: "downloads", group: "Go to", label: "Downloads", href: "/studio/downloads", keywords: "exports history again" },
  { id: "trash", group: "Go to", label: "Trash", href: "/studio/trash", keywords: "restore deleted" },
  { id: "account", group: "Go to", label: "Account", href: "/account", keywords: "profile settings password devices" },
  { id: "plan", group: "Go to", label: "Plan & billing", href: "/account#plan", keywords: "pro upgrade subscription" },
  { id: "keys", group: "Go to", label: "API keys", href: "/account#api-keys", keywords: "developer token" },
  { id: "pricing", group: "Go to", label: "Pricing", href: "/pricing", keywords: "pro free plans" },
  { id: "help", group: "Go to", label: "Help centre", href: "/support", keywords: "support questions faq" },
];

const DOCS: Command[] = DOC_PAGES.map((p) => ({ id: `doc-${p.href}`, group: "Developer docs", label: p.title, hint: "Docs", href: p.href, keywords: `${p.summary} ${p.sections.map((s) => s.title).join(" ")}` }));

const GROUP_ORDER: Command["group"][] = ["Actions", "Projects", "Assets", "Brand presets", "Batch images", "Go to", "Developer docs"];

function matches(command: Command, query: string) {
  if (!query) return true;
  const hay = `${command.label} ${command.hint ?? ""} ${command.keywords ?? ""} ${command.group}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

/** ⌘K: jump to any tool, page, preset or image in your batch. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const listId = useId();
  const presets = usePresets((s) => s.presets);
  const loadPresets = usePresets((s) => s.load);
  const [images, setImages] = useState<Command[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!presets) void loadPresets();
    void loadLibrary().catch(() => undefined);
    let alive = true;
    void loadSnapshot().then((snap) => {
      if (!alive || !snap) return;
      setImages(
        snap.items.map((i) => ({
          id: `img-${i.id}`,
          group: "Batch images",
          label: i.name,
          hint: i.status === "ready" ? "Open in editor" : "Batch Studio",
          href: i.status === "ready" ? `/batch?open=${encodeURIComponent(i.id)}` : "/batch",
          keywords: snap.name,
        })),
      );
    });
    return () => {
      alive = false;
    };
  }, [open, presets, loadPresets]);

  const projects = useLibrary((s) => s.projects);
  const assets = useLibrary((s) => s.assets);
  const results = useMemo(() => {
    const projectCommands: Command[] = projects
      .filter((p) => !p.trashedAt)
      .map((p) => ({ id: `project-${p.id}`, group: "Projects", label: p.name, hint: `${p.versions.length} versions`, href: `/studio/projects/${p.id}`, keywords: "project" }));
    const assetCommands: Command[] = assets
      .filter((a) => !a.trashedAt)
      .map((a) => ({ id: `asset-${a.id}`, group: "Assets", label: a.name, hint: a.kind, href: `/studio/assets?asset=${encodeURIComponent(a.id)}`, keywords: [...a.tags, ...a.autoTags].join(" ") }));
    const presetCommands: Command[] = (presets ?? []).map((p) => ({
      id: `preset-${p.id}`,
      group: "Brand presets",
      label: `Apply “${p.name}”`,
      hint: p.isDefault ? "Default" : "Batch Studio",
      href: `/batch?preset=${encodeURIComponent(p.id)}`,
      keywords: `brand preset ${p.name} ${p.colors.map((c) => c.name).join(" ")}`,
    }));
    const all = [...STATIC, ...projectCommands, ...(query.trim() ? assetCommands : []), ...presetCommands, ...images, ...DOCS].filter((c) => matches(c, query.trim()));
    return GROUP_ORDER.flatMap((g) => all.filter((c) => c.group === g)).slice(0, 40);
  }, [presets, images, query, projects, assets]);

  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  function go(command: Command | undefined) {
    if (!command) return;
    onOpenChange(false);
    router.push(command.href);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[72vh] w-[min(92vw,620px)] -translate-x-1/2 animate-scale-in flex-col overflow-hidden rounded-[18px] bg-surface shadow-[var(--shadow-float)] focus:outline-none"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Search the studio</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-5 shrink-0 text-muted" aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={results[current] ? `${listId}-${current}` : undefined}
              aria-label="Search tools, presets and images"
              placeholder="Search tools, presets, images and docs…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((current + 1) % Math.max(1, results.length));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((current - 1 + results.length) % Math.max(1, results.length));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  go(results[current]);
                }
              }}
              className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-subtle focus:outline-none"
            />
            <kbd className="hidden rounded-md border border-line px-1.5 text-[11px] font-semibold text-muted sm:inline">Esc</kbd>
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
            {results.length === 0 && <p className="px-3 py-8 text-center text-[14px] text-muted">Nothing matches “{query}”.</p>}
            {GROUP_ORDER.map((group) => {
              const members = results.map((c, i) => ({ c, i })).filter(({ c }) => c.group === group);
              if (!members.length) return null;
              return (
                <div key={group} role="group" aria-label={group}>
                  <p aria-hidden="true" className="px-3 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                    {group}
                  </p>
                  {members.map(({ c, i }) => (
                    <div
                      key={c.id}
                      id={`${listId}-${i}`}
                      role="option"
                      aria-selected={i === current}
                      data-index={i}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(c)}
                      className={cn("flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px]", i === current ? "bg-blue-50 text-ink" : "text-ink-3")}
                    >
                      <ArrowRight className={cn("size-4 shrink-0", i === current ? "text-blue" : "text-subtle")} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                      {c.hint && <span className="shrink-0 text-[12px] text-muted">{c.hint}</span>}
                      {i === current && <CornerDownLeft className="size-3.5 shrink-0 text-muted" aria-hidden="true" />}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted">
            <kbd className="font-sans font-semibold">↑</kbd> <kbd className="font-sans font-semibold">↓</kbd> to move ·{" "}
            <kbd className="font-sans font-semibold">Enter</kbd> to open · <kbd className="font-sans font-semibold">⌘K</kbd> anywhere in the studio
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
