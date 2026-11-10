"use client";

import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FormAlert, TextField } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import type { CurrentUser } from "@/server/auth";
import { Avatar } from "./account-header";
import { FooterHint, Section } from "./section";

type Status = { tone: "danger" | "success"; text: string } | null;

export function ProfileSection({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const unchanged = !name.trim() || name.trim() === user.name;

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
    <Section
      id="profile"
      icon={<UserRound />}
      title="Profile"
      description="How you appear in ISOLA and in the emails we send you."
      footer={
        <>
          <FooterHint>Up to 80 characters.</FooterHint>
          <Button type="submit" form="profile-form" disabled={saving || unchanged} icon={saving ? <Spinner /> : undefined}>
            Save profile
          </Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={save} className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6">
        <Avatar name={name || user.name} email={user.email} className="size-14 text-[19px] ring-0 shadow-none" />
        <div className="grid gap-4">
          <TextField label="Name" autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="Email"
            type="email"
            value={user.email}
            readOnly
            disabled
            hint={`${user.emailVerified ? "Confirmed." : "Not confirmed yet."} Email changes aren't available yet.`}
          />
          {status && <FormAlert tone={status.tone}>{status.text}</FormAlert>}
        </div>
      </form>
    </Section>
  );
}
