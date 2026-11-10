/**
 * Drawing primitives shared by Scene Studio and Motion Studio. Everything
 * takes explicit geometry in output pixels, so a still, a preview frame and an
 * exported video frame go through exactly the same code.
 */

import { backdropBitmap, context2d, makeCanvas, softFill } from "./backdrops";
import type { BackdropLayer, FontId, TextStyle } from "./model";

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Drawable = CanvasImageSource & { width: number; height: number };

/** Where a layer lands in the output: anchor point (cx, cy), size, rotation and opacity. */
export interface Placement {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  /** Anchor inside the layer box (0..1); the box rotates around it. Default centre. */
  ax?: number;
  ay?: number;
}

export interface FontFamilies {
  /** CSS font-family lists for each font id, resolved from the loaded web fonts. */
  family: Record<FontId, string>;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Moves the context so (0, 0) is the layer's top-left corner, rotated about its anchor. */
export function enterPlacement(ctx: Ctx, p: Placement) {
  const ax = p.ax ?? 0.5;
  const ay = p.ay ?? 0.5;
  ctx.translate(p.cx, p.cy);
  if (p.rotation) ctx.rotate(rad(p.rotation));
  ctx.translate(-ax * p.w, -ay * p.h);
}

/** The four corners of a placed box, in output pixels (for hit-testing and outlines). */
export function corners(p: Placement): Array<[number, number]> {
  const ax = p.ax ?? 0.5;
  const ay = p.ay ?? 0.5;
  const c = Math.cos(rad(p.rotation));
  const s = Math.sin(rad(p.rotation));
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => {
    const x = (u - ax) * p.w;
    const y = (v - ay) * p.h;
    return [p.cx + x * c - y * s, p.cy + x * s + y * c] as [number, number];
  });
}

/** Is the output point inside the placed box? */
export function hitTest(p: Placement, x: number, y: number) {
  const ax = p.ax ?? 0.5;
  const ay = p.ay ?? 0.5;
  const c = Math.cos(-rad(p.rotation));
  const s = Math.sin(-rad(p.rotation));
  const dx = x - p.cx;
  const dy = y - p.cy;
  const lx = dx * c - dy * s + ax * p.w;
  const ly = dx * s + dy * c + ay * p.h;
  return lx >= 0 && ly >= 0 && lx <= p.w && ly <= p.h;
}

/* --------------------------------------------------------------- backdrop --- */

/** Fills the frame with a backdrop layer (drawn set, uploaded image cover-fitted, or plain tint). */
export function drawBackdropLayer(ctx: Ctx, layer: Pick<BackdropLayer, "backdrop" | "imageAssetId" | "tint">, W: number, H: number, image: Drawable | null) {
  if (layer.imageAssetId && image) {
    const s = Math.max(W / image.width, H / image.height);
    const w = image.width * s;
    const h = image.height * s;
    ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h);
    return;
  }
  if (layer.backdrop) {
    ctx.drawImage(backdropBitmap(layer.backdrop, W, H, layer.tint), 0, 0, W, H);
    return;
  }
  ctx.fillStyle = layer.tint ?? "#F5F6F3";
  ctx.fillRect(0, 0, W, H);
}

/* ---------------------------------------------------------------- images --- */

/** A product (or logo) image at its placement. With `light`, a soft key light is laid over the product's own pixels only. */
export function drawImageLayer(ctx: Ctx, img: Drawable, p: Placement, light?: { direction: number; strength: number } | null) {
  if (p.opacity <= 0 || p.w <= 0 || p.h <= 0) return;
  ctx.save();
  ctx.globalAlpha *= p.opacity;
  enterPlacement(ctx, p);
  if (light && light.strength > 0) {
    const w = Math.max(1, Math.ceil(p.w));
    const h = Math.max(1, Math.ceil(p.h));
    const off = makeCanvas(w, h);
    const o = context2d(off);
    o.drawImage(img, 0, 0, w, h);
    o.globalCompositeOperation = "source-atop";
    const a = rad(light.direction);
    const gx = w / 2 - Math.sin(a) * w * 0.6;
    const gy = h / 2 - Math.cos(a) * h * 0.6;
    const g = o.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h));
    g.addColorStop(0, `rgba(255,244,226,${0.35 * light.strength})`);
    g.addColorStop(1, `rgba(40,30,20,${0.18 * light.strength})`);
    o.fillStyle = g;
    o.fillRect(0, 0, w, h);
    ctx.drawImage(off, 0, 0, p.w, p.h);
  } else {
    ctx.drawImage(img, 0, 0, p.w, p.h);
  }
  ctx.restore();
}

