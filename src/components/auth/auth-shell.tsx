import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type FooterLink = "help" | "privacy" | "terms";
const footerLinks: Record<FooterLink, { href: string; label: string }> = {
  help: { href: "/support", label: "Help" },
  privacy: { href: "/privacy", label: "Privacy" },
  terms: { href: "/terms", label: "Terms" },
};

/**
 * One account screen: a badge, an optional picture, the heading and the form.
 * With a picture, phones stack badge → picture → heading → form (as designed)
 * and wide screens put the picture beside the form. Reading and tab order stay
 * badge → heading → form → picture everywhere.
 */
export function AuthShell({
  badge,
  title,
  subtitle,
  art,
  children,
  footer,
  links = ["privacy", "terms"],
}: {
  badge: string;
  title: string;
  subtitle?: ReactNode;
  art?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  links?: FooterLink[];
}) {
  const hasArt = Boolean(art);
  return (
    <>
      <main id="main" className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "mx-auto grid w-full max-w-[440px] flex-1 content-start gap-6 pb-10 pt-2 sm:pt-6",
            hasArt
              ? "lg:max-w-none lg:grid-cols-[minmax(0,1.1fr)_minmax(0,420px)] lg:content-center lg:gap-x-16 lg:pb-14 xl:gap-x-24"
              : "sm:content-center sm:pb-20",
          )}
        >
          <div className={cn("contents", hasArt && "lg:col-start-2 lg:row-start-1 lg:block lg:self-center")}>
            <p
              className={cn(
                "order-1 w-fit justify-self-center rounded-full border border-blue/15 bg-blue-50 px-3.5 py-1.5 text-[12px] font-bold uppercase leading-none tracking-[0.16em] text-blue-700 animate-fade-in",
                hasArt && "lg:mb-5 lg:justify-self-start",
              )}
            >
              {badge}
            </p>
            <div className={cn("order-3 text-center animate-fade-up", hasArt && "lg:text-left")}>
              <h1 className="text-balance font-display text-[32px] font-bold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[38px]">
                {title}
              </h1>
              {subtitle && <p className="mt-2 text-[16px] leading-relaxed text-ink-3">{subtitle}</p>}
            </div>
            <div className={cn("order-4 animate-fade-up [animation-delay:60ms]", hasArt && "lg:mt-7")}>
              {children}
              {footer && <p className="mt-6 text-center text-[15px] text-ink-3">{footer}</p>}
            </div>
          </div>
          {hasArt && <div className="order-2 animate-scale-in lg:col-start-1 lg:row-start-1 lg:self-center">{art}</div>}
        </div>
      </main>

      <footer className="flex justify-center px-4 pb-6 pt-2">
        <ul className="flex items-center gap-3 text-[13px] text-muted">
          {links.map((key, i) => (
            <Fragment key={key}>
              {i > 0 && <li aria-hidden="true" className="h-3.5 w-px bg-line-strong" />}
              <li>
                <Link href={footerLinks[key].href} className="rounded-sm px-1 transition-colors hover:text-ink">
                  {footerLinks[key].label}
                </Link>
              </li>
            </Fragment>
          ))}
        </ul>
      </footer>
    </>
  );
}

export function FormSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      <div className="h-[74px] animate-pulse rounded-[12px] bg-paper-2" />
      <div className="h-[74px] animate-pulse rounded-[12px] bg-paper-2" />
      <div className="h-12 animate-pulse rounded-[12px] bg-paper-2" />
    </div>
  );
}
