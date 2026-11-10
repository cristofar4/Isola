"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage, oauthErrorMessage, safeNext, verifyCallback } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_TOO_SHORT, passwordHint } from "@/lib/password";
import { CheckEmail } from "./check-email";
import { FormAlert, PasswordField, TextField } from "./fields";
import { SignedInNotice } from "./signed-in-notice";

/**
 * Name, email and password sign-up. `social` (Google/GitHub, when configured)
 * is shown under the form, and only while the form is.
 */
export function SignUpForm({ social }: { social?: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(oauthErrorMessage(params.get("error")));
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const hint = passwordHint(password);

  if (verifyEmail) return <CheckEmail email={verifyEmail} next={next} reason="sign-up" />;
  if (!isPending && session) return <SignedInNotice name={session.user.name} email={session.user.email} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN) {
      setPasswordError(PASSWORD_TOO_SHORT);
      return;
    }
    setPasswordError(null);
    setSubmitting(true);
    const { data, error } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
      callbackURL: verifyCallback(next),
    });
    if (error) {
      setError(authErrorMessage(error));
      setSubmitting(false);
      return;
    }
    // No session yet means the deployment requires a confirmed email first.
    if (!data?.token) {
      setVerifyEmail(email.trim());
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
          label="Name"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          maxLength={PASSWORD_MAX}
          hint={hint.text}
          hintTone={hint.tone}
          error={passwordError}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (passwordError && e.target.value.length >= PASSWORD_MIN) setPasswordError(null);
          }}
        />
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={submitting} icon={submitting ? <Spinner className="size-5" /> : undefined}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-[13px] leading-relaxed text-muted">
          By creating an account, you agree to our{" "}
          <Link className="font-medium text-ink-3 underline underline-offset-2 hover:text-ink" href="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="font-medium text-ink-3 underline underline-offset-2 hover:text-ink" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
      {social}
    </div>
  );
}
