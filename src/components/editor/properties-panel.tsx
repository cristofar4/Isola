"use client";

import { Download, ImagePlus, Lock, RotateCcw, Server, Wand2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { formatBytes, ACCEPT_ATTRIBUTE } from "@/lib/config";
import { clampRect } from "@/lib/editor/geometry";
import { maskBounds } from "@/lib/editor/mask-ops";
import { BACKGROUND_SWATCHES, cropOf, type EditSettings } from "@/lib/editor/types";
import { detectWebGPU } from "@/lib/processing/capabilities";
import { MODELS } from "@/lib/processing/models";
import { fetchRemoteCapabilities } from "@/lib/processing/remote/remote-engine";
import { type EngineId } from "@/lib/processing/registry";
import {
  addBackgroundImage,
  commitSettings,
  previewSettings,
  processImage,
  resetMask,
  updateSettings,
} from "@/lib/project/actions";
import { imageAssets } from "@/lib/project/assets";
import { useProject, type ProjectImage } from "@/lib/project/store";
import { aspectRatioOf, BRUSH_MAX, BRUSH_MIN, useEditorUI, type AspectPreset } from "./editor-ui-store";

function Section({ title, children, className, sectionRef }: { title: string; children: ReactNode; className?: string; sectionRef?: Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} className={cn("border-b border-line px-4 py-4 transition-colors duration-700", className)} aria-label={title}>
      <h3 className="mb-3 text-[13px] font-semibold text-ink">{title}</h3>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

/** Live preview while dragging, one undo step when released. */
function useSettingsDrag(image: ProjectImage) {
  const start = useRef<EditSettings | null>(null);
  const latest = useRef<EditSettings>(image.settings);
  return {
    change(patch: (s: EditSettings) => EditSettings) {
      const current = useProject.getState().images.find((i) => i.id === image.id)?.settings ?? image.settings;
      start.current ??= current;
      latest.current = patch(current);
      previewSettings(image.id, latest.current);
    },
    commit(label: string) {
      if (!start.current) return;
      commitSettings(image.id, label, start.current, latest.current);
      start.current = null;
    },
  };
}

function EngineSection({ image }: { image: ProjectImage }) {
  const engineId = useProject((s) => s.engineId);
  const setEngine = useProject((s) => s.setEngine);
  const [webgpu, setWebgpu] = useState<boolean | null>(null);
  const [remote, setRemote] = useState<{ configured: boolean; label: string | null }>({ configured: false, label: null });
  useEffect(() => {
    void detectWebGPU().then(setWebgpu);
    void fetchRemoteCapabilities().then((c) => setRemote({ configured: c.configured, label: c.providerLabel }));
  }, []);

  const options = [
    { value: "device:isnet-general-use" as EngineId, label: MODELS["isnet-general-use"].label },
    {
      value: "device:birefnet-lite" as EngineId,
      label: MODELS["birefnet-lite"].label,
      disabled: webgpu === false,
      title: webgpu === false ? "Needs WebGPU, which this browser doesn't provide" : undefined,
    },
    ...(remote.configured ? [{ value: "server:remote" as EngineId, label: "Server" }] : []),
  ];
  const server = engineId === "server:remote";
  const model = server ? null : MODELS[engineId.slice(7) as keyof typeof MODELS];
  const differs = image.result && image.result.engineId !== engineId;
  const busy = image.status === "processing" || image.status === "queued" || image.status === "decoding";

  return (
    <Section title="Background removal">
      <Segmented label="Removal model" value={engineId} options={options} onChange={setEngine} />
      <div className="text-xs leading-relaxed text-muted">
        <p>{server ? "Uses the server provider configured for this site." : model?.description}</p>
        <p className="mt-1.5 flex items-center gap-1.5">
          {server ? <Server className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
          {server
            ? `Your image is uploaded${remote.label ? ` to ${remote.label}` : ""}.`
            : `Runs on this device. One-time ${formatBytes(model!.bytes)} model download.`}
        </p>
        {webgpu === false && !server && (
          <p className="mt-1.5">High detail is unavailable here because this browser doesn&apos;t expose WebGPU.</p>
        )}
      </div>
      {(differs || image.status === "error" || image.status === "cancelled") && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void processImage(image.id)}
          icon={<Wand2 className="size-3.5" aria-hidden="true" />}
        >
          {differs ? `Reprocess with ${options.find((o) => o.value === engineId)?.label}` : "Process again"}
        </Button>
      )}
    </Section>
  );
}

function BrushSection({ image }: { image: ProjectImage }) {
  const tool = useEditorUI((s) => s.tool);
  const setTool = useEditorUI((s) => s.setTool);
  const brushSize = useEditorUI((s) => s.brushSize);
  const setBrushSize = useEditorUI((s) => s.setBrushSize);
  const hardness = useEditorUI((s) => s.brushHardness);
  const setHardness = useEditorUI((s) => s.setBrushHardness);
  const mode = tool === "erase" ? "erase" : "restore";
  return (
    <Section title="Brush">
      <Segmented
        label="Brush mode"
        value={mode}
        options={[
          { value: "restore", label: "Restore" },
          { value: "erase", label: "Erase" },
        ]}
        onChange={(v) => setTool(v)}
      />
      <p className="-mt-1 text-xs leading-relaxed text-muted">
        {mode === "restore"
          ? "Paint to bring back original pixels the model removed."
          : "Paint to remove areas the model kept. Only the mask changes."}
      </p>
      <Slider label="Size" value={brushSize} min={BRUSH_MIN} max={BRUSH_MAX} onChange={setBrushSize} format={(v) => `${v} px`} />
      <Slider
        label="Softness"
        value={Math.round((1 - hardness) * 100)}
        min={0}
        max={100}
        onChange={(v) => setHardness(1 - v / 100)}
        format={(v) => `${v}%`}
      />
      <p className="text-[11px] text-muted">Shortcuts: [ and ] change size. Hold Space to pan.</p>
      <Button variant="ghost" size="sm" className="justify-start px-2" onClick={() => resetMask(image.id)} icon={<RotateCcw className="size-3.5" aria-hidden="true" />}>
        Reset to automatic result
      </Button>
    </Section>
  );
}

function EdgesSection({ image }: { image: ProjectImage }) {
  const drag = useSettingsDrag(image);
  const { feather, shift } = image.settings;
  return (
    <Section title="Edges">
      <Slider
        label="Feather"
        value={feather}
        min={0}
        max={20}
        onChange={(v) => drag.change((s) => ({ ...s, feather: v }))}
        onCommit={() => drag.commit("Feather")}
        format={(v) => `${v} px`}
      />
      <Slider
        label="Edge shift"
        value={shift}
        min={-10}
        max={10}
        onChange={(v) => drag.change((s) => ({ ...s, shift: v }))}
        onCommit={() => drag.commit("Edge shift")}
        format={(v) => `${v > 0 ? "+" : ""}${v} px`}
      />
      <p className="-mt-1 text-xs leading-relaxed text-muted">Shift inwards to trim halos; feather to soften hard edges.</p>
    </Section>
  );
}

function BackgroundSection({ image }: { image: ProjectImage }) {
  const backgrounds = useProject((s) => s.backgrounds);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const bg = image.settings.background;
  const [rememberedColor, setRememberedColor] = useState("#FFFFFF");
  const lastColor = bg.kind === "color" ? bg.color : rememberedColor;
  const colorDrag = useSettingsDrag(image);
  // Arriving from "Change background" in the Tools menu: bring this section into view once.
  const sectionRef = useRef<HTMLElement>(null);
  const intent = useEditorUI((s) => s.intent);
  const pending = useEditorUI((s) => s.intentPending);
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (intent !== "background" || !pending || !sectionRef.current?.offsetParent) return;
    sectionRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    useEditorUI.getState().clearIntentPending();
    const on = window.setTimeout(() => setHighlight(true), 0);
    const off = window.setTimeout(() => setHighlight(false), 1600);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
    };
  }, [intent, pending]);

  return (
    <Section title="Background" sectionRef={sectionRef} className={highlight ? "bg-blue-50" : undefined}>
      <Segmented
        label="Background type"
        value={bg.kind}
        options={[
          { value: "transparent", label: "None" },
          { value: "color", label: "Colour" },
          { value: "image", label: "Image" },
        ]}
        onChange={(kind) => {
          if (bg.kind === "color") setRememberedColor(bg.color);
          if (kind === "transparent") updateSettings(image.id, "Background", { background: { kind: "transparent" } });
          else if (kind === "color") updateSettings(image.id, "Background", { background: { kind: "color", color: lastColor } });
          else if (backgrounds.length) {
            const b = backgrounds.at(-1)!;
            updateSettings(image.id, "Background", { background: { kind: "image", assetId: b.id, name: b.name } });
          } else fileRef.current?.click();
        }}
      />
      {bg.kind === "transparent" && (
        <p className="-mt-1 text-xs text-muted">The checkerboard only shows transparency. It&apos;s never exported.</p>
      )}
      {bg.kind === "color" && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour swatches">
            {BACKGROUND_SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={bg.color.toUpperCase() === color}
                aria-label={color}
                onClick={() => updateSettings(image.id, "Background colour", { background: { kind: "color", color } })}
                className={cn(
                  "size-8 rounded-full border border-line-strong transition-transform hover:scale-110",
                  bg.color.toUpperCase() === color && "ring-2 ring-blue ring-offset-2",
                )}
                style={{ background: color }}
              />
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 text-[13px] font-medium">
            Custom colour
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase text-muted">{bg.color}</span>
              <input
                type="color"
                value={bg.color.length === 7 ? bg.color : "#ffffff"}
                onChange={(e) => colorDrag.change((s) => ({ ...s, background: { kind: "color", color: e.target.value.toUpperCase() } }))}
                onBlur={() => colorDrag.commit("Background colour")}
                className="h-8 w-10 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
              />
            </span>
          </label>
        </div>
      )}
      {bg.kind === "image" && backgrounds.length > 0 && (
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Background images">
          {backgrounds.map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={bg.assetId === b.id}
              aria-label={b.name}
              onClick={() => updateSettings(image.id, "Background image", { background: { kind: "image", assetId: b.id, name: b.name } })}
              className={cn(
                "relative aspect-square overflow-hidden rounded-lg border border-line",
                bg.assetId === b.id && "ring-2 ring-blue ring-offset-2",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.thumbUrl} alt="" className="absolute inset-0 size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {(bg.kind === "image" || backgrounds.length > 0) && (
        <Button
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          icon={<ImagePlus className="size-3.5" aria-hidden="true" />}
        >
          Upload background image
        </Button>
      )}
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
          setError(null);
          const result = await addBackgroundImage(file);
          setUploading(false);
          if ("error" in result) setError(result.error);
          else updateSettings(image.id, "Background image", { background: { kind: "image", assetId: result.id, name: file.name } });
        }}
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {bg.kind === "image" && <p className="-mt-1 text-xs text-muted">The image fills the frame, centred and cropped to fit.</p>}
    </Section>
  );
}

