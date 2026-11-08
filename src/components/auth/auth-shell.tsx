import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-[420px] animate-fade-up">
        <div className="rounded-[20px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
          <Link href="/" aria-label="ISOLA home" className="inline-flex rounded-md">
            <LogoMark className="size-9" />
          </Link>
          <h1 className="mt-5 font-display text-[28px] font-bold leading-tight tracking-[-0.025em] text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-muted">{footer}</div>}
      </div>
    </div>
  );
}

export function FormSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-11 animate-pulse rounded-[10px] bg-paper-2" />
      ))}
    </div>
  );
}
