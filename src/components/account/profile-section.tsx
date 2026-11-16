"use client";

import { Camera, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { avatarFromFile } from "@/lib/avatar";
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
  const [photo, setPhoto] = useState<string | null>(user.image);
  const [photoBusy, setPhotoBusy] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  /** Saves (or removes) the profile photo straight away; it shows by your name everywhere you're signed in. */
  async function savePhoto(next: string | null) {
    setPhotoBusy(true);
    setStatus(null);
    const { error } = await authClient.updateUser({ image: next });
    setPhotoBusy(false);
    if (error) {
      setStatus({ tone: "danger", text: authErrorMessage(error) });
      return;
    }
    setPhoto(next);
    setStatus({ tone: "success", text: next ? "Profile photo saved." : "Profile photo removed." });
    router.refresh();
  }

  async function pickPhoto(file: File | undefined) {
    if (pickerRef.current) pickerRef.current.value = "";
    if (!file) return;
    try {
      await savePhoto(await avatarFromFile(file));
    } catch (error) {
      setPhotoBusy(false);
      setStatus({ tone: "danger", text: error instanceof Error && error.message ? error.message : "That photo couldn't be read." });
    }
  }

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
        <div className="flex items-center gap-4 sm:flex-col sm:items-center sm:gap-2.5" data-profile-photo>
          <Avatar name={name || user.name} email={user.email} image={photo} className="size-[72px] text-[24px] ring-0 shadow-none" />
          <input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-1.5 sm:justify-center">
            <Button type="button" variant="secondary" size="sm" disabled={photoBusy} icon={photoBusy ? <Spinner /> : <Camera className="size-4" aria-hidden="true" />} onClick={() => pickerRef.current?.click()}>
              {photo ? "Change photo" : "Add photo"}
            </Button>
            {photo && (
              <Button type="button" variant="ghost" size="sm" disabled={photoBusy} onClick={() => void savePhoto(null)}>
                Remove photo
              </Button>
            )}
          </div>
        </div>
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
