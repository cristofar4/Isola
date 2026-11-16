"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CommandPalette } from "@/components/studio/command-palette";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { MainNav } from "./tools-menu";
import { MobileMenu } from "./mobile-menu";
import { UserMenu } from "./user-menu";

const links = [
  { href: "/batch", label: "Batch Studio" },
  { href: "/developers", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
];

/** Sections with their own name next to the logo, e.g. "ISOLA DEVELOPERS". */
function sectionOf(pathname: string) {
  if (pathname.startsWith("/developers")) return { label: "DEVELOPERS", href: "/developers", name: "ISOLA Developers" };
  if (pathname === "/batch") return { label: "BATCH", href: "/batch", name: "ISOLA Batch Studio" };
  return null;
}

export function SiteHeader() {
  const pathname = usePathname();
  const section = sectionOf(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The developer docs have their own search on "/" and ⌘K; everywhere else those open this one.
  const docs = pathname.startsWith("/developers");

  useEffect(() => {
    if (docs) return;
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docs]);

  // Subscribe to scroll position so the fixed bar can gain a shadow once content passes under it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-paper/85 backdrop-blur-md transition-[box-shadow,border-color,background-color] duration-200 supports-[backdrop-filter]:bg-paper/90",
        scrolled ? "border-line shadow-[0_6px_24px_-16px_rgba(32,41,45,0.35)]" : "border-line/60",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label="ISOLA home" className="rounded-md">
            <Logo />
          </Link>
          {section && (
            <Link href={section.href} aria-label={section.name} className="hidden font-display text-[21px] font-medium tracking-[0.06em] text-ink-3 hover:text-ink sm:inline">
              {section.label}
            </Link>
          )}
        </div>

        <MainNav pathname={pathname} links={links} />

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          data-site-search
          className="ml-auto hidden h-10 w-[200px] items-center gap-2.5 rounded-[11px] border border-line bg-surface px-3 text-left text-[14px] text-muted shadow-[0_1px_2px_rgb(32_41_45/0.04)] hover:border-line-strong lg:flex xl:w-[240px]"
        >
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">Search</span>
          {!docs && <kbd className="shrink-0 rounded-md border border-line px-1.5 text-[11px] font-semibold text-muted">⌘K</kbd>}
        </button>
        <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search" className="ml-auto inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-ink/5 lg:hidden">
          <Search className="size-5" aria-hidden="true" />
        </button>

        <div className="hidden items-center gap-2 md:flex">
          <UserMenu />
        </div>

        <button
          ref={menuButton}
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-ink/5 md:hidden"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? "mobile-menu" : undefined}
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} scope="site" />

      <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} pathname={pathname} onSearch={() => setSearchOpen(true)} returnFocus={menuButton} />
    </header>
  );
}
