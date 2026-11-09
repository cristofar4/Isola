import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Code2, Copy, CreditCard, Keyboard, LifeBuoy, Rocket, Sparkles, Wand2, Wrench, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { HelpSearch, OpenOnHash, type HelpEntry } from "@/components/help/help-search";
import { exportLimits, formatBytes, formatNaira, planConfig, uploadLimits } from "@/lib/config";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Answers about uploading, refining cutouts, Batch Studio, accounts, plans, the API and troubleshooting in ISOLA.",
};

const cap = planConfig.freeMaxExportSide.toLocaleString("en-US");

interface Item {
  id: string;
  q: string;
  /** Plain text for search. */
  text: string;
  a: ReactNode;
}
interface Topic {
  id: string;
  title: string;
  blurb: string;
  icon: typeof Rocket;
  items: Item[];
}

const topics: Topic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "Uploading, formats and limits",
    icon: Rocket,
    items: [
      {
        id: "formats",
        q: "Which images can I upload?",
        text: `PNG, JPEG or WebP, checked by content. Up to ${formatBytes(uploadLimits.maxFileBytes)}, ${uploadLimits.maxDimension}px and ${uploadLimits.maxMegapixels} megapixels.`,
        a: (
          <p>
            PNG, JPEG or WebP, checked by their contents rather than the file name. Each file can be up to{" "}
            {formatBytes(uploadLimits.maxFileBytes)}, {uploadLimits.maxDimension.toLocaleString("en-US")}px on the longest side
            and {uploadLimits.maxMegapixels} megapixels. Transparent areas in PNG and WebP stay transparent.
          </p>
        ),
      },
      {
        id: "first-image",
        q: "Why does the first image take a while?",
        text: "The browser downloads the model once, about 170 MB, with real progress, then caches it.",
        a: (
          <p>
            The first time, your browser downloads the background removal model (about 170 MB for Standard) and shows real
            progress. It&apos;s then kept in your browser, so later images start much sooner.
          </p>
        ),
      },
      {
        id: "where-processed",
        q: "Are my photos uploaded?",
        text: "No. In the app, background removal runs in your browser and images are not uploaded.",
        a: (
          <p>
            Not in the app: background removal runs in your browser, so photos stay on your device. The optional Server
            engine, if a site enables it, is clearly labelled as uploading. Images your own code sends to the API are processed
            in the server&apos;s memory and not stored.
          </p>
        ),
      },
      {
        id: "export-formats",
        q: "Which formats can I download?",
        text: "Transparent PNG, PNG with a background, or JPEG. Original dimensions unless you crop or resize.",
        a: (
          <p>
            A transparent PNG (real transparency, no checkerboard), a PNG with your background, or a JPEG (always opaque).
            Exports keep the original dimensions unless you crop or choose a size, up to {exportLimits.maxMegapixels}{" "}
            megapixels; some phones allow less.
          </p>
        ),
      },
    ],
  },
  {
    id: "editing",
    title: "Refining a cutout",
    blurb: "Brushes, edges, backgrounds, crop",
    icon: Wand2,
    items: [
      {
        id: "restore-erase",
        q: "How do I fix what the model missed?",
        text: "Restore brush paints back the original; erase brush removes leftovers. Size and softness; zoom in.",
        a: (
          <p>
            Choose the <strong>Restore brush</strong> to paint back parts of the original the model removed, or the{" "}
            <strong>Erase brush</strong> to remove what it kept. Brushes only change the mask, never the original pixels, and
            every stroke can be undone. Adjust size and softness in the Brush panel and zoom in for detail.
          </p>
        ),
      },
      {
        id: "edges",
        q: "There's a thin halo around my subject",
        text: "Edge shift moves the boundary in to remove a halo; feather softens hard edges.",
        a: (
          <p>
            Use <strong>Edge shift</strong> to pull the boundary in slightly, which removes a thin line of old background, and{" "}
            <strong>Feather</strong> to soften edges that look too sharp.
          </p>
        ),
      },
      {
        id: "backgrounds",
        q: "How do I change the background or add a shadow?",
        text: "Pick a colour or upload a background image; drop shadow with opacity, softness, distance and angle.",
        a: (
          <p>
            In the Background panel, pick a colour or upload your own image; it fills the frame. Turn on{" "}
            <strong>Drop shadow</strong> for a soft shadow from the subject&apos;s outline, with opacity, softness, distance and
            angle.
          </p>
        ),
      },
      {
        id: "crop-resize",
        q: "How do I crop or resize?",
        text: "Crop tool with ratio presets and fit to subject; choose the exact size when exporting.",
        a: (
          <p>
            Use the Crop tool (C) to pick a ratio such as 1:1 or 4:5, or fit the frame to the subject. Set the exact pixel size
            in the Export dialog.
          </p>
        ),
      },
    ],
  },
  {
    id: "batch",
    title: "Batch Studio",
    blurb: "Many images, one look, one ZIP",
    icon: Copy,
    items: [
      {
        id: "batch-basics",
        q: "How does Batch Studio work?",
        text: `Add up to ${uploadLimits.maxBatchFiles} images, they process one at a time, apply settings, download each or a ZIP. Part of Pro.`,
        a: (
          <p>
            Add up to {uploadLimits.maxBatchFiles} images; they&apos;re processed one at a time on your device. Choose a
            background, canvas, padding, alignment and format in Batch settings, apply them to the selected images (or all of
            them), then download each image or a ZIP. Batch Studio is part of Pro.
          </p>
        ),
      },
      {
        id: "batch-kept",
        q: "Will I lose my batch if I reload?",
        text: "No. The batch is kept in this browser until you remove images or clear the batch.",
        a: (
          <p>
            No. The batch is kept in this browser (not uploaded) until you remove the images or choose{" "}
            <strong>Clear batch</strong>, so it survives a reload, signing in and paying. If your browser blocks storage, the page
            tells you.
          </p>
        ),
      },
      {
        id: "batch-excluded",
        q: "Why were some images left out of my ZIP?",
        text: "Only finished images are exported; unfinished or failed ones are listed by name.",
        a: <p>Only finished images are exported. Images still processing, or that failed, are listed by name after the download so you can retry them.</p>,
      },
      {
        id: "batch-refine",
        q: "Can I fix one image from a batch by hand?",
        text: "Refine opens it in the editor; your changes come back to the batch.",
        a: <p>Choose <strong>Refine</strong> on the image. It opens in the editor, and your brush and edge changes come back to the batch automatically.</p>,
      },
    ],
  },
  {
    id: "accounts",
    title: "Accounts & sign-in",
    blurb: "Sign-up, confirmation, passwords",
    icon: UserRound,
    items: [
      {
        id: "why-account",
        q: "Why do I need an account?",
        text: "Removing backgrounds needs a free account. Email and password, Google or GitHub.",
        a: (
          <p>
            Removing backgrounds needs a free account. Sign up with email and a password, or with Google or GitHub where offered.
            Images you added before signing in wait and start automatically afterwards.
          </p>
        ),
      },
      {
        id: "confirmation-email",
        q: "The confirmation email didn't arrive",
        text: "Check spam. Signing in sends a fresh link. Links last 24 hours.",
        a: <p>Check your spam folder. Signing in with your email and password sends a fresh link; links last 24 hours.</p>,
      },
      {
        id: "forgot-password",
        q: "I forgot my password",
        text: "Reset your password from the sign-in page; link expires after 60 minutes and signs out every device.",
        a: (
          <p>
            Use <Link href="/forgot-password">Reset your password</Link>. The link works once, expires after 60 minutes and signs
            you out of every device.
          </p>
        ),
      },
      {
        id: "projects-saved",
        q: "Are my projects saved to my account?",
        text: "Not yet. Editor projects live in the tab; Batch Studio keeps the batch in this browser.",
        a: <p>Not yet. Editor projects live in the open tab, so export before closing it. Batch Studio keeps your current batch in this browser.</p>,
      },
    ],
  },
  {
    id: "plans",
    title: "Plans & billing",
    blurb: "Free, Pro, watermark, Paystack",
    icon: CreditCard,
    items: [
      {
        id: "free-vs-pro",
        q: "What's the difference between Free and Pro?",
        text: `Free: watermarked downloads up to ${cap}px. Pro: full resolution, no watermark, Batch Studio, API masks.`,
        a: (
          <p>
            Free accounts remove backgrounds and download watermarked images up to {cap}px. Pro ({formatNaira(planConfig.proPriceNgn)}{" "}
            a month or {formatNaira(planConfig.proYearlyPriceNgn)} a year, the same features either way) gives full-resolution
            exports without a watermark, Batch Studio, and full-resolution API results with masks.
          </p>
        ),
      },
      {
        id: "watermark",
        q: "How do I remove the watermark?",
        text: "Upgrade to Pro; exports are then full resolution with no watermark.",
        a: (
          <p>
            Upgrade to Pro on the <Link href="/pricing">Pricing</Link> page. New downloads are then full resolution without a
            watermark.
          </p>
        ),
      },
      {
        id: "cancel",
        q: "How do I change my card or cancel?",
        text: "Manage subscription on the Account page; Pro stays active until the end of the paid period.",
        a: <p>Use <strong>Manage subscription</strong> on the Account page. Pro stays active until the end of the period you&apos;ve paid for.</p>,
      },
    ],
  },
  {
    id: "api",
    title: "API & developers",
    blurb: "API keys, limits, docs",
    icon: Code2,
    items: [
      {
        id: "api-key",
        q: "How do I get an API key?",
        text: "Account page, API keys, create key, copy it once. Use Authorization Bearer.",
        a: (
          <p>
            Open the <Link href="/account">Account page</Link>, create a key under <strong>API keys</strong> and copy it straight
            away; it&apos;s only shown once. Send it as <code>Authorization: Bearer …</code>. The{" "}
            <Link href="/developers/api">API quickstart</Link> has curl, Node.js and Python examples and a live playground.
          </p>
        ),
      },
      {
        id: "api-watermark",
        q: "Why are my API results watermarked?",
        text: `Free keys return watermarked cutouts up to ${cap}px; Pro keys are full resolution.`,
        a: <p>The API follows your plan: Free keys return watermarked cutouts up to {cap}px, and Pro keys return full resolution without a watermark.</p>,
      },
      {
        id: "api-limit",
        q: "I'm getting 429 rate_limited",
        text: "Each key has an hourly limit; wait for the reset in Retry-After or use another key.",
        a: (
          <p>
            Each key has an hourly limit. The response&apos;s <code>Retry-After</code> and <code>X-RateLimit-Reset</code> headers say
            when it resets. See <Link href="/developers/api-reference#rate-limits">rate limits</Link>.
          </p>
        ),
      },
    ],
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    blurb: "Errors and how to fix them",
    icon: Wrench,
    items: [
      {
        id: "high-detail",
        q: "High detail is greyed out",
        text: "High detail needs WebGPU; recent desktop Chrome and Edge have it. Standard works everywhere.",
        a: (
          <p>
            The High detail model needs WebGPU, which recent desktop Chrome and Edge provide. Standard works in every current
            browser. <Link href="/developers/browser-requirements#check">Check your browser</Link>.
          </p>
        ),
      },
      {
        id: "memory",
        q: "\"Ran out of memory\" or very large images",
        text: "Close other tabs or resize the image first; phones have less memory.",
        a: <p>Close other heavy tabs, or resize the image before uploading. Phones have less memory than desktops.</p>,
      },
      {
        id: "engine-unavailable",
        q: "\"Engine unavailable\" or the model couldn't be downloaded",
        text: "The site couldn't serve the model file; retry; operators see the developer docs.",
        a: (
          <p>
            The site couldn&apos;t deliver the model file. Retry in a moment; your images are kept. If you run the site, see{" "}
            <Link href="/developers/errors-limits#troubleshooting">troubleshooting for operators</Link>.
          </p>
        ),
      },
      {
        id: "missed-subject",
        q: "The cutout missed part of my subject",
        text: "Use the restore brush; low-contrast, transparent and busy photos are hardest.",
        a: <p>Use the Restore brush to bring it back. Low-contrast subjects, transparent objects and busy backgrounds are the hardest cases.</p>,
      },
    ],
  },
];

