import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { TOOL_GROUPS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "All tools",
  description: "Remove backgrounds, refine edges, change backgrounds, crop and resize, and process whole batches with ISOLA.",
};

export default function ToolsPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:px-8">
      <header className="grid items-center gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          <p className="eyebrow text-blue-700">Tools</p>
          <h1 className="display mt-3 max-w-xl text-balance text-[44px] sm:text-[56px]">One photo. New possibilities.</h1>
          <p className="mt-4 max-w-lg text-[17px] text-ink-3">
            Start with an image. Keep creative control. Everything below runs in your browser, and each link opens the tool ready
            to use.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/editor" size="lg">
              Open the editor
            </ButtonLink>
            <ButtonLink href="/batch" size="lg" variant="secondary">
              Open Batch Studio
            </ButtonLink>
          </div>
        </div>
        <div className="relative hidden aspect-[4/3] overflow-hidden rounded-[18px] border border-line bg-surface shadow-[var(--shadow-card)] lg:block" aria-hidden="true">
          <Image src="/showcase/sneaker-white.webp" alt="" fill sizes="420px" className="object-cover" priority />
          <div className="checkerboard absolute inset-0 [clip-path:inset(0_0_0_50%)]">
            <Image src="/showcase/sneaker-white-cutout.webp" alt="" fill sizes="420px" className="object-cover" />
          </div>
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white" />
        </div>
      </header>

      {TOOL_GROUPS.map((group) => (
        <section key={group.title} aria-labelledby={`group-${group.title}`} className="mt-14">
          <h2 id={`group-${group.title}`} className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-3">
            {group.title}
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {group.items.map((tool) => (
              <li key={tool.href}>
                <Link
                  href={tool.href}
                  className="group flex h-full flex-col rounded-[16px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-blue"
                >
                  <span className="inline-flex size-11 items-center justify-center rounded-[12px] bg-blue-50 text-blue">
                    <tool.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="mt-4 text-[17px] font-semibold text-ink">{tool.label}</span>
                  <span className="mt-1 flex-1 text-[14px] leading-relaxed text-muted">{tool.detail}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-blue-700">
                    Open <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
