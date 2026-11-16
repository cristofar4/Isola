import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthShell, FormSkeleton } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { authConfigurationProblem } from "@/server/auth";
import { emailMode } from "@/server/email";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Get a link to reset your ISOLA password.",
};

/** Reads configuration at request time so it can change without a rebuild. */
async function ForgotPasswordContent() {
  await connection();
  const problem = authConfigurationProblem();
  const mode = emailMode();
  if (problem || !mode) {
    return (
      <div role="alert" className="grid gap-2 rounded-[10px] border border-warn/25 bg-warn-50 px-3 py-2.5 text-[13px] leading-relaxed text-warn">
        <p>
          Password reset by email isn&apos;t set up on this deployment
          {problem ? ` (${problem})` : " (no email service is configured)"}, so no reset email can be sent. Contact the site operator for
          help with your account.
        </p>
        {!problem && (
          <p className="text-ink-3">
            Still signed in somewhere? You can change your password in{" "}
            <Link href="/studio/settings#security" className="font-semibold text-blue-700 underline underline-offset-2">
              Settings → Password &amp; sign-in
            </Link>{" "}
            without email.
          </p>
        )}
      </div>
    );
  }
  return <ForgotPasswordForm mode={mode} />;
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      badge="Reset password"
      links={["help", "privacy", "terms"]}
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link to choose a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/sign-in" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <ForgotPasswordContent />
      </Suspense>
    </AuthShell>
  );
}
