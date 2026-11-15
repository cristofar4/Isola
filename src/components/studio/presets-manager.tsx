"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { AlertDialog, Tabs } from "radix-ui";
import { Copy, Download, Import, Plus, Replace, Search, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckboxField, FormAlert, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { renderBatchPreview } from "@/lib/batch/render";
import { MAX_PADDING } from "@/lib/batch/settings";
import {
  BRAND_CANVASES,
  BRAND_CANVAS_LABEL,
  BRAND_FORMATS,
  BRAND_TRANSITIONS,
  BRAND_TRANSITION_LABEL,
  DEFAULT_IDENTITY,
  MAX_COLORS,
  MAX_PRESETS,
  MOTION_STYLE_IDS,
  MOTION_STYLE_LABEL,
  STARTER_PRESET,
  backgroundHex,
  describeLayout,
  normaliseIdentity,
  presetToBatchSettings,
  validatePreset,
  type BrandColor,
  type BrandFont,
  type BrandIdentity,
  type BrandLayout,
  type BrandPreset,
  type BrandPresetInput,
} from "@/lib/brand-presets";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/editor/export";
import { exportPolicy } from "@/lib/plan-policy";
import { creativeFontClasses, FONT_CSS } from "@/lib/scene/fonts";
import { FONT_LABEL, FONT_WEIGHTS, SCENE_FORMATS, type FontId } from "@/lib/scene/model";
import { addAssets, useLibrary } from "@/lib/studio/library";
import { setLook } from "@/lib/studio/projects";
import { useLibraryReady, useThumb } from "./library-hooks";
import { IdentityPreview, type PreviewTab } from "./preset-preview";
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

/** The image style drawn on a sample product by the same renderer as Batch Studio downloads. */
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
        const blob = await renderBatchPreview({ width: cutout.width, height: cutout.height, cutout, bounds: { x: 0, y: 0, w: cutout.width, h: cutout.height }, backgroundImage: null }, settings, exportPolicy(true), 360);
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
    <figure className="grid content-start gap-2">
      <div className="checkerboard flex aspect-square items-center justify-center overflow-hidden rounded-[14px] border border-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL of the rendered preview */}
        {url ? <img src={url} alt="Sample product with this image style" className="max-h-full max-w-full" data-preset-preview /> : <Spinner />}
      </div>
      <figcaption className="text-center text-[12px] text-muted">How Batch Studio exports a product with this style</figcaption>
    </figure>
  );
}

const fieldBase = "h-10 rounded-[10px] border border-line bg-surface px-3 text-[14px] text-ink hover:border-line-strong focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15";
const field = `${fieldBase} w-full`;
const WEIGHT_LABEL: Record<number, string> = { 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold" };

const toInput = (p: BrandPreset): BrandPresetInput => ({ name: p.name, colors: p.colors, layout: p.layout, isDefault: p.isDefault, identity: p.identity ?? DEFAULT_IDENTITY });

function Chips({ colors }: { colors: BrandColor[] }) {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {colors.slice(0, 4).map((c, i) => (
        <span key={i} className="size-4 rounded-[5px] border border-ink/10" style={{ background: c.hex }} />
      ))}
    </span>
  );
}

