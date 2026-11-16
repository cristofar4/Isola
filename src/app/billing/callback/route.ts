import { handleBillingCallback } from "@/server/billing-callback";

/** Paystack returns here after a checkout started on the public site (see src/server/billing-callback.ts). */
export function GET(request: Request) {
  return handleBillingCallback(request, "site");
}
