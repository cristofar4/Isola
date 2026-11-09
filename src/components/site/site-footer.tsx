import Link from "next/link";
import { BrandIcon } from "@/components/ui/brand-icons";
import { Logo } from "@/components/ui/logo";
import { site, socialLinks } from "@/lib/site";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/editor", label: "Background remover" },
      { href: "/batch", label: "Batch Studio" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/developers", label: "Developer docs" },
      { href: "/developers/api", label: "API quickstart" },
      { href: "/developers/api-reference", label: "API reference" },
      { href: "/developers/engine-adapter", label: "Engine adapter" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/support", label: "Help centre" },
      { href: "/support#formats", label: "Formats & limits" },
      ...(site.supportEmail ? [{ href: `mailto:${site.supportEmail}`, label: "Contact" }] : []),
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

const year = process.env.NEXT_PUBLIC_BUILD_YEAR;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_repeat(4,1fr)] lg:px-8">
        <div className="max-w-xs">
          <Link href="/" aria-label="ISOLA home" className="inline-block rounded-md">
            <Logo />
          </Link>
          <p className="mt-4 text-sm leading-relaxed text-muted">{site.tagline}</p>
          {socialLinks.length > 0 && (
            <ul className="mt-5 flex gap-2" aria-label="Social">
              {socialLinks.map((link) => (
                <li key={link.network}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:border-line-strong hover:text-blue"
                    aria-label={`${site.name} on ${link.label}`}
                  >
                    <BrandIcon network={link.network} className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-[13px] font-semibold text-ink">{column.title}</h2>
            <ul className="mt-3 grid gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-5 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {year} {site.legalEntity}. All rights reserved.
          </p>
          <p>Sample photography from Unsplash.</p>
        </div>
      </div>
    </footer>
  );
}