/** One logo of the preset: a file in this browser's asset library, chosen or uploaded here. */
function LogoSlot({ title, note, dark, value, onChange }: { title: string; note: string; dark?: boolean; value: string | null; onChange: (id: string | null) => void }) {
  const assets = useLibrary((s) => s.assets);
  const logos = useMemo(() => assets.filter((a) => !a.trashedAt && (a.kind === "logo" || a.mime === "image/svg+xml")), [assets]);
  const current = assets.find((a) => a.id === value && !a.trashedAt) ?? null;
  const thumb = useThumb(current?.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const selectId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { added, duplicates, rejected } = await addAssets([file], { kind: "logo" });
      const asset = added[0] ?? duplicates[0]?.of;
      if (asset) onChange(asset.id);
      else setError(rejected[0]?.reason ?? "That file couldn't be added.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be added.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-2" data-logo-slot={title}>
      <div className={cn("flex aspect-[16/5] items-center justify-center overflow-hidden rounded-[12px] border border-line p-4", dark ? "bg-[#17212C]" : "bg-[#F1ECE4]")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        {current && thumb ? <img src={thumb} alt={`${title} logo: ${current.name}`} className="max-h-full max-w-full object-contain" /> : <span className={cn("text-[13px]", dark ? "text-white/70" : "text-ink-3")}>{value && !current ? "Not in this browser's library" : "No logo yet"}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">{title}</p>
          <p className="text-[12px] text-muted">{note}</p>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
        <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()} icon={busy ? <Spinner className="size-3.5" /> : <Replace className="size-3.5" aria-hidden="true" />}>
          {current ? "Replace" : "Upload"}
        </Button>
        {value && (
          <button type="button" onClick={() => onChange(null)} aria-label={`Remove the ${title.toLowerCase()} logo`} className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-danger-50 hover:text-danger">
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {logos.length > 0 && (
        <div className="flex items-center gap-2 text-[12px] text-muted">
          <label htmlFor={selectId}>From your library</label>
          <select id={selectId} value={current?.id ?? ""} onChange={(e) => onChange(e.target.value || null)} className="h-8 min-w-0 flex-1 rounded-[8px] border border-line bg-surface px-2 text-[13px] text-ink">
            <option value="">None</option>
            {logos.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function FontRow({ title, note, value, sample, onChange }: { title: string; note: string; value: BrandFont; sample: string; onChange: (f: BrandFont) => void }) {
  const ids = { font: useId(), weight: useId() };
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[150px_minmax(0,1fr)_130px_minmax(0,1.2fr)]">
      <div>
        <p className="text-[14px] font-semibold text-ink">{title}</p>
        <p className="text-[12px] text-muted">{note}</p>
      </div>
      <div>
        <label htmlFor={ids.font} className="sr-only">
          {title} font
        </label>
        <select id={ids.font} className={field} value={value.font} onChange={(e) => { const font = e.target.value as FontId; onChange({ font, weight: FONT_WEIGHTS[font].includes(value.weight) ? value.weight : FONT_WEIGHTS[font][0] }); }}>
          {(Object.keys(FONT_LABEL) as FontId[]).map((f) => (
            <option key={f} value={f}>
              {FONT_LABEL[f]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={ids.weight} className="sr-only">
          {title} weight
        </label>
        <select id={ids.weight} className={field} value={value.weight} onChange={(e) => onChange({ ...value, weight: Number(e.target.value) })}>
          {FONT_WEIGHTS[value.font].map((w) => (
            <option key={w} value={w}>
              {WEIGHT_LABEL[w] ?? w}
            </option>
          ))}
        </select>
      </div>
      <p className="truncate rounded-[10px] bg-paper px-3 py-2 text-[20px] leading-tight text-ink" style={{ fontFamily: FONT_CSS[value.font], fontWeight: value.weight }} data-font-sample={title}>
        {sample}
      </p>
    </div>
  );
}

type EditorTab = "identity" | "image" | "motion" | "export";
const PREVIEW_FOR: Record<EditorTab, PreviewTab> = { identity: "image", image: "image", motion: "motion", export: "formats" };

function Editor({ initial, id, onSaved, onCancel, onDeleted }: { initial: BrandPresetInput; id: string | null; onSaved: (p: BrandPreset) => void; onCancel: () => void; onDeleted: () => void }) {
  const router = useRouter();
  const save = usePresets((s) => s.save);
  const remove = usePresets((s) => s.remove);
  const projects = useLibrary((s) => s.projects);
  const live = useMemo(() => projects.filter((p) => !p.trashedAt && p.status === "ready"), [projects]);
  const [draft, setDraft] = useState<BrandPresetInput>({ ...initial, identity: initial.identity ?? DEFAULT_IDENTITY });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>("identity");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("image");
  const [applyAfter, setApplyAfter] = useState(false);
  const [toBatch, setToBatch] = useState(false);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const ids = { form: useId(), bg: useId(), canvas: useId(), padding: useId(), x: useId(), y: useId(), format: useId(), style: useId(), duration: useId(), transition: useId(), container: useId(), resolution: useId(), fps: useId() };
  const identity = draft.identity ?? DEFAULT_IDENTITY;
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...initial, identity: initial.identity ?? DEFAULT_IDENTITY });
  const layout = (patch: Partial<BrandLayout>) => setDraft((d) => ({ ...d, layout: { ...d.layout, ...patch } }));
  const ident = (patch: Partial<BrandIdentity>) => setDraft((d) => ({ ...d, identity: { ...(d.identity ?? DEFAULT_IDENTITY), ...patch } }));
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
    const result = await save({ ...checked.value, identity: normaliseIdentity(draft.identity) }, id ?? undefined);
    setSaving(false);
    if (!result.ok) return setErrors([result.message]);
    let note = "Saved to your account.";
    if (applyAfter) {
      const look = presetToBatchSettings(result.preset);
      let done = 0;
      for (const pid of projectIds) {
        const project = live.find((p) => p.id === pid);
        if (!project) continue;
        await setLook(pid, { ...look, keepNames: project.look.keepNames, namePattern: project.look.namePattern }, `Brand preset “${result.preset.name}” applied`);
        done++;
      }
      if (done) note = `Saved, and applied to ${done} project${done === 1 ? "" : "s"}.`;
      if (toBatch) {
        onSaved(result.preset);
        router.push(`/studio/batch?preset=${encodeURIComponent(result.preset.id)}`);
        return;
      }
    }
    setSaved(note);
    onSaved(result.preset);
  }

  const bgValue = draft.layout.background.kind === "brand" ? `brand-${draft.layout.background.index}` : draft.layout.background.kind;
  const formatsOn = new Set(identity.export.formats);

  return (
    <>
      <form id={ids.form} onSubmit={submit} aria-label={id ? "Edit brand preset" : "New brand preset"} className="min-w-0 rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="flex items-end gap-3">
          <span className="grid size-14 shrink-0 grid-cols-2 overflow-hidden rounded-[12px] border border-line" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ background: draft.colors[i]?.hex ?? (i === 0 ? (backgroundHex(draft.layout, draft.colors) ?? "#F5F6F3") : "#F5F6F3") }} />
            ))}
          </span>
          <div className="min-w-0 flex-1">
            <TextField label="Preset name" maxLength={60} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </div>
        </div>

        <Tabs.Root
          value={tab}
          onValueChange={(v) => {
            setTab(v as EditorTab);
            setPreviewTab(PREVIEW_FOR[v as EditorTab]);
          }}
          className="mt-4"
        >
          <Tabs.List aria-label="Preset sections" className="flex gap-1 overflow-x-auto border-b border-line">
            {(
              [
                ["identity", "Identity"],
                ["image", "Image style"],
                ["motion", "Motion"],
                ["export", "Export"],
              ] as const
            ).map(([v, label]) => (
              <Tabs.Trigger key={v} value={v} className="-mb-px h-11 shrink-0 border-b-2 border-transparent px-3.5 text-[15px] font-medium text-muted hover:text-ink data-[state=active]:border-blue data-[state=active]:font-semibold data-[state=active]:text-blue-700">
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="identity" className="grid gap-6 pt-5 focus:outline-none">
            <fieldset>
              <legend className="text-[17px] font-bold text-ink">Brand colours</legend>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Brand colours">
                {draft.colors.map((c, i) => (
                  <li key={i} className="grid gap-1.5">
                    <input type="color" aria-label={`Colour ${i + 1}`} value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : "#000000"} onChange={(e) => setColor(i, { hex: e.target.value.toUpperCase() })} className="h-[72px] w-full cursor-pointer rounded-[12px] border border-line bg-surface p-1" />
                    <div className="flex items-center gap-1">
                      <input aria-label={`Colour ${i + 1} name`} value={c.name} maxLength={30} onChange={(e) => setColor(i, { name: e.target.value })} className="h-8 min-w-0 flex-1 rounded-[8px] border border-transparent px-1.5 text-[14px] font-semibold text-ink hover:border-line focus:border-blue focus:outline-none" />
                      <button type="button" aria-label={`Remove colour ${i + 1}`} onClick={() => removeColor(i)} className="inline-flex size-7 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-danger-50 hover:text-danger">
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <input aria-label={`Colour ${i + 1} hex`} value={c.hex} maxLength={7} onChange={(e) => setColor(i, { hex: e.target.value.trim() })} className="h-7 w-full rounded-[8px] border border-transparent px-1.5 font-mono text-[12px] uppercase text-ink-3 hover:border-line focus:border-blue focus:outline-none" />
                  </li>
                ))}
                {draft.colors.length < MAX_COLORS && (
                  <li>
                    <button type="button" onClick={() => setDraft((d) => ({ ...d, colors: [...d.colors, { name: `Colour ${d.colors.length + 1}`, hex: "#C9D8F2" }] }))} className="grid h-[72px] w-full place-items-center rounded-[12px] border-2 border-dashed border-line-strong text-muted hover:border-blue/60 hover:text-ink">
                      <Plus className="size-5" aria-hidden="true" />
                      <span className="sr-only">Add colour</span>
                    </button>
                    <p className="mt-1.5 px-1.5 text-[13px] text-muted" aria-hidden="true">
                      Add colour
                    </p>
                  </li>
                )}
              </ul>
            </fieldset>

            <fieldset>
              <legend className="text-[17px] font-bold text-ink">Logos</legend>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <LogoSlot title="Primary" note="Main logo, on light backgrounds" value={identity.logos.primary} onChange={(v) => ident({ logos: { ...identity.logos, primary: v } })} />
                <LogoSlot title="Light" note="For dark backgrounds" dark value={identity.logos.light} onChange={(v) => ident({ logos: { ...identity.logos, light: v } })} />
              </div>
              <p className="mt-2 text-[12px] text-muted">Logos are files in this browser&apos;s asset library. The preset remembers which ones; on another device, add them to that library too.</p>
            </fieldset>

            <fieldset className={creativeFontClasses}>
              <legend className="text-[17px] font-bold text-ink">Typography</legend>
              <div className="mt-3 grid gap-4">
                <FontRow title="Heading" note="For titles and key messages" value={identity.typography.heading} sample={draft.name || "Your brand"} onChange={(heading) => ident({ typography: { ...identity.typography, heading } })} />
                <FontRow title="Body" note="For captions and details" value={identity.typography.body} sample="Aa Bb Cc 123" onChange={(body) => ident({ typography: { ...identity.typography, body } })} />
              </div>
              <p className="mt-2 text-[12px] text-muted">New titles in Scene Studio and Motion Studio start in the heading typeface.</p>
            </fieldset>
          </Tabs.Content>

          <Tabs.Content value="image" className="grid gap-5 pt-5 focus:outline-none lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="grid content-start gap-4">
              <h3 className="text-[17px] font-bold text-ink">Default image style</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label htmlFor={ids.bg} className="text-[13px] font-medium text-ink">
                    Background
                  </label>
                  <select id={ids.bg} className={field} value={bgValue} onChange={(e) => { const v = e.target.value; layout({ background: v === "transparent" || v === "white" ? { kind: v } : { kind: "brand", index: Number(v.slice(6)) } }); }}>
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
                  <input id={ids.padding} type="range" min={0} max={MAX_PADDING} value={draft.layout.padding} disabled={draft.layout.canvas === "framing"} onChange={(e) => layout({ padding: Number(e.target.value) })} className="h-10 w-full accent-blue" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <label htmlFor={ids.x} className="text-[13px] font-medium text-ink">
                      Horizontal
                    </label>
                    <select id={ids.x} className={field} value={draft.layout.align.x} onChange={(e) => layout({ align: { ...draft.layout.align, x: Number(e.target.value) as 0 | 0.5 | 1 } })}>
                      <option value={0}>Left</option>
                      <option value={0.5}>Centre</option>
                      <option value={1}>Right</option>
                    </select>
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor={ids.y} className="text-[13px] font-medium text-ink">
                      Vertical
                    </label>
                    <select id={ids.y} className={field} value={draft.layout.align.y} onChange={(e) => layout({ align: { ...draft.layout.align, y: Number(e.target.value) as 0 | 0.5 | 1 } })}>
                      <option value={0}>Top</option>
                      <option value={0.5}>Middle</option>
                      <option value={1}>Bottom</option>
                    </select>
                  </div>
                </div>
              </div>
              <CheckboxField label="Soft shadow under the product" checked={draft.layout.shadow} onChange={(e) => layout({ shadow: e.target.checked })} />
              <p className="text-[13px] text-ink-3">{describeLayout(draft.layout, draft.colors)}.</p>
            </div>
            <LivePreview draft={draft} />
          </Tabs.Content>

          <Tabs.Content value="motion" className="grid gap-4 pt-5 focus:outline-none">
            <h3 className="text-[17px] font-bold text-ink">Motion defaults</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <label htmlFor={ids.style} className="text-[13px] font-medium text-ink">
                  Motion style
                </label>
                <select id={ids.style} className={field} value={identity.motion.style} onChange={(e) => ident({ motion: { ...identity.motion, style: e.target.value as BrandIdentity["motion"]["style"] } })}>
                  {MOTION_STYLE_IDS.map((s) => (
                    <option key={s} value={s}>
                      {MOTION_STYLE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={ids.duration} className="text-[13px] font-medium text-ink">
                  Length: {identity.motion.duration} seconds
                </label>
                <input id={ids.duration} type="range" min={3} max={30} step={0.5} value={identity.motion.duration} onChange={(e) => ident({ motion: { ...identity.motion, duration: Number(e.target.value) } })} className="h-10 w-full accent-blue" />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor={ids.transition} className="text-[13px] font-medium text-ink">
                  Transitions
                </label>
                <select id={ids.transition} className={field} value={identity.motion.transition} onChange={(e) => ident({ motion: { ...identity.motion, transition: e.target.value as BrandIdentity["motion"]["transition"] } })}>
                  {BRAND_TRANSITIONS.map((t) => (
                    <option key={t} value={t}>
                      {BRAND_TRANSITION_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-ink-3">Animate scene starts from this style, length and transition when this is your default preset. They&apos;re only a starting point: every film can be changed in Motion Studio. The preview on the right is the real renderer.</p>
          </Tabs.Content>

          <Tabs.Content value="export" className="grid gap-5 pt-5 focus:outline-none">
            <div className="grid gap-3">
              <h3 className="text-[17px] font-bold text-ink">Images</h3>
              <div className="grid gap-1.5 sm:max-w-[240px]">
                <label htmlFor={ids.format} className="text-[13px] font-medium text-ink">
                  Format
                </label>
                <select id={ids.format} className={field} value={draft.layout.format} onChange={(e) => layout({ format: e.target.value as "png" | "jpeg" })}>
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </div>
              <fieldset>
                <legend className="text-[13px] font-medium text-ink">Formats made from a scene</legend>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  {BRAND_FORMATS.map((f) => (
                    <CheckboxField
                      key={f}
                      label={SCENE_FORMATS[f].label}
                      checked={formatsOn.has(f)}
                      onChange={(e) => {
                        const next = BRAND_FORMATS.filter((x) => (x === f ? e.target.checked : formatsOn.has(x)));
                        if (next.length) ident({ export: { ...identity.export, formats: next } });
                      }}
                    />
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="grid gap-3">
              <h3 className="text-[17px] font-bold text-ink">Video</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <label htmlFor={ids.container} className="text-[13px] font-medium text-ink">
                    File type
                  </label>
                  <select id={ids.container} className={field} value={identity.export.container} onChange={(e) => ident({ export: { ...identity.export, container: e.target.value as "mp4" | "webm" } })}>
                    <option value="mp4">MP4 (H.264)</option>
                    <option value="webm">WebM (VP9)</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor={ids.resolution} className="text-[13px] font-medium text-ink">
                    Resolution
                  </label>
                  <select id={ids.resolution} className={field} value={identity.export.resolution} onChange={(e) => ident({ export: { ...identity.export, resolution: Number(e.target.value) as 720 | 1080 | 2160 } })}>
                    <option value={720}>720p</option>
                    <option value={1080}>1080p</option>
                    <option value={2160}>4K</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor={ids.fps} className="text-[13px] font-medium text-ink">
                    Frame rate
                  </label>
                  <select id={ids.fps} className={field} value={identity.export.fps} onChange={(e) => ident({ export: { ...identity.export, fps: Number(e.target.value) as 24 | 25 | 30 | 60 } })}>
                    {[24, 25, 30, 60].map((f) => (
                      <option key={f} value={f}>
                        {f} fps
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-[13px] text-ink-3">New films start with these. Motion Studio only offers what your browser can actually encode, and Free exports keep the watermark and size limit.</p>
            </div>
          </Tabs.Content>
        </Tabs.Root>

        {errors.length > 0 && (
          <div className="mt-4">
            <FormAlert>
              <ul className="grid gap-1">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </FormAlert>
          </div>
        )}
      </form>

      <aside aria-label="Preview and apply" className={cn("grid content-start gap-5 rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow-card)]", creativeFontClasses)}>
        <IdentityPreview draft={draft} tab={previewTab} onTab={setPreviewTab} />
        <fieldset className="grid gap-2.5 border-t border-line pt-4">
          <legend className="float-left mb-1 w-full text-[16px] font-bold text-ink">Apply to</legend>
          <CheckboxField label="Use as my default preset" checked={draft.isDefault === true} onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))} />
          <p className="-mt-1.5 pl-7 text-[12px] text-muted">New projects, scenes and films start from the default.</p>
          <CheckboxField
            label="Batch Studio"
            checked={toBatch}
            onChange={(e) => {
              setToBatch(e.target.checked);
              if (e.target.checked) setApplyAfter(true);
            }}
          />
          <p className="-mt-1.5 pl-7 text-[12px] text-muted">Opens Batch Studio with this look loaded, after saving.</p>
          {live.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-[14px] text-ink">Selected projects</p>
              <ul className="grid max-h-[132px] gap-1 overflow-y-auto pl-1" aria-label="Projects to apply this look to">
                {live.map((p) => (
                  <li key={p.id}>
                    <CheckboxField
                      label={p.name}
                      checked={projectIds.includes(p.id)}
                      onChange={(e) => {
                        setProjectIds((list) => (e.target.checked ? [...list, p.id] : list.filter((x) => x !== p.id)));
                        if (e.target.checked) setApplyAfter(true);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>
      </aside>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:col-span-3" data-preset-bar>
        <p className="min-w-0 flex-1 truncate text-[15px]" aria-live="polite">
          <span className="font-bold text-ink">{draft.name || "Untitled preset"}</span>
          <span className={cn("ml-2 text-[13px]", dirty ? "text-warn" : "text-muted")}>{dirty ? (id ? "Unsaved changes" : "Not created yet") : (saved ?? (id ? "Saved to your account" : "Not created yet"))}</span>
        </p>
        {id && (
          <AlertDialog.Root>
            <AlertDialog.Trigger asChild>
              <button type="button" className="inline-flex h-10 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold text-danger hover:bg-danger-50">
                <Trash2 className="size-4" aria-hidden="true" /> Delete
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-[18px] bg-surface p-6 shadow-[var(--shadow-float)]">
                <AlertDialog.Title className="font-display text-lg font-bold">Delete “{initial.name}”?</AlertDialog.Title>
                <AlertDialog.Description className="mt-1.5 text-sm text-muted">Images and films that already use its look keep it. This can&apos;t be undone.</AlertDialog.Description>
                <div className="mt-5 flex justify-end gap-2">
                  <AlertDialog.Cancel asChild>
                    <Button variant="secondary">Cancel</Button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <Button variant="danger" onClick={() => void remove(id).then((ok) => ok && onDeleted())}>
                      Delete preset
                    </Button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        )}
        <CheckboxField label="Apply after saving" checked={applyAfter} disabled={!toBatch && projectIds.length === 0} onChange={(e) => setApplyAfter(e.target.checked)} />
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {dirty ? "Cancel" : "Close"}
        </Button>
        <Button type="submit" form={ids.form} disabled={saving || (!dirty && !!id && !applyAfter)} icon={saving ? <Spinner /> : undefined}>
          {id ? "Save preset" : "Create preset"}
        </Button>
      </div>
    </>
  );
}

/** A preset as a file, to move between accounts or keep a copy. Logos aren't included (they're local files). */
function exportPresetFile(p: BrandPreset) {
  const body = { isolaBrandPreset: 1, name: p.name, colors: p.colors, layout: p.layout, identity: { ...p.identity, logos: { primary: null, light: null } } };
  downloadBlob(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }), `${p.name.replace(/[^\p{L}\p{N}\-_ ]+/gu, "").replace(/\s+/g, "-") || "brand-preset"}.isola-preset.json`);
}

type Selection = { key: number; id: string | null; initial: BrandPresetInput };

export function PresetsManager() {
  const router = useRouter();
  const params = useSearchParams();
  useLibraryReady();
  const presets = usePresets((s) => s.presets);
  const error = usePresets((s) => s.error);
  const load = usePresets((s) => s.load);
  const [sel, setSel] = useState<Selection | null>(null);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const wantsNew = params.get("new") === "1";
  const full = (presets?.length ?? 0) >= MAX_PRESETS;

  useEffect(() => {
    void load();
  }, [load]);

  const open = (id: string | null, initial: BrandPresetInput) => setSel((prev) => ({ key: (prev?.key ?? 0) + 1, id, initial }));
  const startNew = (from?: BrandPresetInput) =>
    open(null, from ?? { ...STARTER_PRESET, name: presets?.length ? `Brand preset ${presets.length + 1}` : STARTER_PRESET.name, isDefault: !presets?.length, identity: DEFAULT_IDENTITY });

  // Once the list is known: ?new=1 (from "Create → Brand preset") starts a new one; otherwise the default preset opens.
  const [initialised, setInitialised] = useState(false);
  if (presets && !initialised) {
    setInitialised(true);
    if (wantsNew && presets.length < MAX_PRESETS) startNew();
    else if (presets.length) open(presets[0].id, toInput(presets[0]));
  }
  useEffect(() => {
    if (initialised && wantsNew) router.replace("/studio/presets", { scroll: false });
  }, [initialised, wantsNew, router]);

  const shown = (presets ?? []).filter((p) => !query.trim() || `${p.name} ${p.colors.map((c) => `${c.name} ${c.hex}`).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const current = sel?.id ? (presets?.find((p) => p.id === sel.id) ?? null) : null;

  async function importFile(file: File) {
    setNotice(null);
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const checked = validatePreset({ ...raw, isDefault: false });
      if (!checked.ok) return setNotice({ tone: "error", text: `That file isn't a usable preset: ${checked.errors[0]}` });
      const taken = new Set((presets ?? []).map((p) => p.name.toLowerCase()));
      const name = taken.has(checked.value.name.toLowerCase()) ? `${checked.value.name} (imported)`.slice(0, 60) : checked.value.name;
      startNew({ ...checked.value, name, identity: normaliseIdentity({ ...(checked.value.identity ?? {}), logos: {} }) });
      setNotice({ tone: "ok", text: `Imported “${name}”. Review it, then choose Create preset to save it to your account.` });
    } catch {
      setNotice({ tone: "error", text: "That file couldn't be read as a preset. Choose a .isola-preset.json file exported from ISOLA." });
    }
  }

  return (
    <div className="mx-auto max-w-[1560px] px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[40px]">Brand presets</h1>
          <p className="mt-2 max-w-[620px] text-[17px] text-ink-3">One visual identity. Across every image and film.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" data-testid="preset-import" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }} />
          <Button size="lg" variant="secondary" onClick={() => importRef.current?.click()} disabled={!presets || full} icon={<Import className="size-4" aria-hidden="true" />}>
            Import preset
          </Button>
          <Button size="lg" onClick={() => startNew()} disabled={!presets || full} icon={<Plus className="size-4" aria-hidden="true" />}>
            New preset
          </Button>
        </div>
      </header>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={cn("mt-4 rounded-[12px] px-4 py-2.5 text-[14px]", notice.tone === "error" ? "bg-danger-50 text-danger" : "bg-success-50 text-success")}>
          {notice.text}
        </p>
      )}
      {error && !presets && (
        <div className="mt-4">
          <FormAlert>{error}</FormAlert>
        </div>
      )}
      {!presets && !error && (
        <p className="mt-6 flex items-center gap-2 text-[14px] text-muted">
          <Spinner /> Loading presets…
        </p>
      )}

      {presets && (
        <div className="mt-6 grid items-start gap-5 xl:grid-cols-[260px_minmax(0,1fr)_380px]">
          <aside aria-label="Your presets" className="grid content-start gap-3 rounded-[18px] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
            <h2 className="font-display text-[20px] font-bold text-ink">Your presets</h2>
            <label className="relative block">
              <span className="sr-only">Search presets</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search presets" className="h-10 w-full rounded-[10px] border border-line bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-blue focus:ring-3 focus:ring-blue/15" />
            </label>
            {presets.length === 0 ? (
              <p className="rounded-[12px] border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-muted">No brand presets yet. Create one and every image and film can share your look.</p>
            ) : (
              <ul className="grid gap-2" aria-label="Your brand presets">
                {shown.map((p) => {
                  const active = sel?.id === p.id;
                  return (
                    <li key={p.id} data-preset={p.name}>
                      <button type="button" onClick={() => open(p.id, toInput(p))} aria-pressed={active} className={cn("flex w-full items-center gap-3 rounded-[12px] border p-2 text-left", active ? "border-blue bg-blue-50/60 shadow-[0_0_0_1px_var(--color-blue)]" : "border-transparent hover:border-line hover:bg-paper")}>
                        <span className="size-14 shrink-0 rounded-[10px] border border-ink/10" style={{ background: backgroundHex(p.layout, p.colors) ?? p.colors[0]?.hex ?? "#F5F6F3" }} aria-hidden="true" />
                        <span className="grid min-w-0 gap-1">
                          <span className="truncate text-[15px] font-semibold text-ink">{p.name}</span>
                          <span className="flex items-center gap-2">
                            <Chips colors={p.colors} />
                            {p.isDefault && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-700">Default</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {shown.length === 0 && <li className="px-2 py-4 text-center text-[13px] text-muted">No presets match “{query}”.</li>}
              </ul>
            )}
            <div className="grid gap-2 border-t border-line pt-3">
              <Button variant="secondary" disabled={!current || full} onClick={() => current && startNew({ ...toInput(current), name: `${current.name} copy`.slice(0, 60), isDefault: false })} icon={<Copy className="size-4" aria-hidden="true" />}>
                Duplicate preset
              </Button>
              <Button variant="ghost" disabled={!current} onClick={() => current && exportPresetFile(current)} icon={<Download className="size-4" aria-hidden="true" />}>
                Export as a file
              </Button>
              {full && <p className="text-[12px] text-muted">You have {MAX_PRESETS} presets, the most an account can have.</p>}
            </div>
          </aside>

          {sel ? (
            <Editor
              key={sel.key}
              initial={sel.initial}
              id={sel.id}
              onSaved={(p) => {
                setNotice(null);
                open(p.id, toInput(p));
              }}
              onCancel={() => {
                const back = sel.id ? presets.find((p) => p.id === sel.id) : presets[0];
                if (back) open(back.id, toInput(back));
                else setSel(null);
              }}
              onDeleted={() => {
                const rest = (usePresets.getState().presets ?? []).filter((p) => p.id !== sel.id);
                if (rest[0]) open(rest[0].id, toInput(rest[0]));
                else setSel(null);
              }}
            />
          ) : (
            <div className="rounded-[18px] border-2 border-dashed border-line-strong px-6 py-16 text-center xl:col-span-2">
              <p className="text-[17px] font-semibold text-ink">{presets.length ? "Choose a preset to edit" : "No brand presets yet"}</p>
              <p className="mx-auto mt-1 max-w-[460px] text-[14px] text-muted">Colours, logos, typography and the default look for your images and films, saved to your account.</p>
              <Button className="mt-4" onClick={() => startNew()} disabled={full} icon={<Plus className="size-4" aria-hidden="true" />}>
                {presets.length ? "New preset" : "Create your first preset"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