const shortcuts: Array<[string, string]> = [
  ["V", "Move / pan"],
  ["R", "Restore brush"],
  ["E", "Erase brush"],
  ["C", "Crop"],
  ["\\", "Compare with the original"],
  ["[ ]", "Smaller / larger brush"],
  ["Space + drag", "Pan with any tool"],
  ["Ctrl/⌘ + scroll", "Zoom"],
  ["0 · 1 · 2", "Fit, 100%, 200%"],
  ["Ctrl/⌘ + Z", "Undo"],
  ["Ctrl/⌘ + Shift + Z", "Redo"],
  ["Ctrl/⌘ + E", "Export"],
];

export default function SupportPage() {
  const entries: HelpEntry[] = topics.flatMap((t) => t.items.map((i) => ({ id: i.id, topic: t.title, q: i.q, text: i.text })));
  return (
    <div className="pb-16">
      <OpenOnHash />
      <section className="border-b border-line bg-[radial-gradient(ellipse_at_top,#e4ebfd,transparent_70%)] px-4 pb-14 pt-14 text-center sm:px-6">
        <p className="eyebrow text-blue-700">Help centre</p>
        <h1 className="display mx-auto mt-3 max-w-2xl text-balance text-[44px] sm:text-[58px]">How can we help?</h1>
        <p className="mx-auto mt-3 max-w-xl text-[17px] text-ink-3">Answers about getting a clean cutout, Batch Studio, your account, plans and the API.</p>
        <HelpSearch entries={entries} />
      </section>

      <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
        <nav aria-label="Help topics" className="-mt-0 pt-10">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {topics.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className="group flex h-full items-start gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)]"
                >
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-blue-50 text-blue">
                    <t.icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-ink group-hover:text-blue-700">{t.title}</span>
                    <span className="block text-[13px] text-muted">{t.blurb}</span>
                  </span>
                </a>
              </li>
            ))}
            <li>
              <a
                href="#shortcuts"
                className="group flex h-full items-start gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition-[border-color,box-shadow] hover:border-blue/40 hover:shadow-[var(--shadow-float)]"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-blue-50 text-blue">
                  <Keyboard className="size-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-ink group-hover:text-blue-700">Keyboard shortcuts</span>
                  <span className="block text-[13px] text-muted">Work faster in the editor</span>
                </span>
              </a>
            </li>
          </ul>
        </nav>

        <div className="mt-12 grid gap-10">
          {topics.map((t) => (
            <section key={t.id} id={t.id} aria-labelledby={`${t.id}-title`} className="scroll-mt-24">
              <h2 id={`${t.id}-title`} className="flex items-center gap-2.5 font-display text-[26px] font-bold tracking-tight text-ink">
                <t.icon className="size-6 text-blue" strokeWidth={1.75} aria-hidden="true" />
                {t.title}
              </h2>
              <div className="mt-4 grid gap-2.5">
                {t.items.map((item) => (
                  <details key={item.id} id={item.id} className="group scroll-mt-28 rounded-[14px] border border-line bg-surface px-5 py-4 open:shadow-[var(--shadow-card)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-paper-2 text-ink-3 transition-transform group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <div className="prose-isola mt-3 text-[15px] [&_p]:mb-0">{item.a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <section id="shortcuts" aria-labelledby="shortcuts-title" className="scroll-mt-24">
            <h2 id="shortcuts-title" className="flex items-center gap-2.5 font-display text-[26px] font-bold tracking-tight text-ink">
              <Keyboard className="size-6 text-blue" strokeWidth={1.75} aria-hidden="true" />
              Keyboard shortcuts
            </h2>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {shortcuts.map(([key, action]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-[12px] border border-line bg-surface px-4 py-3">
                  <dt className="text-[14px] text-ink-3">{action}</dt>
                  <dd>
                    <kbd className="rounded-md border border-line-strong bg-paper px-2 py-0.5 font-mono text-[12px] text-ink shadow-[0_1px_0_var(--color-line-strong)]">{key}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section aria-label="More help" className="mt-14 grid gap-4 md:grid-cols-2">
          <Link href="/developers" className="group flex items-center gap-4 rounded-[16px] bg-ink p-6 text-white">
            <Sparkles className="size-8 shrink-0 text-[#9fb4ff]" strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-[18px] font-semibold">Building with ISOLA?</span>
              <span className="block text-[14px] text-white/70">Developer docs, API quickstart and a live playground.</span>
            </span>
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
          <div className="flex items-center gap-4 rounded-[16px] border border-line bg-surface p-6">
            <LifeBuoy className="size-8 shrink-0 text-blue" strokeWidth={1.5} aria-hidden="true" />
            <span className="flex-1">
              <span className="block text-[18px] font-semibold text-ink">Still stuck?</span>
              {site.supportEmail ? (
                <span className="block text-[14px] text-ink-3">
                  Email <a className="font-semibold text-blue-700 underline" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a> and we&apos;ll help.
                </span>
              ) : (
                <span className="block text-[14px] text-ink-3">Search above, or check the troubleshooting answers. This site hasn&apos;t published a support email.</span>
              )}
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
