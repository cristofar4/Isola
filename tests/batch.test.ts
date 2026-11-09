import { describe, expect, it } from "vitest";
import { reviewMask } from "@/lib/batch/review";
import {
  DEFAULT_BATCH_SETTINGS,
  canvasSize,
  customSizeError,
  exportName,
  normaliseSettings,
  placement,
  safeFileStem,
  sameSettings,
  type BatchSettings,
} from "@/lib/batch/settings";
import { applyPolicySize, exportPolicy } from "@/lib/plan-policy";

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

describe("naming patterns", () => {
  it("fills {name}, {n} and {project}, padding the number", () => {
    const settings = s({ keepNames: false, namePattern: "{project}-{n}-{name}" });
    expect(exportName("bag.jpg", settings, new Set(), { index: 3, total: 12, project: "Spring sale" })).toBe("Spring sale-03-bag.png");
  });
  it("falls back to the default pattern when empty", () => {
    expect(exportName("bag.jpg", s({ keepNames: false, namePattern: "  " }), new Set())).toBe("bag-isola.png");
  });
  it("makes names safe without dropping non-Latin letters", () => {
    expect(safeFileStem('a/b:c*?"<>|d')).toBe("a b c d");
    expect(safeFileStem("café façade")).toBe("café façade");
    expect(safeFileStem("CON")).toBe("CON-image");
    expect(safeFileStem("...")).toBe("image");
  });
  it("treats names case-insensitively when avoiding collisions", () => {
    const used = new Set<string>();
    expect(exportName("A.jpg", s({}), used)).toBe("A.png");
    expect(exportName("a.png", s({}), used)).toBe("a-2.png");
  });
});

describe("settings", () => {
  it("validates custom dimensions", () => {
    expect(customSizeError({ width: 2000, height: 2000 })).toBeNull();
    expect(customSizeError({ width: 8, height: 2000 })).toMatch(/at least 16px/);
    expect(customSizeError({ width: 2000, height: 9000 })).toMatch(/at most 8,000px/);
    expect(customSizeError({ width: Number.NaN, height: 100 })).toMatch(/Width/);
  });
  it("fills in fields missing from older saved settings", () => {
    const old = { background: { kind: "transparent" }, canvas: "square", padding: 99 } as unknown as BatchSettings;
    const n = normaliseSettings(old);
    expect(n.matte).toBe("#FFFFFF");
    expect(n.namePattern).toBe("{name}-isola");
    expect(n.padding).toBe(40);
    expect(sameSettings(n, normaliseSettings(n))).toBe(true);
  });
  it("square canvases with padding place the subject inside the margin", () => {
    const p = placement(s({ canvas: "square", padding: 10, align: { x: 0.5, y: 1 } }), 1600, 1280, { x: 400, y: 300, w: 800, h: 600 });
    // canvas 1600², margin 160, subject scaled to fit 1280² → bottom edge at 1440 (90%).
    expect(p.ty + (300 + 600) * p.s).toBeCloseTo(1440);
  });
});

describe("plan policy", () => {
  it("caps free exports and adds the watermark; Pro is untouched", () => {
    const free = exportPolicy(false);
    expect(free.watermark).toBe(true);
    expect(applyPolicySize(1600, 1280, free)).toMatchObject({ width: 1000, height: 800, limited: true });
    expect(applyPolicySize(800, 600, free)).toMatchObject({ width: 800, height: 600, limited: false });
    const pro = exportPolicy(true);
    expect(pro.watermark).toBe(false);
    expect(applyPolicySize(6000, 4000, pro)).toMatchObject({ width: 6000, height: 4000, scale: 1 });
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
