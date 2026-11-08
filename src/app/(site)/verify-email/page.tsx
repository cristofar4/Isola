import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell, FormSkeleton } from "@/components/auth/auth-shell";
import { VerifyEmailResult } from "@/components/auth/verify-email-result";

export const metadata: Metadata = {
  title: "Confirm your email",
  description: "Confirm the email address for your ISOLA account.",
  robots: { index: false },
};

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Confirm your email"
      footer={
        <Link href="/" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
          Back to ISOLA
        </Link>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <VerifyEmailResult />
      </Suspense>
    </AuthShell>
  );
}
