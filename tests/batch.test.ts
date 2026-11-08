import { describe, expect, it } from "vitest";
import { reviewMask } from "@/lib/batch/review";
import { DEFAULT_BATCH_SETTINGS, canvasSize, exportName, placement, type BatchSettings } from "@/lib/batch/settings";

const s = (patch: Partial<BatchSettings>): BatchSettings => ({ ...DEFAULT_BATCH_SETTINGS, ...patch });

describe("canvasSize", () => {
  it("keeps the photo size for framing and original", () => {
    expect(canvasSize(s({ canvas: "framing" }), 2400, 1600)).toEqual({ width: 2400, height: 1600 });
    expect(canvasSize(s({ canvas: "original" }), 2400, 1600)).toEqual({ width: 2400, height: 1600 });
  });
  it("uses the longest side for presets", () => {
    expect(canvasSize(s({ canvas: "square" }), 2400, 1600)).toEqual({ width: 2400, height: 2400 });
    expect(canvasSize(s({ canvas: "portrait" }), 2400, 1600)).toEqual({ width: 1920, height: 2400 });
    expect(canvasSize(s({ canvas: "landscape" }), 1600, 2400)).toEqual({ width: 2400, height: 1600 });
  });
  it("clamps custom sizes", () => {
    expect(canvasSize(s({ canvas: "custom", customSize: { width: 99999, height: 3 } }), 10, 10)).toEqual({ width: 8000, height: 16 });
  });
});

describe("placement", () => {
  const bounds = { x: 100, y: 200, w: 400, h: 200 };
  it("is the identity for original framing", () => {
    expect(placement(s({ canvas: "framing" }), 1000, 800, bounds)).toEqual({ s: 1, tx: 0, ty: 0 });
  });
  it("fits the subject inside the padded canvas and centres it", () => {
    const settings = s({ canvas: "square", padding: 10, fit: "contain" });
    const p = placement(settings, 1000, 800, bounds); // canvas 1000×1000, margin 100, inner 800×800
    expect(p.s).toBeCloseTo(2); // 800 / 400
    const left = p.tx + bounds.x * p.s;
    const top = p.ty + bounds.y * p.s;
    expect(left).toBeCloseTo(100);
    expect(top).toBeCloseTo(100 + (800 - 400) / 2);
  });
  it("respects alignment and cover", () => {
    const p = placement(s({ canvas: "square", padding: 0, fit: "cover", align: { x: 1, y: 1 } }), 1000, 800, bounds);
    expect(p.s).toBeCloseTo(5); // max(1000/400, 1000/200)
    expect(p.tx + (bounds.x + bounds.w) * p.s).toBeCloseTo(1000);
    expect(p.ty + (bounds.y + bounds.h) * p.s).toBeCloseTo(1000);
  });
});

describe("exportName", () => {
  it("keeps or suffixes names and avoids collisions", () => {
    const used = new Set<string>();
    expect(exportName("Sneakers.JPG", s({ keepNames: true }), used)).toBe("Sneakers.png");
    expect(exportName("sneakers.webp", s({ keepNames: true }), used)).toBe("sneakers-2.png");
    expect(exportName("bag.jpg", s({ keepNames: false, format: "jpeg" }), used)).toBe("bag-isola.jpg");
  });
});

describe("reviewMask", () => {
  const size = 100 * 100;
  it("passes a clean cutout", () => {
    const m = new Uint8Array(size);
    for (let i = 0; i < 3000; i++) m[i] = 255;
    for (let i = 3000; i < 3100; i++) m[i] = 128;
    expect(reviewMask(m).reason).toBeNull();
  });
  it("flags empty, full and uncertain masks", () => {
    expect(reviewMask(new Uint8Array(size)).reason).toMatch(/No clear subject/);
    expect(reviewMask(new Uint8Array(size).fill(255)).reason).toMatch(/Almost everything/);
    const soft = new Uint8Array(size);
    for (let i = 0; i < 2000; i++) soft[i] = 255;
    for (let i = 2000; i < 3000; i++) soft[i] = 120;
    expect(reviewMask(soft).reason).toMatch(/partly transparent/);
  });
});
