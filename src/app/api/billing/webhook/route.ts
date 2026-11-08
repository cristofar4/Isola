import { BillingError, billingConfigured, handleWebhook, validWebhookSignature } from "@/server/billing";

/**
 * POST /api/billing/webhook — Paystack events (charge.success for first and
 * renewal payments, subscription changes). Requests must carry a valid
 * x-paystack-signature; payments are re-verified with Paystack's API.
 */
export async function POST(request: Request) {
  if (!billingConfigured()) return new Response("Billing not configured", { status: 503 });
  const raw = await request.text();
  if (!validWebhookSignature(raw, request.headers.get("x-paystack-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  let event: Parameters<typeof handleWebhook>[0];
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  try {
    await handleWebhook(event);
  } catch (error) {
    // A payment that doesn't check out is acknowledged (so it isn't retried forever) but not granted.
    if (!(error instanceof BillingError)) {
      console.error("[billing] webhook failed:", error instanceof Error ? error.message : error);
      return new Response("Error", { status: 500 });
    }
  }
  return new Response("ok");
}
