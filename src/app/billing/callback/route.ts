import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { BillingError, verifyAndGrant } from "@/server/billing";

/**
 * Paystack sends the payer back here with ?reference=…. The payment is
 * verified server-side with Paystack's API before anything changes.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.BETTER_AUTH_URL || url.origin;
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  const to = (path: string) => NextResponse.redirect(new URL(path, base), { headers: { "Cache-Control": "no-store" } });
  if (!reference) return to("/pricing?payment=missing");
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    await verifyAndGrant(reference, session?.user.id);
    return to("/account?upgraded=1");
  } catch (error) {
    const reason = error instanceof BillingError && error.status === 402 ? "incomplete" : error instanceof BillingError && error.status === 403 ? "mismatch" : "failed";
    if (!(error instanceof BillingError)) console.error("[billing] callback failed:", error instanceof Error ? error.message : error);
    return to(`/pricing?payment=${reason}`);
  }
}
