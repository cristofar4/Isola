import { BookOpen, Code2, Lock, Monitor, Server, TriangleAlert, Workflow, type LucideIcon } from "lucide-react";

/**
 * Developer guide structure. The sidebar, the previous/next links and the
 * search index all come from here, so they can't disagree. Section ids match
 * the headings on each page (tests/docs.test.ts checks the anchors exist).
 */
export interface DocSection {
  id: string;
  title: string;
  /** Plain-text summary used for search results. */
  text: string;
}

export interface DocPage {
  href: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  sections: DocSection[];
}

export const DOC_PAGES: DocPage[] = [
  {
    href: "/developers",
    title: "Introduction",
    summary: "How ISOLA processes images and how its editing tools fit together.",
    icon: BookOpen,
    sections: [
      { id: "overview", title: "Overview", text: "What the guide covers. There is no public API or API keys yet; this describes the application architecture and deployment interfaces." },
      { id: "processing-flow", title: "Processing flow", text: "Validate image, load engine, create mask, refine and export. Original, mask and cutout." },
      { id: "engine-options", title: "Engine options", text: "On-device processing in the browser, or optional server processing through a configured provider." },
      { id: "next-steps", title: "Next steps", text: "Authentication and access, file formats and limits, troubleshooting." },
    ],
  },
  {
    href: "/developers/processing",
    title: "How processing works",
    summary: "Validation, models, inference in a Web Worker, compositing and export.",
    icon: Workflow,
    sections: [
      { id: "pipeline", title: "Pipeline", text: "Content sniffing by magic bytes, header dimensions, decoding with EXIF orientation, the untouched original kept for retries." },
      { id: "models", title: "On-device models", text: "IS-Net general-use Standard model Apache-2.0, BiRefNet High detail MIT, 1024 input, download size, WebGPU or WebAssembly." },
      { id: "model-delivery", title: "Model delivery and caching", text: "GET /api/models/:file for signed-in users, server cache in ./models, automatic download with SHA-256 checksum, Cache Storage isola-models-v1." },
      { id: "inference", title: "Inference", text: "ONNX Runtime Web in a module worker, WebGPU or multi-threaded WebAssembly, resize, normalise, bilinear upscale of the mask, real phases, cancellation." },
      { id: "compositing", title: "Editing and compositing", text: "Original, AI mask, editable mask, edge shift and feather, background, shadow, crop and output size. One compositor for preview and export; no checkerboard in files." },
      { id: "batch", title: "Batch Studio pipeline", text: "Queue with controlled concurrency, per-item states, masks reused when settings change, IndexedDB persistence, ZIP export." },
      { id: "export", title: "Export and plans", text: "Transparent PNG, PNG with background, JPEG. Free plan watermark and 1000px limit from plan-policy.ts, Pro full resolution." },
    ],
  },
  {
    href: "/developers/browser-requirements",
    title: "Browser requirements",
    summary: "What a browser needs for on-device processing, and a live check of this one.",
    icon: Monitor,
    sections: [
      { id: "check", title: "Check this browser", text: "Live check for WebAssembly, workers, OffscreenCanvas, cross-origin isolation, WebGPU, Cache Storage and IndexedDB." },
      { id: "required", title: "Required features", text: "WebAssembly, module Web Workers, createImageBitmap and canvas." },
      { id: "optional", title: "Optional features", text: "WebGPU for speed and the High detail model, cross-origin isolation for threads, Cache Storage for the model, IndexedDB for Batch Studio." },
      { id: "headers", title: "Required response headers", text: "Cross-Origin-Opener-Policy same-origin and Cross-Origin-Embedder-Policy require-corp enable SharedArrayBuffer threads. CORS and CORP for model hosts." },
      { id: "memory", title: "Memory and image size", text: "WebAssembly 4 GB ceiling, iOS Safari canvas limit about 16.7 megapixels, large exports on phones." },
      { id: "tested", title: "What has been tested", text: "Verified in Chromium; Safari, Firefox and real phones not yet verified." },
    ],
  },
  {
    href: "/developers/engine-adapter",
    title: "Engine adapter",
    summary: "The interface every background-removal engine implements.",
    icon: Code2,
    sections: [
      { id: "interface", title: "The interface", text: "BackgroundRemovalEngine: descriptor, getState, subscribe, load, removeBackground, dispose. MaskResult, RemoveOptions, EngineState, JobPhase." },
      { id: "contract", title: "Contract", text: "Masks at the original resolution, 0 to 255, row-major. Honour AbortSignal, report real phases, never invent progress, throw EngineError codes." },
      { id: "registering", title: "Registering an engine", text: "Engine ids in registry.ts, getEngine, one on-device model resident at a time, useEngineState." },
      { id: "implementations", title: "Implementations", text: "OnnxEngine on-device worker engine and RemoteEngine for the server route." },
      { id: "custom-engine", title: "Writing your own", text: "Skeleton of a custom engine that calls a self-hosted segmentation service." },
    ],
  },
  {
    href: "/developers/server-endpoints",
    title: "Server endpoints",
    summary: "The routes each deployment serves, and who may call them.",
    icon: Server,
    sections: [
      { id: "authentication", title: "Authentication and access", text: "Better Auth session cookie, sign-in required for models and server processing, no API keys, same-origin checks." },
      { id: "engines", title: "GET /api/engines", text: "Which engines the deployment offers; never returns credentials." },
      { id: "models", title: "GET /api/models/:file", text: "Streams a model file to a signed-in browser; 401 otherwise; downloads it once if missing." },
      { id: "remove-background", title: "POST /api/remove-background", text: "Multipart image field, greyscale PNG mask response, remove.bg provider, rate limit, status codes 401 413 415 422 429 503." },
      { id: "billing", title: "Billing routes", text: "POST /api/billing/checkout, GET /billing/callback, POST /api/billing/webhook with x-paystack-signature, GET /api/billing/manage." },
      { id: "feedback", title: "POST /api/docs/feedback", text: "Stores the yes or no answer from Was this page helpful." },
      { id: "configuration", title: "Configuration", text: "ISOLA_REMOTE_PROVIDER, REMOVE_BG_API_KEY, ISOLA_REMOTE_MAX_UPLOAD_MB, ISOLA_REMOTE_RATE_LIMIT_PER_HOUR, model hosting." },
    ],
  },
  {
    href: "/developers/errors-limits",
    title: "Errors & limits",
    summary: "Formats, size limits, error codes and how to fix common problems.",
    icon: TriangleAlert,
    sections: [
      { id: "formats", title: "File formats and limits", text: "PNG, JPEG, WebP detected by content. 30 MB, 8000 px, 32 px minimum, 36 MP, 50 images per batch, export limits, free plan 1000 px." },
      { id: "validation-errors", title: "Upload errors", text: "empty-file, too-large, unsupported-type, corrupt, dimension-too-large, too-many-pixels, too-small." },
      { id: "engine-errors", title: "Engine errors", text: "auth-required, model-missing, model-download-failed, model-integrity, unsupported-browser, engine-init-failed, inference-failed, out-of-memory, not-configured, provider-error, network, cancelled." },
      { id: "troubleshooting", title: "Troubleshooting", text: "Engine unavailable, model couldn't be downloaded on serverless hosts, single-threaded processing, High detail missing, out of memory, batch not kept, downloads blocked." },
    ],
  },
  {
    href: "/developers/privacy-storage",
    title: "Privacy & storage",
    summary: "What stays on the device, what reaches the server, and what is stored where.",
    icon: Lock,
    sections: [
      { id: "on-device", title: "What stays on the device", text: "Images and masks are processed in the browser and not uploaded with the on-device engines." },
      { id: "server", title: "What reaches the server", text: "Model download requests, account and payment data, server engine uploads forwarded to the provider, not stored or logged." },
      { id: "browser-storage", title: "Browser storage", text: "Cache Storage isola-models-v1, IndexedDB isola-batch, session cookies with the isola prefix. Nothing in localStorage." },
      { id: "server-storage", title: "Server storage", text: "Accounts, sessions, payments and documentation feedback in Postgres or SQLite." },
    ],
  },
];

export function docIndex(href: string) {
  return DOC_PAGES.findIndex((p) => p.href === href);
}

export interface SearchHit {
  href: string;
  page: string;
  section: string | null;
  text: string;
  score: number;
}

/** Ranked full-text search over page titles, section titles and summaries. */
export function searchDocs(query: string, limit = 8): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits: SearchHit[] = [];
  for (const page of DOC_PAGES) {
    const candidates = [
      { href: page.href, section: null as string | null, title: page.title, text: page.summary, weight: 3 },
      ...page.sections.map((s) => ({ href: `${page.href}#${s.id}`, section: s.title, title: s.title, text: s.text, weight: 2 })),
    ];
    for (const c of candidates) {
      const title = c.title.toLowerCase();
      const body = `${page.title} ${c.text}`.toLowerCase();
      let score = 0;
      let all = true;
      for (const t of terms) {
        if (title.includes(t)) score += c.weight * (title.startsWith(t) ? 3 : 2);
        else if (body.includes(t)) score += 1;
        else all = false;
      }
      if (all && score > 0) hits.push({ href: c.href, page: page.title, section: c.section, text: c.text, score });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
