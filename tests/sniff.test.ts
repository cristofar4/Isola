import { describe, expect, it } from "vitest";
import { sniffImage } from "@/lib/image/sniff";
import { validateImageFile } from "@/lib/image/validate";

function png(width: number, height: number, colorType = 6) {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  b[24] = 8;
  b[25] = colorType;
  return b;
}

function jpeg(width: number, height: number) {
  // SOI, APP0 (len 16), SOF0
  const b = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
    0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03,
  ]);
  return b;
}

function webpVp8x(width: number, height: number, alpha: boolean) {
  const b = new Uint8Array(40);
  const enc = (s: string, o: number) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  enc("RIFF", 0);
  enc("WEBP", 8);
  enc("VP8X", 12);
  b[20] = alpha ? 0x10 : 0;
  const w = width - 1;
  const h = height - 1;
  b[24] = w & 255; b[25] = (w >> 8) & 255; b[26] = (w >> 16) & 255;
  b[27] = h & 255; b[28] = (h >> 8) & 255; b[29] = (h >> 16) & 255;
  return b;
}

describe("sniffImage", () => {
  it("reads PNG dimensions and alpha", () => {
    const r = sniffImage(png(640, 480, 6));
    expect(r).toMatchObject({ ok: true, mime: "image/png", width: 640, height: 480, mayHaveAlpha: true });
    expect(sniffImage(png(10, 10, 2))).toMatchObject({ mayHaveAlpha: false });
  });
  it("reads JPEG dimensions from SOF", () => {
    expect(sniffImage(jpeg(1600, 1280))).toMatchObject({ ok: true, mime: "image/jpeg", width: 1600, height: 1280 });
  });
  it("reads WebP VP8X dimensions", () => {
    expect(sniffImage(webpVp8x(3000, 2000, true))).toMatchObject({ ok: true, width: 3000, height: 2000, mayHaveAlpha: true });
  });
  it("names unsupported formats", () => {
    const gif = new TextEncoder().encode("GIF89a........");
    expect(sniffImage(gif)).toMatchObject({ ok: false, reason: "unknown-format", detected: "GIF" });
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(sniffImage(svg)).toMatchObject({ ok: false, detected: "SVG" });
  });
});

describe("validateImageFile", () => {
  const limits = { maxFileBytes: 1000, maxDimension: 4000, minDimension: 32, maxMegapixels: 10 };
  it("accepts a valid image", async () => {
    const r = await validateImageFile(new Blob([png(800, 600) as BlobPart]), limits);
    expect(r.ok).toBe(true);
  });
  it("rejects by content, not extension", async () => {
    const r = await validateImageFile(new Blob([new TextEncoder().encode("hello world, not an image")]), limits);
    expect(r).toMatchObject({ ok: false, error: { code: "unsupported-type" } });
  });
  it("enforces size, dimension, pixel and minimum limits", async () => {
    expect(await validateImageFile(new Blob([new Uint8Array(2000)]), limits)).toMatchObject({ error: { code: "too-large" } });
    expect(await validateImageFile(new Blob([png(5000, 100) as BlobPart]), limits)).toMatchObject({ error: { code: "dimension-too-large" } });
    expect(await validateImageFile(new Blob([png(4000, 3000) as BlobPart]), limits)).toMatchObject({ error: { code: "too-many-pixels" } });
    expect(await validateImageFile(new Blob([png(10, 400) as BlobPart]), limits)).toMatchObject({ error: { code: "too-small" } });
    expect(await validateImageFile(new Blob([]), limits)).toMatchObject({ error: { code: "empty-file" } });
  });
});
