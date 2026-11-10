"use client";

import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_TOO_SHORT, passwordHint } from "@/lib/password";
import { FormAlert, PasswordField } from "./fields";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = passwordHint(password);
  const [fieldError, setFieldError] = useState<{ password?: string; confirm?: string }>({});
  const [done, setDone] = useState(false);

  if (linkError || !token) {
    return (
      <div className="grid gap-4">
        <FormAlert>
          {linkError === "INVALID_TOKEN" || !token
            ? "This reset link is invalid or has expired. Links work once and last 60 minutes."
            : authErrorMessage({ code: linkError ?? undefined })}
        </FormAlert>
        <ButtonLink href="/forgot-password" size="lg">
          Request a new link
        </ButtonLink>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid gap-4" role="status">
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <CircleCheck className="size-5" aria-hidden="true" /> Your password has been changed.
        </p>
        <p className="text-sm text-muted">For your security, you&apos;ve been signed out everywhere. Sign in with your new password.</p>
        <ButtonLink href="/sign-in" size="lg">
          Sign in
        </ButtonLink>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const errors: typeof fieldError = {};
    if (password.length < PASSWORD_MIN) errors.password = PASSWORD_TOO_SHORT;
    if (confirm !== password) errors.confirm = "The passwords don't match.";
    setFieldError(errors);
    if (errors.password || errors.confirm) return;
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! });
    setSubmitting(false);
    if (error) setError(authErrorMessage(error));
    else setDone(true);
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && (
        <FormAlert>
          {error}{" "}
          {/expired|invalid/i.test(error) && (
            <Link href="/forgot-password" className="font-semibold underline">
              Request a new link
            </Link>
          )}
        </FormAlert>
      )}
      <PasswordField
        tall
        label="New password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX}
        hint={hint.text}
        hintTone={hint.tone}
        error={fieldError.password}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <PasswordField
        tall
        label="Confirm new password"
        autoComplete="new-password"
        required
        maxLength={PASSWORD_MAX}
        error={fieldError.confirm}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button type="submit" size="lg" disabled={submitting} icon={submitting ? <Spinner className="size-5" /> : undefined}>
        {submitting ? "Saving…" : "Set new password"}
      </Button>
    </form>
  );
}
