import { handleBillingCallback } from "@/server/billing-callback";

/** Paystack returns here after a checkout started inside the studio, so you land back in the studio. */
export function GET(request: Request) {
  return handleBillingCallback(request, "studio");
}
