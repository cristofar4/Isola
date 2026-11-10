"use client";

import { KeyRound, MonitorSmartphone, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export const ACCOUNT_SECTIONS = [
  { id: "plan", label: "Plan & billing", icon: Sparkles },
  { id: "api-keys", label: "API keys", icon: KeyRound },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "security", label: "Password & sign-in", icon: ShieldCheck },
  { id: "devices", label: "Devices", icon: MonitorSmartphone },
  { id: "delete-account", label: "Delete account", icon: Trash2 },
] as const;

/** Follows scrolling and returns the section being read. */
function useCurrentSection() {
  const [active, setActive] = useState<string>(ACCOUNT_SECTIONS[0].id);
  useEffect(() => {
    const elements = ACCOUNT_SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => el !== null);
    if (!elements.length) return;
    const update = () => {
      // At the bottom of the page the last section wins even if it's short.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        setActive(elements[elements.length - 1].id);
        return;
      }
      const passed = elements.filter((el) => el.getBoundingClientRect().top < 160);
      setActive((passed[passed.length - 1] ?? elements[0]).id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return active;
}

/** Section links: a sticky list beside the content on wide screens, a scrolling row of chips on phones. */
export function AccountNav() {
  const active = useCurrentSection();

  // Keep the active chip in view in the phone row (scrolling only the row, never the page).
  useEffect(() => {
    const chip = document.querySelector<HTMLElement>(`[data-account-chip="${active}"]`);
    const row = chip?.closest("ul");
    if (!chip || !row || !row.offsetParent) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: Math.max(0, left - 16), behavior: "smooth" });
  }, [active]);

  return (
    <>
      <nav aria-label="Account sections" className="sticky top-24 hidden lg:block">
        <ul className="grid gap-1">
          {ACCOUNT_SECTIONS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={active === id ? "location" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors",
                  active === id ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink-3 hover:bg-ink/5 hover:text-ink",
                  id === "delete-account" && active !== id && "text-danger/80 hover:text-danger",
                )}
              >
                <Icon className={cn("size-[18px]", active === id ? "text-blue" : "text-subtle")} aria-hidden="true" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="Account sections" className="-mx-4 border-b border-line/70 bg-paper/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden">
        <ul className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ACCOUNT_SECTIONS.map(({ id, label }) => (
            <li key={id} className="shrink-0">
              <a
                href={`#${id}`}
                data-account-chip={id}
                aria-current={active === id ? "location" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                  active === id ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-3 hover:text-ink",
                )}
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
