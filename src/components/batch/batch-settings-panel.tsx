"use client";

import { Check, Plus, RotateCcw, Upload } from "lucide-react";
import { Tabs } from "radix-ui";
import { useId, useRef, useState } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ACCEPT_ATTRIBUTE } from "@/lib/config";
import { cn } from "@/lib/cn";
import { addBatchBackground, applySettings, draftIsApplied, hasUnappliedEdits, targetIds, targetsMixed, useBatch } from "@/lib/batch/batch-store";
import {
  BATCH_SOFT_GREY,
  BATCH_WHITE,
  CANVAS_LABEL,
  DEFAULT_BATCH_SETTINGS,
  DEFAULT_NAME_PATTERN,
  MAX_CUSTOM_SIDE,
  MAX_PADDING,
  MIN_CUSTOM_SIDE,
  canvasSize,
  customSizeError,
  exportName,
  usesLayout,
  type BatchSettings,
  type CanvasPreset,
} from "@/lib/batch/settings";
import { useProject } from "@/lib/project/store";

export type SettingsTab = "background" | "layout" | "export";

/** Which tab is open, shared by the desktop panel, the mobile drawer and the export bar. */
export const useSettingsTab = create<{ tab: SettingsTab; setTab: (tab: SettingsTab) => void }>((set) => ({
  tab: "background",
  setTab: (tab) => set({ tab }),
}));

function Field({ title, children, className, hint }: { title: string; children: React.ReactNode; className?: string; hint?: React.ReactNode }) {
  return (
    <fieldset className={cn("grid gap-3 border-t border-line py-4 first:border-t-0 first:pt-1", className)}>
      <legend className="float-left mb-1 w-full text-[14px] font-semibold text-ink">{title}</legend>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
    </fieldset>
  );
}

