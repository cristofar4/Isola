import { createCanvas, get2d } from "@/lib/image/decode";
import { expandRect, type Rect } from "./geometry";
import { blurInPlace, downsample, refineRegion, refinementReach, type Refinement } from "./mask-ops";

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ShadowLayer {
  canvas: AnyCanvas;
  /** Image pixels per layer pixel. */
  scale: number;
  /** Padding around the image, in layer pixels. */
  pad: number;
}

const BAND_ROWS = 256;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Derived, render-ready layers for one image: the refined mask and a cutout
 * canvas (original RGB with the refined mask as alpha). The original pixels
 * and the editable mask are only read here, never modified.
 */
export class ImageLayers {
  readonly cutout: AnyCanvas;
  readonly refined: Uint8Array;
  private readonly ctx: AnyContext;
  private refinement: Refinement = { shift: 0, feather: 0 };
  private shadowCache: { key: string; layer: ShadowLayer } | null = null;
  /** Increments whenever the refined mask changes. */
  revision = 0;

  constructor(
    private readonly pixels: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
    private mask: Uint8Array,
    refinement: Refinement,
  ) {
    this.cutout = createCanvas(width, height);
    this.ctx = get2d(this.cutout);
    this.refined = new Uint8Array(width * height);
    this.refinement = { ...refinement };
    this.rebuild();
  }

  get currentRefinement(): Refinement {
    return this.refinement;
  }

  /** Point at a different mask buffer (after reprocessing or a reset). */
  setMask(mask: Uint8Array) {
    this.mask = mask;
    this.rebuild();
  }

  setRefinement(refinement: Refinement) {
    if (refinement.shift === this.refinement.shift && refinement.feather === this.refinement.feather) return;
    this.refinement = { ...refinement };
    this.rebuild();
  }

  /** Recompute everything. Processes in bands to bound temporary memory. */
  rebuild() {
    const { width, height } = this;
    for (let y = 0; y < height; y += BAND_ROWS) {
      const band: Rect = { x: 0, y, w: width, h: Math.min(BAND_ROWS, height - y) };
      const data = refineRegion(this.mask, width, height, band, this.refinement);
      this.refined.set(data, y * width);
      this.paint(band);
    }
    this.revision++;
  }

  /** Recompute only what a mask edit inside `rect` can affect. */
  update(rect: Rect) {
    const area = expandRect(rect, refinementReach(this.refinement), this.width, this.height);
    const data = refineRegion(this.mask, this.width, this.height, area, this.refinement);
    for (let y = 0; y < area.h; y++) {
      this.refined.set(data.subarray(y * area.w, (y + 1) * area.w), (area.y + y) * this.width + area.x);
    }
    this.paint(area);
    this.revision++;
  }

  private paint(rect: Rect) {
    const image = this.ctx.createImageData(rect.w, rect.h);
    const out = image.data;
    const src = this.pixels;
    const refined = this.refined;
    const width = this.width;
    for (let y = 0; y < rect.h; y++) {
      let i = (rect.y + y) * width + rect.x;
      let o = y * rect.w * 4;
      for (let x = 0; x < rect.w; x++, i++, o += 4) {
        const s = i * 4;
        out[o] = src[s];
        out[o + 1] = src[s + 1];
        out[o + 2] = src[s + 2];
        out[o + 3] = (src[s + 3] * refined[i] + 127) / 255;
      }
    }
    this.ctx.putImageData(image, rect.x, rect.y);
  }

  /**
   * A soft silhouette for drop shadows, built at reduced resolution (a blurred
   * shadow has no fine detail) and cached until the mask or blur changes.
   */
  shadowLayer(blurImagePx: number, color: string): ShadowLayer {
    const scale = Math.max(1, Math.ceil(Math.max(this.width, this.height) / 1024));
    const radius = Math.max(0, blurImagePx / scale);
    const key = `${this.revision}:${radius.toFixed(1)}:${color}`;
    if (this.shadowCache?.key === key) return this.shadowCache.layer;
    const small = downsample(this.refined, this.width, this.height, scale);
    const pad = Math.ceil(radius * 3) + 2;
    const w = small.width + pad * 2;
    const h = small.height + pad * 2;
    const data = new Uint8Array(w * h);
    for (let y = 0; y < small.height; y++) {
      data.set(small.data.subarray(y * small.width, (y + 1) * small.width), (y + pad) * w + pad);
    }
    blurInPlace(data, w, h, radius);
    const canvas = createCanvas(w, h);
    const ctx = get2d(canvas);
    const image = ctx.createImageData(w, h);
    const [r, g, b] = hexToRgb(color);
    for (let i = 0, o = 0; i < data.length; i++, o += 4) {
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = data[i];
    }
    ctx.putImageData(image, 0, 0);
    const layer = { canvas, scale, pad };
    this.shadowCache = { key, layer };
    return layer;
  }
}
