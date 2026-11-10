"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, DropdownMenu } from "radix-ui";
import {
  BookOpen,
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
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/initials";
import { usePlan } from "@/lib/plan";
import { CommandPalette } from "./command-palette";

const NAV = [
  { href: "/studio", label: "Home", icon: House, match: (p: string) => p === "/studio" },
  { href: "/editor", label: "Image editor", icon: ImageIcon },
  { href: "/batch", label: "Batch Studio", icon: Layers },
  { href: "/studio/presets", label: "Brand presets", icon: Palette, match: (p: string) => p.startsWith("/studio/presets") },
  { href: "/batch?export=set", label: "Export sets", icon: Share },
];

const QUALITY = [{ href: "/batch?check=consistency", label: "Consistency check", icon: ScanSearch }];

const FOOTER = [
  { href: "/developers", label: "Developers", icon: BookOpen },
  { href: "/support", label: "Help", icon: CircleHelp },
  { href: "/account", label: "Settings", icon: Settings },
];

type NavItem = { href: string; label: string; icon: typeof House; match?: (p: string) => boolean };

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = item.match ? item.match(pathname) : false;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-medium transition-colors",
        active ? "bg-blue text-white shadow-[var(--shadow-blue)]" : "text-white/75 hover:bg-white/8 hover:text-white",
      )}
    >
      <item.icon className="size-[19px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function Sidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const { data } = authClient.useSession();
  const plan = usePlan();
  const name = data?.user.name ?? "";
  const email = data?.user.email ?? "";
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-5 [scrollbar-width:thin]">
      <Link href="/studio" onClick={onNavigate} aria-label="ISOLA Studio home" className="flex items-center gap-2.5 rounded-md px-2">
        <LogoMark className="size-8" />
        <span className="leading-none">
          <span className="block font-display text-[21px] font-extrabold tracking-[0.06em] text-white">ISOLA</span>
          <span className="mt-1 block text-[10px] font-semibold tracking-[0.24em] text-white/70">CREATIVE STUDIO</span>
        </span>
      </Link>

      <div className="flex items-center gap-3 rounded-[12px] border border-white/10 bg-white/5 px-3 py-2.5">
        <span className="flex-1 truncate text-[14px] font-semibold text-white">Personal studio</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em]", plan.pro ? "bg-white text-ink" : "bg-white/10 text-white/80")}>
          {plan.isPending ? "…" : plan.pro ? "Pro" : "Free"}
        </span>
      </div>

      <nav aria-label="Studio" className="grid gap-6">
        <ul className="grid gap-1">
          {NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
        <div>
          <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">Quality tools</p>
          <ul className="mt-2 grid gap-1">
            {QUALITY.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
        <ul className="grid gap-1 border-t border-white/10 pt-4">
          {FOOTER.map((item) => (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </nav>

      <Link href="/account" onClick={onNavigate} className="mt-auto flex items-center gap-3 rounded-[12px] border-t border-white/10 px-2 pt-4 hover:opacity-90">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue to-blue-700 text-[14px] font-bold text-white">
          {email ? initialsOf(name, email) : ""}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-white">{name || email || "Your account"}</span>
          <span className="block truncate text-[12px] text-white/70">{email}</span>
        </span>
      </Link>
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
            <Link href="/editor">
              <Wand2 className="size-4 text-blue" aria-hidden="true" /> Remove a background
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/batch">
              <Layers className="size-4 text-blue" aria-hidden="true" /> New batch
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={item}>
            <Link href="/batch?export=set">
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

/** The studio's frame: a dark sidebar, a top bar with search (⌘K) and Create, and the page. */
export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const page = pathname.startsWith("/studio/presets") ? "Brand presets" : "Home";

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
    <div className="min-h-dvh bg-paper lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="hidden bg-[#111b2b] lg:block">
        <div className="sticky top-0 h-dvh">
          <Sidebar pathname={pathname} />
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
              {page}
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
            <Sidebar pathname={pathname} onNavigate={() => setDrawer(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CommandPalette open={palette} onOpenChange={setPalette} />
    </div>
  );
}
