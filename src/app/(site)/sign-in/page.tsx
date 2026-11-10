import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthReason, AuthSwitchLink } from "@/components/auth/auth-context";
import { AuthShell, FormSkeleton } from "@/components/auth/auth-shell";
import { ProviderSlot } from "@/components/auth/provider-slot";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ISOLA account.",
};

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your ISOLA account."
      footer={
        <>
          New to ISOLA?{" "}
          <Suspense
            fallback={
              <Link href="/sign-up" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Create an account
              </Link>
            }
          >
            <AuthSwitchLink to="/sign-up">Create an account</AuthSwitchLink>
          </Suspense>
        </>
      }
    >
      <Suspense fallback={null}>
        <AuthReason mode="sign-in" />
      </Suspense>
      <Suspense fallback={null}>
        <ProviderSlot mode="sign-in" />
      </Suspense>
      <Suspense fallback={<FormSkeleton />}>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
