"use client";

import { create } from "zustand";
import type { BrandPreset, BrandPresetInput } from "@/lib/brand-presets";

type Result = { ok: true; preset: BrandPreset } | { ok: false; message: string };

interface PresetsState {
  presets: BrandPreset[] | null;
  error: string | null;
  load: () => Promise<void>;
  save: (input: BrandPresetInput, id?: string) => Promise<Result>;
  remove: (id: string) => Promise<boolean>;
}

function sorted(list: BrandPreset[]) {
  return [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.createdAt.localeCompare(b.createdAt));
}

/** Brand presets on the account, shared by the dashboard card, the presets page and the command palette. */
export const usePresets = create<PresetsState>((set, get) => ({
  presets: null,
  error: null,
  async load() {
    try {
      const res = await fetch("/api/presets", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { presets?: BrandPreset[]; message?: string };
      if (res.ok && json.presets) set({ presets: sorted(json.presets), error: null });
      else set({ error: json.message ?? "Couldn't load your brand presets." });
    } catch {
      set({ error: "Couldn't reach the server." });
    }
  },
  async save(input, id) {
    try {
      const res = await fetch(id ? `/api/presets/${encodeURIComponent(id)}` : "/api/presets", {
        method: id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json().catch(() => ({}))) as { preset?: BrandPreset; message?: string };
      if (!res.ok || !json.preset) return { ok: false, message: json.message ?? "Couldn't save the preset." };
      // Making one the default clears the flag on the others, so reload the list.
      if (input.isDefault || !get().presets?.length) await get().load();
      else set((s) => ({ presets: sorted([...(s.presets ?? []).filter((p) => p.id !== json.preset!.id), json.preset!]) }));
      return { ok: true, preset: json.preset };
    } catch {
      return { ok: false, message: "Couldn't reach the server." };
    }
  },
  async remove(id) {
    try {
      const res = await fetch(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) return false;
      await get().load();
      return true;
    } catch {
      return false;
    }
  },
}));

export function defaultPreset(presets: BrandPreset[] | null) {
  return presets?.find((p) => p.isDefault) ?? presets?.[0] ?? null;
}
