import "server-only";

import { resolveKey, type ResolvedKey } from "./api-keys";
import { memoryLimiter, type UsageDecision } from "./usage";

/**
 * Shared plumbing for /api/v1: key authentication, per-key rate limits,
 * CORS (keys are bearer tokens, never cookies, so any origin may call) and
 * one error shape: { "error": { "code", "message" } }.
 */

function positive(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/** Requests per key per hour (configurable; a safeguard for the server's CPU). */
export const API_RATE_LIMIT_PER_HOUR = positive(process.env.ISOLA_API_RATE_LIMIT_PER_HOUR, 60);
const limiter = memoryLimiter(API_RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
  "Access-Control-Expose-Headers":
    "X-Isola-Width, X-Isola-Height, X-Isola-Original-Width, X-Isola-Original-Height, X-Isola-Plan, X-Isola-Watermark, X-Isola-Duration-Ms, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  "Access-Control-Max-Age": "86400",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Cache-Control": "no-store",
};

export function rateHeaders(decision: UsageDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(API_RATE_LIMIT_PER_HOUR),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
  };
}

export function apiError(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { ...CORS_HEADERS, ...headers } });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** The key from `Authorization: Bearer …` or `X-Api-Key`. */
function presentedKey(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
    return m ? m[1] : null;
  }
  return request.headers.get("x-api-key")?.trim() || null;
}

export type Authenticated = ResolvedKey & { subject: string };

export async function authenticate(request: Request): Promise<{ ok: true; caller: Authenticated } | { ok: false; response: Response }> {
  const presented = presentedKey(request);
  if (!presented) {
    return {
      ok: false,
      response: apiError(401, "missing_api_key", "Send your API key as `Authorization: Bearer isola_sk_…`. Create one on your Account page.", {
        "WWW-Authenticate": 'Bearer realm="isola"',
      }),
    };
  }
  let resolved: ResolvedKey | null;
  try {
    resolved = await resolveKey(presented);
  } catch (error) {
    console.error("[api] key lookup failed:", error instanceof Error ? error.message : error);
    return { ok: false, response: apiError(503, "service_unavailable", "The API can't check keys right now. Try again shortly.") };
  }
  if (!resolved) {
    return { ok: false, response: apiError(401, "invalid_api_key", "This API key isn't valid. It may have been deleted.", { "WWW-Authenticate": 'Bearer error="invalid_token"' }) };
  }
  return { ok: true, caller: { ...resolved, subject: `key:${resolved.key.id}` } };
}

export async function consumeRate(caller: Authenticated) {
  return limiter.consume(caller.subject);
}

export async function peekRate(caller: Authenticated) {
  return limiter.peek ? limiter.peek(caller.subject) : limiter.consume(caller.subject);
}
