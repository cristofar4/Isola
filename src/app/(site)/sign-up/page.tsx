import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthShell, FormSkeleton } from "@/components/auth/auth-shell";
import { ProviderSlot } from "@/components/auth/provider-slot";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create an ISOLA account.",
};

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Background removal still runs on your device. Your images aren't uploaded."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <ProviderSlot mode="sign-up" />
      </Suspense>
      <Suspense fallback={<FormSkeleton />}>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
