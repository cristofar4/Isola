import Image from "next/image";
import { ArrowRight, BookOpen, Code2, Upload } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { uploadLimits } from "@/lib/config";

const stack = [
  { src: "/samples/portrait-curly.jpg", rotate: "-rotate-6", offset: "translate-y-2" },
  { src: "/samples/sneaker-white.jpg", rotate: "rotate-0", offset: "-translate-y-1" },
  { src: "/samples/serum-bottle.jpg", rotate: "rotate-6", offset: "translate-y-3" },
];

export function WorkflowCards() {
  return (
    <section aria-label="Workflows" className="mx-auto grid max-w-[1240px] gap-5 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:px-8">
      <article className="flex flex-col gap-6 overflow-hidden rounded-[18px] border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:p-7">
        <div className="flex-1">
          <h2 className="font-display text-[26px] font-bold leading-[1.08] tracking-[-0.025em]">
            A whole shoot.
            <br />
            One workflow.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Queue up to {uploadLimits.maxBatchFiles} images, process them on your device, retry any that fail and download every
            transparent PNG in one ZIP.
          </p>
          <ButtonLink href="/batch" className="mt-5" icon={<Upload className="size-4" aria-hidden="true" />}>
            Batch upload
          </ButtonLink>
        </div>
        <div className="relative flex h-40 flex-1 items-center justify-center" aria-hidden="true">
          {stack.map((s, i) => (
            <div
              key={s.src}
              className={`relative -mx-4 h-32 w-28 overflow-hidden rounded-[12px] border-4 border-white shadow-[var(--shadow-float)] ${s.rotate} ${s.offset}`}
              style={{ zIndex: i === 1 ? 2 : 1 }}
            >
              <Image src={s.src} alt="" fill sizes="120px" className="object-cover" />
            </div>
          ))}
        </div>
      </article>

      <article className="flex flex-col gap-6 overflow-hidden rounded-[18px] border border-blue-100 bg-[linear-gradient(135deg,#eef2fe,#e3ebfb)] p-6 sm:flex-row sm:items-center sm:p-7">
        <div className="flex-1">
          <h2 className="font-display text-[26px] font-bold leading-[1.08] tracking-[-0.025em]">
            Build on
            <br />
            the engine.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Processing sits behind a replaceable engine adapter, with a documented server route for provider-backed removal.
            A hosted public API isn&apos;t offered yet.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/developers" icon={<Code2 className="size-4" aria-hidden="true" />}>
              Developer docs
            </ButtonLink>
            <ButtonLink href="/developers#adapter" variant="outline-blue" icon={<BookOpen className="size-4" aria-hidden="true" />}>
              Engine adapter
            </ButtonLink>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-3" aria-hidden="true">
          <div className="relative h-28 w-28 overflow-hidden rounded-[12px] border-4 border-white bg-sky shadow-[var(--shadow-card)]">
            <Image src="/showcase/sneaker-white.webp" alt="" fill sizes="120px" className="object-cover" />
          </div>
          <ArrowRight className="size-5 text-ink" />
          <div className="checkerboard-sm relative h-28 w-28 overflow-hidden rounded-[12px] border-4 border-white shadow-[var(--shadow-card)]">
            <Image src="/showcase/sneaker-white-cutout.webp" alt="" fill sizes="120px" className="object-cover" />
          </div>
        </div>
      </article>
    </section>
  );
}
