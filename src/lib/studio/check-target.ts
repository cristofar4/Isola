"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { TargetId } from "@/lib/consistency";

const TARGET_KEY = "isola:check-target";

const useTargetStore = create<{ target: TargetId | null; loaded: boolean; set: (t: TargetId | null) => void }>((set) => ({
  target: null,
  loaded: false,
  set: (target) => {
    set({ target, loaded: true });
    try {
      if (target) localStorage.setItem(TARGET_KEY, target);
      else localStorage.removeItem(TARGET_KEY);
    } catch {
      // Storage blocked: the choice just isn't remembered.
    }
  },
}));

/** The destination the check measures against, shared by every view and remembered in this browser. */
export function useCheckTarget(): [TargetId | null, (t: TargetId | null) => void] {
  const target = useTargetStore((s) => s.target);
  const loaded = useTargetStore((s) => s.loaded);
  const set = useTargetStore((s) => s.set);
  useEffect(() => {
    if (loaded) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(TARGET_KEY);
    } catch {
      // Ignore.
    }
    useTargetStore.setState({ loaded: true, target: saved === "amazon" || saved === "instagram" ? saved : null });
  }, [loaded]);
  return [target, set];
}

