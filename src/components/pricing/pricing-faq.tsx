"use client";

import { Accordion } from "radix-ui";
import { ChevronDown } from "lucide-react";

export function PricingFaq({ items }: { items: Array<{ q: string; a: string }> }) {
  return (
    <Accordion.Root type="single" collapsible defaultValue={items[0]?.q} className="grid gap-3">
      {items.map((item) => (
        <Accordion.Item key={item.q} value={item.q} className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-semibold text-ink">
              {item.q}
              <ChevronDown className="size-4 shrink-0 text-muted transition-transform duration-300 group-data-[state=open]:rotate-180" aria-hidden="true" />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="data-[state=open]:animate-fade-in">
            <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{item.a}</p>
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
