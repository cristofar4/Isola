"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { Code2, ChevronDown, Eraser, Layers, Menu, Wand2 } from "lucide-react";
import { useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

const tools = [
  { href: "/editor", label: "Background remover", description: "Remove, refine and export one image", icon: Wand2 },
  { href: "/batch", label: "Batch studio", description: "Process a set of images in one go", icon: Layers },
  { href: "/support#editing", label: "Restore & erase brushes", description: "How to fine-tune edges by hand", icon: Eraser },
  { href: "/developers", label: "Engine adapter", description: "Swap models or providers", icon: Code2 },
];

const links = [
  { href: "/batch", label: "Batch studio" },
  { href: "/developers", label: "API" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="relative z-30 border-b border-line/80 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="ISOLA home" className="rounded-md">
          <Logo />
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex lg:ml-24 lg:mr-auto">
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger className="group inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium text-ink hover:bg-ink/5 data-[state=open]:bg-ink/5">
              Tools
              <ChevronDown
                className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="start"
                sideOffset={8}
                className="z-50 w-[320px] animate-scale-in rounded-[14px] border border-line bg-surface p-1.5 shadow-[var(--shadow-float)]"
              >
                {tools.map((tool) => (
                  <DropdownMenu.Item key={tool.href} asChild>
                    <Link
                      href={tool.href}
                      className="flex items-start gap-3 rounded-[10px] p-2.5 outline-none data-[highlighted]:bg-paper"
                    >
                      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue">
                        <tool.icon className="size-4" aria-hidden="true" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-ink">{tool.label}</span>
                        <span className="block text-[13px] text-muted">{tool.description}</span>
                      </span>
                    </Link>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-ink/5",
                pathname === link.href && "bg-ink/5",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex lg:ml-0">
          <Link href="/sign-in" className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-ink hover:bg-ink/5">
            Sign in
          </Link>
          <ButtonLink href="/editor" size="md">
            Get started
          </ButtonLink>
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
          <p className="eyebrow px-3 pb-1 pt-2 text-subtle">Tools</p>
          {tools.map((tool) => (
            <Link key={tool.href} href={tool.href} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-paper">
              <tool.icon className="size-4 text-blue" aria-hidden="true" />
              {tool.label}
            </Link>
          ))}
          <div className="my-2 h-px bg-line" />
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-paper">
              {link.label}
            </Link>
          ))}
          <Link href="/sign-in" className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-paper">
            Sign in
          </Link>
          <ButtonLink href="/editor" size="lg" className="mt-3">
            Get started
          </ButtonLink>
        </nav>
      </Sheet>
    </header>
  );
}
