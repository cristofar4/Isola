"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { ArrowUpRight, ChevronRight, Code2, LayoutGrid, Layers, Search, Tag, X } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";
import { TOOL_GROUPS } from "@/lib/tools";
import { MobileAccount } from "./user-menu";

const PAGES = [
  { href: "/batch", label: "Batch Studio", note: "Many images at once", icon: Layers },
  { href: "/developers", label: "Developers", note: "API and docs", icon: Code2 },
  { href: "/pricing", label: "Pricing", note: "Free and Pro", icon: Tag },
];

const [EDIT, ...OTHER_GROUPS] = TOOL_GROUPS;
/** Tools from the other groups that aren't already one of the main pages above. */
const MORE = OTHER_GROUPS.flatMap((g) => g.items).filter((t) => !PAGES.some((p) => p.href === t.href));

/**
 * The phone menu: a full-height panel that slides in from the right, with the
 * site header's logo and a close button where the menu button was, search,
 * the main pages, the editing tools as tiles, the rest as a short list, and
 * your account pinned to the bottom so it's always in reach.
 */
export function MobileMenu({
  open,
  onOpenChange,
  pathname,
  onSearch,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  onSearch: () => void;
  /** The menu button: focus goes back to it when the menu closes (unless search opened instead). */
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  const toSearch = useRef(false);
  const close = () => onOpenChange(false);

  // The menu is for phones; if the window grows past the breakpoint, it closes.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => mq.matches && onOpenChange(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, onOpenChange]);

  const isActive = (href: string) => (href === "/batch" ? pathname === "/batch" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40 backdrop-blur-[2px]" />
        <Dialog.Content
          id="mobile-menu"
          className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-[420px] animate-slide-in-right flex-col bg-paper shadow-[var(--shadow-float)] focus:outline-none"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (toSearch.current) toSearch.current = false;
            else returnFocus.current?.focus();
          }}
          // Any link inside closes the menu as it navigates.
          onClick={(e) => (e.target as HTMLElement).closest("a") && close()}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line/80 px-4 sm:px-6">
            <Link href="/" aria-label="ISOLA home" className="rounded-md">
              <Logo />
            </Link>
            <Dialog.Close aria-label="Close menu" className="inline-flex size-10 items-center justify-center rounded-lg text-ink hover:bg-ink/5">
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <nav aria-label="Mobile" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 sm:px-6">
            <button
              type="button"
              onClick={() => {
                toSearch.current = true;
                close();
                onSearch();
              }}
              className="flex h-12 w-full items-center gap-3 rounded-[12px] border border-line bg-surface px-3.5 text-left text-[15px] text-muted shadow-[0_1px_2px_rgb(32_41_45/0.04)] hover:border-line-strong"
            >
              <Search className="size-[18px] shrink-0" aria-hidden="true" />
              Search tools, pages and docs
            </button>

            <ul className="mt-4 overflow-hidden rounded-[14px] border border-line bg-surface">
              {PAGES.map((page, i) => {
                const active = isActive(page.href);
                return (
                  <li key={page.href} className={cn(i > 0 && "border-t border-line")}>
                    <Link
                      href={page.href}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex min-h-14 items-center gap-3 px-3.5 py-2.5", active ? "bg-blue-50" : "hover:bg-paper")}
                    >
                      <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-[10px]", active ? "bg-blue text-white" : "bg-paper-2 text-ink-3")}>
                        <page.icon className="size-[18px]" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[16px] font-semibold", active ? "text-blue-700" : "text-ink")}>{page.label}</span>
                        <span className="block text-[13px] text-muted">{page.note}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <section aria-label={EDIT.title} className="mt-6">
              <p className="eyebrow px-1 pb-2.5 text-subtle">{EDIT.title}</p>
              <ul className="grid grid-cols-2 gap-2.5">
                {EDIT.items.map((tool) => (
                  <li key={tool.href}>
                    <Link
                      href={tool.href}
                      className="flex h-full min-h-[76px] flex-col justify-between gap-2 rounded-[14px] border border-line bg-surface p-3 transition-colors hover:border-line-strong active:bg-paper"
                    >
                      <span className="inline-flex size-8 items-center justify-center rounded-[9px] bg-blue-50 text-blue">
                        <tool.icon className="size-[17px]" aria-hidden="true" />
                      </span>
                      <span className="text-[14px] font-semibold leading-tight text-ink">{tool.label}</span>
                      <span className="sr-only">: {tool.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="More" className="mt-6">
              <p className="eyebrow px-1 pb-2.5 text-subtle">More</p>
              <ul className="overflow-hidden rounded-[14px] border border-line bg-surface">
                {MORE.map((tool, i) => (
                  <li key={tool.href} className={cn(i > 0 && "border-t border-line")}>
                    <Link href={tool.href} aria-current={isActive(tool.href) ? "page" : undefined} className="flex min-h-12 items-center gap-3 px-3.5 py-2.5 hover:bg-paper">
                      <tool.icon className="size-[18px] shrink-0 text-blue" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-medium text-ink">{tool.label}</span>
                        <span className="block truncate text-[13px] text-muted">{tool.description}</span>
                      </span>
                    </Link>
                  </li>
                ))}
                <li className="border-t border-line">
                  <Link href="/tools" className="flex min-h-12 items-center gap-3 px-3.5 py-2.5 font-semibold text-blue-700 hover:bg-paper">
                    <LayoutGrid className="size-[18px] shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-[15px]">All tools</span>
                    <ArrowUpRight className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                </li>
              </ul>
            </section>
          </nav>

          <div className="shrink-0 border-t border-line bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            <MobileAccount onNavigate={close} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
