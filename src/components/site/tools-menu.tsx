"use client";

import Image from "next/image";
import Link from "next/link";
import { NavigationMenu } from "radix-ui";
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { EDIT_TOOLS, LEARN_LINKS, MORE_TOOLS, type ToolGroup, type ToolLink } from "@/lib/tools";

function ToolItem({ tool }: { tool: ToolLink }) {
  return (
    <li>
      <NavigationMenu.Link asChild>
        <Link
          href={tool.href}
          className="group flex items-center gap-4 rounded-[14px] p-3 outline-none transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue/40"
        >
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-blue-50 text-blue transition-colors group-hover:bg-surface group-focus-visible:bg-surface">
            <tool.icon className="size-[22px]" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold leading-snug text-ink">{tool.label}</span>
            <span className="block text-[14px] leading-snug text-muted">{tool.description}</span>
          </span>
          <ChevronRight
            className="size-4 shrink-0 -translate-x-1 text-blue-700 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
            aria-hidden="true"
          />
        </Link>
      </NavigationMenu.Link>
    </li>
  );
}

function Group({ group, className }: { group: ToolGroup; className?: string }) {
  const id = `tools-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="px-3 pb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-3">
        {group.title}
      </h2>
      <ul className="grid gap-1">
        {group.items.map((tool) => (
          <ToolItem key={tool.href} tool={tool} />
        ))}
      </ul>
    </section>
  );
}

/** A real before/after from ISOLA's own model (see public/samples/CREDITS.md). */
function Promo() {
  return (
    <div className="flex h-full flex-col rounded-[18px] bg-[#e4ebfd] p-5">
      <div className="relative min-h-[200px] flex-1 overflow-hidden rounded-[12px] bg-surface" aria-hidden="true">
        <Image src="/showcase/sneaker-white.webp" alt="" fill sizes="340px" className="object-cover" />
        <div className="checkerboard absolute inset-0 [clip-path:inset(0_0_0_50%)]">
          <Image src="/showcase/sneaker-white-cutout.webp" alt="" fill sizes="340px" className="object-cover" />
        </div>
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(32,41,45,0.08)]" />
        <span className="absolute left-1/2 top-1/2 inline-flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-[var(--shadow-card)]">
          <ChevronLeft className="-mr-1 size-3.5" />
          <ChevronRight className="-ml-1 size-3.5" />
        </span>
      </div>
      <p className="mt-5 text-center font-display text-[24px] font-bold leading-tight tracking-tight text-ink">One photo. New possibilities.</p>
      <NavigationMenu.Link asChild>
        <Link
          href="/editor"
          className="mx-auto mb-1 mt-2 inline-flex items-center gap-1.5 rounded-md px-1 text-[16px] font-semibold text-blue-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue/40"
        >
          Open the editor <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </NavigationMenu.Link>
    </div>
  );
}

const linkClass =
  "relative inline-flex h-16 items-center px-3 text-sm font-medium outline-none transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors focus-visible:text-blue-700";

/**
 * Main navigation: the Tools mega menu plus the top-level links. The panel
 * opens on hover or click, closes with Escape, and is a set of plain links.
 */
export function MainNav({ pathname, links }: { pathname: string; links: Array<{ href: string; label: string }> }) {
  const toolsActive = pathname === "/tools" || pathname === "/editor";
  return (
    <NavigationMenu.Root aria-label="Main" delayDuration={120} className="hidden md:block lg:ml-16">
      <NavigationMenu.List className="flex items-center gap-1">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger
            className={cn(
              "group inline-flex h-10 items-center gap-1 rounded-[10px] px-3 text-sm font-medium outline-none transition-colors hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-blue/40 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700",
              toolsActive ? "text-blue-700" : "text-ink",
            )}
          >
            Tools
            <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden="true" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="w-[min(1180px,calc(100vw-2rem))] data-[motion^=from-]:animate-fade-in">
            <div className="grid gap-2 p-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_minmax(0,0.92fr)] lg:gap-4">
              <Group group={EDIT_TOOLS} className="pr-2 pt-3 md:border-r md:border-line" />
              <div className="pt-3 lg:border-r lg:border-line lg:pr-4">
                <Group group={MORE_TOOLS} />
                <div className="mx-3 my-4 h-px bg-line" />
                <Group group={LEARN_LINKS} />
              </div>
              <div className="hidden lg:block">
                <Promo />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper/80 px-7 py-4">
              <p className="text-[15px] text-ink-3">Start with an image. Keep creative control.</p>
              <NavigationMenu.Link asChild>
                <Link
                  href="/tools"
                  className="inline-flex items-center gap-1.5 rounded-md px-1 text-[15px] font-semibold text-blue-700 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue/40"
                >
                  Explore all tools <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </NavigationMenu.Link>
            </div>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <NavigationMenu.Item key={link.href}>
              <NavigationMenu.Link asChild active={active}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(linkClass, active ? "text-blue-700 after:bg-blue" : "text-ink after:bg-transparent hover:text-blue-700")}
                >
                  {link.label}
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          );
        })}
      </NavigationMenu.List>
      {/* The panel is placed under the whole header bar (the header is the positioned ancestor). */}
      <div className="pointer-events-none absolute inset-x-0 top-full flex justify-center px-4 pt-2">
        <NavigationMenu.Viewport className="pointer-events-auto relative origin-top overflow-hidden rounded-[20px] border border-line bg-surface shadow-[0_24px_60px_-20px_rgba(32,41,45,0.35),var(--shadow-float)] data-[state=open]:animate-scale-in h-[var(--radix-navigation-menu-viewport-height)] w-[var(--radix-navigation-menu-viewport-width)]" />
      </div>
    </NavigationMenu.Root>
  );
}
