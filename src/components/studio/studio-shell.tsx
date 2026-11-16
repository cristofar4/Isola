"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  ArrowUpRight,
  Box,
  Clapperboard,
  BookOpen,
  Download,
  FolderOpen,
  Images,
  Trash2,
  ChevronDown,
  CircleHelp,
  House,
  Image as ImageIcon,
  Layers,
  Menu,
  Palette,
  Plus,
  ScanSearch,
  Search,
  Settings,
  Share,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";
import { UserAvatar } from "@/components/ui/user-avatar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { usePlan } from "@/lib/plan";
import { CommandPalette } from "./command-palette";
import { NameDialogHost } from "./name-dialog";
import { rememberStudioPlace, studioPageName, useEditorOpen } from "./studio-place";

const WORKSPACE = [
  { href: "/studio", label: "Home", icon: House, match: (p: string) => p === "/studio" },
  { href: "/studio/projects", label: "Projects", icon: FolderOpen, match: (p: string) => p.startsWith("/studio/projects") },
  { href: "/studio/assets", label: "Asset library", icon: Images, match: (p: string) => p.startsWith("/studio/assets") },
];

const CREATE = [
  { href: "/studio/editor", label: "Image editor", icon: ImageIcon, match: (p: string) => p.startsWith("/studio/editor") },
  { href: "/studio/batch", label: "Batch Studio", icon: Layers, match: (p: string) => p.startsWith("/studio/batch") },
  { href: "/studio/scenes", label: "Scene Studio", icon: Box, match: (p: string) => p.startsWith("/studio/scenes") },
  { href: "/studio/motion", label: "Motion Studio", icon: Clapperboard, match: (p: string) => p.startsWith("/studio/motion") },
];

const ORGANISE = [
  { href: "/studio/presets", label: "Brand presets", icon: Palette, match: (p: string) => p.startsWith("/studio/presets") },
  { href: "/studio/batch?export=set", label: "Export sets", icon: Share },
  { href: "/studio/batch?check=consistency", label: "Quality review", icon: ScanSearch },
  { href: "/studio/downloads", label: "Downloads", icon: Download, match: (p: string) => p.startsWith("/studio/downloads") },
  { href: "/studio/trash", label: "Trash", icon: Trash2, match: (p: string) => p.startsWith("/studio/trash") },
];

type NavItem = { href: string; label: string; icon: typeof House; match?: (p: string) => boolean; external?: boolean };

const FOOTER: NavItem[] = [
  { href: "/studio/help", label: "Help", icon: CircleHelp, match: (p: string) => p.startsWith("/studio/help") },
  { href: "/studio/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/studio/settings") },
  // The developer docs are their own site: they open beside the studio, never in place of it.
  { href: "/developers", label: "Developers", icon: BookOpen, external: true },
];

/*
 * The desktop sidebar can be folded to an icon rail with the menu button; the
 * choice is remembered in this browser. The image editor has its own choice
 * (folded unless you open it), so its canvas gets the room.
 */
const collapsedListeners = new Set<() => void>();
const collapsedKey = (editor: boolean) => (editor ? "isola-sidebar-collapsed-editor" : "isola-sidebar-collapsed");
function readCollapsed(editor: boolean) {
  try {
    const value = localStorage.getItem(collapsedKey(editor));
    return editor ? value !== "0" : value === "1";
  } catch {
    return editor;
  }
}
function writeCollapsed(editor: boolean, value: boolean) {
  try {
    localStorage.setItem(collapsedKey(editor), value ? "1" : "0");
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  collapsedListeners.forEach((l) => l());
}
function useSidebarCollapsed(editor: boolean) {
  return useSyncExternalStore(
    (onChange) => {
      collapsedListeners.add(onChange);
      return () => collapsedListeners.delete(onChange);
    },
    () => readCollapsed(editor),
    () => false,
  );
}

function NavLink({ item, pathname, onNavigate, compact }: { item: NavItem; pathname: string; onNavigate?: () => void; compact?: boolean }) {
  const active = item.match ? item.match(pathname) : false;
  const className = cn(
    "flex items-center gap-3 rounded-[10px] py-2 text-[15px] font-medium transition-colors",
    compact ? "justify-center px-0" : "px-3",
    active ? "bg-blue text-white shadow-[var(--shadow-blue)]" : "text-white/75 hover:bg-white/8 hover:text-white",
  );
  const content = (
    <>
      <item.icon className="size-[19px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
      <span className={cn("min-w-0 flex-1 truncate", compact && "sr-only")}>{item.label}</span>
      {item.external && (
        <>
          {!compact && <ArrowUpRight className="size-4 shrink-0 text-white/50" aria-hidden="true" />}
          <span className="sr-only"> (opens in a new tab)</span>
        </>
      )}
    </>
  );
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener" onClick={onNavigate} title={compact ? `${item.label} (opens in a new tab)` : undefined} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={compact ? item.label : undefined} className={className}>
      {content}
    </Link>
  );
}

