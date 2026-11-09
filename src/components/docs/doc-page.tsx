import Link from "next/link";
import { ArrowLeft, ArrowRight, Info, Link2, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DOC_PAGES, docIndex } from "@/lib/docs";
import { DocFeedback } from "./doc-feedback";

/** Breadcrumb, badge, title and lead for one docs page. */
export function DocHeader({ href, title, lead, badge = "Technical documentation" }: { href: string; title: ReactNode; lead: ReactNode; badge?: string }) {
  const page = DOC_PAGES[docIndex(href)];
  return (
    <header id="overview" data-anchor>
      <nav aria-label="Breadcrumb" className="text-[14px]">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/developers" className="font-medium text-blue-700 hover:underline">
              Developers
            </Link>
          </li>
          <li aria-hidden="true" className="text-subtle">
            /
          </li>
          <li aria-current="page" className="text-ink-3">
            {page?.title ?? "Introduction"}
          </li>
        </ol>
      </nav>
      <p className="mt-5 inline-flex rounded-md bg-blue-50 px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.08em] text-blue-700">{badge}</p>
      <h1 className="display mt-3 text-balance text-[38px] sm:text-[48px]">{title}</h1>
      <div className="mt-3 max-w-[680px] text-[17px] leading-relaxed text-ink-3">{lead}</div>
    </header>
  );
}

/** Section heading with a shareable anchor link. `id` must match the section list in src/lib/docs.ts. */
export function H2({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn("group flex items-center gap-2", className)}>
      {children}
      <a
        href={`#${id}`}
        aria-label="Link to this section"
        className="inline-flex size-7 items-center justify-center rounded-md text-subtle opacity-0 transition-opacity hover:bg-ink/5 hover:text-blue-700 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Link2 className="size-4" aria-hidden="true" />
      </a>
    </h2>
  );
}

export function DocCallout({ title, children, tone = "info" }: { title?: ReactNode; children: ReactNode; tone?: "info" | "warn" }) {
  const Icon = tone === "warn" ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        "not-prose my-6 flex gap-4 rounded-[14px] border px-5 py-4",
        tone === "warn" ? "border-warn/25 bg-warn-50" : "border-blue-100 bg-blue-50",
      )}
    >
      <Icon className={cn("mt-0.5 size-6 shrink-0", tone === "warn" ? "text-warn" : "text-blue")} strokeWidth={1.75} aria-hidden="true" />
      <div className="text-[15px] leading-relaxed text-ink-3">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** Previous/next links in guide order, then the feedback strip. */
export function DocFooter({ href }: { href: string }) {
  const i = docIndex(href);
  const prev = i > 0 ? DOC_PAGES[i - 1] : null;
  const next = i >= 0 && i < DOC_PAGES.length - 1 ? DOC_PAGES[i + 1] : null;
  return (
    <div className="not-prose mt-12 grid gap-6">
      <nav aria-label="Previous and next pages" className="grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link href={prev.href} className="group rounded-[14px] border border-line bg-surface px-4 py-3 hover:border-blue/40 hover:shadow-[var(--shadow-card)]">
            <span className="flex items-center gap-1.5 text-[13px] text-muted">
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Previous
            </span>
            <span className="mt-0.5 block font-semibold text-ink group-hover:text-blue-700">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link href={next.href} className="group rounded-[14px] border border-line bg-surface px-4 py-3 text-right hover:border-blue/40 hover:shadow-[var(--shadow-card)]">
            <span className="flex items-center justify-end gap-1.5 text-[13px] text-muted">
              Next <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
            <span className="mt-0.5 block font-semibold text-ink group-hover:text-blue-700">{next.title}</span>
          </Link>
        )}
      </nav>
      <DocFeedback page={href} />
    </div>
  );
}

/** The wrapper every docs page uses for its body text. */
export function DocBody({ children }: { children: ReactNode }) {
  return <div className="prose-isola mt-8 max-w-[860px] [&_h2]:mt-12">{children}</div>;
}
