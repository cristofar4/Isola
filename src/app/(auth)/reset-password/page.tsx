import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell, FormSkeleton } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your ISOLA account.",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      badge="New password"
      links={["help", "privacy", "terms"]}
      title="Choose a new password"
      subtitle="After you save it, you'll be signed out of every device."
      footer={
        <Link href="/sign-in" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
