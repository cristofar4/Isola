import type { ReactNode } from "react";

export function Card({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  // aria-labelledby takes space-separated ids, so the id must not contain spaces.
  const id = `card-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6" aria-labelledby={id}>
      <div className="flex items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2 id={id} className="text-[15px] font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

