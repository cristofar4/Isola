"use client";

import { useSearchParams } from "next/navigation";

const messages: Record<string, string> = {
  failed: "We couldn't confirm that payment. If you were charged, contact support with your Paystack receipt.",
  incomplete: "That payment wasn't completed, so nothing was charged for Pro.",
  mismatch: "That payment belongs to a different ISOLA account. Sign in with the account you paid from.",
  missing: "The payment provider didn't return a payment reference.",
};

export function PaymentNotice() {
  const params = useSearchParams();
  const code = params.get("payment");
  if (!code || !messages[code]) return null;
  return (
    <div role="alert" className="mx-auto mb-8 max-w-2xl rounded-[12px] border border-danger/25 bg-danger-50 px-4 py-3 text-center text-sm text-danger">
      {messages[code]}
    </div>
  );
}
