"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

type Option = "transparent" | "studio" | "custom";

const options: Array<{ value: Option; label: string; swatch: string }> = [
  { value: "transparent", label: "Transparent", swatch: "checkerboard-sm" },
  { value: "studio", label: "Studio", swatch: "bg-[linear-gradient(160deg,#dbe8fb,#b9d0f3)]" },
  { value: "custom", label: "Custom", swatch: "" },
];

function Cutout({ shadow }: { shadow?: boolean }) {
  return (
    <Image
      src="/showcase/sneaker-white-cutout.webp"
      alt=""
      fill
      sizes="(min-width: 1024px) 260px, 45vw"
      className={cn("object-cover transition-[filter] duration-500", shadow && "drop-shadow-[0_18px_14px_rgba(32,41,45,0.22)]")}
      style={{ objectPosition: "50% 50%" }}
    />
  );
}

export function Possibilities() {
  const [choice, setChoice] = useState<Option>("studio");
  const name = useId();
  return (
    <section aria-labelledby="possibilities-heading" className="border-y border-line bg-surface/50">
      <div className="mx-auto grid max-w-[1240px] items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.95fr_2.2fr] lg:px-8 lg:py-16">
        <div>
          <p className="eyebrow text-muted">More than a cutout</p>
          <h2 id="possibilities-heading" className="display mt-3 text-[38px] sm:text-[44px]">
            One image.
            <br />
            <span className="text-blue">New possibilities.</span>
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted">
            Export a transparent PNG, or place the subject on a solid colour or your own image, with an optional shadow.
          </p>
        </div>

        <div className="grid grid-cols-2 items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_0.8fr] sm:gap-4">
          <figure className="checkerboard relative aspect-[4/3] overflow-hidden rounded-[14px] border border-line">
            <Cutout />
            <figcaption className="sr-only">Sneaker with its background removed</figcaption>
          </figure>
          <ArrowRight className="hidden size-6 text-ink sm:block" aria-hidden="true" />
          <figure
            className={cn(
              "relative aspect-[4/3] overflow-hidden rounded-[14px] border border-line transition-colors duration-500",
              choice === "transparent" && "checkerboard",
              choice === "studio" && "bg-[linear-gradient(160deg,#dbe8fb,#b9d0f3)]",
            )}
          >
            {choice === "custom" && (
              <Image src="/showcase/sky.webp" alt="" fill sizes="(min-width: 1024px) 260px, 45vw" className="animate-fade-in object-cover" />
            )}
            <Cutout shadow={choice !== "transparent"} />
            <figcaption className="sr-only">Sneaker on the selected background</figcaption>
          </figure>
          <ArrowRight className="hidden size-6 text-ink sm:block" aria-hidden="true" />
          <fieldset className="col-span-2 rounded-[14px] border border-line bg-surface p-2 sm:col-span-1">
            <legend className="sr-only">Preview a background</legend>
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-1">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] p-2 text-[13px] font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue sm:flex-row sm:gap-3",
                    choice === o.value ? "bg-blue-50 text-blue-700" : "text-ink hover:bg-paper",
                  )}
                >
                  <input
                    type="radio"
                    name={name}
                    value={o.value}
                    checked={choice === o.value}
                    onChange={() => setChoice(o.value)}
                    className="sr-only"
                  />
                  <span className={cn("relative h-8 w-11 shrink-0 overflow-hidden rounded-md border border-line", o.swatch)} aria-hidden="true">
                    {o.value === "custom" && <Image src="/showcase/sky.webp" alt="" fill sizes="48px" className="object-cover" />}
                  </span>
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </section>
  );
}