function ShadowSection({ image }: { image: ProjectImage }) {
  const drag = useSettingsDrag(image);
  const shadow = image.settings.shadow;
  const set = (label: string, patch: Partial<EditSettings["shadow"]>) =>
    updateSettings(image.id, label, { shadow: { ...image.settings.shadow, ...patch } });
  return (
    <Section title="Shadow">
      <Switch
        label="Drop shadow"
        description="Cast from the subject's own outline."
        checked={shadow.enabled}
        onChange={(enabled) => set(enabled ? "Add shadow" : "Remove shadow", { enabled })}
      />
      {shadow.enabled && (
        <div className="grid animate-fade-in gap-4">
          <Slider
            label="Opacity"
            value={Math.round(shadow.opacity * 100)}
            min={0}
            max={100}
            onChange={(v) => drag.change((s) => ({ ...s, shadow: { ...s.shadow, opacity: v / 100 } }))}
            onCommit={() => drag.commit("Shadow opacity")}
            format={(v) => `${v}%`}
          />
          <Slider
            label="Softness"
            value={shadow.softness}
            min={0}
            max={100}
            onChange={(v) => drag.change((s) => ({ ...s, shadow: { ...s.shadow, softness: v } }))}
            onCommit={() => drag.commit("Shadow softness")}
          />
          <Slider
            label="Distance"
            value={shadow.distance}
            min={0}
            max={100}
            onChange={(v) => drag.change((s) => ({ ...s, shadow: { ...s.shadow, distance: v } }))}
            onCommit={() => drag.commit("Shadow distance")}
          />
          <Slider
            label="Angle"
            value={shadow.angle}
            min={0}
            max={359}
            onChange={(v) => drag.change((s) => ({ ...s, shadow: { ...s.shadow, angle: v } }))}
            onCommit={() => drag.commit("Shadow angle")}
            format={(v) => `${v}°`}
          />
          <label className="flex items-center justify-between text-[13px] font-medium">
            Colour
            <input
              type="color"
              value={shadow.color}
              onChange={(e) => drag.change((s) => ({ ...s, shadow: { ...s.shadow, color: e.target.value } }))}
              onBlur={() => drag.commit("Shadow colour")}
              className="h-8 w-10 cursor-pointer rounded-md border border-line bg-transparent p-0.5"
            />
          </label>
        </div>
      )}
    </Section>
  );
}

