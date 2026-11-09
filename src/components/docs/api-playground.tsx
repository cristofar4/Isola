"use client";

import { Download, Eye, EyeOff, ImageUp, KeyRound, Play } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { CopyButton } from "./copy-button";

type Output = "cutout" | "mask";
type Format = "png" | "jpeg";

interface Result {
  status: number;
  ms: number;
  headers: Array<[string, string]>;
  imageUrl: string | null;
  json: string | null;
}

const noop = () => () => {};

const SHOWN_HEADERS = /^(content-type|x-isola-|x-ratelimit-|retry-after)/i;

/**
 * Calls this site's real API with the visitor's own key. The key lives only
 * in this component's memory and is sent only to /api/v1 on this origin.
 */
export function ApiPlayground() {
  const ids = { key: useId(), file: useId(), bg: useId() };
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [image, setImage] = useState<{ blob: Blob; name: string } | null>(null);
  const [output, setOutput] = useState<Output>("cutout");
  const [format, setFormat] = useState<Format>("png");
  const [background, setBackground] = useState<string | null>(null);
  const [busy, setBusy] = useState<"me" | "run" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Release the previous result image when a new one replaces it or on unmount.
  useEffect(() => {
    const url = result?.imageUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result]);

  // Hydration-safe: the server renders a placeholder origin, the browser then shows its own.
  const origin = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "https://your-deployment.example",
  );
  const params = [output !== "cutout" && `-F "output=${output}"`, format !== "png" && `-F "format=${format}"`, background && `-F "background=${background}"`].filter(Boolean);
  const curl = [
    `curl -X POST ${origin}/api/v1/remove-background \\`,
    `  -H "Authorization: Bearer ${key ? key.slice(0, 13) + "…" : "isola_sk_…"}" \\`,
    `  -F "image=@${image?.name ?? "photo.jpg"}" \\`,
    ...params.map((p) => `  ${p} \\`),
    `  -o result.${format === "jpeg" ? "jpg" : "png"}`,
  ].join("\n");

  async function collect(res: Response, started: number): Promise<Result> {
    const headers = [...res.headers.entries()].filter(([k]) => SHOWN_HEADERS.test(k));
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) return { status: res.status, ms: Math.round(performance.now() - started), headers, imageUrl: URL.createObjectURL(await res.blob()), json: null };
    const text = await res.text();
    let json = text;
    try {
      json = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* not JSON */
    }
    return { status: res.status, ms: Math.round(performance.now() - started), headers, imageUrl: null, json };
  }

  async function checkKey() {
    setBusy("me");
    setResult(null);
    const started = performance.now();
    try {
      setResult(await collect(await fetch("/api/v1/me", { headers: { Authorization: `Bearer ${key.trim()}` } }), started));
    } catch {
      setResult({ status: 0, ms: 0, headers: [], imageUrl: null, json: "Couldn't reach the API." });
    }
    setBusy(null);
  }

  async function run() {
    if (!image) return;
    setBusy("run");
    setResult(null);
    const started = performance.now();
    const form = new FormData();
    form.append("image", image.blob, image.name);
    if (output !== "cutout") form.append("output", output);
    if (format !== "png") form.append("format", format);
    if (background) form.append("background", background);
    try {
      setResult(await collect(await fetch("/api/v1/remove-background", { method: "POST", headers: { Authorization: `Bearer ${key.trim()}` }, body: form }), started));
    } catch {
      setResult({ status: 0, ms: 0, headers: [], imageUrl: null, json: "Couldn't reach the API." });
    }
    setBusy(null);
  }

  async function loadSample() {
    const res = await fetch("/samples/sneaker-white.jpg");
    setImage({ blob: await res.blob(), name: "sneaker-white.jpg" });
  }

  const ok = result && result.status >= 200 && result.status < 300;
  return (
    <div className="not-prose my-6 overflow-hidden rounded-[16px] border border-line bg-surface shadow-[var(--shadow-card)]" data-playground>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/70 px-5 py-3">
        <span className="rounded-md bg-ink px-2 py-0.5 font-mono text-[12px] font-semibold text-white">POST</span>
        <code className="font-mono text-[13px] text-ink">/api/v1/remove-background</code>
        <span className="ml-auto text-[12px] text-muted">Live: uses your key and counts towards its limit</span>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={ids.key} className="text-[13px] font-semibold text-ink">
              API key
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  id={ids.key}
                  type={showKey ? "text" : "password"}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="isola_sk_…"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-10 font-mono text-[13px] text-ink focus:border-blue focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? "Hide key" : "Show key"}
                  className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-ink/5"
                >
                  {showKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
              <Button variant="secondary" disabled={!key.trim() || busy !== null} onClick={() => void checkKey()} icon={busy === "me" ? <Spinner /> : undefined}>
                Check key
              </Button>
            </div>
            <p className="text-[12px] text-muted">
              Create one on your <a href="/account" className="font-semibold text-blue-700 underline">Account page</a>. It stays in this page and is sent only to this site.
            </p>
          </div>

          <div className="grid gap-1.5">
            <p className="text-[13px] font-semibold text-ink">Image</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} icon={<ImageUp className="size-4" aria-hidden="true" />}>
                Choose file
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void loadSample()}>
                Use the sample photo
              </Button>
              <span className="truncate text-[13px] text-muted" aria-live="polite">
                {image ? image.name : "No image chosen"}
              </span>
              <input
                ref={fileRef}
                id={ids.file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) setImage({ blob: f, name: f.name });
                }}
              />
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[13px] font-semibold text-ink">Options</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Output">
              {(["cutout", "mask"] as Output[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={output === o}
                  onClick={() => {
                    setOutput(o);
                    if (o === "mask") {
                      setFormat("png");
                      setBackground(null);
                    }
                  }}
                  className={cn("h-8 rounded-lg border px-3 text-[13px] font-medium", output === o ? "border-blue bg-blue-50 text-blue-700" : "border-line hover:bg-paper")}
                >
                  output={o}
                </button>
              ))}
              {(["png", "jpeg"] as Format[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={format === f}
                  disabled={output === "mask"}
                  onClick={() => setFormat(f)}
                  className={cn("h-8 rounded-lg border px-3 text-[13px] font-medium disabled:opacity-40", format === f ? "border-blue bg-blue-50 text-blue-700" : "border-line hover:bg-paper")}
                >
                  format={f}
                </button>
              ))}
            </div>
            <label htmlFor={ids.bg} className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={background !== null} disabled={output === "mask"} onChange={(e) => setBackground(e.target.checked ? "#FFFFFF" : null)} className="size-4 accent-[var(--color-blue)]" />
              Background colour
              <input
                id={ids.bg}
                type="color"
                aria-label="Background colour"
                value={background ?? "#ffffff"}
                disabled={background === null}
                onChange={(e) => setBackground(e.target.value.toUpperCase())}
                className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0.5 disabled:opacity-40"
              />
              <span className="font-mono text-[12px] text-muted">{background ?? "transparent"}</span>
            </label>
          </fieldset>

          <Button size="lg" disabled={!key.trim() || !image || busy !== null} onClick={() => void run()} icon={busy === "run" ? <Spinner className="size-5" /> : <Play className="size-4" aria-hidden="true" />}>
            {busy === "run" ? "Processing on the server…" : "Send request"}
          </Button>

          <div className="overflow-hidden rounded-[12px] bg-[#1d2529]">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
              <span className="text-[12px] font-semibold text-white/80">Same request with curl</span>
              <CopyButton text={curl.replace(/isola_sk_[^"\s]*…/, "YOUR_KEY")} />
            </div>
            <pre tabIndex={0} aria-label="curl command" className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-[#e6ebef]">
              {curl}
            </pre>
          </div>
        </div>

        <div className="grid content-start gap-3" aria-live="polite">
          {!result ? (
            <div className="flex min-h-[260px] items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-strong p-6 text-center text-[14px] text-muted">
              {busy ? (
                <>
                  <Spinner className="text-blue" /> {busy === "run" ? "Removing the background on the server…" : "Checking the key…"}
                </>
              ) : (
                "The response appears here: status, headers and the image."
              )}
            </div>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className={cn("rounded-md px-2 py-0.5 font-mono font-semibold", ok ? "bg-success-50 text-success" : "bg-danger-50 text-danger")} data-status={result.status}>
                  {result.status || "network error"}
                </span>
                <span className="text-muted">{result.ms} ms round trip</span>
                {result.imageUrl && (
                  <a href={result.imageUrl} download={`result.${format === "jpeg" ? "jpg" : "png"}`} className="ml-auto inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline">
                    <Download className="size-4" aria-hidden="true" /> Download
                  </a>
                )}
              </p>
              {result.imageUrl && (
                <div className={cn("relative overflow-hidden rounded-[12px] border border-line", output === "mask" ? "bg-black" : "checkerboard")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.imageUrl} alt="API result" className="mx-auto max-h-[360px] w-auto object-contain" />
                </div>
              )}
              {result.json && <pre tabIndex={0} aria-label="Response body" className="max-h-[360px] overflow-auto rounded-[12px] bg-[#1d2529] p-3 font-mono text-[12px] leading-relaxed text-[#e6ebef]">{result.json}</pre>}
              {result.headers.length > 0 && (
                <table className="w-full text-left text-[12px]">
                  <tbody>
                    {result.headers.map(([k, v]) => (
                      <tr key={k} className="border-b border-line">
                        <th scope="row" className="py-1 pr-3 font-mono font-medium text-ink-3">
                          {k}
                        </th>
                        <td className="py-1 font-mono text-ink">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
