type AnyContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Free-plan watermark: "ISOLA" tiled diagonally across the whole image, light
 * fill with a dark outline so it shows on light, dark and transparent areas.
 */
export function drawWatermark(ctx: AnyContext, width: number, height: number) {
  const size = Math.max(14, Math.round(Math.min(width, height) * 0.07));
  const stepX = size * 4.6;
  const stepY = size * 2.8;
  const reach = Math.hypot(width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `800 ${size}px "Inter Tight", Inter, Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.strokeStyle = "rgba(32, 41, 45, 0.32)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  let row = 0;
  for (let y = -reach; y <= reach; y += stepY, row++) {
    for (let x = -reach + (row % 2) * (stepX / 2); x <= reach; x += stepX) {
      ctx.strokeText("ISOLA", x, y);
      ctx.fillText("ISOLA", x, y);
    }
  }
  ctx.restore();
}
