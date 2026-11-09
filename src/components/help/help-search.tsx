"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";

export interface HelpEntry {
  id: string;
  topic: string;
  q: string;
  text: string;
}

function score(entry: HelpEntry, terms: string[]) {
  const q = entry.q.toLowerCase();
  const body = `${entry.topic} ${entry.text}`.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (q.includes(t)) s += 3;
    else if (body.includes(t)) s += 1;
    else return 0;
  }
  return s;
}

/** Opens the question a link points at (#id), including on load. */
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "center" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}

export function HelpSearch({ entries }: { entries: HelpEntry[] }) {
  const [query, setQuery] = useState("");
  const listId = useId();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = terms.length
    ? entries
        .map((e) => ({ e, s: score(e, terms) }))
        .filter((h) => h.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
    : [];
  return (
    <div className="relative mx-auto mt-7 w-full max-w-[620px]">
      <label className="relative block">
        <span className="sr-only">Search the help centre</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for answers, e.g. watermark, batch, API key"
          aria-controls={listId}
          className="h-14 w-full rounded-[14px] border border-line bg-surface pl-12 pr-4 text-[16px] text-ink shadow-[var(--shadow-card)] placeholder:text-subtle focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
        />
      </label>
      <div id={listId} aria-live="polite" className={cn(terms.length ? "block" : "hidden")}>
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-[14px] border border-line bg-surface text-left shadow-[var(--shadow-float)]">
          {hits.length ? (
            <ul className="p-1.5">
              {hits.map(({ e }) => (
                <li key={e.id}>
                  <a href={`#${e.id}`} onClick={() => setQuery("")} className="block rounded-[10px] px-3 py-2.5 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none">
                    <span className="block text-[15px] font-semibold text-ink">{e.q}</span>
                    <span className="line-clamp-1 block text-[13px] text-muted">
                      {e.topic} · {e.text}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-[14px] text-muted">No answers match “{query.trim()}”. Try fewer words.</p>
          )}
        </div>
      </div>
    </div>
  );
}
