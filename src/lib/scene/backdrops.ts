/**
 * Backdrops drawn by code: gradients, light and seeded noise textures. The
 * same inputs always draw the same pixels, so a backdrop looks identical in
 * the preview, in a PNG export and in every frame of a video.
 */

import type { BackdropId } from "./model";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export function makeCanvas(width: number, height: number): AnyCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function context2d(canvas: AnyCanvas): Ctx {
  const ctx = canvas.getContext("2d") as Ctx | null;
  if (!ctx) throw new Error("This browser can't draw on a canvas.");
  return ctx;
}

/* ------------------------------------------------------------------ noise --- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a grid of `cells` × `cells`, wrapping, from a seed. */
function valueNoise(seed: number, cells: number) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(cells * cells);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x: number, y: number) => grid[(((y % cells) + cells) % cells) * cells + (((x % cells) + cells) % cells)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

function fbm(seed: number, octaves: number, cells = 4) {
  const layers = Array.from({ length: octaves }, (_, i) => valueNoise(seed + i * 101, cells << i));
  return (u: number, v: number) => {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (const n of layers) {
      sum += n(u, v) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

const textures = new Map<string, AnyCanvas>();

/** A small greyscale texture (cached), drawn scaled up with smoothing for soft grain. */
function texture(kind: "grain" | "stone" | "marble" | "weave", size = 256): AnyCanvas {
  const key = `${kind}:${size}`;
  const cached = textures.get(key);
  if (cached) return cached;
  const canvas = makeCanvas(size, size);
  const ctx = context2d(canvas);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const grain = mulberry32(7);
  const stone = fbm(11, 5, 4);
  const marble = fbm(23, 6, 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let g = 0.5;
      let a = 1;
      if (kind === "grain") g = 0.5 + (grain() - 0.5) * 0.9;
      else if (kind === "stone") {
        const n = stone(u, v);
        g = 0.35 + n * 0.6;
        // Travertine pits: occasional darker specks.
        if (grain() > 0.992) g *= 0.55;
      } else if (kind === "marble") {
        // Fine, soft veins: a turbulent sine field, kept thin and light, plus faint cloudiness.
        const t = marble(u, v);
        const vein = Math.abs(Math.sin((u * 1.4 + v * 0.8 + t * 2.6) * Math.PI * 2));
        const fine = Math.abs(Math.sin((u * 3.1 - v * 1.2 + t * 3.4) * Math.PI * 2));
        g = 1 - Math.pow(1 - vein, 40) * 0.45 - Math.pow(1 - fine, 60) * 0.25 - (t - 0.5) * 0.08;
        a = 1;
      } else {
        const wx = Math.sin(x * 1.7) * 0.5 + 0.5;
        const wy = Math.sin(y * 1.9) * 0.5 + 0.5;
        g = 0.55 + (wx * wy - 0.25) * 0.35 + (grain() - 0.5) * 0.18;
      }
      const i = (y * size + x) * 4;
      const c = Math.max(0, Math.min(255, Math.round(g * 255)));
      d[i] = d[i + 1] = d[i + 2] = c;
      d[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  textures.set(key, canvas);
  return canvas;
}

/** Lay a greyscale texture over a region with a blend mode at some strength. */
function overlayTexture(ctx: Ctx, tex: AnyCanvas, x: number, y: number, w: number, h: number, mode: GlobalCompositeOperation, alpha: number, scale = 1) {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;
  const tw = tex.width * scale;
  const th = tex.height * scale;
  for (let ty = y; ty < y + h; ty += th) for (let tx = x; tx < x + w; tx += tw) ctx.drawImage(tex, tx, ty, tw, th);
  ctx.restore();
}

/** Draw a soft (blurred) shape by casting a shadow from far off-canvas: works in every browser, unlike ctx.filter. */
export function softFill(ctx: Ctx, color: string, blur: number, path: (c: Ctx) => void) {
  const OFF = 20000;
  ctx.save();
  const m = ctx.getTransform();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e - OFF, m.f);
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(0, blur);
  ctx.shadowOffsetX = OFF;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  path(ctx);
  ctx.fill();
  ctx.restore();
}

function linear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: Array<[number, string]>) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function radial(ctx: Ctx, x: number, y: number, r: number, stops: Array<[number, string]>) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

/* -------------------------------------------------------------- backdrops --- */

function wallAndFloor(ctx: Ctx, W: number, H: number, horizon: number, wall: [string, string], floor: [string, string]) {
  const hy = H * horizon;
  ctx.fillStyle = linear(ctx, 0, 0, 0, hy, [
    [0, wall[0]],
    [1, wall[1]],
  ]);
  ctx.fillRect(0, 0, W, hy + 1);
  ctx.fillStyle = linear(ctx, 0, hy, 0, H, [
    [0, floor[0]],
    [1, floor[1]],
  ]);
  ctx.fillRect(0, hy, W, H - hy);
  // A soft contact line where wall meets floor.
  softFill(ctx, "rgba(60,45,30,0.10)", Math.min(W, H) * 0.02, (c) => c.rect(0, hy - 2, W, 4));
}

function keyLight(ctx: Ctx, W: number, H: number, x: number, y: number, strength: number) {
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = radial(ctx, W * x, H * y, Math.max(W, H) * 0.75, [
    [0, `rgba(255,255,255,${strength})`],
    [1, "rgba(255,255,255,0)"],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function vignette(ctx: Ctx, W: number, H: number, strength: number) {
  ctx.save();
  ctx.fillStyle = radial(ctx, W / 2, H / 2, Math.hypot(W, H) * 0.62, [
    [0.55, "rgba(30,24,18,0)"],
    [1, `rgba(30,24,18,${strength})`],
  ]);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** A cylindrical plinth whose top surface sits at `topY`. */
function plinth(ctx: Ctx, W: number, H: number, topY: number, colours: { top: string; side: [string, string, string]; rim: string }) {
  const S = Math.min(W, H);
  const cx = W / 2;
  const rx = Math.min(W * 0.42, S * 0.36);
  const ry = rx * 0.17;
  const ty = H * topY;
  const bottom = H + ry;
  // Ground shadow
  softFill(ctx, "rgba(70,52,36,0.25)", S * 0.05, (c) => c.ellipse(cx, bottom - ry * 0.2, rx * 1.05, ry * 1.2, 0, 0, Math.PI * 2));
  // Body
  ctx.fillStyle = linear(ctx, cx - rx, 0, cx + rx, 0, [
    [0, colours.side[0]],
    [0.45, colours.side[1]],
    [1, colours.side[2]],
  ]);
  ctx.beginPath();
  ctx.moveTo(cx - rx, ty);
  ctx.lineTo(cx - rx, bottom);
  ctx.ellipse(cx, bottom, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(cx + rx, ty);
  ctx.closePath();
  ctx.fill();
  // Top
  ctx.fillStyle = linear(ctx, cx - rx, ty - ry, cx + rx, ty + ry, [
    [0, colours.top],
    [1, colours.rim],
  ]);
  ctx.beginPath();
  ctx.ellipse(cx, ty, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, S * 0.002);
  ctx.beginPath();
  ctx.ellipse(cx, ty, rx, ry, 0, Math.PI * 0.05, Math.PI * 0.95);
  ctx.stroke();
}

/** A rectangular slab (stone or marble) whose top face sits at `topY`. */
function slab(ctx: Ctx, W: number, H: number, topY: number, fill: { top: string; front: [string, string] }, tex: AnyCanvas | null, texMode: GlobalCompositeOperation, texAlpha: number) {
  const S = Math.min(W, H);
  const cx = W / 2;
  const hw = Math.min(W * 0.44, S * 0.4);
  const depth = S * 0.06;
  const ty = H * topY;
  const fy = ty + depth;
  const bottom = Math.min(H, fy + S * 0.22);
  softFill(ctx, "rgba(50,40,30,0.28)", S * 0.04, (c) => c.rect(cx - hw * 1.02, bottom - S * 0.012, hw * 2.04, S * 0.03));
  // Top face (a slight trapezoid for perspective)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - hw * 0.94, ty - depth * 0.4);
  ctx.lineTo(cx + hw * 0.94, ty - depth * 0.4);
  ctx.lineTo(cx + hw, fy);
  ctx.lineTo(cx - hw, fy);
  ctx.closePath();
  ctx.fillStyle = fill.top;
  ctx.fill();
  if (tex) {
    ctx.clip();
    overlayTexture(ctx, tex, cx - hw, ty - depth, hw * 2, depth * 2, texMode, texAlpha, Math.max(1, S / 512));
  }
  ctx.restore();
  // Front face
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - hw, fy, hw * 2, bottom - fy);
  ctx.fillStyle = linear(ctx, 0, fy, 0, bottom, [
    [0, fill.front[0]],
    [1, fill.front[1]],
  ]);
  ctx.fill();
  if (tex) {
    ctx.clip();
    overlayTexture(ctx, tex, cx - hw, fy, hw * 2, bottom - fy, texMode, texAlpha, Math.max(1, S / 400));
  }
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = Math.max(1, S * 0.002);
  ctx.beginPath();
  ctx.moveTo(cx - hw, fy);
  ctx.lineTo(cx + hw, fy);
  ctx.stroke();
}

function lightShafts(ctx: Ctx, W: number, H: number, alpha: number) {
  const S = Math.min(W, H);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (const [x, w] of [
    [0.18, 0.1],
    [0.36, 0.06],
    [0.62, 0.12],
  ] as const) {
    softFill(ctx, `rgba(255,250,236,${alpha})`, S * 0.05, (c) => {
      c.moveTo(W * x, -H * 0.1);
      c.lineTo(W * (x + w), -H * 0.1);
      c.lineTo(W * (x + w + 0.28), H * 0.85);
      c.lineTo(W * (x + 0.28), H * 0.85);
      c.closePath();
    });
  }
  ctx.restore();
}

function folds(ctx: Ctx, W: number, H: number) {
  const S = Math.min(W, H);
  ctx.save();
  for (let i = 0; i < 7; i++) {
    const x = W * (-0.1 + i * 0.19);
    const shade = i % 2 === 0 ? "rgba(120,96,64,0.10)" : "rgba(255,255,255,0.22)";
    softFill(ctx, shade, S * 0.06, (c) => {
      c.moveTo(x, -H * 0.1);
      c.bezierCurveTo(x + W * 0.08, H * 0.3, x - W * 0.06, H * 0.6, x + W * 0.1, H * 1.1);
      c.lineTo(x + W * 0.14, H * 1.1);
      c.bezierCurveTo(x + W * 0.0, H * 0.6, x + W * 0.12, H * 0.3, x + W * 0.05, -H * 0.1);
      c.closePath();
    });
  }
  ctx.restore();
}

/** Draws backdrop `id` filling a W × H frame. */
export function drawBackdrop(ctx: Ctx, id: BackdropId, W: number, H: number) {
  const S = Math.min(W, H);
  switch (id) {
    case "ivory-plinth": {
      wallAndFloor(ctx, W, H, 0.74, ["#EFE7DC", "#E3D8C8"], ["#E2D6C4", "#D4C5B0"]);
      keyLight(ctx, W, H, 0.25, 0.2, 0.55);
      plinth(ctx, W, H, 0.7, { top: "#F3ECE1", rim: "#E4D8C6", side: ["#E9DFD0", "#DCCFBC", "#C9B9A2"] });
      overlayTexture(ctx, texture("grain"), 0, 0, W, H, "soft-light", 0.18, Math.max(1, S / 700));
      vignette(ctx, W, H, 0.12);
      break;
    }
    case "sage-wall": {
      wallAndFloor(ctx, W, H, 0.8, ["#BFC9B6", "#AEB9A5"], ["#C7CDBE", "#B5BCAB"]);
      lightShafts(ctx, W, H, 0.18);
      overlayTexture(ctx, texture("grain"), 0, 0, W, H, "soft-light", 0.22, Math.max(1, S / 700));
      vignette(ctx, W, H, 0.16);
      break;
    }
    case "warm-stone": {
      wallAndFloor(ctx, W, H, 0.78, ["#DCCBB4", "#CDB89D"], ["#CBB597", "#B9A283"]);
      keyLight(ctx, W, H, 0.7, 0.15, 0.45);
      slab(ctx, W, H, 0.69, { top: "#E2D3BD", front: ["#D2BFA3", "#B8A283"] }, texture("stone"), "multiply", 0.45);
      overlayTexture(ctx, texture("grain"), 0, 0, W, H, "soft-light", 0.16, Math.max(1, S / 700));
      vignette(ctx, W, H, 0.18);
      break;
    }
    case "pale-blue": {
      ctx.fillStyle = linear(ctx, 0, 0, 0, H, [
        [0, "#C5D6E6"],
        [0.62, "#DCE7F1"],
        [0.8, "#E6EEF5"],
        [1, "#D4E0EB"],
      ]);
      ctx.fillRect(0, 0, W, H);
      keyLight(ctx, W, H, 0.5, 0.35, 0.5);
      overlayTexture(ctx, texture("grain"), 0, 0, W, H, "soft-light", 0.12, Math.max(1, S / 700));
      vignette(ctx, W, H, 0.1);
      break;
    }
    case "linen": {
      ctx.fillStyle = linear(ctx, 0, 0, W, H, [
        [0, "#F3EBDD"],
        [1, "#E4D7C3"],
      ]);
      ctx.fillRect(0, 0, W, H);
      folds(ctx, W, H);
      overlayTexture(ctx, texture("weave", 128), 0, 0, W, H, "multiply", 0.12, Math.max(1, S / 900));
      lightShafts(ctx, W, H, 0.22);
      vignette(ctx, W, H, 0.12);
      break;
    }
    case "marble": {
      wallAndFloor(ctx, W, H, 0.76, ["#ECEAE6", "#DEDBD5"], ["#D8D4CD", "#C8C3BB"]);
      keyLight(ctx, W, H, 0.3, 0.2, 0.5);
      slab(ctx, W, H, 0.67, { top: "#F4F3F0", front: ["#E9E7E3", "#D3D0CA"] }, texture("marble", 512), "multiply", 0.55);
      overlayTexture(ctx, texture("grain"), 0, 0, W, H, "soft-light", 0.1, Math.max(1, S / 700));
      vignette(ctx, W, H, 0.12);
      break;
    }
  }
}

/** Recolour everything drawn so far, keeping its light and shade. */
export function tintFrame(ctx: Ctx, W: number, H: number, hex: string) {
  ctx.save();
  ctx.globalCompositeOperation = "color";
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

const drawn = new Map<string, AnyCanvas>();
const MAX_DRAWN = 12;

/** A backdrop rendered once per size and tint, then reused (frames of a video draw the same backdrop many times). */
export function backdropBitmap(id: BackdropId, W: number, H: number, tint: string | null): AnyCanvas {
  const key = `${id}:${Math.round(W)}x${Math.round(H)}:${tint ?? ""}`;
  const hit = drawn.get(key);
  if (hit) {
    drawn.delete(key);
    drawn.set(key, hit);
    return hit;
  }
  const canvas = makeCanvas(W, H);
  const ctx = context2d(canvas);
  drawBackdrop(ctx, id, canvas.width, canvas.height);
  if (tint) tintFrame(ctx, canvas.width, canvas.height, tint);
  drawn.set(key, canvas);
  while (drawn.size > MAX_DRAWN) drawn.delete(drawn.keys().next().value!);
  return canvas;
}
