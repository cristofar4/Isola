import "server-only";

import { NextResponse } from "next/server";
import { getAuth } from "./auth";
import { BillingError, paymentProblemPath, verifyAndGrant } from "./billing";

/**
 * Paystack sends the payer back with ?reference=…. The payment is verified
 * server-side with Paystack's API before anything changes. `place` is where
 * checkout started: payments from the studio come back to the studio, even
 * when something went wrong.
 */
export async function handleBillingCallback(request: Request, place: "site" | "studio") {
  const url = new URL(request.url);
  const base = process.env.BETTER_AUTH_URL || url.origin;
  const problems = place === "studio" ? "/studio/plans" : "/pricing";
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  const to = (path: string) => NextResponse.redirect(new URL(path, base), { headers: { "Cache-Control": "no-store" } });
  if (!reference) return to(`${problems}?payment=missing`);
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    const result = await verifyAndGrant(reference, session?.user.id);
    return to(`${result.returnTo ?? (place === "studio" ? "/studio/plans" : "/studio/settings")}?upgraded=1`);
  } catch (error) {
    const reason = error instanceof BillingError && error.status === 402 ? "incomplete" : error instanceof BillingError && error.status === 403 ? "mismatch" : "failed";
    if (!(error instanceof BillingError)) console.error("[billing] callback failed:", error instanceof Error ? error.message : error);
    return to(`${paymentProblemPath(place === "studio" ? "/studio" : null)}?payment=${reason}`);
  }
}