const ASPECTS: Array<{ value: AspectPreset; label: string }> = [
  { value: "free", label: "Free" },
  { value: "original", label: "Original" },
  { value: "1:1", label: "1:1" },
  { value: "4:5", label: "4:5" },
  { value: "3:2", label: "3:2" },
  { value: "16:9", label: "16:9" },
];

function CropSection({ image }: { image: ProjectImage }) {
  const aspect = useEditorUI((s) => s.aspect);
  const setAspect = useEditorUI((s) => s.setAspect);
  const setTool = useEditorUI((s) => s.setTool);
  const crop = cropOf(image.settings, image.width, image.height);

  function fitToSubject() {
    const layers = imageAssets.get(image.id)?.layers;
    if (!layers) return;
    const bounds = maskBounds(layers.refined, image.width, image.height, 12);
    if (!bounds) return;
    const pad = Math.round(Math.max(bounds.w, bounds.h) * 0.05);
    let rect = { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + pad * 2, h: bounds.h + pad * 2 };
    const ratio = aspectRatioOf(aspect, image.width, image.height);
    if (ratio) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      if (rect.w / rect.h < ratio) rect.w = rect.h * ratio;
      else rect.h = rect.w / ratio;
      rect = { x: cx - rect.w / 2, y: cy - rect.h / 2, w: rect.w, h: rect.h };
    }
    const clamped = clampRect(rect, image.width, image.height);
    if (clamped) updateSettings(image.id, "Fit to subject", { crop: clamped, output: null });
  }

  return (
    <Section title="Crop">
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Aspect ratio">
        {ASPECTS.map((a) => (
          <button
            key={a.value}
            type="button"
            role="radio"
            aria-checked={aspect === a.value}
            onClick={() => {
              setAspect(a.value);
              setTool("crop");
            }}
            className={cn(
              "h-8 rounded-lg border text-[13px] font-medium transition-colors",
              aspect === a.value ? "border-blue bg-blue-50 text-blue-700" : "border-line text-ink hover:bg-paper",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="text-xs tabular-nums text-muted">
        Crop: {Math.round(crop.w)} × {Math.round(crop.h)} px {image.settings.crop ? "" : "(full image)"}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={fitToSubject}>
          Fit to subject
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!image.settings.crop}
          onClick={() => updateSettings(image.id, "Reset crop", { crop: null, output: null })}
        >
          Reset crop
        </Button>
      </div>
    </Section>
  );
}

export function PropertiesPanel({ image }: { image: ProjectImage }) {
  const tool = useEditorUI((s) => s.tool);
  const setExportOpen = useEditorUI((s) => s.setExportOpen);
  const ready = image.status === "ready";
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {image.batchItemId && (
          <p className="mx-4 mt-4 rounded-[10px] border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-ink-3">
            <span className="font-semibold text-ink">From Batch Studio.</span> Brush and edge changes and the background go back to
            this image in the batch automatically. Canvas size, layout and file format are set in Batch Studio.
          </p>
        )}
        <EngineSection image={image} />
        {ready ? (
          <>
            {(tool === "restore" || tool === "erase") && <BrushSection image={image} />}
            {tool === "crop" && <CropSection image={image} />}
            <EdgesSection image={image} />
            <BackgroundSection image={image} />
            <ShadowSection image={image} />
            {tool !== "crop" && <CropSection image={image} />}
          </>
        ) : (
          <p className="px-4 py-6 text-sm text-muted">Editing tools appear once the background has been removed.</p>
        )}
      </div>
      <div className="border-t border-line p-4">
        <Button className="w-full" disabled={!ready} onClick={() => setExportOpen(true)} icon={<Download className="size-4" aria-hidden="true" />}>
          Export image
        </Button>
      </div>
    </div>
  );
}
