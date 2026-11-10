"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertDialog } from "radix-ui";
import { ArrowRight, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { CheckboxField, FormAlert, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { renderBatchPreview } from "@/lib/batch/render";
import { MAX_PADDING } from "@/lib/batch/settings";
import {
  BRAND_CANVASES,
  BRAND_CANVAS_LABEL,
  MAX_COLORS,
  MAX_PRESETS,
  STARTER_PRESET,
  describeLayout,
  presetToBatchSettings,
  validatePreset,
  type BrandColor,
  type BrandLayout,
  type BrandPreset,
  type BrandPresetInput,
} from "@/lib/brand-presets";
import { cn } from "@/lib/cn";
import { exportPolicy } from "@/lib/plan-policy";
import { Swatches } from "./brand-preset-card";
import { usePresets } from "./use-presets";

const SAMPLE = "/showcase/batch/sneaker-cutout.webp";
let sample: Promise<ImageBitmap | null> | null = null;
function sampleCutout() {
  sample ??= fetch(SAMPLE)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b))
    .catch(() => null);
  return sample;
}

/** The preset drawn on a sample product by the same renderer as Batch Studio downloads. */
function LivePreview({ draft }: { draft: BrandPresetInput }) {
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify({ c: draft.colors, l: draft.layout });
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    const t = window.setTimeout(async () => {
      const cutout = await sampleCutout();
      if (!cutout || !alive) return;
      const settings = presetToBatchSettings(draft);
      try {
        const blob = await renderBatchPreview(
          { width: cutout.width, height: cutout.height, cutout, bounds: { x: 0, y: 0, w: cutout.width, h: cutout.height }, backgroundImage: null },
          settings,
          exportPolicy(true),
          360,
        );
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      } catch {
        // Keep the previous preview.
      }
    }, 120);
    return () => {
      alive = false;
      window.clearTimeout(t);
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` summarises the draft
  }, [key]);
  return (
    <figure className="grid content-start gap-2 self-start lg:sticky lg:top-24">
      <div className="checkerboard flex aspect-square items-center justify-center overflow-hidden rounded-[14px] border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of the rendered preview */}
        {url ? <img src={url} alt="Sample product with this preset" className="max-h-full max-w-full" data-preset-preview /> : <Spinner />}
      </div>
      <figcaption className="text-center text-[12px] text-muted">Live preview, drawn by the export renderer</figcaption>
    </figure>
  );
}

const fieldBase = "h-10 rounded-[10px] border border-line bg-surface px-3 text-[14px] text-ink hover:border-line-strong focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15";
const field = `${fieldBase} w-full`;

function Editor({ initial, id, onDone }: { initial: BrandPresetInput; id: string | null; onDone: () => void }) {
  const save = usePresets((s) => s.save);
  const [draft, setDraft] = useState<BrandPresetInput>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const ids = { bg: useId(), canvas: useId(), padding: useId(), x: useId(), y: useId(), format: useId() };
  const layout = (patch: Partial<BrandLayout>) => setDraft((d) => ({ ...d, layout: { ...d.layout, ...patch } }));
  const setColor = (i: number, patch: Partial<BrandColor>) => setDraft((d) => ({ ...d, colors: d.colors.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  function removeColor(i: number) {
    setDraft((d) => {
      const bg = d.layout.background;
      // Keep the background pointing at the same colour, or fall back to white if it was the one removed.
      const background: BrandLayout["background"] = bg.kind !== "brand" ? bg : bg.index === i ? { kind: "white" } : { kind: "brand", index: bg.index > i ? bg.index - 1 : bg.index };
      return { ...d, colors: d.colors.filter((_, j) => j !== i), layout: { ...d.layout, background } };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const checked = validatePreset(draft);
    if (!checked.ok) return setErrors(checked.errors);
    setErrors([]);
    setSaving(true);
    const result = await save(checked.value, id ?? undefined);
    setSaving(false);
    if (result.ok) onDone();
    else setErrors([result.message]);
  }

  const bgValue = draft.layout.background.kind === "brand" ? `brand-${draft.layout.background.index}` : draft.layout.background.kind;

  return (
    <form onSubmit={submit} className="rounded-[18px] border border-blue/30 bg-surface p-5 shadow-[var(--shadow-float)] sm:p-6" aria-label={id ? "Edit brand preset" : "New brand preset"}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold text-ink">{id ? "Edit brand preset" : "New brand preset"}</h2>
        <button type="button" onClick={onDone} aria-label="Close" className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid content-start gap-5">
          <TextField label="Preset name" maxLength={60} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />

          <fieldset>
            <legend className="text-[13px] font-medium text-ink">Brand colours</legend>
            <ul className="mt-2 grid gap-2">
              {draft.colors.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`Colour ${i + 1}`}
                    value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#000000"}
                    onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-[10px] border border-line bg-surface p-1"
                  />
                  <input aria-label={`Colour ${i + 1} name`} value={c.name} maxLength={30} onChange={(e) => setColor(i, { name: e.target.value })} className={cn(fieldBase, "min-w-0 flex-1")} />
                  <input aria-label={`Colour ${i + 1} hex`} value={c.hex} maxLength={7} onChange={(e) => setColor(i, { hex: e.target.value.trim() })} className={cn(fieldBase, "w-28 shrink-0 font-mono uppercase")} />
                  <button type="button" aria-label={`Remove colour ${i + 1}`} onClick={() => removeColor(i)} className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-danger-50 hover:text-danger">
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            {draft.colors.length < MAX_COLORS && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-2"
                icon={<Plus className="size-4" aria-hidden="true" />}
                onClick={() => setDraft((d) => ({ ...d, colors: [...d.colors, { name: `Colour ${d.colors.length + 1}`, hex: "#FFFFFF" }] }))}
              >
                Add colour
              </Button>
            )}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor={ids.bg} className="text-[13px] font-medium text-ink">
                Background
              </label>
              <select
                id={ids.bg}
                className={field}
                value={bgValue}
                onChange={(e) => {
                  const v = e.target.value;
                  layout({ background: v === "transparent" || v === "white" ? { kind: v } : { kind: "brand", index: Number(v.slice(6)) } });
                }}
              >
                <option value="transparent">Transparent</option>
                <option value="white">White</option>
                {draft.colors.map((c, i) => (
                  <option key={i} value={`brand-${i}`}>
                    {c.name || `Colour ${i + 1}`} ({c.hex})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.canvas} className="text-[13px] font-medium text-ink">
                Canvas
              </label>
              <select id={ids.canvas} className={field} value={draft.layout.canvas} onChange={(e) => layout({ canvas: e.target.value as BrandLayout["canvas"] })}>
                {BRAND_CANVASES.map((c) => (
                  <option key={c} value={c}>
                    {BRAND_CANVAS_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.padding} className="text-[13px] font-medium text-ink">
                Padding: {draft.layout.padding}%
              </label>
              <input
                id={ids.padding}
                type="range"
                min={0}
                max={MAX_PADDING}
                value={draft.layout.padding}
                disabled={draft.layout.canvas === "framing"}
                onChange={(e) => layout({ padding: Number(e.target.value) })}
                className="h-10 w-full accent-blue"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.format} className="text-[13px] font-medium text-ink">
                Format
              </label>
              <select id={ids.format} className={field} value={draft.layout.format} onChange={(e) => layout({ format: e.target.value as "png" | "jpeg" })}>
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.x} className="text-[13px] font-medium text-ink">
                Horizontal position
              </label>
              <select id={ids.x} className={field} value={draft.layout.align.x} onChange={(e) => layout({ align: { ...draft.layout.align, x: Number(e.target.value) as 0 | 0.5 | 1 } })}>
                <option value={0}>Left</option>
                <option value={0.5}>Centre</option>
                <option value={1}>Right</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor={ids.y} className="text-[13px] font-medium text-ink">
                Vertical position
              </label>
              <select id={ids.y} className={field} value={draft.layout.align.y} onChange={(e) => layout({ align: { ...draft.layout.align, y: Number(e.target.value) as 0 | 0.5 | 1 } })}>
                <option value={0}>Top</option>
                <option value={0.5}>Middle</option>
                <option value={1}>Bottom</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <CheckboxField label="Soft shadow under the product" checked={draft.layout.shadow} onChange={(e) => layout({ shadow: e.target.checked })} />
            <CheckboxField label="Use as my default preset" checked={draft.isDefault === true} onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))} />
          </div>
          {errors.length > 0 && (
            <FormAlert>
              {errors.map((e) => (
                <span key={e} className="block">
                  {e}
                </span>
              ))}
            </FormAlert>
          )}
        </div>
        <LivePreview draft={draft} />
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving} icon={saving ? <Spinner /> : undefined}>
          {id ? "Save changes" : "Create preset"}
        </Button>
      </div>
    </form>
  );
}

function PresetCard({ preset, onEdit }: { preset: BrandPreset; onEdit: () => void }) {
  const save = usePresets((s) => s.save);
  const remove = usePresets((s) => s.remove);
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-col gap-4 rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow-card)]" data-preset={preset.name}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[17px] font-bold text-ink">{preset.name}</span>
            {preset.isDefault && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-blue-700">Default</span>}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{describeLayout(preset.layout, preset.colors)}</p>
        </div>
      </div>
      {preset.colors.length > 0 && <Swatches colors={preset.colors} background={preset.layout.background} />}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Link href={`/batch?preset=${encodeURIComponent(preset.id)}`} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-blue px-3 text-[13px] font-semibold text-white hover:bg-blue-600">
          Apply in Batch Studio <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Button size="sm" variant="secondary" onClick={onEdit} icon={<Pencil className="size-3.5" aria-hidden="true" />} aria-label={`Edit ${preset.name}`}>
          Edit
        </Button>
        {!preset.isDefault && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            icon={<Star className="size-3.5" aria-hidden="true" />}
            onClick={async () => {
              setBusy(true);
              await save({ name: preset.name, colors: preset.colors, layout: preset.layout, isDefault: true }, preset.id);
              setBusy(false);
            }}
          >
            Make default
          </Button>
        )}
        <AlertDialog.Root>
          <AlertDialog.Trigger asChild>
            <button type="button" aria-label={`Delete ${preset.name}`} className="ml-auto inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-danger-50 hover:text-danger">
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40" />
            <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-[18px] bg-surface p-6 shadow-[var(--shadow-float)]">
              <AlertDialog.Title className="font-display text-lg font-bold">Delete “{preset.name}”?</AlertDialog.Title>
              <AlertDialog.Description className="mt-1.5 text-sm text-muted">Images that already use its look keep it. This can&apos;t be undone.</AlertDialog.Description>
              <div className="mt-5 flex justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button variant="secondary">Cancel</Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <Button variant="danger" onClick={() => void remove(preset.id)}>
                    Delete preset
                  </Button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </li>
  );
}

export function PresetsManager() {
  const router = useRouter();
  const params = useSearchParams();
  const presets = usePresets((s) => s.presets);
  const error = usePresets((s) => s.error);
  const load = usePresets((s) => s.load);
  const [editing, setEditing] = useState<{ id: string | null; initial: BrandPresetInput; key: number } | null>(null);
  const wantsNew = params.get("new") === "1";

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = () =>
    setEditing((prev) => ({
      id: null,
      initial: { ...STARTER_PRESET, name: presets?.length ? `Brand preset ${presets.length + 1}` : STARTER_PRESET.name, isDefault: !presets?.length },
      key: (prev?.key ?? 0) + 1,
    }));

  // ?new=1 (from "Create → Brand preset") opens the editor once the list is known.
  const [handledNew, setHandledNew] = useState(false);
  if (wantsNew && presets && !handledNew) {
    setHandledNew(true);
    if (presets.length < MAX_PRESETS && !editing) startNew();
  }
  useEffect(() => {
    if (handledNew && wantsNew) router.replace("/studio/presets", { scroll: false });
  }, [handledNew, wantsNew, router]);

  return (
    <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[40px]">Brand presets</h1>
          <p className="mt-2 max-w-[620px] text-[16px] text-ink-3">
            Your colours and one look for every product photo. Saved to your account, applied in Batch Studio with one click.
          </p>
        </div>
        <Button size="lg" onClick={startNew} disabled={!presets || presets.length >= MAX_PRESETS || editing !== null} icon={<Plus className="size-4" aria-hidden="true" />}>
          New preset
        </Button>
      </header>

      {editing && <Editor key={editing.key} initial={editing.initial} id={editing.id} onDone={() => setEditing(null)} />}

      {error && !presets && <FormAlert>{error}</FormAlert>}
      {!presets && !error && (
        <p className="flex items-center gap-2 text-[14px] text-muted">
          <Spinner /> Loading presets…
        </p>
      )}
      {presets && presets.length === 0 && !editing && (
        <div className="rounded-[18px] border-2 border-dashed border-line-strong px-6 py-12 text-center">
          <p className="text-[17px] font-semibold text-ink">No brand presets yet</p>
          <p className="mx-auto mt-1 max-w-[440px] text-[14px] text-muted">Create one and every image in a batch can share your canvas, padding, background and shadow.</p>
          <Button className="mt-4" onClick={startNew} icon={<Plus className="size-4" aria-hidden="true" />}>
            Create your first preset
          </Button>
        </div>
      )}
      {presets && presets.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Your brand presets">
          {presets.map((p) => (
            <PresetCard key={p.id} preset={p} onEdit={() => setEditing((prev) => ({ id: p.id, initial: { name: p.name, colors: p.colors, layout: p.layout, isDefault: p.isDefault }, key: (prev?.key ?? 0) + 1 }))} />
          ))}
        </ul>
      )}
      {presets && presets.length >= MAX_PRESETS && <p className="text-[13px] text-muted">You have {MAX_PRESETS} presets, the most an account can have.</p>}
    </div>
  );
}
