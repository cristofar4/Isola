/**
 * Flags results a person should look at. Thresholds were calibrated on real
 * model output: clean cutouts have well under 10% uncertain edge pixels.
 */
export interface MaskReview {
  coverage: number;
  reason: string | null;
}

export function reviewMask(mask: Uint8Array): MaskReview {
  let foreground = 0;
  let uncertain = 0;
  let peak = 0;
  for (let i = 0; i < mask.length; i++) {
    const v = mask[i];
    if (v > 127) foreground++;
    if (v > 25 && v < 230) uncertain++;
    if (v > peak) peak = v;
  }
  const coverage = mask.length ? foreground / mask.length : 0;
  let reason: string | null = null;
  if (peak < 128 || coverage < 0.002) reason = "No clear subject was found.";
  else if (coverage > 0.92) reason = "Almost everything was kept, so the background may still be there.";
  else if (uncertain / Math.max(1, foreground) > 0.25) reason = "Large areas are only partly transparent. Check the edges.";
  return { coverage, reason };
}