/**
 * The bottom of the menu, always in view: Get Pro (on Free, like the upgrade
 * row at the bottom of a chat app's menu) and you, with your profile picture
 * beside your name and a Pro badge once you've upgraded.
 */
function AccountFooter({ pathname, onNavigate, compact }: { pathname: string; onNavigate?: () => void; compact: boolean }) {
  const { data } = authClient.useSession();
  const plan = usePlan();
  const name = data?.user.name ?? "";
  const email = data?.user.email ?? "";
  const image = (data?.user as { image?: string | null } | undefined)?.image ?? null;
  const onPlans = pathname.startsWith("/studio/plans");
  const showGetPro = !plan.isPending && plan.signedIn && !plan.pro;
  return (
    <div
      className={cn("grid shrink-0 grid-cols-[minmax(0,1fr)] gap-1 border-t border-white/10 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3", compact ? "px-3" : "px-3.5")}
      data-studio-account
    >
      {showGetPro && (
        <Link
          href="/studio/plans"
          onClick={onNavigate}
          aria-current={onPlans ? "page" : undefined}
          title={compact ? "Get Pro" : undefined}
          data-get-pro
          className={cn("flex items-center gap-3 rounded-[12px] py-2 transition-colors", compact ? "justify-center px-0" : "px-2", onPlans ? "bg-white/12" : "hover:bg-white/8")}
        >
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-gradient-to-br from-[#7b95ff] to-blue text-white shadow-[0_6px_18px_-6px_rgb(70_110_255/0.8)]">
            <Sparkles className="size-[18px]" aria-hidden="true" />
          </span>
          <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
            <span className="block text-[14px] font-semibold text-white">Get Pro</span>
            <span className="block truncate text-[12px] text-white/65">Full resolution, Batch Studio and more</span>
          </span>
        </Link>
      )}
      <Link
        href="/studio/settings"
        onClick={onNavigate}
        title={compact ? [name || email || "Your account", plan.pro ? "Pro" : null].filter(Boolean).join(" · ") : undefined}
        className={cn("flex items-center gap-3 rounded-[12px] py-2 transition-colors hover:bg-white/8", compact ? "justify-center px-0" : "px-2")}
        data-studio-me
      >
        <UserAvatar
          name={name}
          email={email}
          image={image}
          className={cn("size-10 text-[14px]", plan.pro && "ring-2 ring-[#9fb4ff] ring-offset-2 ring-offset-[#111b2b]")}
        />
        <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
          {plan.pro && (
            <span className="mb-0.5 block w-fit rounded-full bg-gradient-to-r from-[#9fb4ff] to-white px-1.5 py-px text-[10px] font-extrabold uppercase leading-[1.4] tracking-[0.14em] text-[#111b2b]" data-pro-badge>
              Pro
            </span>
          )}
          <span className="block truncate text-[14px] font-semibold leading-tight text-white">{name || email || "Your account"}</span>
          {!plan.pro && <span className="block truncate text-[12px] text-white/65">{plan.isPending ? " " : "Free plan"}</span>}
          <span className="sr-only">: settings</span>
        </span>
        {!compact && <Settings className="size-4 shrink-0 text-white/45" aria-hidden="true" />}
      </Link>
    </div>
  );
}

function Sidebar({ pathname, onNavigate, compact = false, onSearch }: { pathname: string; onNavigate?: () => void; compact?: boolean; onSearch?: () => void }) {
  const plan = usePlan();
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain pb-4 pt-5 [scrollbar-width:thin]", compact ? "px-3" : "px-4")}>
        <Link href="/studio" onClick={onNavigate} aria-label="ISOLA Studio home" className={cn("flex items-center gap-2.5 rounded-md", compact ? "justify-center" : "px-2")}>
          <LogoMark className="size-8" />
          <span className={cn("leading-none", compact && "sr-only")}>
            <span className="block font-display text-[21px] font-extrabold tracking-[0.06em] text-white">ISOLA</span>
            <span className="mt-1 block text-[10px] font-semibold tracking-[0.24em] text-white/70">CREATIVE STUDIO</span>
          </span>
        </Link>

        <div className={cn("flex items-center gap-3 rounded-[12px] border border-white/10 bg-white/5 px-3 py-2.5", compact && "hidden")}>
          <span className="flex-1 truncate text-[14px] font-semibold text-white">Personal studio</span>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]", plan.pro ? "bg-white text-ink" : "bg-white/10 text-white/80")}>
            {plan.isPending ? "…" : plan.pro ? "Pro" : "Free"}
          </span>
        </div>

        {onSearch && (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              onSearch();
            }}
            aria-label="Search the studio"
            title={compact ? "Search (⌘K)" : undefined}
            data-sidebar-search
            className={cn(
              "flex h-10 shrink-0 items-center gap-2.5 rounded-[10px] border border-white/10 bg-white/5 text-[14px] text-white/75 hover:bg-white/10 hover:text-white",
              compact ? "justify-center px-0" : "px-3",
            )}
          >
            <Search className="size-[18px] shrink-0" aria-hidden="true" />
            {!compact && (
              <>
                <span className="min-w-0 flex-1 truncate text-left">Search</span>
                <kbd className="shrink-0 rounded-md border border-white/15 px-1.5 text-[11px] font-semibold text-white/70">⌘K</kbd>
              </>
            )}
          </button>
        )}

        <nav aria-label="Studio" className="grid gap-5">
          {(
            [
              ["Workspace", WORKSPACE],
              ["Create", CREATE],
              ["Organise", ORGANISE],
            ] as const
          ).map(([title, items]) => (
            <div key={title} className={cn(compact && "border-t border-white/10 pt-3 first:border-t-0 first:pt-0")}>
              <p className={cn("px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70", compact && "sr-only")}>{title}</p>
              <ul className={cn("grid gap-0.5", !compact && "mt-2")}>
                {items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} pathname={pathname} onNavigate={onNavigate} compact={compact} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <ul className="grid gap-0.5 border-t border-white/10 pt-4">
            {FOOTER.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} onNavigate={onNavigate} compact={compact} />
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <AccountFooter pathname={pathname} onNavigate={onNavigate} compact={compact} />
    </div>
  );
}

function CreateMenu() {
  const item = "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] text-ink outline-none data-[highlighted]:bg-paper";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-blue px-4 text-[14px] font-semibold text-white shadow-[var(--shadow-blue)] hover:bg-blue-600">
        <Plus className="size-4" aria-hidden="true" /> Create <ChevronDown className="size-4" aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 min-w-[240px] animate-scale-in rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]">
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/projects?new=1">
              <FolderOpen className="size-4 text-blue" aria-hidden="true" /> New project
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/assets">
              <Images className="size-4 text-blue" aria-hidden="true" /> Upload assets
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/scenes">
              <Box className="size-4 text-blue" aria-hidden="true" /> New scene
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/motion">
              <Clapperboard className="size-4 text-blue" aria-hidden="true" /> New film
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/editor">
              <Wand2 className="size-4 text-blue" aria-hidden="true" /> Remove a background
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/batch">
              <Layers className="size-4 text-blue" aria-hidden="true" /> New batch
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/batch?export=set">
              <Share className="size-4 text-blue" aria-hidden="true" /> Export set
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/studio/presets?new=1">
              <Palette className="size-4 text-blue" aria-hidden="true" /> Brand preset
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The sidebar with the current page highlighted. Reading the path waits for the request, so it streams in. */
function CurrentSidebar({ onNavigate, compact, onSearch }: { onNavigate?: () => void; compact?: boolean; onSearch?: () => void }) {
  return <Sidebar pathname={usePathname()} onNavigate={onNavigate} compact={compact} onSearch={onSearch} />;
}

function PlacedSidebar({ onNavigate, compact, onSearch }: { onNavigate?: () => void; compact?: boolean; onSearch?: () => void }) {
  return (
    <Suspense fallback={<Sidebar pathname="" onNavigate={onNavigate} compact={compact} onSearch={onSearch} />}>
      <CurrentSidebar onNavigate={onNavigate} compact={compact} onSearch={onSearch} />
    </Suspense>
  );
}

function PageName() {
  return <>{studioPageName(usePathname())}</>;
}

/** Notes the studio page you're on, so the image editor's Back button can return to it. */
function RememberPlace() {
  const pathname = usePathname();
  useEffect(() => rememberStudioPlace(pathname), [pathname]);
  return null;
}

/** The studio's frame: a dark sidebar, a top bar with search (⌘K) and Create, and the page. */
export function StudioShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const editor = useEditorOpen();
  const collapsed = useSidebarCollapsed(editor);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setPalette(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={cn("min-h-dvh bg-paper lg:grid", collapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[256px_minmax(0,1fr)]")}>
      <aside id="studio-sidebar" aria-label="Studio sidebar" className="hidden bg-[#111b2b] lg:block">
        <div className="sticky top-0 h-dvh">
          <PlacedSidebar compact={collapsed} onSearch={() => setPalette(true)} />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/80 bg-paper/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open studio menu"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-ink/5 lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => writeCollapsed(editor, !collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="studio-sidebar"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="-ml-2 hidden size-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-ink/5 lg:inline-flex"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <Link href="/studio" aria-label="ISOLA Studio home" className="shrink-0 rounded-md lg:hidden">
            <LogoMark className="size-8" />
          </Link>
          <nav aria-label="Breadcrumb" className="hidden shrink-0 items-center gap-2 text-[15px] md:flex">
            <Link href="/studio" className="text-muted hover:text-ink">
              Studio
            </Link>
            <span className="text-subtle" aria-hidden="true">
              /
            </span>
            <span className="font-semibold text-ink" aria-current="page">
              <Suspense fallback={null}>
                <PageName />
              </Suspense>
            </span>
          </nav>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="mx-auto flex h-10 min-w-0 max-w-[560px] flex-1 items-center gap-2.5 rounded-[11px] border border-line bg-surface px-3 text-left text-[14px] text-muted shadow-[0_1px_2px_rgb(32_41_45/0.04)] hover:border-line-strong"
          >
            <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              <span className="sm:hidden">Search</span>
              <span className="hidden sm:inline">Search tools, presets and images</span>
            </span>
            <kbd className="hidden shrink-0 rounded-md border border-line px-1.5 text-[11px] font-semibold text-muted sm:inline">⌘K</kbd>
          </button>
          <CreateMenu />
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>
      </div>

      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/50 lg:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(86vw,300px)] animate-fade-in bg-[#111b2b] shadow-[var(--shadow-float)] focus:outline-none lg:hidden" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Studio menu</Dialog.Title>
            <Dialog.Close aria-label="Close menu" className="absolute right-3 top-4 z-10 inline-flex size-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
            <PlacedSidebar onNavigate={() => setDrawer(false)} onSearch={() => setPalette(true)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Suspense fallback={null}>
        <RememberPlace />
      </Suspense>
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <NameDialogHost />
    </div>
  );
}
