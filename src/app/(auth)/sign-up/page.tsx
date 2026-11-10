import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpArt } from "@/components/auth/auth-art";
import { AuthReason, AuthSwitchLink } from "@/components/auth/auth-context";
import { AuthShell, FormSkeleton } from "@/components/auth/auth-shell";
import { AuthSetupNotice, ProviderSlot } from "@/components/auth/provider-slot";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your ISOLA account to start editing.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      badge="Create account"
      art={<SignUpArt />}
      title="Make room for your creativity."
      subtitle="Create your ISOLA account to start editing."
      links={["help", "privacy", "terms"]}
      footer={
        <>
          Already have an account?{" "}
          <Suspense
            fallback={
              <Link href="/sign-in" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Sign in
              </Link>
            }
          >
            <AuthSwitchLink to="/sign-in">Sign in</AuthSwitchLink>
          </Suspense>
        </>
      }
    >
      <Suspense fallback={null}>
        <AuthSetupNotice />
      </Suspense>
      <Suspense fallback={null}>
        <AuthReason mode="sign-up" />
      </Suspense>
      <Suspense fallback={<FormSkeleton />}>
        <SignUpForm social={<ProviderSlot mode="sign-up" />} />
      </Suspense>
    </AuthShell>
  );
}
