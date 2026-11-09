import { planConfig, uploadLimits } from "@/lib/config";
import { exportPolicy } from "@/lib/plan-policy";
import { API_RATE_LIMIT_PER_HOUR, CORS_HEADERS, authenticate, peekRate, preflight, rateHeaders } from "@/server/public-api";
import { API_MODEL } from "@/server/segmenter";

export function OPTIONS() {
  return preflight();
}

/** GET /api/v1/me: check a key and see its plan, output rules and remaining requests. Doesn't count as a request. */
export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;
  const { key, pro, proUntil } = auth.caller;
  const rate = await peekRate(auth.caller);
  const policy = exportPolicy(pro);
  return Response.json(
    {
      key: {
        name: key.name,
        preview: `${key.start}…${key.end}`,
        createdAt: new Date(key.createdAt).toISOString(),
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt).toISOString() : null,
        requestCount: Number(key.requestCount ?? 0),
      },
      plan: { name: policy.plan, proUntil },
      output: {
        watermark: policy.watermark,
        maxSide: policy.maxSide,
        masks: pro,
        note: pro ? "Full resolution, no watermark." : `Watermarked, up to ${planConfig.freeMaxExportSide}px on the longest side. Upgrade to Pro for full resolution.`,
      },
      rateLimit: { limit: API_RATE_LIMIT_PER_HOUR, remaining: rate.remaining, resetAt: new Date(rate.resetAt).toISOString() },
      limits: {
        maxFileBytes: uploadLimits.maxFileBytes,
        maxDimension: uploadLimits.maxDimension,
        minDimension: uploadLimits.minDimension,
        maxMegapixels: uploadLimits.maxMegapixels,
        formats: ["image/png", "image/jpeg", "image/webp"],
      },
      model: { id: API_MODEL.id, name: API_MODEL.label, license: API_MODEL.license },
    },
    { headers: { ...CORS_HEADERS, ...rateHeaders(rate) } },
  );
}
