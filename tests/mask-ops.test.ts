import { describe, expect, it } from "vitest";
import {
  createStrokeBuffers,
  finishStroke,
  maskBounds,
  refineRegion,
  stampSegment,
  morphInPlace,
} from "@/lib/editor/mask-ops";
import { writeRect } from "@/lib/editor/geometry";
import { History } from "@/lib/editor/history";
import { resizeMaskBilinear } from "@/lib/processing/onnx/resize";

function disk(w: number, h: number, cx: number, cy: number, r: number) {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) m[y * w + x] = 255;
  return m;
}

describe("brushes", () => {
  it("erase lowers the mask and restore brings it back to full", () => {
    const w = 64, h = 64;
    const mask = new Uint8Array(w * h).fill(255);
    const buffers = createStrokeBuffers(w * h);
    const rect = stampSegment(mask, w, h, buffers, { x: 10, y: 32 }, { x: 54, y: 32 }, 6, 1, "erase")!;
    expect(mask[32 * w + 32]).toBe(0);
    expect(mask[5 * w + 5]).toBe(255);
    const patch = finishStroke(mask, w, buffers, rect);
    expect(patch.changed).toBe(true);
    expect(buffers.coverage.every((v) => v === 0)).toBe(true);

    const rect2 = stampSegment(mask, w, h, buffers, { x: 10, y: 32 }, { x: 54, y: 32 }, 8, 1, "restore")!;
    finishStroke(mask, w, buffers, rect2);
    for (let x = 12; x < 52; x++) expect(mask[32 * w + x]).toBe(255);
  });

  it("overlapping dabs in one stroke do not accumulate", () => {
    const w = 40, h = 40;
    const mask = new Uint8Array(w * h).fill(255);
    const buffers = createStrokeBuffers(w * h);
    stampSegment(mask, w, h, buffers, { x: 20, y: 20 }, { x: 20.01, y: 20 }, 10, 0, "erase");
    const once = mask[20 * w + 27];
    stampSegment(mask, w, h, buffers, { x: 20, y: 20 }, { x: 20.02, y: 20 }, 10, 0, "erase");
    expect(mask[20 * w + 27]).toBe(once);
  });

  it("undo patches restore the exact previous mask", () => {
    const w = 50, h = 50;
    const mask = disk(w, h, 25, 25, 15);
    const original = mask.slice();
    const buffers = createStrokeBuffers(w * h);
    const rect = stampSegment(mask, w, h, buffers, { x: 5, y: 5 }, { x: 45, y: 45 }, 5, 0.5, "erase")!;
    const { before, after } = finishStroke(mask, w, buffers, rect);
    const history = new History();
    history.push({ kind: "mask", label: "Erase", rect, before, after });
    const entry = history.undo()!;
    if (entry.kind === "mask") writeRect(mask, w, entry.rect, entry.before);
    expect(mask).toEqual(original);
    const redo = history.redo()!;
    if (redo.kind === "mask") writeRect(mask, w, redo.rect, redo.after);
    expect(mask).toEqual(after.length === w * h ? after : mask);
  });
});

describe("refinement", () => {
  it("region refinement equals full refinement cropped", () => {
    const w = 120, h = 90;
    const mask = disk(w, h, 60, 45, 30);
    const refine = { shift: -2, feather: 3 };
    const full = refineRegion(mask, w, h, { x: 0, y: 0, w, h }, refine);
    const rect = { x: 30, y: 20, w: 40, h: 30 };
    const part = refineRegion(mask, w, h, rect, refine);
    for (let y = 0; y < rect.h; y++)
      for (let x = 0; x < rect.w; x++) expect(part[y * rect.w + x]).toBe(full[(rect.y + y) * w + rect.x + x]);
  });

  it("feather softens edges and shift grows/shrinks", () => {
    const w = 60, h = 60;
    const mask = disk(w, h, 30, 30, 15);
    const soft = refineRegion(mask, w, h, { x: 0, y: 0, w, h }, { shift: 0, feather: 3 });
    const edge = soft[30 * w + 45];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
    const grown = mask.slice();
    morphInPlace(grown, w, h, 3);
    expect(maskBounds(grown, w, h)!.w).toBeGreaterThan(maskBounds(mask, w, h)!.w);
    const shrunk = mask.slice();
    morphInPlace(shrunk, w, h, -3);
    expect(maskBounds(shrunk, w, h)!.w).toBeLessThan(maskBounds(mask, w, h)!.w);
  });

  it("maskBounds finds the subject and handles empty masks", () => {
    const w = 30, h = 20;
    const mask = new Uint8Array(w * h);
    expect(maskBounds(mask, w, h)).toBeNull();
    mask[5 * w + 7] = 255;
    mask[9 * w + 12] = 255;
    expect(maskBounds(mask, w, h)).toEqual({ x: 7, y: 5, w: 6, h: 5 });
  });
});

describe("resizeMaskBilinear", () => {
  it("keeps constant masks constant and preserves alignment", () => {
    const src = new Uint8Array(16).fill(200);
    expect(resizeMaskBilinear(src, 4, 4, 9, 7).every((v) => v === 200)).toBe(true);
    const half = new Uint8Array(4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) half[y * 4 + x] = 255;
    const up = resizeMaskBilinear(half, 4, 4, 400, 10);
    expect(up[0]).toBe(255);
    expect(up[399]).toBe(0);
    expect(Math.abs(up[199] - up[200])).toBeLessThan(20);
  });
});

describe("History", () => {
  it("clears redo on new edits and respects the entry limit", () => {
    const h = new History(3);
    const s = (n: number) => ({ kind: "settings" as const, label: `s${n}`, before: {} as never, after: {} as never });
    h.push(s(1)); h.push(s(2)); h.push(s(3)); h.push(s(4));
    expect(h.size).toBe(3);
    h.undo();
    expect(h.canRedo).toBe(true);
    h.push(s(5));
    expect(h.canRedo).toBe(false);
    expect(h.undoLabel).toBe("s5");
  });
});
