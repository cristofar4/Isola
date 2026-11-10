"use client";

import { LogOut, Monitor, MonitorSmartphone, Smartphone, Tablet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/auth/fields";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { formatDate, relativeTime, useAccountData, type DeviceSummary } from "./account-data";
import { Section } from "./section";

const icons = { desktop: Monitor, mobile: Smartphone, tablet: Tablet } as const;
type Status = { tone: "danger" | "success"; text: string } | null;

function DeviceRow({ device, onSignOut, busy }: { device: DeviceSummary; onSignOut: () => void; busy: boolean }) {
  const Icon = icons[device.kind];
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5" data-device={device.current ? "current" : "other"}>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-paper text-ink-3" aria-hidden="true">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">
          {device.label}
          {device.current && (
            <span className="rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-success">This device</span>
          )}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          Signed in {formatDate(device.signedInAt, "short")}
          {!device.current && <> · Last active {relativeTime(device.lastActiveAt).toLowerCase()}</>}
          {device.ipAddress && <> · {device.ipAddress}</>}
        </p>
      </div>
      {!device.current && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={onSignOut}
          aria-label={`Sign out ${device.label}, signed in ${formatDate(device.signedInAt, "short")}`}
          icon={busy ? <Spinner /> : undefined}
        >
          Sign out
        </Button>
      )}
    </li>
  );
}

/** Every browser signed in to this account, with a way to sign each one out. */
export function DevicesSection() {
  const router = useRouter();
  const devices = useAccountData((s) => s.devices.data);
  const loadError = useAccountData((s) => s.devices.error);
  const loadDevices = useAccountData((s) => s.loadDevices);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const others = devices?.filter((d) => !d.current).length ?? 0;

  async function signOutOne(device: DeviceSummary) {
    setBusy(device.id);
    setStatus(null);
    const res = await fetch(`/api/account/devices/${encodeURIComponent(device.id)}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (res?.ok || res?.status === 404) setStatus({ tone: "success", text: `Signed out ${device.label}.` });
    else setStatus({ tone: "danger", text: "Couldn't sign that device out. Try again." });
    await loadDevices();
  }

  async function signOutOthers() {
    setBusy("others");
    setStatus(null);
    const { error } = await authClient.revokeOtherSessions();
    setBusy(null);
    setStatus(error ? { tone: "danger", text: authErrorMessage(error) } : { tone: "success", text: "Signed out of all other devices." });
    await loadDevices();
  }

  return (
    <Section
      id="devices"
      icon={<MonitorSmartphone />}
      title="Devices"
      description="Browsers signed in to your account. With Remember me a sign-in lasts up to 30 days; without it, until the browser closes."
      footer={
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy !== null || others === 0} onClick={() => void signOutOthers()} icon={busy === "others" ? <Spinner /> : undefined}>
            Sign out other devices
          </Button>
          <Button
            variant="ghost"
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
      }
    >
      <div className="grid gap-4">
        {status && <FormAlert tone={status.tone}>{status.text}</FormAlert>}
        {loadError ? (
          <FormAlert>
            {loadError}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void loadDevices()}>
              Retry
            </button>
          </FormAlert>
        ) : !devices ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading devices…
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-[12px] border border-line" aria-label="Signed-in devices">
            {devices.map((d) => (
              <DeviceRow key={d.id} device={d} busy={busy === d.id} onSignOut={() => void signOutOne(d)} />
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
