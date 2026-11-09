import { AuthUnavailableError, getAuth } from "@/server/auth";
import { BillingError, billingConfigured, isInterval, planOf, safeReturnPath, startCheckout } from "@/server/billing";

function json(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ code, message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/billing/checkout  { interval?: "monthly" | "yearly", returnTo?: "/batch" | … }
 * → { url } of Paystack's hosted payment page.
 */
export async function POST(request: Request) {
  if (!billingConfigured()) return json(503, "billing-unavailable", "Payments aren't set up on this deployment yet.");
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return json(403, "forbidden", "Cross-origin requests aren't allowed.");
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return json(401, "auth-required", "Sign in to upgrade.");
    const body = (await request.json().catch(() => ({}))) as { interval?: unknown; returnTo?: unknown };
    if (body.interval !== undefined && !isInterval(body.interval)) return json(400, "bad-interval", "Choose monthly or yearly billing.");
    const plan = planOf(session.user as { proUntil?: Date | null; proRenews?: boolean | null });
    if (plan.pro && plan.renews) {
      return json(409, "already-pro", "You're already on Pro and it renews automatically. To switch billing, cancel from Manage subscription on your Account page first.");
    }
    const base = process.env.BETTER_AUTH_URL || new URL(request.url).origin;
    const { url } = await startCheckout({
      userId: session.user.id,
      email: session.user.email,
      origin: base,
      interval: isInterval(body.interval) ? body.interval : "monthly",
      returnTo: safeReturnPath(body.returnTo),
    });
    return json(200, "ok", "Redirecting to payment.", { url });
  } catch (error) {
    if (error instanceof AuthUnavailableError) return json(503, "auth-unavailable", error.message);
    if (error instanceof BillingError) return json(error.status, "billing-error", error.message);
    console.error("[billing] checkout failed:", error instanceof Error ? error.message : error);
    return json(500, "error", "Couldn't start checkout. Please try again.");
  }
}
