"use client";

import { create } from "zustand";
import type { DeviceKind } from "@/lib/user-agent";

/** What the account page shows about an API key (never the key or its hash). */
export interface KeySummary {
  id: string;
  name: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
}

export interface DeviceSummary {
  id: string;
  current: boolean;
  label: string;
  kind: DeviceKind;
  ipAddress: string | null;
  signedInAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

type Loadable<T> = { data: T | null; error: string | null };

interface AccountData {
  keys: Loadable<KeySummary[]>;
  devices: Loadable<DeviceSummary[]>;
  loadKeys: () => Promise<void>;
  loadDevices: () => Promise<void>;
  setKeys: (update: (keys: KeySummary[]) => KeySummary[]) => void;
}

async function getJson<T>(url: string, field: string): Promise<{ data: T } | { error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && json[field]) return { data: json[field] as T };
    return { error: typeof json.message === "string" ? json.message : "Couldn't load this. Try again." };
  } catch {
    return { error: "Couldn't reach the server." };
  }
}

/** Keys and devices, loaded once and shared by the overview and their sections. */
export const useAccountData = create<AccountData>((set) => ({
  keys: { data: null, error: null },
  devices: { data: null, error: null },
  async loadKeys() {
    set((s) => ({ keys: { data: s.keys.data, error: null } }));
    const r = await getJson<KeySummary[]>("/api/keys", "keys");
    set({ keys: "data" in r ? { data: r.data, error: null } : { data: null, error: r.error } });
  },
  async loadDevices() {
    set((s) => ({ devices: { data: s.devices.data, error: null } }));
    const r = await getJson<DeviceSummary[]>("/api/account/devices", "devices");
    set({ devices: "data" in r ? { data: r.data, error: null } : { data: null, error: r.error } });
  },
  setKeys(update) {
    set((s) => ({ keys: { data: update(s.keys.data ?? []), error: null } }));
  },
}));

export function formatDate(iso: string, month: "long" | "short" = "long") {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month, year: "numeric" });
}

/** "Just now", "12 min ago", "3 h ago", "Yesterday", or a date. */
export function relativeTime(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  if (mins < 60 * 48) return "Yesterday";
  return formatDate(iso, "short");
}
