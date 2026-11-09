import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileImage, KeyRound, Laptop, Layers, Scan, Server, Share, Wrench, Image as ImageIcon } from "lucide-react";
import { CodeBlock } from "@/components/docs/code-block";
import { DocBody, DocCallout, DocFooter, DocHeader, H2 } from "@/components/docs/doc-page";

export const metadata: Metadata = {
  title: "Developer docs",
  description: "How ISOLA processes images, how its editing tools fit together, and the interfaces each deployment exposes.",
};

const steps = [
  { icon: ImageIcon, title: "Validate image", text: "Check the input is a supported image and can be processed.", href: "/developers/processing#pipeline" },
  { icon: Layers, title: "Load engine", text: "Initialise the removal engine for the current session.", href: "/developers/processing#model-delivery" },
  { icon: Scan, title: "Create mask", text: "Generate a foreground mask that isolates the subject.", href: "/developers/processing#inference" },
  { icon: Share, title: "Refine & export", text: "Refine the result and export a cutout with transparency.", href: "/developers/processing#compositing" },
];

const adapter = `interface BackgroundRemovalEngine {
  load(): Promise<void>;
  removeBackground(
    image: ImageBitmap,
    options?: RemoveOptions,
  ): Promise<MaskResult>;
  dispose(): void;
}
`;

const next = [
  { icon: KeyRound, title: "Authentication & access", text: "How access is controlled in the application and what's currently supported.", href: "/developers/server-endpoints#authentication" },
  { icon: FileImage, title: "File formats & limits", text: "Supported image formats and processing considerations.", href: "/developers/errors-limits#formats" },
  { icon: Wrench, title: "Troubleshooting", text: "Common issues and how to resolve them.", href: "/developers/errors-limits#troubleshooting" },
];

function Step({ step, last }: { step: (typeof steps)[number]; last: boolean }) {
  return (
    <li className="relative flex">
      <Link
        href={step.href}
        className="group flex w-full flex-col rounded-[14px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)]"
      >
        <step.icon className="size-7 text-blue" strokeWidth={1.6} aria-hidden="true" />
        <span className="mt-3 text-[17px] font-semibold text-ink group-hover:text-blue-700">{step.title}</span>
        <span className="mt-1 text-[14px] leading-snug text-ink-3">{step.text}</span>
      </Link>
      {!last && (
        <ArrowRight
          className="absolute -right-[22px] top-1/2 z-10 hidden size-5 -translate-y-1/2 text-blue xl:block"
          aria-hidden="true"
        />
      )}
    </li>
  );
}

function MaskIllustration() {
  const frames = [
    { src: "/showcase/sneaker-white.webp", label: "Original", className: "" },
    { src: "/showcase/sneaker-white-mask.webp", label: "Mask", className: "bg-black" },
    { src: "/showcase/sneaker-white-cutout.webp", label: "Cutout", className: "checkerboard-sm" },
  ];
  return (
    <figure className="flex flex-col justify-center rounded-[14px] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
        {frames.map((f, i) => (
          <div key={f.label} className="contents">
            <div className="text-center">
              <div className={`relative aspect-[4/3] overflow-hidden rounded-[8px] border border-line ${f.className}`}>
                <Image src={f.src} alt={`${f.label} of a sneaker photo`} fill sizes="160px" className="object-cover" />
              </div>
              <p className="mt-2 text-[14px] font-medium text-ink">{f.label}</p>
            </div>
            {i < frames.length - 1 && <ArrowRight className="mb-6 size-5 text-blue" aria-hidden="true" />}
          </div>
        ))}
      </div>
      <figcaption className="mt-3 text-center text-[12px] text-muted">Real output of the Standard model; the mask is the cutout&apos;s alpha channel.</figcaption>
    </figure>
  );
}

function PathCard({
  icon: Icon,
  title,
  badge,
  text,
  href,
  cta,
}: {
  icon: typeof Laptop;
  title: string;
  badge: string;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <Link href={href} className="group flex gap-4 rounded-[14px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)]">
      <Icon className="size-9 shrink-0 text-blue" strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[18px] font-semibold text-ink">{title}</span>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[12px] font-semibold text-blue-700">{badge}</span>
        </span>
        <span className="mt-1 block text-[15px] text-ink-3">{text}</span>
        <span className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-semibold text-blue-700">
          {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

export default function DevelopersPage() {
  return (
    <>
      <DocHeader
        href="/developers"
        title="Build with a clear picture."
        lead="Understand how ISOLA processes images and how its editing tools fit together."
      />
      <DocBody>
        <DocCallout title="Public API access is not available yet.">
          <p>This guide covers the application architecture and deployment interfaces. There are no API keys or usage plans.</p>
        </DocCallout>

        <H2 id="processing-flow">From image to cutout.</H2>
        <ol className="not-prose grid gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-8">
          {steps.map((step, i) => (
            <Step key={step.title} step={step} last={i === steps.length - 1} />
          ))}
        </ol>
        <div className="not-prose mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <CodeBlock title="Engine adapter" code={adapter} className="my-0" />
          <MaskIllustration />
        </div>
        <p className="mt-3 text-[14px] text-muted">
          Simplified; the full interface, with state, phases and the mask format, is on{" "}
          <Link href="/developers/engine-adapter" className="font-medium text-blue-700 underline underline-offset-2">
            Engine adapter
          </Link>
          .
        </p>

        <H2 id="engine-options">Choose a processing path.</H2>
        <div className="not-prose grid gap-4 lg:grid-cols-2">
          <PathCard
            icon={Laptop}
            title="On-device processing"
            badge="Browser"
            text="Model loading, browser support and local inference. The default; images never leave the browser."
            href="/developers/processing"
            cta="Read the guide"
          />
          <PathCard
            icon={Server}
            title="Server processing"
            badge="Optional"
            text="Provider configuration and deployment requirements. Off unless the operator configures a provider."
            href="/developers/server-endpoints#remove-background"
            cta="View setup"
          />
        </div>

        <H2 id="next-steps">Next steps</H2>
        <ul className="not-prose divide-y divide-line">
          {next.map((row) => (
            <li key={row.title}>
              <Link href={row.href} className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 py-3.5 sm:grid-cols-[auto_220px_1fr_auto]">
                <row.icon className="size-5 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
                <span className="text-[16px] font-semibold text-ink group-hover:text-blue-700">{row.title}</span>
                <span className="col-start-2 text-[14px] text-ink-3 sm:col-start-auto sm:border-l sm:border-line sm:pl-4">{row.text}</span>
                <ArrowRight className="col-start-3 row-span-2 row-start-1 size-5 text-blue transition-transform group-hover:translate-x-0.5 sm:col-start-auto sm:row-span-1" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        <DocFooter href="/developers" />
      </DocBody>
    </>
  );
}
