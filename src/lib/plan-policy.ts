import { planConfig } from "./config";

/**
 * The one place that decides what an export looks like on each plan. The
 * editor's export dialog and every Batch Studio download (single files and
 * ZIPs) go through `exportPolicy` and `applyPolicySize`, so the rules can't
 * drift apart.
 *
 * Pro status comes from the signed-in session, which only the server changes
 * after verifying a payment with Paystack. No plan adds a watermark: Free is
 * limited in size, Pro is full resolution.
 */
export interface ExportPolicy {
  plan: "free" | "pro";
  /** Always false: no plan watermarks its exports. Kept so API clients reading it keep working. */
  watermark: false;
  /** Longest side allowed in pixels, or null for full resolution. */
  maxSide: number | null;
}

export function exportPolicy(pro: boolean): ExportPolicy {
  return pro
    ? { plan: "pro", watermark: false, maxSide: null }
    : { plan: "free", watermark: false, maxSide: planConfig.freeMaxExportSide };
}

/** Output size after the plan's limit, keeping the aspect ratio. */
export function applyPolicySize(width: number, height: number, policy: ExportPolicy) {
  const scale = policy.maxSide ? Math.min(1, policy.maxSide / Math.max(width, height)) : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    limited: scale < 1,
  };
}

/** One-line description for notices next to download buttons. */
export function policySummary(policy: ExportPolicy) {
  return policy.maxSide
    ? `Free plan: up to ${planConfig.freeMaxExportSide.toLocaleString("en-US")}px on the longest side`
    : "Pro: full resolution";
}
