"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage, oauthErrorMessage, safeNext, verifyCallback } from "@/lib/auth-client";
import { CheckEmail } from "./check-email";
import { FormAlert, PasswordField, TextField } from "./fields";
import { SignedInNotice } from "./signed-in-notice";

export function SignUpForm() {
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

  if (verifyEmail) return <CheckEmail email={verifyEmail} next={next} reason="sign-up" />;
  if (!isPending && session) return <SignedInNotice name={session.user.name} email={session.user.email} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setPasswordError("Use at least 8 characters.");
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
    <form onSubmit={submit} className="grid gap-4">
      {error && <FormAlert>{error}</FormAlert>}
      <TextField label="Name" name="name" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        required
        maxLength={128}
        hint="At least 8 characters."
        error={passwordError}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" size="lg" disabled={submitting} icon={submitting ? <Spinner className="size-5" /> : undefined}>
        {submitting ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-xs leading-relaxed text-muted">
        By creating an account you agree to the <a className="underline" href="/terms">Terms</a> and acknowledge the{" "}
        <a className="underline" href="/privacy">Privacy</a> page.
      </p>
    </form>
  );
}
