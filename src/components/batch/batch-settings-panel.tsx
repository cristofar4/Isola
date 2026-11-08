"use client";

import { Check, Plus, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ACCEPT_ATTRIBUTE } from "@/lib/config";
import { cn } from "@/lib/cn";
import { useBatch } from "@/lib/batch/batch-store";
import {
  BATCH_SOFT_GREY,
  BATCH_WHITE,
  CANVAS_LABEL,
  MAX_CUSTOM_SIDE,
  formatLabel,
  usesLayout,
  type BatchSettings,
  type CanvasPreset,
} from "@/lib/batch/settings";
import { addBackgroundImage } from "@/lib/project/actions";
import { useProject } from "@/lib/project/store";

function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("grid gap-3 border-t border-line py-4 first:border-t-0 first:pt-0", className)}>
      <legend className="float-left mb-3 w-full text-[15px] font-semibold text-ink">{title}</legend>
      {children}
    </fieldset>
  );
}

function Swatch({
  label,
  checked,
  onSelect,
  children,
  className,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className="group grid justify-items-center gap-1.5 text-xs text-muted">
      <span
        className={cn(
          "relative flex h-12 w-full items-center justify-center overflow-hidden rounded-[10px] border transition-shadow",
          checked ? "border-blue shadow-[0_0_0_1px_var(--color-blue)]" : "border-line group-hover:border-line-strong",
          className,
        )}
      >
        {children}
        {checked && (
          <span className="absolute bottom-1 right-1 inline-flex size-4 items-center justify-center rounded bg-blue text-white">
            <Check className="size-3" aria-hidden="true" />
          </span>
        )}
      </span>
      <span className={cn(checked && "font-medium text-ink")}>{label}</span>
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

export function BatchSettingsPanel({ onApplied }: { onApplied?: () => void }) {
  const draft = useBatch((s) => s.draft);
  const setDraft = useBatch((s) => s.setDraft);
  const selected = useBatch((s) => s.selected);
  const apply = useBatch((s) => s.apply);
  const backgrounds = useProject((s) => s.backgrounds);
  const [customColor, setCustomColor] = useState("#C9D8F2");
  const [uploading, setUploading] = useState(false);
  // Remember which selection a message belongs to, so it clears when the selection changes.
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; selection?: string[] } | null>(null);
  const visibleMessage = message && (!message.selection || message.selection === selected) ? message : null;
  const [applying, setApplying] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const ids = { canvas: useId(), padding: useId(), format: useId(), width: useId(), height: useId() };
  const update = (patch: Partial<BatchSettings>) => {
    setMessage(null);
    setDraft({ ...draft, ...patch });
  };
  const bg = draft.background;
  const layout = usesLayout(draft);
  const isColor = (c: string) => bg.kind === "color" && bg.color.toUpperCase() === c.toUpperCase();
  const isCustomColor = bg.kind === "color" && !isColor(BATCH_WHITE) && !isColor(BATCH_SOFT_GREY);
  const count = selected.length;

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <h2 className="font-display text-[22px] font-bold tracking-tight text-ink">Batch settings</h2>
        <p className="text-[13px] text-muted">Apply to selected images</p>
      </div>

      <Group title="Background">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Background">
          <Swatch label="Transparent" checked={bg.kind === "transparent"} onSelect={() => update({ background: { kind: "transparent" } })} className="checkerboard-sm" />
          <Swatch label="White" checked={isColor(BATCH_WHITE)} onSelect={() => update({ background: { kind: "color", color: BATCH_WHITE } })} className="bg-white" />
          <Swatch label="Soft grey" checked={isColor(BATCH_SOFT_GREY)} onSelect={() => update({ background: { kind: "color", color: BATCH_SOFT_GREY } })} className="bg-[#EEEFEC]" />
          <Swatch
            label="Custom"
            checked={isCustomColor}
            onSelect={() => update({ background: { kind: "color", color: customColor } })}
            className={isCustomColor ? undefined : "bg-surface"}
          >
            {isCustomColor ? <span className="absolute inset-0" style={{ background: bg.kind === "color" ? bg.color : undefined }} /> : <Plus className="size-5 text-muted" aria-hidden="true" />}
          </Swatch>
          {backgrounds.map((b) => (
            <Swatch
              key={b.id}
              label={b.name.length > 10 ? `${b.name.slice(0, 9)}…` : b.name}
              checked={bg.kind === "image" && bg.assetId === b.id}
              onSelect={() => update({ background: { kind: "image", assetId: b.id, name: b.name } })}
            >
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
            {uploading ? <Spinner /> : <Upload className="size-4" aria-hidden="true" />} Upload background
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setUploading(true);
              const result = await addBackgroundImage(file);
              setUploading(false);
              if ("error" in result) setMessage({ tone: "error", text: result.error });
              else update({ background: { kind: "image", assetId: result.id, name: file.name } });
            }}
          />
        </div>
      </Group>

      <Group title="Canvas size">
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
        <div className="grid grid-cols-3 gap-2">
          {(["square", "portrait", "custom"] as CanvasPreset[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={draft.canvas === c}
              onClick={() => update({ canvas: draft.canvas === c ? "framing" : c })}
              className={cn(
                "h-9 rounded-[10px] border text-[13px] font-medium transition-colors",
                draft.canvas === c ? "border-blue bg-blue-50 text-blue-700" : "border-line text-ink hover:bg-paper",
              )}
            >
              {c === "square" ? "Square 1:1" : c === "portrait" ? "Portrait 4:5" : "Custom"}
            </button>
          ))}
        </div>
        {draft.canvas === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            {(["width", "height"] as const).map((side) => (
              <label key={side} htmlFor={ids[side]} className="grid gap-1 text-xs text-muted">
                {side === "width" ? "Width (px)" : "Height (px)"}
                <input
                  id={ids[side]}
                  type="number"
                  min={16}
                  max={MAX_CUSTOM_SIDE}
                  value={draft.customSize[side]}
                  onChange={(e) => update({ customSize: { ...draft.customSize, [side]: Math.round(Number(e.target.value)) || 0 } })}
                  className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm tabular-nums text-ink focus:border-blue focus:outline-none"
                />
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">
          {draft.canvas === "framing"
            ? "Keeps each photo's own size and composition. Choose another canvas to reposition the subject."
            : draft.canvas === "custom"
              ? `Up to ${MAX_CUSTOM_SIDE.toLocaleString("en-US")}px per side.`
              : "Presets keep each photo's longest side, so nothing is downscaled."}
        </p>
      </Group>

      <Group title="Layout">
        {!layout && <p className="-mt-1 text-xs text-muted">Choose a canvas size above to reposition the subject.</p>}
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] font-medium text-ink">Fit</span>
          <Segmented
            label="Fit"
            className="w-[220px]"
            value={draft.fit}
            options={[
              { value: "contain", label: "Contain", disabled: !layout },
              { value: "cover", label: "Cover", disabled: !layout },
            ]}
            onChange={(fit) => update({ fit })}
          />
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Slider label="Padding" value={draft.padding} min={0} max={40} onChange={(padding) => update({ padding })} format={(v) => `${v}%`} disabled={!layout} />
          <label htmlFor={ids.padding} className="sr-only">
            Padding percentage
          </label>
          <div className="relative">
            <input
              id={ids.padding}
              type="number"
              min={0}
              max={40}
              disabled={!layout}
              value={draft.padding}
              onChange={(e) => update({ padding: Math.min(40, Math.max(0, Math.round(Number(e.target.value)) || 0)) })}
              className="h-9 w-[72px] rounded-lg border border-line bg-surface pl-2.5 pr-6 text-sm tabular-nums text-ink focus:border-blue focus:outline-none disabled:bg-paper-2"
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
                    "inline-flex size-7 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    on ? "border-blue bg-blue text-white" : "border-line-strong bg-surface hover:border-blue/60",
                  )}
                >
                  {on && <span className="size-1.5 rounded-full bg-white" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </Group>

      <Group title="Shadow">
        <Switch label="Soft shadow" description="Cast beneath the subject from its outline." checked={draft.shadow} onChange={(shadow) => update({ shadow })} />
      </Group>

      <Group title="Export">
        <label htmlFor={ids.format} className="sr-only">
          Export format
        </label>
        <select
          id={ids.format}
          value={draft.format}
          onChange={(e) => update({ format: e.target.value as BatchSettings["format"] })}
          className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-ink focus:border-blue focus:outline-none"
        >
          <option value="png">{formatLabel({ ...draft, format: "png" })}</option>
          <option value="jpeg">JPEG</option>
        </select>
        {draft.format === "jpeg" && bg.kind === "transparent" && <p className="text-xs text-muted">JPEG can&apos;t be transparent, so empty areas become white.</p>}
        <Switch
          label="Keep original filenames"
          description={draft.keepNames ? "sneakers.jpg → sneakers.png" : "sneakers.jpg → sneakers-isola.png"}
          checked={draft.keepNames}
          onChange={(keepNames) => update({ keepNames })}
        />
      </Group>

      <div className="sticky bottom-0 -mx-5 mt-2 grid gap-2 border-t border-line bg-surface px-5 pb-4 pt-4">
        <Button
          size="lg"
          disabled={count === 0 || applying}
          icon={applying ? <Spinner className="size-5" /> : undefined}
          onClick={async () => {
            setApplying(true);
            await apply(selected, draft);
            setApplying(false);
            setMessage({ tone: "ok", text: `Applied to ${count} image${count === 1 ? "" : "s"}.`, selection: selected });
            onApplied?.();
          }}
        >
          {count === 0 ? "Select images to apply" : `Apply to ${count} image${count === 1 ? "" : "s"}`}
        </Button>
        <p aria-live="polite" className={cn("min-h-4 text-center text-xs", visibleMessage?.tone === "error" ? "text-danger" : "text-success")}>
          {visibleMessage?.text}
        </p>
      </div>
    </div>
  );
}
