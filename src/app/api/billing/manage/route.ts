import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { BillingError, subscriptionManageLink } from "@/server/billing";

/**
 * GET /api/billing/manage → Paystack's page for updating the card or cancelling.
 * With ?from=studio, problems come back to the studio's Settings instead of the site's Account page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = process.env.BETTER_AUTH_URL || url.origin;
  const home = url.searchParams.get("from") === "studio" ? "/studio/settings" : "/account";
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(home)}`, base));
  try {
    const link = await subscriptionManageLink(session.user.id);
    return NextResponse.redirect(link ?? new URL(`${home}?manage=none`, base));
  } catch (error) {
    if (!(error instanceof BillingError)) console.error("[billing] manage link failed:", error instanceof Error ? error.message : error);
    return NextResponse.redirect(new URL(`${home}?manage=failed`, base));
  }
}
