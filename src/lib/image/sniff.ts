/**
 * Format detection and header-only dimension parsing for PNG, JPEG and WebP.
 *
 * Reading dimensions from the header lets us reject oversized images before
 * asking the browser to decode them, which protects against decompression
 * bombs exhausting memory.
 */

import type { AcceptedMime } from "@/lib/config";

export interface SniffResult {
  mime: AcceptedMime;
  width: number;
  height: number;
  /** True when the container can carry alpha (PNG colour types 4/6, tRNS, WebP alpha). */
  mayHaveAlpha: boolean;
}

export type SniffFailure =
  | { ok: false; reason: "unknown-format"; detected?: string }
  | { ok: false; reason: "corrupt-header"; mime: AcceptedMime };

export type SniffOutcome = ({ ok: true } & SniffResult) | SniffFailure;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function u32be(b: Uint8Array, o: number) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function u16be(b: Uint8Array, o: number) {
  return (b[o] << 8) | b[o + 1];
}
function u16le(b: Uint8Array, o: number) {
  return b[o] | (b[o + 1] << 8);
}
function u24le(b: Uint8Array, o: number) {
  return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
}

/** Describes formats we recognise but do not accept, for clearer errors. */
function detectOther(b: Uint8Array): string | undefined {
  if (ascii(b, 0, 4) === "GIF8") return "GIF";
  if (ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4);
    if (/hei|hev|mif1|msf1/.test(brand)) return "HEIC/HEIF";
    if (/avi/.test(brand)) return "AVIF";
    return "an ISO media file";
  }
  if (b[0] === 0x42 && b[1] === 0x4d) return "BMP";
  if ((b[0] === 0x49 && b[1] === 0x49) || (b[0] === 0x4d && b[1] === 0x4d)) return "TIFF";
  if (ascii(b, 0, 4) === "%PDF") return "PDF";
  const head = ascii(b, 0, 256).trimStart().toLowerCase();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "SVG";
  return undefined;
}

function sniffPng(b: Uint8Array): SniffOutcome {
  // IHDR must be the first chunk: length(4) "IHDR"(4) width(4) height(4) depth(1) colorType(1)
  if (b.length < 33 || ascii(b, 12, 4) !== "IHDR") return { ok: false, reason: "corrupt-header", mime: "image/png" };
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  const colorType = b[25];
  let mayHaveAlpha = colorType === 4 || colorType === 6;
  if (!mayHaveAlpha) {
    // Look for a tRNS chunk before IDAT in the bytes we have.
    let offset = 8;
    while (offset + 8 <= b.length) {
      const len = u32be(b, offset);
      const type = ascii(b, offset + 4, 4);
      if (type === "tRNS") {
        mayHaveAlpha = true;
        break;
      }
      if (type === "IDAT" || type === "IEND") break;
      offset += 12 + len;
    }
  }
  if (!width || !height) return { ok: false, reason: "corrupt-header", mime: "image/png" };
  return { ok: true, mime: "image/png", width, height, mayHaveAlpha };
}

function sniffJpeg(b: Uint8Array): SniffOutcome {
  let o = 2;
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    const marker = b[o + 1];
    if (marker === 0xff) {
      o++;
      continue;
    }
    // Standalone markers without length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // EOI / start of scan before any SOF
    const length = u16be(b, o + 2);
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (o + 9 > b.length) break;
      const height = u16be(b, o + 5);
      const width = u16be(b, o + 7);
      if (!width || !height) break;
      return { ok: true, mime: "image/jpeg", width, height, mayHaveAlpha: false };
    }
    o += 2 + length;
  }
  return { ok: false, reason: "corrupt-header", mime: "image/jpeg" };
}

function sniffWebp(b: Uint8Array): SniffOutcome {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8X" && b.length >= 30) {
    const flags = b[20];
    const width = u24le(b, 24) + 1;
    const height = u24le(b, 27) + 1;
    return { ok: true, mime: "image/webp", width, height, mayHaveAlpha: (flags & 0x10) !== 0 };
  }
  if (chunk === "VP8 " && b.length >= 30) {
    // Frame tag (3 bytes) + start code 9d 01 2a + 14-bit width/height.
    if (b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      const width = u16le(b, 26) & 0x3fff;
      const height = u16le(b, 28) & 0x3fff;
      if (width && height) return { ok: true, mime: "image/webp", width, height, mayHaveAlpha: false };
    }
  }
  if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    const alphaHint = ((bits >>> 28) & 1) === 1;
    return { ok: true, mime: "image/webp", width, height, mayHaveAlpha: alphaHint };
  }
  return { ok: false, reason: "corrupt-header", mime: "image/webp" };
}

/** Inspect the first bytes of a file. 64 KB is enough for every supported header. */
export function sniffImage(bytes: Uint8Array): SniffOutcome {
  if (bytes.length >= 8 && PNG_SIGNATURE.every((v, i) => bytes[i] === v)) return sniffPng(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return sniffJpeg(bytes);
  if (bytes.length >= 16 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return sniffWebp(bytes);
  return { ok: false, reason: "unknown-format", detected: detectOther(bytes) };
}

export const SNIFF_BYTES = 64 * 1024;
