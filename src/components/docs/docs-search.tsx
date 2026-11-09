"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { searchDocs } from "@/lib/docs";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** Search across every docs page and section. "/" or Ctrl/⌘ K focuses it. */
export function DocsSearch({ onNavigate, autoFocusShortcut = true }: { onNavigate?: () => void; autoFocusShortcut?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hits = searchDocs(query);

  useEffect(() => {
    if (!autoFocusShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const shortcut = (e.key === "/" && !isTyping(e.target)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k");
      if (!shortcut || !inputRef.current?.offsetParent) return;
      e.preventDefault();
      inputRef.current.focus();
      inputRef.current.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autoFocusShortcut]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    onNavigate?.();
    router.push(href);
  }

  const showList = open && query.trim().length > 0;
  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">Search documentation</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? `${listId}-${active}` : undefined}
          value={query}
          placeholder="Search documentation"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(hits.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && hits[active]) {
              e.preventDefault();
              go(hits[active].href);
            } else if (e.key === "Escape") {
              setQuery("");
              setOpen(false);
            }
          }}
          className="h-11 w-full rounded-[10px] border border-line bg-surface pl-9 pr-10 text-[14px] text-ink placeholder:text-muted hover:border-line-strong focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15 [&::-webkit-search-cancel-button]:hidden"
        />
        {autoFocusShortcut && (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-paper px-1.5 text-[11px] text-muted lg:block" aria-hidden="true">
            /
          </kbd>
        )}
      </label>
      {showList && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[12px] border border-line bg-surface shadow-[var(--shadow-float)]">
          {hits.length ? (
            <ul id={listId} role="listbox" aria-label="Search results" className="max-h-[60vh] overflow-y-auto p-1.5">
              {hits.map((hit, i) => (
                <li
                  key={hit.href}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(hit.href)}
                  onMouseEnter={() => setActive(i)}
                  className={cn("cursor-pointer rounded-[9px] px-3 py-2", i === active && "bg-blue-50")}
                >
                  <span className="block text-[14px] font-semibold text-ink">
                    {hit.section ?? hit.page}
                    {hit.section && <span className="font-normal text-muted"> · {hit.page}</span>}
                  </span>
                  <span className="line-clamp-2 block text-[13px] text-muted">{hit.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-4 py-3 text-[13px] text-muted">
              Nothing matches “{query.trim()}”. Try “model”, “401” or “WebGPU”.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
