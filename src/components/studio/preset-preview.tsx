"use client";

import { useEffect, useMemo, useState } from "react";
import { FilmPreview } from "@/components/motion/kit-preview";
import { SceneThumb } from "@/components/scene/scene-canvas";
import { BRAND_FORMATS, DEFAULT_IDENTITY, MOTION_STYLE_LABEL, type BrandPresetInput } from "@/lib/brand-presets";
import { cn } from "@/lib/cn";
import { filmFromScene } from "@/lib/motion/scene-link";
import { secs, filmDuration } from "@/lib/motion/time";
import { brandPreviewScene } from "@/lib/scene/brand-preview";
import { SCENE_FORMATS } from "@/lib/scene/model";
import { loadSampleProduct } from "@/lib/scene/resources";
import { useLibrary } from "@/lib/studio/library";

export type PreviewTab = "image" | "motion" | "formats";

/**
 * "Preview your identity": the preset on a product, as a still, as a film in
 * its default motion style, and in every format it exports. All three are
 * drawn by the same renderers as Scene Studio and Motion Studio.
 */
export function IdentityPreview({ draft, tab, onTab }: { draft: BrandPresetInput; tab: PreviewTab; onTab: (t: PreviewTab) => void }) {
  const assets = useLibrary((s) => s.assets);
  const cutouts = useMemo(() => assets.filter((a) => !a.trashedAt && a.hasAlpha && a.kind !== "logo").slice(0, 12), [assets]);
  const [sample, setSample] = useState<{ id: string; aspect: number } | null>(null);
  const [productId, setProductId] = useState("sample");
  useEffect(() => {
    let alive = true;
    void loadSampleProduct().then((s) => alive && setSample(s));
    return () => {
      alive = false;
    };
  }, []);
  const identity = draft.identity ?? DEFAULT_IDENTITY;
  const chosen = cutouts.find((c) => c.id === productId);
  const product = chosen ? { id: chosen.id, aspect: chosen.width / Math.max(1, chosen.height) } : sample;
  const logoAsset = assets.find((a) => a.id === identity.logos.primary && !a.trashedAt);
  const logo = logoAsset ? { id: logoAsset.id, aspect: logoAsset.width / Math.max(1, logoAsset.height) } : null;
  const key = JSON.stringify([draft.name, draft.colors, draft.layout, identity, product, logo]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` summarises everything the scenes depend on
  const scenes = useMemo(() => Object.fromEntries(BRAND_FORMATS.map((f) => [f, brandPreviewScene(draft, product, f, logo)])), [key]);
  const film = useMemo(
    () => filmFromScene(scenes.wide, { kitId: identity.motion.style, brand: draft.colors.map((c) => c.hex), defaults: { duration: identity.motion.duration, transition: identity.motion.transition } }),
    [scenes, identity.motion.style, identity.motion.duration, identity.motion.transition, draft.colors],
  );
  return (
    <div className="grid gap-4" data-identity-preview>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-[20px] font-bold text-ink">Preview your identity</h2>
      </div>
      <div role="tablist" aria-label="Preview" className="flex border-b border-line">
        {(["image", "motion", "formats"] as PreviewTab[]).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onTab(t)} className={cn("-mb-px h-10 border-b-2 px-3 text-[14px] font-medium capitalize", tab === t ? "border-blue font-semibold text-blue-700" : "border-transparent text-muted hover:text-ink")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "image" && (
        <>
          <SceneThumb scene={scenes.portrait} format="portrait" size={720} label="Your identity on a product" className="block h-auto w-full rounded-[12px] border border-line" />
          <div>
            <p className="text-[14px] font-semibold text-ink">Export previews</p>
            <div className="mt-2 grid grid-cols-3 items-end gap-3">
              {(["square", "portrait", "wide"] as const).map((f) => (
                <figure key={f} className="grid gap-1 text-center">
                  <SceneThumb scene={scenes[f]} format={f} label={`${SCENE_FORMATS[f].label} preview`} className="mx-auto block h-auto max-h-[110px] w-auto max-w-full rounded-[8px] border border-line" />
                  <figcaption className="text-[12px] text-muted">{SCENE_FORMATS[f].label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </>
      )}
      {tab === "motion" && (
        <>
          <FilmPreview film={film} playing label={`${MOTION_STYLE_LABEL[identity.motion.style]} preview`} className="aspect-video rounded-[12px] border border-line object-contain" />
          <p className="text-[13px] text-ink-3" data-motion-summary>
            {MOTION_STYLE_LABEL[identity.motion.style]} · {secs(filmDuration(film))} · {film.shots.length} shot{film.shots.length === 1 ? "" : "s"}. This is what Animate scene starts from; every film stays editable.
          </p>
        </>
      )}
      {tab === "formats" && (
        <div className="grid grid-cols-2 gap-3">
          {identity.export.formats.map((f) => (
            <figure key={f} className="grid content-end gap-1 text-center">
              <SceneThumb scene={scenes[f]} format={f} label={`${SCENE_FORMATS[f].label} preview`} className="mx-auto block h-auto max-h-[190px] w-auto max-w-full rounded-[8px] border border-line" />
              <figcaption className="text-[12px] text-muted">
                {SCENE_FORMATS[f].label} · {SCENE_FORMATS[f].width} × {SCENE_FORMATS[f].height}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      <label className="grid gap-1 text-[12px] text-muted">
        Preview with
        <select value={chosen ? productId : "sample"} onChange={(e) => setProductId(e.target.value)} className="h-9 rounded-[9px] border border-line bg-surface px-2 text-[13px] text-ink">
          <option value="sample">ISOLA&apos;s sample product</option>
          {cutouts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