/** An image's silhouette, blurred, from far off-canvas (a shadow cast back into place). */
function softImage(ctx: Ctx, img: Drawable, w: number, h: number, color: string, blur: number) {
  const OFF = 20000;
  ctx.save();
  const m = ctx.getTransform();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e - OFF, m.f);
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(0, blur);
  ctx.shadowOffsetX = OFF;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
}

export interface ShadowParams {
  opacity: number;
  softness: number;
  direction: number;
  length: number;
}

/**
 * A product's shadow, from its placement: a soft contact shadow where it
 * meets the surface plus, with `length`, a cast shadow sheared away from the
 * light. Drawn as its own layer so the product's pixels are never touched.
 */
export function drawProductShadow(ctx: Ctx, img: Drawable, target: Placement, s: ShadowParams, short: number) {
  if (s.opacity <= 0 || target.w <= 0) return;
  const ay = target.ay ?? 0.5;
  const ax = target.ax ?? 0.5;
  const bottomX = target.cx + (0.5 - ax) * target.w;
  const bottomY = target.cy + (1 - ay) * target.h;
  ctx.save();
  // Contact shadow
  const blur = short * (0.006 + s.softness * 0.03);
  softFill(ctx, `rgba(28,20,12,${0.55 * s.opacity * Math.min(1, target.opacity)})`, blur, (c) => c.ellipse(bottomX, bottomY - target.h * 0.01, target.w * 0.42, Math.max(2, target.h * 0.035), 0, 0, Math.PI * 2));
  // Cast shadow: the silhouette squashed and sheared away from the light.
  if (s.length > 0.01) {
    const shear = -Math.tan(rad(Math.max(-75, Math.min(75, s.direction))));
    ctx.save();
    ctx.translate(bottomX, bottomY);
    ctx.transform(1, 0, shear * s.length, s.length, 0, 0);
    ctx.translate(-target.w / 2, -target.h);
    softImage(ctx, img, target.w, target.h, `rgba(28,20,12,${0.3 * s.opacity * Math.min(1, target.opacity)})`, short * (0.004 + s.softness * 0.05));
    ctx.restore();
  }
  ctx.restore();
}

