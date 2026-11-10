import { describe, expect, it } from "vitest";
import { CATALOGUE_PRESET, DEFAULT_BATCH_SETTINGS, normaliseSettings, type BatchSettings } from "@/lib/batch/settings";
import { STARTER_PRESET, presetToBatchSettings, validatePreset } from "@/lib/brand-presets";
import { amazonSettings, analyseMask, checkCollection, flaggedCount, outputGeometry, type CheckEntry } from "@/lib/consistency";
import { DESTINATIONS, destinationById, destinationSettings, folderFor } from "@/lib/export-sets";
import { canvasSize, placement } from "@/lib/batch/settings";
import { exportPolicy } from "@/lib/plan-policy";

const PRO = exportPolicy(true);
const FREE = exportPolicy(false);

/** A w×h mask with filled rectangles (x, y, w, h). */
function mask(w: number, h: number, rects: Array<[number, number, number, number]>) {
  const m = new Uint8Array(w * h);
  for (const [rx, ry, rw, rh] of rects) for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) m[y * w + x] = 255;
  return m;
}

function entry(id: string, settings: Partial<BatchSettings> = {}, extra: Partial<CheckEntry> = {}): CheckEntry {
  return {
    id,
    name: `${id}.jpg`,
    width: 2000,
    height: 2000,
    bounds: { x: 500, y: 400, w: 1000, h: 1200 },
    settings: normaliseSettings({ ...CATALOGUE_PRESET, ...settings }),
    review: null,
    stats: { touches: [], fragments: 0 },
    ...extra,
  };
}

describe("analyseMask", () => {
  it("sees a subject that runs into the bottom edge", () => {
    expect(analyseMask(mask(100, 100, [[30, 40, 40, 60]]), 100, 100).touches).toEqual(["bottom"]);
  });
  it("leaves a centred subject alone", () => {
    expect(analyseMask(mask(100, 100, [[30, 30, 40, 40]]), 100, 100)).toEqual({ touches: [], fragments: 0 });
  });
  it("counts small stray pieces but not a second real part", () => {
    const specks = mask(200, 200, [[50, 50, 100, 100], [5, 5, 3, 3], [190, 10, 4, 4]]);
    expect(analyseMask(specks, 200, 200).fragments).toBe(2);
    const pair = mask(200, 200, [[20, 60, 70, 80], [110, 60, 70, 80]]);
    expect(analyseMask(pair, 200, 200).fragments).toBe(0);
  });
});

