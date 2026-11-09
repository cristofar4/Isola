"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { TOOL_GROUPS } from "@/lib/tools";
import { MainNav } from "./tools-menu";
import { MobileUserLinks, UserMenu } from "./user-menu";

const links = [
  { href: "/batch", label: "Batch Studio" },
  { href: "/developers", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
        "sticky top-0 z-40 border-b bg-paper/85 backdrop-blur-md transition-[box-shadow,border-color,background-color] duration-200 supports-[backdrop-filter]:bg-paper/75",
        scrolled ? "border-line shadow-[0_6px_24px_-16px_rgba(32,41,45,0.35)]" : "border-line/60",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="ISOLA home" className="rounded-md">
          <Logo />
        </Link>

        <MainNav pathname={pathname} links={links} />

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <UserMenu />
        </div>

        <button
          type="button"
          className="ml-auto inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-ink/5 md:hidden"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Menu" side="right">
        <nav aria-label="Mobile" className="grid gap-1 pt-2" onClick={(e) => (e.target as HTMLElement).closest("a") && setMenuOpen(false)}>
          {TOOL_GROUPS.map((group) => (
            <div key={group.title} className="grid gap-0.5">
              <p className="eyebrow px-3 pb-1 pt-3 text-subtle">{group.title}</p>
              {group.items.map((tool) => (
                <Link key={tool.href} href={tool.href} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-paper">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue">
                    <tool.icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-ink">{tool.label}</span>
                    <span className="block text-[13px] text-muted">{tool.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
          <Link href="/tools" className="inline-flex items-center gap-1.5 px-3 py-2 text-[14px] font-semibold text-blue-700">
            Explore all tools <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <div className="my-2 h-px bg-line" />
          <Link href="/pricing" className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-paper">
            Pricing
          </Link>
          <div className="my-2 h-px bg-line" />
          <MobileUserLinks onNavigate={() => setMenuOpen(false)} />
          <ButtonLink href="/editor" size="lg" className="mt-3">
            Get started
          </ButtonLink>
        </nav>
      </Sheet>
    </header>
  );
}
