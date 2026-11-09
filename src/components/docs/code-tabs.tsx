"use client";

import { Tabs } from "radix-ui";
import type { ReactNode } from "react";

/** The same example in several languages; each tab holds a server-rendered CodeBlock. */
export function CodeTabs({ label, tabs }: { label: string; tabs: Array<{ id: string; label: string; content: ReactNode }> }) {
  return (
    <Tabs.Root defaultValue={tabs[0]?.id} className="not-prose my-5">
      <Tabs.List aria-label={label} className="flex gap-1 rounded-t-[14px] border-b border-white/10 bg-[#1d2529] px-2 pt-2">
        {tabs.map((t) => (
          <Tabs.Trigger
            key={t.id}
            value={t.id}
            className="rounded-t-lg px-3.5 py-2 text-[13px] font-semibold text-white/60 transition-colors hover:text-white data-[state=active]:bg-[#232c31] data-[state=active]:text-white"
          >
            {t.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((t) => (
        <Tabs.Content key={t.id} value={t.id} className="[&_figure]:my-0 [&_figure]:rounded-t-none focus:outline-none">
          {t.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
