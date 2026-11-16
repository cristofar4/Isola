"use client";

import Link from "next/link";
import { ArrowRight, Check, Pencil, Tag } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { BRAND_CANVASES, BRAND_CANVAS_LABEL, STARTER_PRESET, type BrandColor, type BrandLayout, type BrandPreset } from "@/lib/brand-presets";
import { cn } from "@/lib/cn";
import { PresetLookPreview } from "./preset-preview";
import { defaultPreset, usePresets } from "./use-presets";

const PADDINGS = [0, 4, 6, 8, 10, 12, 15, 20, 25];

export function Swatches({ colors, background }: { colors: BrandColor[]; background?: BrandLayout["background"] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-2" aria-label="Brand colours">
      {colors.map((c, i) => {
        const isBg = background?.kind === "brand" && background.index === i;
        return (
          <li key={`${c.hex}-${i}`} className="flex min-w-0 items-center gap-2" title={`${c.name} ${c.hex}${isBg ? " (background)" : ""}`}>
            <span
              className={cn("size-7 shrink-0 rounded-full border border-ink/10 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.4)]", isBg && "ring-2 ring-blue ring-offset-2")}
              style={{ background: c.hex }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block max-w-[96px] truncate text-[13px] font-semibold leading-tight text-ink">{c.name}</span>
              <span className="block font-mono text-[11px] uppercase leading-tight text-muted">
                {c.hex}
                {isBg && <span className="sr-only"> (background)</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Row({ label, children, id }: { label: string; children: React.ReactNode; id: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <label htmlFor={id} className="text-[12px] font-medium text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

const selectClass =
  "h-10 w-full min-w-0 rounded-[10px] border border-line bg-surface px-2.5 text-[14px] text-ink hover:border-line-strong focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15 disabled:opacity-60";

/** The default brand preset, editable in place and saved to the account. */
export function BrandPresetCard() {
  const presets = usePresets((s) => s.presets);
  const error = usePresets((s) => s.error);
  const load = usePresets((s) => s.load);
  const save = usePresets((s) => s.save);
  const ids = { canvas: useId(), padding: useId(), shadow: useId() };
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const preset = defaultPreset(presets);

  useEffect(() => {
    if (!presets) void load();
  }, [presets, load]);

  async function update(p: BrandPreset, layout: Partial<BrandLayout>) {
    setBusy(true);
    setStatus(null);
    const result = await save({ name: p.name, colors: p.colors, layout: { ...p.layout, ...layout }, isDefault: p.isDefault }, p.id);
    setBusy(false);
    setStatus(result.ok ? { tone: "ok", text: "Saved to your account." } : { tone: "error", text: result.message });
  }

  async function create() {
    setBusy(true);
    setStatus(null);
    const result = await save({ ...STARTER_PRESET, isDefault: true });
    setBusy(false);
    if (!result.ok) setStatus({ tone: "error", text: result.message });
  }

  return (
    <section aria-labelledby="preset-title" className="rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow-card)]" data-brand-preset-card>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-blue-50 text-blue">
          <Tag className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="preset-title" className="font-display text-[20px] font-bold leading-tight tracking-[-0.01em] text-ink">
            Brand preset
          </h2>
          <p className="truncate text-[13px] text-muted">{preset ? preset.name : "One look for every product photo"}</p>
        </div>
        {preset?.isDefault && <span className="shrink-0 rounded-full bg-success-50 px-2.5 py-1 text-[12px] font-semibold text-success">Default</span>}
      </div>

      {!presets && !error && (
        <p className="mt-4 flex items-center gap-2 text-[14px] text-muted">
          <Spinner /> Loading…
        </p>
      )}
      {error && !presets && (
        <p role="alert" className="mt-4 text-[13px] text-danger">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}

      {presets && !preset && (
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 rounded-[14px] border border-dashed border-line-strong p-3">
            <PresetLookPreview draft={STARTER_PRESET} size={240} caption={false} />
            <div className="grid gap-2">
              <span className="w-fit rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-blue-700">Starter</span>
              <Swatches colors={STARTER_PRESET.colors} background={STARTER_PRESET.layout.background} />
            </div>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-3">
            Save your colours and one look for every product photo: canvas, padding and shadow. It&apos;s stored on your account, so it&apos;s
            the same on every device.
          </p>
          <Button onClick={() => void create()} disabled={busy} icon={busy ? <Spinner /> : undefined}>
            Create brand preset
          </Button>
        </div>
      )}

      {preset && (
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4 rounded-[14px] bg-paper p-3 sm:grid-cols-[128px_minmax(0,1fr)]">
            <PresetLookPreview draft={preset} size={256} caption={false} className={cn(busy && "opacity-70")} />
            <div className="grid min-w-0 gap-2.5">
              <Swatches colors={preset.colors} background={preset.layout.background} />
              <p className="text-[12px] leading-snug text-muted">
                {BRAND_CANVAS_LABEL[preset.layout.canvas]}
                {preset.layout.canvas !== "framing" ? ` · ${preset.layout.padding}% padding` : ""} · {preset.layout.shadow ? "soft shadow" : "no shadow"} · {preset.layout.format.toUpperCase()}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
            <Row label="Canvas" id={ids.canvas}>
              <select
                id={ids.canvas}
                className={selectClass}
                value={preset.layout.canvas}
                disabled={busy}
                onChange={(e) => void update(preset, { canvas: e.target.value as BrandLayout["canvas"] })}
              >
                {BRAND_CANVASES.map((c) => (
                  <option key={c} value={c}>
                    {BRAND_CANVAS_LABEL[c]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Padding" id={ids.padding}>
              <select
                id={ids.padding}
                className={selectClass}
                value={preset.layout.padding}
                disabled={busy || preset.layout.canvas === "framing"}
                onChange={(e) => void update(preset, { padding: Number(e.target.value) })}
              >
                {[...new Set([...PADDINGS, preset.layout.padding])]
                  .sort((a, b) => a - b)
                  .map((p) => (
                    <option key={p} value={p}>
                      {p}%
                    </option>
                  ))}
              </select>
            </Row>
            <Row label="Shadow" id={ids.shadow}>
              <select id={ids.shadow} className={selectClass} value={preset.layout.shadow ? "soft" : "none"} disabled={busy} onChange={(e) => void update(preset, { shadow: e.target.value === "soft" })}>
                <option value="soft">Soft</option>
                <option value="none">None</option>
              </select>
            </Row>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Link href="/studio/presets" className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-surface px-3 text-[14px] font-semibold text-ink hover:bg-paper">
              <Pencil className="size-4" aria-hidden="true" /> Edit identity
            </Link>
            <Link
              href={`/studio/batch?preset=${encodeURIComponent(preset.id)}`}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] bg-blue px-3 text-[14px] font-semibold text-white shadow-[var(--shadow-blue)] hover:bg-blue-600"
            >
              Apply preset <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
      {status && (
        <p role={status.tone === "error" ? "alert" : "status"} className={cn("mt-3 flex items-center gap-1.5 text-[12px]", status.tone === "ok" ? "text-success" : "text-danger")}>
          {status.tone === "ok" && <Check className="size-3.5" aria-hidden="true" />}
          {status.text}
        </p>
      )}
    </section>
  );
}
