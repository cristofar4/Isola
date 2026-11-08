"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage, oauthErrorMessage, safeNext } from "@/lib/auth-client";
import { FormAlert, PasswordField, TextField } from "./fields";
import { SignedInNotice } from "./signed-in-notice";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(oauthErrorMessage(params.get("error")));

  if (!isPending && session) return <SignedInNotice name={session.user.name} email={session.user.email} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email: email.trim(), password, rememberMe: true });
    if (error) {
      setError(authErrorMessage(error));
      setSubmitting(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate={false}>
      {error && <FormAlert>{error}</FormAlert>}
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
        autoComplete="current-password"
        required
        labelAction={
          <Link href="/forgot-password" className="text-[13px] font-medium text-blue-700 underline-offset-2 hover:underline">
            Forgot password?
          </Link>
        }
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" size="lg" disabled={submitting} icon={submitting ? <Spinner className="size-5" /> : undefined}>
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
