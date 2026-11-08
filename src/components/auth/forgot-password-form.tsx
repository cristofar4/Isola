"use client";

import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { FormAlert, TextField } from "./fields";

export function ForgotPasswordForm({ mode }: { mode: "smtp" | "resend" | "console" }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) setError(authErrorMessage(error));
    else setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div className="grid gap-4" role="status">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-success-50 text-success" aria-hidden="true">
          <MailCheck className="size-5" />
        </span>
        <p className="text-sm leading-relaxed text-ink-3">
          If an account exists for <span className="font-semibold text-ink">{sentTo}</span>, we&apos;ve sent a link to reset
          its password. The link expires in 60 minutes.
        </p>
        {mode === "console" && (
          <p className="rounded-[10px] bg-paper-2 px-3 py-2 text-xs text-muted">
            Development mode: no email service is configured, so the link was printed in the server terminal.
          </p>
        )}
        <p className="text-xs text-muted">Didn&apos;t get it? Check your spam folder, or try again in a few minutes.</p>
        <Button variant="secondary" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
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
      <Button type="submit" size="lg" disabled={submitting || !email.trim()} icon={submitting ? <Spinner className="size-5" /> : undefined}>
        {submitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