function Swatch({ label, checked, onSelect, children, className }: { label: string; checked: boolean; onSelect: () => void; children?: React.ReactNode; className?: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} aria-label={label} onClick={onSelect} className="group grid justify-items-center gap-1.5 text-xs text-muted">
      <span
        className={cn(
          "relative flex h-14 w-full items-center justify-center overflow-hidden rounded-[10px] border transition-shadow",
          checked ? "border-blue shadow-[0_0_0_1px_var(--color-blue)]" : "border-line group-hover:border-line-strong",
          className,
        )}
      >
        {children}
        {checked && (
          <span className="absolute inset-0 m-auto inline-flex size-6 items-center justify-center rounded-full bg-blue text-white shadow">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className={cn("max-w-full truncate", checked && "font-medium text-ink")} aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

const ALIGN: Array<{ x: 0 | 0.5 | 1; y: 0 | 0.5 | 1; label: string }> = [
  { x: 0, y: 0, label: "Top left" },
  { x: 0.5, y: 0, label: "Top centre" },
  { x: 1, y: 0, label: "Top right" },
  { x: 0, y: 0.5, label: "Middle left" },
  { x: 0.5, y: 0.5, label: "Centre" },
  { x: 1, y: 0.5, label: "Middle right" },
  { x: 0, y: 1, label: "Bottom left" },
  { x: 0.5, y: 1, label: "Bottom centre" },
  { x: 1, y: 1, label: "Bottom right" },
];

const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm tabular-nums text-ink focus:border-blue focus:outline-none disabled:bg-paper-2 aria-[invalid=true]:border-danger";

function BackgroundTab({ draft, update, onError }: { draft: BatchSettings; update: (p: Partial<BatchSettings>) => void; onError: (m: string) => void }) {
  const backgrounds = useProject((s) => s.backgrounds);
  const [customColor, setCustomColor] = useState("#C9D8F2");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = draft.background;
  const isColor = (c: string) => bg.kind === "color" && bg.color.toUpperCase() === c.toUpperCase();
  const isCustomColor = bg.kind === "color" && !isColor(BATCH_WHITE) && !isColor(BATCH_SOFT_GREY);
  return (
    <Field title="Background" hint={bg.kind === "transparent" ? "Exports keep real transparency. The checkerboard is only shown on screen." : undefined}>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Background">
        <Swatch label="Transparent" checked={bg.kind === "transparent"} onSelect={() => update({ background: { kind: "transparent" } })} className="checkerboard-sm" />
        <Swatch label="White" checked={isColor(BATCH_WHITE)} onSelect={() => update({ background: { kind: "color", color: BATCH_WHITE } })} className="bg-white" />
        <Swatch label="Soft grey" checked={isColor(BATCH_SOFT_GREY)} onSelect={() => update({ background: { kind: "color", color: BATCH_SOFT_GREY } })} className="bg-[#EEEFEC]" />
        <Swatch label="Custom" checked={isCustomColor} onSelect={() => update({ background: { kind: "color", color: customColor } })} className={isCustomColor ? undefined : "bg-surface"}>
          {isCustomColor ? <span className="absolute inset-0" style={{ background: bg.kind === "color" ? bg.color : undefined }} /> : <Plus className="size-5 text-muted" aria-hidden="true" />}
        </Swatch>
        {backgrounds.map((b) => (
          <Swatch key={b.id} label={b.name} checked={bg.kind === "image" && bg.assetId === b.id} onSelect={() => update({ background: { kind: "image", assetId: b.id, name: b.name } })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" />
          </Swatch>
        ))}
      </div>
      {isCustomColor && (
        <label className="flex items-center justify-between text-[13px] font-medium text-ink">
          Custom colour
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase text-muted">{bg.kind === "color" ? bg.color : ""}</span>
            <input
              type="color"
              value={bg.kind === "color" ? bg.color : customColor}
              onChange={(e) => {
                setCustomColor(e.target.value.toUpperCase());
                update({ background: { kind: "color", color: e.target.value.toUpperCase() } });
              }}
              aria-label="Custom background colour"
              className="h-8 w-10 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
            />
          </span>
        </label>
      )}
      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-700 hover:underline disabled:opacity-60"
        >
          {uploading ? <Spinner /> : <Upload className="size-4" aria-hidden="true" />} Upload background image…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="batch-background-file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            const result = await addBatchBackground(file);
            setUploading(false);
            if ("error" in result) onError(result.error);
            else update({ background: { kind: "image", assetId: result.id, name: file.name } });
          }}
        />
      </div>
    </Field>
  );
}

function LayoutTab({ draft, update }: { draft: BatchSettings; update: (p: Partial<BatchSettings>) => void }) {
  const ids = { canvas: useId(), padding: useId(), width: useId(), height: useId() };
  const layout = usesLayout(draft);
  const sizeError = draft.canvas === "custom" ? customSizeError(draft.customSize) : null;
  return (
    <>
      <Field
        title="Canvas"
        hint={
          draft.canvas === "framing"
            ? "Keeps each photo's own size and composition. Choose another canvas to place the subject with padding and alignment."
            : draft.canvas === "custom"
              ? `Every image is exported at exactly this size (${MIN_CUSTOM_SIDE}–${MAX_CUSTOM_SIDE.toLocaleString("en-US")}px per side).`
              : "Presets keep each photo's longest side, so nothing is downscaled."
        }
      >
        <label htmlFor={ids.canvas} className="sr-only">
          Canvas size
        </label>
        <select
          id={ids.canvas}
          value={draft.canvas}
          onChange={(e) => update({ canvas: e.target.value as CanvasPreset })}
          className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none"
        >
          {(Object.keys(CANVAS_LABEL) as CanvasPreset[]).map((c) => (
            <option key={c} value={c}>
              {CANVAS_LABEL[c]}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Presets:</span>
          {(["framing", "square", "portrait", "custom"] as CanvasPreset[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={draft.canvas === c}
              onClick={() => update({ canvas: c })}
              className={cn(
                "h-8 rounded-[8px] border px-2.5 text-[13px] font-medium transition-colors",
                draft.canvas === c ? "border-blue bg-blue-50 text-blue-700" : "border-line text-ink hover:bg-paper",
              )}
            >
              {c === "framing" ? "Original" : c === "square" ? "Square (1:1)" : c === "portrait" ? "Portrait (4:5)" : "Custom"}
            </button>
          ))}
        </div>
        {draft.canvas === "custom" && (
          <div className="grid gap-1.5">
            <div className="grid grid-cols-2 gap-2">
              {(["width", "height"] as const).map((side) => (
                <label key={side} htmlFor={ids[side]} className="grid gap-1 text-xs text-muted">
                  {side === "width" ? "Width (px)" : "Height (px)"}
                  <input
                    id={ids[side]}
                    type="number"
                    inputMode="numeric"
                    min={MIN_CUSTOM_SIDE}
                    max={MAX_CUSTOM_SIDE}
                    value={Number.isFinite(draft.customSize[side]) ? draft.customSize[side] : ""}
                    aria-invalid={Boolean(sizeError)}
                    onChange={(e) => update({ customSize: { ...draft.customSize, [side]: Math.round(Number(e.target.value)) } })}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
            {sizeError && (
              <p role="alert" className="text-xs text-danger">
                {sizeError}
              </p>
            )}
          </div>
        )}
      </Field>

      <Field title="Placement" hint={layout ? "Padding is measured as a share of the canvas's shorter side." : "Choose a canvas other than Original to use these."}>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] font-medium text-ink">Fit</span>
          <Segmented
            label="Fit"
            className="w-[220px]"
            value={draft.fit}
            options={[
              { value: "contain", label: "Contain", disabled: !layout, title: "The whole subject fits inside the padding" },
              { value: "cover", label: "Cover", disabled: !layout, title: "The subject fills the padded area and may be cropped" },
            ]}
            onChange={(fit) => update({ fit })}
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Slider label="Padding" value={draft.padding} min={0} max={MAX_PADDING} onChange={(padding) => update({ padding })} format={(v) => `${v}%`} disabled={!layout} />
          <label htmlFor={ids.padding} className="sr-only">
            Padding percentage
          </label>
          <div className="relative">
            <input
              id={ids.padding}
              type="number"
              min={0}
              max={MAX_PADDING}
              disabled={!layout}
              value={draft.padding}
              onChange={(e) => update({ padding: Math.min(MAX_PADDING, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
              className={cn(inputClass, "w-[72px] pr-6")}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-4">
          <span className="text-[13px] font-medium text-ink">Alignment</span>
          <div role="radiogroup" aria-label="Alignment" className="grid grid-cols-3 gap-1.5">
            {ALIGN.map((a) => {
              const on = draft.align.x === a.x && draft.align.y === a.y;
              return (
                <button
                  key={a.label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={a.label}
                  disabled={!layout}
                  onClick={() => update({ align: { x: a.x, y: a.y } })}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "border-blue bg-blue text-white" : "border-line-strong bg-surface hover:border-blue/60",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", on ? "bg-white" : "bg-line-strong")} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      </Field>

      <Field title="Shadow">
        <Switch label="Soft shadow" description="A soft shadow cast beneath the subject, in previews and exports." checked={draft.shadow} onChange={(shadow) => update({ shadow })} />
      </Field>
    </>
  );
}

function ExportTab({ draft, update, sample }: { draft: BatchSettings; update: (p: Partial<BatchSettings>) => void; sample: { name: string; width: number; height: number } | null }) {
  const ids = { format: useId(), matte: useId(), pattern: useId() };
  const project = useBatch((s) => s.name);
  const transparent = draft.background.kind === "transparent";
  const out = sample ? canvasSize(draft, sample.width, sample.height) : null;
  const exampleName = sample ? exportName(sample.name, draft, new Set(), { index: 1, total: 1, project }) : null;
  return (
    <>
      <Field
        title="Format"
        hint={
          draft.format === "png"
            ? transparent
              ? "PNG with a real alpha channel."
              : "Lossless PNG with the background you chose."
            : "JPEG is always opaque and smaller than PNG."
        }
      >
        <label htmlFor={ids.format} className="sr-only">
          Export format
        </label>
        <select
          id={ids.format}
          value={draft.format}
          onChange={(e) => update({ format: e.target.value as BatchSettings["format"] })}
          className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none"
        >
          <option value="png">{transparent ? "PNG · Transparent" : "PNG · With background"}</option>
          <option value="jpeg">JPEG · Opaque</option>
        </select>
        {draft.format === "jpeg" && (transparent || draft.background.kind === "image") && (
          <label htmlFor={ids.matte} className="flex items-center justify-between gap-3 text-[13px] text-ink">
            <span>
              <span className="font-medium">JPEG fill colour</span>
              <span className="block text-xs text-muted">{transparent ? "Fills the transparent areas." : "Shows through any transparent parts of the background image."}</span>
            </span>
            <input
              id={ids.matte}
              type="color"
              value={draft.matte}
              onChange={(e) => update({ matte: e.target.value.toUpperCase() })}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
            />
          </label>
        )}
      </Field>
      <Field title="Output size">
        <p className="text-[13px] text-ink">
          {draft.canvas === "framing"
            ? "Each image keeps its original resolution."
            : draft.canvas === "custom"
              ? `Every image: ${draft.customSize.width} × ${draft.customSize.height} px.`
              : `${CANVAS_LABEL[draft.canvas]}, sized from each photo's longest side.`}
        </p>
        {sample && out && (
          <p className="text-xs text-muted">
            For example, {sample.name} ({sample.width} × {sample.height}) exports at{" "}
            <span className="font-semibold tabular-nums text-ink">
              {out.width} × {out.height} px
            </span>
            . Change the canvas in Layout.
          </p>
        )}
      </Field>
      <Field title="File names">
        <Switch
          label="Keep original filenames"
          description={draft.keepNames ? "sneakers.jpg → sneakers.png" : "Use the pattern below."}
          checked={draft.keepNames}
          onChange={(keepNames) => update({ keepNames })}
        />
        {!draft.keepNames && (
          <label htmlFor={ids.pattern} className="grid gap-1 text-xs text-muted">
            Naming pattern
            <input
              id={ids.pattern}
              value={draft.namePattern}
              maxLength={80}
              placeholder={DEFAULT_NAME_PATTERN}
              onChange={(e) => update({ namePattern: e.target.value })}
              className={cn(inputClass, "font-mono")}
            />
            <span>
              Use <code className="font-mono text-ink">{"{name}"}</code>, <code className="font-mono text-ink">{"{n}"}</code> (position in the batch) and{" "}
              <code className="font-mono text-ink">{"{project}"}</code>.
            </span>
          </label>
        )}
        {exampleName && (
          <p className="text-xs text-muted">
            Example: <span className="font-mono text-ink">{exampleName}</span>. Duplicate names get -2, -3…
          </p>
        )}
      </Field>
    </>
  );
}

export function BatchSettingsPanel({ onApplied, inSheet }: { onApplied?: () => void; inSheet?: boolean }) {
  const draft = useBatch((s) => s.draft);
  const draftEdited = useBatch((s) => s.draftEdited);
  const setDraft = useBatch((s) => s.setDraft);
  const items = useBatch((s) => s.items);
  const selected = useBatch((s) => s.selected);
  const tab = useSettingsTab((s) => s.tab);
  const setTab = useSettingsTab((s) => s.setTab);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [applying, setApplying] = useState(false);
  const update = (p: Partial<BatchSettings>) => {
    setMessage(null);
    setDraft({ ...draft, ...p });
  };
  const targets = targetIds({ items, selected });
  const count = targets.length;
  const scope = selected.length ? `${count} selected image${count === 1 ? "" : "s"}` : count === 1 ? "1 image" : `all ${count} images`;
  const applied = draftIsApplied({ items, selected, draft });
  const unapplied = hasUnappliedEdits({ items, selected, draft, draftEdited });
  const mixed = targetsMixed({ items, selected });
  const invalid = draft.canvas === "custom" ? customSizeError(draft.customSize) : null;
  const sampleItem = items.find((i) => targets.includes(i.id)) ?? null;
  const sample = sampleItem ? { name: sampleItem.name, width: sampleItem.width, height: sampleItem.height } : null;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!inSheet && <h2 className="font-display text-[22px] font-bold tracking-tight text-ink">Batch settings</h2>}
        {count > 0 && (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700" aria-live="polite">
            Applies to {scope}
          </span>
        )}
      </div>

      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className="mt-3">
        <Tabs.List aria-label="Settings sections" className="grid grid-cols-3 border-b border-line">
          {(["background", "layout", "export"] as SettingsTab[]).map((t) => (
            <Tabs.Trigger
              key={t}
              value={t}
              className="-mb-px h-10 border-b-2 border-transparent text-[14px] font-medium capitalize text-muted transition-colors hover:text-ink data-[state=active]:border-blue data-[state=active]:font-semibold data-[state=active]:text-blue-700"
            >
              {t}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="background" className="pt-4 focus:outline-none">
          <BackgroundTab draft={draft} update={update} onError={(text) => setMessage({ tone: "error", text })} />
        </Tabs.Content>
        <Tabs.Content value="layout" className="pt-4 focus:outline-none">
          <LayoutTab draft={draft} update={update} />
        </Tabs.Content>
        <Tabs.Content value="export" className="pt-4 focus:outline-none">
          <ExportTab draft={draft} update={update} sample={sample} />
        </Tabs.Content>
      </Tabs.Root>

      <div className="sticky bottom-0 -mx-5 mt-2 grid gap-2 border-t border-line bg-surface px-5 pb-4 pt-3">
        <p className={cn("text-xs", unapplied ? "font-medium text-warn" : "text-muted")} aria-live="polite">
          {count === 0
            ? "Add images to apply settings."
            : applied
              ? `These settings are applied to ${scope}.`
              : unapplied
                ? "Not applied yet. Downloads use each image's applied settings until you apply these."
                : mixed
                  ? `These images have different settings. Applying gives ${count === 1 ? "it" : `all ${count}`} the settings shown here.`
                  : `Applying changes ${scope} to the settings shown here.`}
        </p>
        <Button
          size="lg"
          disabled={count === 0 || applying || Boolean(invalid)}
          icon={applying ? <Spinner className="size-5" /> : undefined}
          onClick={async () => {
            setApplying(true);
            try {
              await applySettings(targets, draft);
              setMessage({ tone: "ok", text: `Applied to ${count} image${count === 1 ? "" : "s"}. No reprocessing needed.` });
              onApplied?.();
            } catch (e) {
              setMessage({ tone: "error", text: e instanceof Error ? e.message : "Couldn't apply these settings." });
            } finally {
              setApplying(false);
            }
          }}
        >
          {count === 0 ? "No images yet" : selected.length ? `Apply to ${count} selected` : count === 1 ? "Apply to 1 image" : `Apply to all ${count} images`}
        </Button>
        <button
          type="button"
          onClick={() => update(DEFAULT_BATCH_SETTINGS)}
          className="mx-auto inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-700 hover:underline"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" /> Reset to default
        </button>
        <p aria-live="polite" className={cn("min-h-4 text-center text-xs", message?.tone === "error" ? "text-danger" : "text-success")}>
          {message?.text}
        </p>
      </div>
    </div>
  );
}
