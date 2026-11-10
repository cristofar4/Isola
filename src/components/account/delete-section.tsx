"use client";

import { AlertDialog } from "radix-ui";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormAlert, PasswordField, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import type { CurrentUser } from "@/server/auth";
import { FooterHint, Section } from "./section";

export function DeleteSection({ user }: { user: CurrentUser }) {
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
    <Section
      id="delete-account"
      tone="danger"
      icon={<Trash2 />}
      title="Delete account"
      description="Permanently removes your profile, sign-in methods, sessions and API keys. This can't be undone."
      footer={
        <>
          <FooterHint>
            {user.plan.pro && user.plan.hasSubscription
              ? "Cancel your subscription under Manage subscription first so you aren't charged again."
              : "Export anything you need from the editor first; images aren't stored in your account."}
          </FooterHint>
          <AlertDialog.Root
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (!o) {
                setPassword("");
                setConfirm("");
                setError(null);
              }
            }}
          >
            <AlertDialog.Trigger asChild>
              <Button variant="danger">Delete account…</Button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40" />
              <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-[18px] bg-surface p-6 shadow-[var(--shadow-float)]">
                <span className="inline-flex size-10 items-center justify-center rounded-[12px] bg-danger-50 text-danger" aria-hidden="true">
                  <Trash2 className="size-[18px]" />
                </span>
                <AlertDialog.Title className="mt-4 font-display text-lg font-bold">Delete your account?</AlertDialog.Title>
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
        </>
      }
    />
  );
}
