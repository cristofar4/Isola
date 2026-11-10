import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One settings section: a titled card with an optional action on the right and
 * an optional footer bar (hint on the left, button on the right).
 */
export function Section({
  id,
  icon,
  title,
  description,
  action,
  footer,
  tone = "default",
  children,
}: {
  id: string;
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
  children?: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-12 overflow-hidden rounded-[18px] lg:scroll-mt-6 border bg-surface shadow-[var(--shadow-card)]",
        tone === "danger" ? "border-danger/30" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3 p-5 sm:p-6">
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] [&>svg]:size-[18px]",
            tone === "danger" ? "bg-danger-50 text-danger" : "bg-blue-50 text-blue",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="font-display text-[19px] font-bold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {description && <div className="mt-0.5 text-[14px] leading-relaxed text-muted">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>}
      {footer && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5 sm:px-6",
            tone === "danger" ? "border-danger/20 bg-danger-50/50" : "border-line bg-paper/70",
          )}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

export function FooterHint({ children }: { children: ReactNode }) {
  return <p className="min-w-0 flex-1 basis-56 text-[13px] text-muted">{children}</p>;
}
