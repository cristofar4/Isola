"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUpRight, BookOpen, ChevronDown, LifeBuoy } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { DOC_PAGES } from "@/lib/docs";
import { DocsSearch } from "./docs-search";

function GuideLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="grid gap-1">
      {DOC_PAGES.map((page) => {
        const active = pathname === page.href;
        return (
          <li key={page.href}>
            <Link
              href={page.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] transition-colors",
                active ? "bg-blue font-semibold text-white shadow-[var(--shadow-blue)]" : "text-ink hover:bg-ink/5",
              )}
            >
              <page.icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {page.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Left column on large screens. */
export function DocsSidebar() {
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-8">
      <p className="px-1 text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">Developer guide</p>
      <div className="mt-4">
        <DocsSearch />
      </div>
      <nav aria-label="Developer guide" className="mt-5">
        <GuideLinks />
      </nav>
      <div className="mt-auto border-t border-line pt-4">
        <Link href="/support" className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] text-ink hover:bg-ink/5">
          <LifeBuoy className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          Help centre
          <ArrowRight className="ml-auto size-4 text-muted" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/** Below lg: a button that opens the guide (search and pages) in a sheet. */
export function MobileDocsNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = DOC_PAGES.find((p) => p.href === pathname);
  return (
    <div className="mb-6 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-left text-[14px] text-ink shadow-[var(--shadow-card)]"
      >
        <BookOpen className="size-4 text-blue" aria-hidden="true" />
        <span className="font-semibold">Developer guide</span>
        <span className="truncate text-muted">· {current?.title ?? "Introduction"}</span>
        <ChevronDown className="ml-auto size-4 text-muted" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Developer guide" side="bottom">
        <div className="grid gap-4 pb-2">
          <DocsSearch onNavigate={() => setOpen(false)} autoFocusShortcut={false} />
          <nav aria-label="Developer guide pages">
            <GuideLinks onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      </Sheet>
    </div>
  );
}

const NO_SECTIONS: never[] = [];

/** Right column: the current page's sections, highlighting the one being read. */
export function OnThisPage() {
  const pathname = usePathname();
  const page = DOC_PAGES.find((p) => p.href === pathname);
  const sections = page?.sections ?? NO_SECTIONS;
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = sections.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (!elements.length) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        // The first section whose heading is in the reading band wins; otherwise keep the last one scrolled past.
        const inBand = elements.find((el) => visible.get(el.id));
        if (inBand) setActive(inBand.id);
        else {
          const passed = elements.filter((el) => el.getBoundingClientRect().top < 120);
          if (passed.length) setActive(passed[passed.length - 1].id);
        }
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [pathname, sections]);

  const current = active ?? sections[0]?.id;
  return (
    <div className="px-6 pb-6 pt-8">
      {sections.length > 0 && (
        <nav aria-label="On this page">
          <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-ink-3">On this page</p>
          <ul className="mt-4 grid gap-1 border-l border-line">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={current === s.id ? "location" : undefined}
                  className={cn(
                    "-ml-px block border-l-2 py-1.5 pl-4 text-[15px] transition-colors",
                    current === s.id ? "border-blue font-semibold text-blue-700" : "border-transparent text-ink-3 hover:text-ink",
                  )}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="mt-8 border-t border-line pt-6">
        <Link href="/support" className="flex gap-3 rounded-[14px] bg-blue-50 px-4 py-4 hover:bg-blue-100">
          <LifeBuoy className="mt-0.5 size-7 shrink-0 text-blue" strokeWidth={1.75} aria-hidden="true" />
          <span>
            <span className="block text-[16px] font-semibold text-ink">Need a hand?</span>
            <span className="mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-[14px] font-semibold text-blue-700">
              Visit the help centre <ArrowUpRight className="size-4" aria-hidden="true" />
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
