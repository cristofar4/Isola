import type { ReactNode } from "react";

export function PageShell({ eyebrow, title, intro, children }: { eyebrow?: string; title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[880px] px-4 py-12 sm:px-6 sm:py-16">
      {eyebrow && <p className="eyebrow text-muted">{eyebrow}</p>}
      <h1 className="display mt-2 text-[40px] sm:text-[52px]">{title}</h1>
      {intro && <div className="mt-4 text-[17px] leading-relaxed text-ink-3">{intro}</div>}
      <div className="prose-isola mt-10">{children}</div>
    </div>
  );
}

export function Callout({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={`my-6 rounded-[14px] border px-4 py-3 text-sm leading-relaxed ${
        tone === "warn" ? "border-warn/25 bg-warn-50 text-warn" : "border-blue-100 bg-blue-50 text-blue-700"
      }`}
    >
      {children}
    </div>
  );
}
