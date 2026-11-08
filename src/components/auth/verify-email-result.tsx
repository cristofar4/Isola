"use client";

import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage, safeNext, verifyCallback } from "@/lib/auth-client";
import { FormAlert, TextField } from "./fields";

export function VerifyEmailResult() {
  const params = useSearchParams();
  const error = params.get("error");
  const next = safeNext(params.get("next"), "/editor");
  const { data } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "danger" | "success"; text: string } | null>(null);

  if (!error) {
    return (
      <div className="grid gap-4" role="status">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-success">
          <CircleCheck className="size-5" aria-hidden="true" /> Your email is confirmed.
        </p>
        <p className="text-sm leading-relaxed text-ink-3">
          {data?.user ? (
            <>
              You&apos;re signed in as <span className="font-semibold text-ink">{data.user.email}</span>.
            </>
          ) : (
            "You can sign in now."
          )}{" "}
          If you started in another tab, you can go back to it and carry on.
        </p>
        <ButtonLink href={data?.user ? next : `/sign-in?next=${encodeURIComponent(next)}`} size="lg">
          {data?.user ? "Continue" : "Sign in"}
        </ButtonLink>
      </div>
    );
  }

  async function resend(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setNotice(null);
    const { error } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: verifyCallback(next) });
    setSending(false);
    setNotice(
      error
        ? { tone: "danger", text: authErrorMessage(error) }
        : { tone: "success", text: "If that address has an unconfirmed account, we've sent a new link." },
    );
  }

  return (
    <form onSubmit={resend} className="grid gap-4">
      <FormAlert>{authErrorMessage({ code: error })}</FormAlert>
      <p className="text-sm text-ink-3">Enter your email and we&apos;ll send a new confirmation link.</p>
      <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      <Button type="submit" size="lg" disabled={sending || !email.trim()} icon={sending ? <Spinner className="size-5" /> : undefined}>
        Send a new link
      </Button>
    </form>
  );
}