describe("checkCollection", () => {
  it("finds the one image whose settings differ, and the fix matches the others", () => {
    const odd = entry("c", { canvas: "framing", padding: 0 });
    const report = checkCollection([entry("a"), entry("b"), odd], { target: null, policy: PRO });
    const issue = report.issues.find((i) => i.kind === "different-settings");
    expect(issue?.itemId).toBe("c");
    expect(issue?.detail).toContain("Original framing instead of Square 1:1");
    expect(issue?.fix?.kind === "settings" && issue.fix.changes[0].settings.canvas).toBe("square");
    expect(flaggedCount(report)).toBe(1);
  });

  it("doesn't call a shared crop a fault", () => {
    const cropped = { touches: ["bottom" as const], fragments: 0 };
    const report = checkCollection([entry("a", {}, { stats: cropped }), entry("b", {}, { stats: cropped }), entry("c", {}, { stats: cropped })], { target: null, policy: PRO });
    expect(report.issues.filter((i) => i.kind === "cut-off")).toHaveLength(0);
    const single = checkCollection([entry("a", {}, { stats: cropped }), entry("b"), entry("c")], { target: null, policy: PRO });
    expect(single.issues.find((i) => i.kind === "cut-off")?.itemId).toBe("a");
  });

  it("checks Amazon's rules on the real output geometry", () => {
    // The catalogue preset uses 10% padding: the product fills 80%, under Amazon's 85%.
    const report = checkCollection([entry("a")], { target: "amazon", policy: PRO });
    expect(report.issues.map((i) => i.kind)).toEqual(["fill"]);
    const fix = report.bulk.fill;
    expect(fix?.kind).toBe("settings");
    const fixed = fix && fix.kind === "settings" ? fix.changes[0].settings : null;
    expect(fixed?.padding).toBe(5);
    const after = checkCollection([entry("a", fixed!)], { target: "amazon", policy: PRO });
    expect(after.issues).toHaveLength(0);
  });

  it("flags transparency, watermark and small sizes for Amazon", () => {
    const transparent = entry("t", { background: { kind: "transparent" }, format: "png", padding: 4 }, { width: 800, height: 600, bounds: { x: 100, y: 100, w: 600, h: 400 } });
    const report = checkCollection([transparent], { target: "amazon", policy: FREE });
    const kinds = report.issues.map((i) => i.kind).sort();
    expect(kinds).toEqual(["background", "size", "watermark"]);
    const fixed = amazonSettings(transparent.settings, 800, 600);
    expect(fixed.canvas).toBe("custom");
    expect(canvasSize(fixed, 800, 600)).toEqual({ width: 1000, height: 1000 });
  });

  it("checks Instagram's aspect range", () => {
    const tall = entry("a", { canvas: "custom", customSize: { width: 1080, height: 1920 } });
    const report = checkCollection([tall], { target: "instagram", policy: PRO });
    const aspect = report.issues.find((i) => i.kind === "aspect");
    expect(aspect?.title).toBe("Too tall for a post");
    expect(aspect?.fix?.kind === "settings" && aspect.fix.changes[0].settings.canvas).toBe("portrait");
  });

  it("reports subjects much smaller than the rest when keeping the photo's framing", () => {
    const framing = { canvas: "framing" as const };
    const small = entry("s", framing, { bounds: { x: 900, y: 900, w: 300, h: 300 } });
    const report = checkCollection([entry("a", framing), entry("b", framing), small], { target: null, policy: PRO });
    expect(report.issues.find((i) => i.kind === "scale")?.itemId).toBe("s");
    expect(report.bulk.scale?.kind === "settings" && report.bulk.scale.changes.every((c) => c.settings.canvas === "original")).toBe(true);
  });

  it("measures enlargement after the plan's size limit", () => {
    const tiny = entry("a", { padding: 0 }, { bounds: { x: 900, y: 900, w: 200, h: 200 } });
    expect(outputGeometry(tiny, PRO).enlargement).toBeCloseTo(10);
    expect(checkCollection([tiny], { target: null, policy: PRO }).issues.some((i) => i.kind === "enlarged")).toBe(true);
    // Free exports are capped at 1,000px, so the same subject is enlarged half as much.
    expect(outputGeometry(tiny, FREE).enlargement).toBeCloseTo(5);
  });
});

describe("export sets", () => {
  it("re-targets the canvas and keeps the image's look", () => {
    const base = normaliseSettings({ ...DEFAULT_BATCH_SETTINGS, shadow: true, background: { kind: "color", color: "#EEEFEC" } });
    const wide = destinationSettings(base, destinationById("wide")!);
    expect(canvasSize(wide, 3000, 2000)).toEqual({ width: 1920, height: 1080 });
    expect(wide.shadow).toBe(true);
    expect(wide.background).toEqual({ kind: "color", color: "#EEEFEC" });
    const market = destinationSettings(base, destinationById("marketplace")!);
    expect(market.format).toBe("jpeg");
    expect(market.background).toEqual({ kind: "color", color: "#FFFFFF" });
    // 5% padding on a 2000px canvas: the subject's longer side fills 90%.
    const { s } = placement(market, 1000, 1000, { x: 0, y: 0, w: 500, h: 250 }, canvasSize(market, 1000, 1000));
    expect((500 * s) / 2000).toBeCloseTo(0.9);
  });
  it("names a folder per destination", () => {
    expect(DESTINATIONS.map(folderFor)).toEqual(["square-1080x1080", "portrait-1080x1350", "story-1080x1920", "wide-1920x1080", "marketplace-2000x2000"]);
  });
});

describe("brand presets", () => {
  it("accepts the starter preset and turns it into Batch settings", () => {
    const result = validatePreset(STARTER_PRESET);
    expect(result.ok).toBe(true);
    const settings = presetToBatchSettings(STARTER_PRESET);
    expect(settings).toMatchObject({ canvas: "square", padding: 12, shadow: true, background: { kind: "color", color: "#F8F6EE" }, matte: "#F8F6EE" });
  });
  it("explains what's wrong with bad input", () => {
    const result = validatePreset({ name: " ", colors: [{ hex: "blue" }], layout: { canvas: "huge", padding: 99, shadow: "yes", background: { kind: "brand", index: 4 }, align: { x: 2, y: 0 }, format: "gif" } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(7);
    const jpegTransparent = validatePreset({ ...STARTER_PRESET, layout: { ...STARTER_PRESET.layout, background: { kind: "transparent" }, format: "jpeg" } });
    expect(jpegTransparent.ok).toBe(false);
  });
});
