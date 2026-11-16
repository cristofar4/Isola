"use client";

import { useEffect } from "react";
import { warmEngine } from "@/lib/project/actions";

/**
 * Starts getting the engine ready once the browser is idle, so the first
 * image placed in the editor is processed straight away instead of waiting
 * for the model. Repeated calls are free: the engine prepares only once.
 */
export function useWarmEngine(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const start = () => void warmEngine();
    // Safari has no requestIdleCallback: a short delay does the same job there.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 300);
    return () => clearTimeout(id);
  }, [enabled]);
}
