"use client";

import { AlertDialog } from "radix-ui";
import { CircleCheck, KeyRound, LogOut, MonitorSmartphone, Sparkles, Trash2, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { UpgradeButton } from "@/components/billing/upgrade-button";
import { formatNaira, planConfig, uploadLimits } from "@/lib/config";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN, PASSWORD_TOO_SHORT, passwordHint } from "@/lib/password";
import type { CurrentUser } from "@/server/auth";
import { Card } from "./account-card";
import { ApiKeysCard } from "./api-keys-card";
import { FormAlert, PasswordField, TextField } from "./fields";

const providerLabel: Record<string, string> = { credential: "Email and password", google: "Google", github: "GitHub" };

type Status = { tone: "danger" | "success"; text: string } | null;

function ProfileCard({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    setStatus(error ? { tone: "danger", text: authErrorMessage(error) } : { tone: "success", text: "Profile saved." });
    if (!error) router.refresh();
  }
  return (
    <Card icon={<UserRound className="size-4" />} title="Profile" description={`Member since ${new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}>
      <form onSubmit={save} className="grid gap-4">
        <TextField label="Name" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          label="Email"
          type="email"
          value={user.email}
          readOnly
          disabled
          hint={`${user.emailVerified ? "Confirmed." : "Not confirmed yet."} Email changes aren't available yet.`}
        />
        <div>
          <p className="text-[13px] font-medium text-ink">Sign-in methods</p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {user.providers.map((p) => (
              <li key={p} className="inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-1 text-xs font-medium text-ink">
                <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
                {providerLabel[p] ?? p}
              </li>
            ))}
          </ul>
        </div>
        {status && <FormAlert tone={status.tone}>{status.text}</FormAlert>}
        <div>
          <Button type="submit" disabled={saving || !name.trim() || name.trim() === user.name} icon={saving ? <Spinner /> : undefined}>
            Save profile
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [revoke, setRevoke] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const nextHint = passwordHint(next);
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
    }
  }
  return (
    <Card icon={<KeyRound className="size-4" />} title="Password">
      <form onSubmit={save} className="grid gap-4">
        <PasswordField label="Current password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="New password" autoComplete="new-password" required maxLength={PASSWORD_MAX} hint={nextHint.text} hintTone={nextHint.tone} value={next} onChange={(e) => setNext(e.target.value)} />
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} className="size-4 accent-[var(--color-blue)]" />
          Sign out of other devices
        </label>
        {status && <FormAlert tone={status.tone}>{status.text}</FormAlert>}
        <div>
          <Button type="submit" disabled={saving || !current || !next} icon={saving ? <Spinner /> : undefined}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const router = useRouter();
  const [busy, setBusy] = useState<"others" | "this" | null>(null);
  const [status, setStatus] = useState<Status>(null);
  return (
    <Card icon={<MonitorSmartphone className="size-4" />} title="Sessions" description="You stay signed in for up to 30 days on each device.">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy !== null}
          icon={busy === "others" ? <Spinner /> : undefined}
          onClick={async () => {
            setBusy("others");
            const { error } = await authClient.revokeOtherSessions();
            setBusy(null);
            setStatus(error ? { tone: "danger", text: authErrorMessage(error) } : { tone: "success", text: "Signed out of all other devices." });
          }}
        >
          Sign out other devices
        </Button>
        <Button
          variant="secondary"
          disabled={busy !== null}
          icon={busy === "this" ? <Spinner /> : <LogOut className="size-4" aria-hidden="true" />}
          onClick={async () => {
            setBusy("this");
            await authClient.signOut();
            router.push("/");
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </div>
      {status && (
        <div className="mt-4">
          <FormAlert tone={status.tone}>{status.text}</FormAlert>
        </div>
      )}
    </Card>
  );
}

function DeleteCard({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const hasPassword = user.providers.includes("credential");
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = confirm.trim().toLowerCase() === "delete" && (!hasPassword || password.length > 0);

  async function remove(e: FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setError(null);
    const { error } = await authClient.deleteUser(hasPassword ? { password } : {});
    if (error) {
      setError(authErrorMessage(error));
      setDeleting(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <Card icon={<Trash2 className="size-4" />} title="Delete account" description="Removes your profile, sign-in methods and sessions. This can't be undone.">
      <AlertDialog.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPassword(""); setConfirm(""); setError(null); } }}>
        <AlertDialog.Trigger asChild>
          <Button variant="danger">Delete account…</Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-[18px] bg-surface p-6 shadow-[var(--shadow-float)]">
            <AlertDialog.Title className="font-display text-lg font-bold">Delete your account?</AlertDialog.Title>
            <AlertDialog.Description className="mt-1.5 text-sm text-muted">
              Your account for {user.email} will be permanently deleted.
            </AlertDialog.Description>
            <form onSubmit={remove} className="mt-5 grid gap-4">
              {hasPassword && (
                <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              )}
              <TextField label='Type "delete" to confirm' autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              {error && <FormAlert>{error}</FormAlert>}
              <div className="flex justify-end gap-2">
                <AlertDialog.Cancel asChild>
                  <Button variant="secondary">Cancel</Button>
                </AlertDialog.Cancel>
                <Button type="submit" variant="danger" disabled={!ready || deleting} icon={deleting ? <Spinner /> : undefined}>
                  Delete account
                </Button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Card>
  );
}

function PlanCard({ user, billingAvailable }: { user: CurrentUser; billingAvailable: boolean }) {
  const params = useSearchParams();
  const upgraded = params.get("upgraded") === "1";
  const manage = params.get("manage");
  const { plan } = user;
  const until = plan.proUntil ? new Date(plan.proUntil).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;
  return (
    <Card
      icon={<Sparkles className="size-4" />}
      title="Plan"
      description={
        plan.pro
          ? plan.interval === "yearly"
            ? `Pro · ${formatNaira(planConfig.proYearlyPriceNgn)}/year`
            : `Pro · ${formatNaira(planConfig.proPriceNgn)}/month`
          : "Free"
      }
    >
      <div className="grid gap-4">
        {upgraded && plan.pro && <FormAlert tone="success">Payment confirmed. Welcome to Pro.</FormAlert>}
        {manage === "failed" && <FormAlert>Couldn&apos;t open subscription management. Please try again.</FormAlert>}
        {plan.pro ? (
          <>
            <p className="text-sm leading-relaxed text-ink-3">
              Full-resolution HD exports without a watermark, and Batch Studio. Billed {plan.interval === "yearly" ? "yearly" : "monthly"}. Active until{" "}
              <span className="font-semibold text-ink">{until}</span>.{" "}
              {plan.renews ? "Renews automatically." : "It won't renew on its own; pay again before then to keep Pro."}
            </p>
            <div className="flex flex-wrap gap-2">
              {plan.hasSubscription ? (
                <a
                  href="/api/billing/manage"
                  className="inline-flex h-10 items-center rounded-[10px] border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-paper"
                >
                  Manage subscription
                </a>
              ) : (
                !plan.renews && (
                  <UpgradeButton available={billingAvailable} size="md" className="w-auto" returnTo="/account" interval={plan.interval ?? "monthly"} />
                )
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-ink-3">
              Free exports include an ISOLA watermark and are limited to {planConfig.freeMaxExportSide.toLocaleString("en-US")}px.
              Pro removes the watermark, exports at full resolution and unlocks Batch Studio (up to {uploadLimits.maxBatchFiles}{" "}
              images at a time) for {formatNaira(planConfig.proPriceNgn)}/month or {formatNaira(planConfig.proYearlyPriceNgn)}/year.
            </p>
            <div className="flex flex-wrap gap-2">
              <UpgradeButton available={billingAvailable} size="md" className="w-auto" returnTo="/account" interval="monthly" label={`Monthly · ${formatNaira(planConfig.proPriceNgn)}`} />
              <UpgradeButton available={billingAvailable} size="md" className="w-auto" returnTo="/account" interval="yearly" label={`Yearly · ${formatNaira(planConfig.proYearlyPriceNgn)}`} />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export function AccountPanel({ user, billingAvailable }: { user: CurrentUser; billingAvailable: boolean }) {
  return (
    <div className="grid gap-5">
      <PlanCard user={user} billingAvailable={billingAvailable} />
      <ApiKeysCard pro={user.plan.pro} />
      <ProfileCard user={user} />
      {user.providers.includes("credential") && <PasswordCard />}
      <SessionsCard />
      <DeleteCard user={user} />
    </div>
  );
}
