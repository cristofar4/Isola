import { describe, expect, it } from "vitest";
import { matchedPadding, matchSettings, visualSize } from "@/lib/batch/match-size";
import { preflight, type PreflightItem } from "@/lib/batch/preflight";
import { DEFAULT_BATCH_SETTINGS, normaliseSettings, type BatchSettings } from "@/lib/batch/settings";
import { batchSettingsToPreset, presetToBatchSettings, validatePreset } from "@/lib/brand-presets";

const square: BatchSettings = normaliseSettings({ ...DEFAULT_BATCH_SETTINGS, canvas: "square", padding: 10, fit: "contain" });
// A tall bottle and a square-ish bag, each filling its own photo.
const bottle = { id: "bottle", width: 1000, height: 2000, bounds: { x: 300, y: 100, w: 400, h: 1800 } };
const bag = { id: "bag", width: 2000, height: 2000, bounds: { x: 200, y: 200, w: 1600, h: 1600 } };

describe("match product size", () => {
  it("with one padding, a square product looks bigger than a tall one", () => {
    expect(visualSize(square, bag)).toBeGreaterThan(visualSize(square, bottle) * 1.5);
  });
  it("gives the bigger product more padding until both look the same size", () => {
    const padding = matchedPadding(square, bottle, bag);
    expect(padding).toBeGreaterThan(square.padding);
    const matched = visualSize({ ...square, padding }, bag);
    // Whole-per-cent padding: within a couple of per cent of the reference's size.
    expect(Math.abs(matched - visualSize(square, bottle)) / visualSize(square, bottle)).toBeLessThan(0.04);
  });
  it("never enlarges a product past the collection's padding", () => {
    // Matching the small bottle to the big bag: the bottle can't grow, so it keeps the padding.
    expect(matchedPadding(square, bag, bottle)).toBe(square.padding);
  });
  it("leaves the reference alone and skips images without a subject box", () => {
    const map = matchSettings(square, bottle, [bottle, bag, { id: "unknown", width: 800, height: 800, bounds: null }]);
    expect(map.get("bottle")!.padding).toBe(square.padding);
    expect(map.get("bag")!.padding).toBeGreaterThan(square.padding);
    expect(map.get("unknown")).toBe(square);
  });
  it("does nothing when each photo keeps its own framing", () => {
    const framing = normaliseSettings({ ...DEFAULT_BATCH_SETTINGS, canvas: "framing", padding: 8 });
    expect(matchedPadding(framing, bottle, bag)).toBe(8);
  });
});

const item = (over: Partial<PreflightItem>): PreflightItem => ({ id: "a", name: "a.jpg", width: 2000, height: 2000, status: "ready", review: null, settings: square, ...over });
const opts = { unapplied: false, pro: true, project: "Spring", total: 3 };
const ids = (lines: ReturnType<typeof preflight>) => Object.fromEntries(lines.map((l) => [l.id, l]));

describe("export preflight", () => {
  it("says what format will be exported and that nothing needs review", () => {
    const l = ids(preflight([item({})], opts));
    expect(l.format).toMatchObject({ tone: "ok", text: "Transparent PNG selected" });
    expect(l.review.tone).toBe("ok");
    expect(l.plan).toBeUndefined();
  });
  it("counts images that need review, with a Review action", () => {
    const l = ids(preflight([item({}), item({ id: "b", name: "b.jpg", review: "Soft edges" })], opts));
    expect(l.review).toMatchObject({ tone: "warn", text: "1 image needs review", action: "review" });
  });
  it("flags unfinished, failed and unapplied states", () => {
    const l = ids(preflight([item({}), item({ id: "b", status: "processing" }), item({ id: "c", status: "failed" })], { ...opts, unapplied: true }));
    expect(l.busy.text).toMatch(/1 image still processing/);
    expect(l.failed.action).toBe("retry");
    expect(l.unapplied.action).toBe("apply");
  });
  it("explains JPEG with a transparent background, and mixed formats", () => {
    const jpeg = normaliseSettings({ ...square, format: "jpeg", matte: "#FFFFFF" });
    expect(ids(preflight([item({ settings: jpeg })], opts)).format.text).toMatch(/filled with #FFFFFF/);
    expect(ids(preflight([item({}), item({ id: "b", settings: jpeg })], opts)).format.text).toMatch(/^Mixed formats/);
  });
  it("shows the Free plan's limit in the smallest export size, and name clashes", () => {
    const l = ids(preflight([item({}), item({ id: "b", name: "a.png" })], { ...opts, pro: false }));
    expect(l.plan.action).toBe("upgrade");
    expect(l.size.text).toBe("Smallest export: 1,000 × 1,000 px");
    expect(l.names.text).toMatch(/1 file share/);
  });
  it("has something honest to say about an empty or unfinished batch", () => {
    expect(preflight([], opts)[0].id).toBe("empty");
    expect(ids(preflight([item({ status: "queued" })], opts)).none.tone).toBe("warn");
  });
});

describe("saving Batch Studio settings as a brand preset", () => {
  it("round-trips the look and passes the server's validation", () => {
    const look = normaliseSettings({ ...square, background: { kind: "color", color: "#A6B39A" }, shadow: true, padding: 12, format: "jpeg" });
    const preset = batchSettingsToPreset(look, "  Sage catalogue ", [{ name: "Ivory", hex: "#F1ECE4" }]);
    expect(preset.name).toBe("Sage catalogue");
    expect(preset.colors.map((c) => c.hex)).toEqual(["#F1ECE4", "#A6B39A"]);
    expect(validatePreset(preset).ok).toBe(true);
    const back = presetToBatchSettings(preset, look);
    expect(back.background).toEqual(look.background);
    expect([back.canvas, back.padding, back.shadow, back.format]).toEqual(["square", 12, true, "jpeg"]);
  });
  it("keeps transparent presets PNG and turns uploaded backgrounds white", () => {
    const transparentJpeg = batchSettingsToPreset(normaliseSettings({ ...square, format: "jpeg" }), "T");
    expect(transparentJpeg.layout).toMatchObject({ background: { kind: "transparent" }, format: "png" });
    const image = batchSettingsToPreset(normaliseSettings({ ...square, background: { kind: "image", assetId: "x", name: "wall.jpg" } }), "I");
    expect(image.layout.background).toEqual({ kind: "white" });
    expect(validatePreset(transparentJpeg).ok && validatePreset(image).ok).toBe(true);
  });
});
