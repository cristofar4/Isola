import { DOC_PAGES } from "@/lib/docs";
import { AuthUnavailableError, getAuth } from "@/server/auth";
import { memoryLimiter, usageSubject } from "@/server/usage";

const limiter = memoryLimiter(30, 60 * 60 * 1000);
const PAGES = new Set(DOC_PAGES.map((p) => p.href));

function json(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/docs/feedback  { page: "/developers/…", helpful: boolean }
 * Records an answer to "Was this page helpful?". Stores the page, the answer
 * and the time; no account, IP address or free text.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return json(403, "forbidden", "Cross-origin requests aren't allowed.");
  const body = (await request.json().catch(() => null)) as { page?: unknown; helpful?: unknown } | null;
  if (!body || typeof body.page !== "string" || !PAGES.has(body.page) || typeof body.helpful !== "boolean") {
    return json(400, "bad-request", "Send { page, helpful } for a developer docs page.");
  }
  const decision = await limiter.consume(usageSubject(request, null));
  if (!decision.allowed) return json(429, "rate-limited", "Thanks, we've got plenty of answers from you for now.");
  try {
    const auth = await getAuth();
    const ctx = await auth.$context;
    await ctx.adapter.create({ model: "docFeedback", data: { page: body.page, helpful: body.helpful, createdAt: new Date() } });
  } catch (error) {
    if (error instanceof AuthUnavailableError) return json(503, "unavailable", "Feedback can't be stored on this deployment.");
    console.error("[docs] feedback failed:", error instanceof Error ? error.message : error);
    return json(500, "error", "Couldn't save that. Please try again.");
  }
  return json(201, "ok", "Thanks for the feedback.");
}
