import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { BillingError, subscriptionManageLink } from "@/server/billing";

/** GET /api/billing/manage → Paystack's page for updating the card or cancelling. */
export async function GET(request: Request) {
  const base = process.env.BETTER_AUTH_URL || new URL(request.url).origin;
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(new URL("/sign-in?next=/account", base));
  try {
    const link = await subscriptionManageLink(session.user.id);
    return NextResponse.redirect(link ?? new URL("/account?manage=none", base));
  } catch (error) {
    if (!(error instanceof BillingError)) console.error("[billing] manage link failed:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL("/account?manage=failed", base));
  }
}
