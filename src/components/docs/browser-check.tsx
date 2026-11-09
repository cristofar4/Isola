"use client";

import { CircleCheck, CircleMinus, CircleX, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";

type Level = "required" | "optional";
interface Result {
  id: string;
  label: string;
  level: Level;
  ok: boolean;
  detail: string;
}

async function runChecks(): Promise<Result[]> {
  const w = window as Window & typeof globalThis;
  let webgpu = false;
  let webgpuDetail = "Not exposed by this browser. Standard runs on WebAssembly; High detail isn't available.";
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (gpu) {
      webgpu = Boolean(await gpu.requestAdapter());
      webgpuDetail = webgpu ? "Available: faster processing, and High detail can run." : "The API exists but no GPU adapter was granted.";
    }
  } catch {
    webgpu = false;
  }
  let idb = typeof indexedDB !== "undefined";
  if (idb) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("isola-capability-check");
        req.onsuccess = () => {
          req.result.close();
          indexedDB.deleteDatabase("isola-capability-check");
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      idb = false;
    }
  }
  let cache = typeof caches !== "undefined";
  if (cache) {
    try {
      await caches.keys();
    } catch {
      cache = false;
    }
  }
  const threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return [
    { id: "wasm", label: "WebAssembly", level: "required", ok: typeof WebAssembly === "object", detail: "Runs the segmentation model." },
    { id: "worker", label: "Web Workers", level: "required", ok: typeof Worker !== "undefined", detail: "Keeps processing off the page so it stays responsive." },
    { id: "bitmap", label: "createImageBitmap", level: "required", ok: typeof createImageBitmap === "function", detail: "Decodes images with their orientation." },
    {
      id: "canvas",
      label: "OffscreenCanvas",
      level: "optional",
      ok: typeof OffscreenCanvas !== "undefined",
      detail: typeof OffscreenCanvas !== "undefined" ? "Used for compositing and export." : "Missing; a regular canvas is used instead.",
    },
    {
      id: "isolation",
      label: "Cross-origin isolation",
      level: "optional",
      ok: w.crossOriginIsolated === true,
      detail: w.crossOriginIsolated ? `On: WebAssembly can use ${threads} thread${threads === 1 ? "" : "s"} here.` : "Off: WebAssembly runs on one thread (slower). Check the COOP/COEP headers.",
    },
    { id: "webgpu", label: "WebGPU", level: "optional", ok: webgpu, detail: webgpuDetail },
    { id: "cache", label: "Cache Storage", level: "optional", ok: cache, detail: cache ? "The model is downloaded once and kept." : "Unavailable (private mode?): the model downloads once per session." },
    { id: "idb", label: "IndexedDB", level: "optional", ok: idb, detail: idb ? "Batch Studio can keep your batch across reloads." : "Unavailable: a batch lasts only until the tab closes." },
    {
      id: "memory",
      label: "Device memory",
      level: "optional",
      ok: memory === undefined || memory >= 4,
      detail: memory === undefined ? "Not reported by this browser." : `About ${memory} GB reported${memory < 4 ? "; very large images may run out of memory" : ""}.`,
    },
  ];
}

/** Runs the same feature checks the engine depends on, in the visitor's own browser. */
export function BrowserCheck() {
  const [results, setResults] = useState<Result[] | null>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    let alive = true;
    void runChecks().then((r) => alive && setResults(r));
    return () => {
      alive = false;
    };
  }, [run]);

  const requiredOk = results?.filter((r) => r.level === "required").every((r) => r.ok);
  return (
    <div className="not-prose my-5 overflow-hidden rounded-[14px] border border-line bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-paper/70 px-4 py-3">
        <p className="font-semibold text-ink" aria-live="polite">
          {!results ? "Checking this browser…" : requiredOk ? "This browser can remove backgrounds on the device." : "This browser is missing something on-device processing needs."}
        </p>
        <button
          type="button"
          onClick={() => {
            setResults(null);
            setRun((n) => n + 1);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-blue-700 hover:bg-blue-50"
        >
          <RotateCw className="size-3.5" aria-hidden="true" /> Run again
        </button>
      </div>
      {!results ? (
        <p className="flex items-center gap-2 px-4 py-6 text-[14px] text-muted">
          <Spinner className="text-blue" /> Testing features…
        </p>
      ) : (
        <ul className="divide-y divide-line" aria-label="Browser features">
          {results.map((r) => {
            const Icon = r.ok ? CircleCheck : r.level === "required" ? CircleX : CircleMinus;
            return (
              <li key={r.id} data-check={r.id} data-ok={r.ok} className="grid grid-cols-[auto_1fr] gap-x-3 px-4 py-2.5 sm:grid-cols-[auto_200px_1fr]">
                <Icon className={cn("mt-0.5 size-[18px]", r.ok ? "text-success" : r.level === "required" ? "text-danger" : "text-warn")} aria-hidden="true" />
                <span className="text-[14px] font-semibold text-ink">
                  {r.label}
                  <span className="sr-only">{r.ok ? ": supported" : ": not supported"}</span>
                  <span className="ml-2 rounded bg-paper-2 px-1.5 py-px text-[11px] font-medium uppercase tracking-wide text-muted">{r.level}</span>
                </span>
                <span className="col-start-2 text-[14px] text-ink-3 sm:col-start-auto">{r.detail}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