/** A dashed box with a label, where an image can't be found (missing from this browser). */
export function drawMissing(ctx: Ctx, p: Placement, label: string) {
  ctx.save();
  enterPlacement(ctx, p);
  ctx.fillStyle = "rgba(185,58,38,0.08)";
  ctx.fillRect(0, 0, p.w, p.h);
  ctx.strokeStyle = "rgba(185,58,38,0.8)";
  ctx.setLineDash([Math.max(4, p.w * 0.03), Math.max(3, p.w * 0.02)]);
  ctx.lineWidth = Math.max(1, p.w * 0.006);
  ctx.strokeRect(0, 0, p.w, p.h);
  ctx.fillStyle = "rgba(185,58,38,0.95)";
  ctx.font = `600 ${Math.max(10, Math.min(p.w, p.h) * 0.07)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, p.w / 2, p.h / 2, p.w * 0.9);
  ctx.restore();
}

/* ------------------------------------------------------------------ text --- */

export interface GlyphBox {
  ch: string;
  x: number;
  w: number;
  word: number;
}
export interface TextLayout {
  font: string;
  px: number;
  lineHeight: number;
  lines: Array<{ glyphs: GlyphBox[]; width: number; y: number }>;
  width: number;
  height: number;
  words: number;
  glyphs: number;
}

export function fontString(style: Pick<TextStyle, "font" | "weight">, px: number, fonts: FontFamilies) {
  return `${style.weight} ${Math.max(1, px).toFixed(2)}px ${fonts.family[style.font]}`;
}

/**
 * Lays text out glyph by glyph (so letter spacing and per-letter animation
 * work the same in every browser). Lines break only where the text has
 * line breaks.
 */
export function layoutText(ctx: Ctx, style: TextStyle, px: number, fonts: FontFamilies): TextLayout {
  const font = fontString(style, px, fonts);
  ctx.save();
  ctx.font = font;
  const text = style.uppercase ? style.text.toUpperCase() : style.text;
  const spacing = style.letterSpacing * px;
  const lineH = style.lineHeight * px;
  let word = 0;
  let glyphCount = 0;
  const lines = text.split("\n").map((line, li) => {
    const glyphs: GlyphBox[] = [];
    let x = 0;
    let inWord = false;
    for (const ch of Array.from(line)) {
      const isSpace = /\s/.test(ch);
      if (!isSpace && !inWord) {
        inWord = true;
      } else if (isSpace && inWord) {
        inWord = false;
        word++;
      }
      const w = ctx.measureText(ch).width;
      glyphs.push({ ch, x, w, word });
      x += w + spacing;
      glyphCount++;
    }
    if (inWord) word++;
    const width = Math.max(0, x - (glyphs.length ? spacing : 0));
    return { glyphs, width, y: li * lineH };
  });
  ctx.restore();
  const width = Math.max(0, ...lines.map((l) => l.width));
  const height = lines.length ? (lines.length - 1) * lineH + px * 1.1 : 0;
  return { font, px, lineHeight: lineH, lines, width, height, words: word, glyphs: glyphCount };
}

export interface TextAnimationState {
  /** 0..1 left-to-right wipe of the whole block (1 = fully shown). */
  reveal?: number;
  /** Per-glyph visibility and offset (in px) for staggered animations. */
  glyph?: (g: { index: number; word: number; line: number }) => { alpha: number; dx: number; dy: number };
}

/** Draws a laid-out text block centred on its placement anchor. */
export function drawTextBlock(ctx: Ctx, style: TextStyle, layout: TextLayout, p: Placement, anim?: TextAnimationState) {
  if (p.opacity <= 0 || !layout.lines.length) return;
  ctx.save();
  ctx.globalAlpha *= p.opacity;
  enterPlacement(ctx, { ...p, w: layout.width, h: layout.height });
  if (anim?.reveal !== undefined && anim.reveal < 1) {
    ctx.beginPath();
    ctx.rect(-layout.px, -layout.px, (layout.width + layout.px * 2) * Math.max(0, anim.reveal), layout.height + layout.px * 2);
    ctx.clip();
  }
  ctx.font = layout.font;
  ctx.fillStyle = style.color;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let index = 0;
  layout.lines.forEach((line, li) => {
    const offset = style.align === "left" ? 0 : style.align === "right" ? layout.width - line.width : (layout.width - line.width) / 2;
    for (const g of line.glyphs) {
      const state = anim?.glyph ? anim.glyph({ index, word: g.word, line: li }) : null;
      index++;
      if (/\s/.test(g.ch)) continue;
      if (state) {
        if (state.alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha *= Math.min(1, state.alpha);
        ctx.fillText(g.ch, offset + g.x + state.dx, line.y + layout.px * 0.05 + state.dy);
        ctx.restore();
      } else ctx.fillText(g.ch, offset + g.x, line.y + layout.px * 0.05);
    }
  });
  ctx.restore();
}

/** The placement box of a text block (for outlines and hit-testing). */
export function textPlacement(layout: TextLayout, p: Omit<Placement, "w" | "h">): Placement {
  return { ...p, w: layout.width, h: layout.height };
}
