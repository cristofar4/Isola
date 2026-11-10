"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage, oauthErrorMessage, safeNext, verifyCallback } from "@/lib/auth-client";
import { CheckEmail } from "./check-email";
import { CheckboxField, FormAlert, PasswordField, TextField } from "./fields";
import { SignedInNotice } from "./signed-in-notice";

/**
 * Email and password sign-in. `social` (Google/GitHub, when configured) is
 * shown under the form, and only while the form is.
 */
export function SignInForm({ social }: { social?: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(oauthErrorMessage(params.get("error")));
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  if (verifyEmail) return <CheckEmail email={verifyEmail} next={next} reason="sign-in" />;
  if (!isPending && session) return <SignedInNotice name={session.user.name} email={session.user.email} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    // No callbackURL here: Better Auth would turn it into a full-page redirect,
    // which would lose any images open in this tab.
    // Without "Remember me" the session ends when the browser closes (and within a day at most).
    const { error } = await authClient.signIn.email({ email: email.trim(), password, rememberMe: remember });
    if (error?.code === "EMAIL_NOT_VERIFIED") {
      // Only reported after the password checks out. Send a fresh link back to where they were.
      await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: verifyCallback(next) });
      setVerifyEmail(email.trim());
      setSubmitting(false);
      return;
    }
    if (error) {
      setError(authErrorMessage(error));
      setSubmitting(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="grid gap-5">
      <form onSubmit={submit} className="grid gap-4">
        {error && <FormAlert>{error}</FormAlert>}
        <TextField
          tall
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <PasswordField
          tall
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3">
          <CheckboxField label="Remember me" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <Link href="/forgot-password" className="rounded-sm text-[14px] font-semibold text-blue-700 underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={submitting} icon={submitting ? <Spinner className="size-5" /> : undefined}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {social}
    </div>
  );
}
