"use client";

import { MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage, refreshSession, verifyCallback } from "@/lib/auth-client";
import { FormAlert } from "./fields";

/**
 * Shown after sign-up (or an unverified sign-in). When the person confirms
 * their email in another tab, this tab notices the new session on focus and
 * continues to `next`, so anything they were working on here is kept.
 */
export function CheckEmail({ email, next, reason }: { email: string; next: string; reason: "sign-up" | "sign-in" }) {
  const router = useRouter();
  const { data } = authClient.useSession();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (data?.session) {
      router.push(next);
      router.refresh();
    }
  }, [data?.session, next, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    setSending(true);
    setNotice(null);
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL: verifyCallback(next) });
    setSending(false);
    if (error) setNotice({ tone: "danger", text: authErrorMessage(error) });
    else {
      setNotice({ tone: "success", text: "We've sent another link." });
      setCooldown(30);
    }
  }

  async function check() {
    setChecking(true);
    setNotice(null);
    const { data } = await authClient.getSession();
    setChecking(false);
    if (data?.session) {
      // Let the header and other session consumers pick up the new sign-in.
      refreshSession();
      router.push(next);
      router.refresh();
    } else setNotice({ tone: "danger", text: "Your email isn't confirmed yet. Open the link in the email we sent." });
  }

  return (
    <div className="grid gap-4" role="status">
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-blue-50 text-blue" aria-hidden="true">
        <MailCheck className="size-5" />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink">{reason === "sign-up" ? "Check your email" : "Confirm your email first"}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-3">
          We sent a link to <span className="font-semibold text-ink">{email}</span>. Open it to confirm your address and
          you&apos;ll be signed in. The link expires in 24 hours.
        </p>
        <p className="mt-2 text-xs text-muted">
          You can keep this tab open. Once you&apos;ve confirmed, come back here and you&apos;ll carry on where you left off.
        </p>
      </div>
      {notice && <FormAlert tone={notice.tone}>{notice.text}</FormAlert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void check()} disabled={checking} icon={checking ? <Spinner /> : undefined}>
          I&apos;ve confirmed my email
        </Button>
        <Button variant="secondary" onClick={() => void resend()} disabled={sending || cooldown > 0} icon={sending ? <Spinner /> : undefined}>
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
        </Button>
      </div>
      <p className="text-xs text-muted">Didn&apos;t get it? Check your spam folder.</p>
    </div>
  );
}
