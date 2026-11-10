import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInArt } from "@/components/auth/auth-art";
import { AuthReason, AuthSwitchLink } from "@/components/auth/auth-context";
import { AuthShell, FormSkeleton } from "@/components/auth/auth-shell";
import { AuthSetupNotice, ProviderSlot } from "@/components/auth/provider-slot";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your ISOLA account.",
};

export default function SignInPage() {
  return (
    <AuthShell
      badge="Sign in"
      art={<SignInArt />}
      title="Welcome back."
      subtitle="Your next great image starts here."
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
        <AuthSetupNotice />
      </Suspense>
      <Suspense fallback={null}>
        <AuthReason mode="sign-in" />
      </Suspense>
      <Suspense fallback={<FormSkeleton />}>
        <SignInForm social={<ProviderSlot mode="sign-in" />} />
      </Suspense>
    </AuthShell>
  );
}
