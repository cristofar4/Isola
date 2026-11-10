"use client";

import { CircleCheck, Mail, ShieldCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { CheckboxField, FormAlert, PasswordField } from "@/components/auth/fields";
import { BrandIcon, GoogleIcon } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_TOO_SHORT, passwordHint } from "@/lib/password";
import type { CurrentUser } from "@/server/auth";
import { useAccountData } from "./account-data";
import { FooterHint, Section } from "./section";

const methods: Record<string, { label: string; icon: ReactNode }> = {
  credential: { label: "Email and password", icon: <Mail className="size-[18px] text-ink-3" aria-hidden="true" /> },
  google: { label: "Google", icon: <GoogleIcon className="size-[18px]" /> },
  github: { label: "GitHub", icon: <BrandIcon network="github" className="size-[18px]" /> },
};

type Status = { tone: "danger" | "success"; text: string } | null;

export function SecuritySection({ user }: { user: CurrentUser }) {
  const hasPassword = user.providers.includes("credential");
  const loadDevices = useAccountData((s) => s.loadDevices);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const hint = passwordHint(next);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (next.length < PASSWORD_MIN) {
      setStatus({ tone: "danger", text: PASSWORD_TOO_SHORT });
      return;
    }
    setSaving(true);
    setStatus(null);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: revoke });
    setSaving(false);
    if (error) setStatus({ tone: "danger", text: authErrorMessage(error) });
    else {
      setStatus({ tone: "success", text: revoke ? "Password changed. Other devices were signed out." : "Password changed." });
      setCurrent("");
      setNext("");
      if (revoke) void loadDevices();
    }
  }

  return (
    <Section
      id="security"
      icon={<ShieldCheck />}
      title="Password & sign-in"
      description="The ways you can sign in, and your password."
      footer={
        hasPassword ? (
          <>
            <CheckboxField label="Sign out of other devices" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} />
            <Button type="submit" form="password-form" disabled={saving || !current || !next} icon={saving ? <Spinner /> : undefined}>
              Change password
            </Button>
          </>
        ) : (
          <FooterHint>This account has no password. Sign in with the method above.</FooterHint>
        )
      }
    >
      <div className="grid gap-6">
        <ul className="divide-y divide-line rounded-[12px] border border-line" aria-label="Sign-in methods">
          {user.providers.map((p) => (
            <li key={p} className="flex items-center gap-3 px-4 py-3">
              {methods[p]?.icon}
              <span className="flex-1 text-[14px] font-medium text-ink">{methods[p]?.label ?? p}</span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success">
                <CircleCheck className="size-4" aria-hidden="true" /> Connected
              </span>
            </li>
          ))}
        </ul>
        {hasPassword && (
          <form id="password-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <PasswordField label="Current password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            <PasswordField
              label="New password"
              autoComplete="new-password"
              required
              maxLength={PASSWORD_MAX}
              hint={hint.text}
              hintTone={hint.tone}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            {status && (
              <div className="sm:col-span-2">
                <FormAlert tone={status.tone}>{status.text}</FormAlert>
              </div>
            )}
          </form>
        )}
      </div>
    </Section>
  );
}
