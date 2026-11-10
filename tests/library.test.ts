import { describe, expect, it } from "vitest";
import { normaliseSettings } from "@/lib/batch/settings";
import { colourName, differenceHash, hashDistance, palette, smartTags, transparency } from "@/lib/studio/asset-analysis";
import { DEFAULT_LOOK, describeChange, isLinked, reviewProject, versionGeometry, versionSettings, type ProjectState, type ProjectVersion } from "@/lib/studio/project-model";

/** RGBA pixels filled by a function of (x, y). */
function image(w: number, h: number, fn: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4);
  return data;
}

describe("asset analysis", () => {
  it("names colours the way people do", () => {
    expect(colourName([245, 240, 225])).toBe("Ivory");
    expect(colourName([20, 25, 30])).toBe("Black");
    expect(colourName([60, 150, 80])).toBe("Green");
    expect(colourName([30, 40, 90])).toBe("Navy");
  });

  it("finds the main colours and ignores transparent pixels", () => {
    // Left 70% beige, right 30% navy, plus a transparent strip that must not count.
    const data = image(100, 50, (x, y) => (y < 5 ? [255, 0, 0, 0] : x < 70 ? [214, 196, 164, 255] : [26, 38, 88, 255]));
    const swatches = palette(data, 100, 50);
    expect(swatches.map((s) => s.name)).toEqual(["Beige", "Navy"]);
    expect(swatches[0].share).toBeCloseTo(0.7, 1);
    expect(transparency(data)).toBeCloseTo(0.1, 2);
  });

  it("recognises the same picture after resizing, and tells different ones apart", () => {
    const scene = (w: number, h: number) => image(w, h, (x, y) => (Math.hypot(x - w * 0.4, y - h * 0.5) < h * 0.3 ? [40, 40, 40, 255] : [230, 230, 230, 255]));
    const big = differenceHash(scene(400, 300), 400, 300);
    const small = differenceHash(scene(160, 120), 160, 120);
    const other = differenceHash(
      image(400, 300, (x) => (x > 200 ? [20, 20, 20, 255] : [240, 240, 240, 255])),
      400,
      300,
    );
    expect(hashDistance(big, small)).toBeLessThanOrEqual(6);
    expect(hashDistance(big, other)).toBeGreaterThan(10);
  });

  it("derives smart tags", () => {
    expect(smartTags({ width: 2400, height: 1600, hasAlpha: true, swatches: [{ hex: "#F0EAD6", share: 0.8, name: "Ivory" }, { hex: "#FFFFFF", share: 0.05, name: "White" }] })).toEqual([
      "Landscape",
      "Transparent",
      "Ivory",
      "High resolution",
    ]);
    expect(smartTags({ width: 500, height: 700, hasAlpha: false, swatches: [] })).toEqual(["Portrait", "Low resolution"]);
  });
});

const base = (versions: ProjectVersion[]): ProjectState & { width: number; height: number } => ({
  name: "Spring",
  look: DEFAULT_LOOK,
  versions,
  maskKey: "m1",
  bounds: { x: 400, y: 300, w: 1200, h: 800 },
  review: null,
  width: 2000,
  height: 1400,
});

describe("projects", () => {
  it("linked versions follow the master and change canvas only", () => {
    const v: ProjectVersion = { id: "a", destination: "wide", overrides: {} };
    const s = versionSettings(DEFAULT_LOOK, v);
    expect(s.customSize).toEqual({ width: 1920, height: 1080 });
    expect(s.padding).toBe(DEFAULT_LOOK.padding);
    expect(isLinked(v)).toBe(true);
    const look = normaliseSettings({ ...DEFAULT_LOOK, padding: 20, shadow: true });
    expect(versionSettings(look, v)).toMatchObject({ padding: 20, shadow: true });
  });

  it("a version scaled differently from the master is reported, with the real difference", () => {
    const p = base([{ id: "p", destination: "portrait", overrides: { padding: 12 } }]);
    const issues = reviewProject(p);
    const scale = issues.find((i) => i.kind === "scale");
    expect(scale?.detail).toMatch(/Portrait 4:5: slightly smaller than the master \(−\d+%\)/);
    expect(scale?.fix).toEqual({ kind: "match", versionId: "p", label: "Match to master" });
    const own = versionGeometry(versionSettings(p.look, p.versions[0]), p.width, p.height, p.bounds).fill;
    const master = versionGeometry(versionSettings(p.look, { ...p.versions[0], overrides: {} }), p.width, p.height, p.bounds).fill;
    expect(scale?.detail).toContain(`${Math.abs(Math.round((own / master - 1) * 100))}%`);
  });

  it("checks the marketplace version's fill and offers the padding that passes", () => {
    const issues = reviewProject(base([{ id: "m", destination: "marketplace", overrides: { padding: 12 } }]));
    expect(issues.find((i) => i.kind === "marketplace")?.fix).toMatchObject({ kind: "padding", padding: 5 });
    expect(reviewProject(base([{ id: "m", destination: "marketplace", overrides: {} }])).some((i) => i.kind === "marketplace")).toBe(false);
  });

  it("reports shadow differences and the mask's own edge check", () => {
    const p = { ...base([{ id: "s", destination: "square", overrides: { shadow: true } }]), review: "Large areas are only partly transparent." };
    const kinds = reviewProject(p).map((i) => i.kind);
    expect(kinds).toEqual(["edges", "shadow"]);
  });

  it("describes changes for version history", () => {
    const a = base([{ id: "a", destination: "square", overrides: {} }]);
    expect(describeChange(a, { ...a, look: { ...a.look, background: { kind: "color", color: "#FFFFFF" } } })).toBe("Background updated");
    expect(describeChange(a, { ...a, maskKey: "m2" })).toBe("Mask refined");
    expect(describeChange(a, { ...a, versions: [...a.versions, { id: "b", destination: "wide", overrides: {} }] })).toBe("Version added");
    expect(describeChange(a, { ...a, look: { ...a.look, padding: 15 } })).toBe("Padding changed");
  });
});
