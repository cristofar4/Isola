"use client";

import Image from "next/image";
import { Accordion } from "radix-ui";
import { Brush, ChevronDown, Eraser, Layers, MousePointer2, Redo2, Scan, SquareDashed, Undo2 } from "lucide-react";
import { useState } from "react";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

type Item = "edges" | "brushes" | "shadows";

const items: Array<{ value: Item; title: string; body: string; icon: React.ElementType }> = [
  {
    value: "edges",
    title: "Hair & edge refinement",
    body: "Soft alpha mattes keep curls and flyaways. Feather and edge shift tidy the boundary without touching your original pixels.",
    icon: Scan,
  },
  {
    value: "brushes",
    title: "Restore & erase",
    body: "Paint back anything the model missed, or erase what it kept. Adjustable size and softness, with full undo and redo.",
    icon: Eraser,
  },
  {
    value: "shadows",
    title: "Natural shadows",
    body: "Add a soft drop shadow with control over softness, distance, angle and opacity. It's exported with your image.",
    icon: Layers,
  },
];

function EditorMockup({ mode }: { mode: Item }) {
  const tools = [
    { icon: MousePointer2, active: false },
    { icon: Brush, active: mode === "brushes" || mode === "edges" },
    { icon: Eraser, active: false },
    { icon: SquareDashed, active: false },
  ];
  return (
    <div className="overflow-hidden rounded-[16px] border border-white/10 bg-surface text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]" aria-hidden="true">
      <div className="flex h-11 items-center gap-3 border-b border-line px-3.5">
        <span className="flex items-center gap-2">
          <LogoMark className="size-5" />
          <span className="font-display text-sm font-extrabold tracking-[0.06em]">ISOLA</span>
        </span>
        <Undo2 className="ml-4 size-4 text-muted" />
        <Redo2 className="size-4 text-muted" />
        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-ink">
          150% <ChevronDown className="size-3.5" />
        </span>
      </div>
      <div className="flex">
        <div className="flex w-12 flex-col items-center gap-2 border-r border-line py-3">
          {tools.map(({ icon: Icon, active }, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-lg transition-colors duration-300",
                active ? "bg-blue text-white" : "text-ink",
              )}
            >
              <Icon className="size-4" />
            </span>
          ))}
        </div>
        <div
          className={cn(
            "relative aspect-[16/10] flex-1 overflow-hidden transition-colors duration-500",
            mode === "shadows" ? "bg-[#e9eef8]" : "checkerboard",
          )}
        >
          <Image
            src="/showcase/curls-cutout.webp"
            alt=""
            fill
            sizes="(min-width: 1024px) 520px, 90vw"
            className={cn(
              "object-cover transition-[transform,filter] duration-700 ease-[var(--ease-out)]",
              mode === "shadows" ? "scale-100 drop-shadow-[14px_18px_16px_rgba(32,41,45,0.35)]" : "scale-[1.45]",
            )}
            style={{ objectPosition: "50% 26%", transformOrigin: "52% 40%" }}
          />
          {mode !== "shadows" && (
            <span
              className="absolute left-[64%] top-[16%] size-14 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(32,41,45,0.35)] transition-all duration-500"
              style={mode === "brushes" ? { left: "36%", top: "52%" } : undefined}
            >
              <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function Details() {
  const [open, setOpen] = useState<Item>("edges");
  return (
    <section aria-labelledby="details-heading" className="bg-ink text-white">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:px-8 lg:py-20">
        <div>
          <h2 id="details-heading" className="display text-[38px] text-white sm:text-[46px]">
            Made for the details.
          </h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-white/75">
            Precise tools to keep what matters, from complex edges to a clean, polished result.
          </p>
          <Accordion.Root
            type="single"
            value={open}
            onValueChange={(v) => v && setOpen(v as Item)}
            className="mt-8 grid gap-3"
          >
            {items.map((item) => (
              <Accordion.Item
                key={item.value}
                value={item.value}
                className="overflow-hidden rounded-[12px] border border-white/12 bg-white/[0.03] transition-colors data-[state=open]:border-white/20 data-[state=open]:bg-white/[0.07]"
              >
                <Accordion.Header>
                  <Accordion.Trigger className="group flex w-full items-center gap-3 px-4 py-3.5 text-left text-[15px] font-semibold">
                    <item.icon className="size-5 text-white/80" aria-hidden="true" />
                    {item.title}
                    <ChevronDown
                      className="ml-auto size-4 text-white/70 transition-transform duration-300 group-data-[state=open]:rotate-180"
                      aria-hidden="true"
                    />
                  </Accordion.Trigger>
                </Accordion.Header>
                <Accordion.Content className="overflow-hidden data-[state=closed]:animate-none data-[state=open]:animate-fade-in">
                  <p className="px-4 pb-4 pl-12 text-sm leading-relaxed text-white/70">{item.body}</p>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </div>
        <div>
          <EditorMockup mode={open} />
          <p className="mt-3 text-xs text-white/55">
            Illustration of the editor. The cutout is real output from the High detail model.
          </p>
        </div>
      </div>
    </section>
  );
}
