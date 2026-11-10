import { BadgeCheck, CircleAlert, Layers, Wand2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import type { CurrentUser } from "@/server/auth";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/initials";

export function Avatar({ name, email, className }: { name: string; email: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-blue to-blue-700 font-display font-bold text-white shadow-[var(--shadow-blue)] ring-4 ring-surface",
        className,
      )}
    >
      {initialsOf(name, email)}
    </span>
  );
}

export function PlanBadge({ pro }: { pro: boolean }) {
  return pro ? (
    <span className="inline-flex items-center rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.12em] text-white">Pro</span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-line-strong bg-surface px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.12em] text-ink-3">
      Free
    </span>
  );
}

/** Who's signed in, their plan, and the two places they'll most likely go next. */
export function AccountHeader({ user }: { user: CurrentUser }) {
  const since = new Date(user.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return (
    <header className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4 sm:gap-5">
        <Avatar name={user.name} email={user.email} className="size-16 text-[22px] sm:size-[72px] sm:text-[24px]" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate font-display text-[28px] font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[34px]">
              {user.name || user.email}
            </h1>
            <PlanBadge pro={user.plan.pro} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-3">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="truncate">{user.email}</span>
              {user.emailVerified ? (
                <BadgeCheck className="size-4 shrink-0 text-success" aria-label="Email confirmed" />
              ) : (
                <CircleAlert className="size-4 shrink-0 text-warn" aria-label="Email not confirmed" />
              )}
            </span>
            <span className="hidden h-3.5 w-px bg-line-strong sm:block" aria-hidden="true" />
            <span className="text-muted">Member since {since}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/editor" icon={<Wand2 className="size-4" aria-hidden="true" />}>
          Open the editor
        </ButtonLink>
        <ButtonLink href="/batch" variant="secondary" icon={<Layers className="size-4" aria-hidden="true" />}>
          Batch Studio
        </ButtonLink>
      </div>
    </header>
  );
}
