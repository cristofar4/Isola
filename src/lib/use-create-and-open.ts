"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** If the page is still showing this long after navigating, the navigation didn't happen: allow another try. */
export const NAVIGATION_GRACE_MS = 12_000;

/**
 * Create something, then open it: one click at a time, with a pending state
 * that never outlives the navigation it started.
 *
 * Next.js keeps a page mounted (hidden) after you navigate away and brings it
 * back with its state, so a "Creating…" flag set before `router.push` used to
 * still be set when you returned, leaving the buttons disabled until a
 * refresh. Here the flag is cleared:
 * - when the page is hidden or unmounted (the navigation happened),
 * - when creating fails (the error is passed on),
 * - and if the page is still showing NAVIGATION_GRACE_MS after navigating
 *   (the navigation was cancelled or never started).
 * A second click while one is pending is ignored, so nothing is created twice.
 */
export function useCreateAndOpen<K extends string>() {
  const router = useRouter();
  const [pending, setPending] = useState<K | null>(null);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reset = useCallback(() => {
    locked.current = false;
    clearTimeout(timer.current);
    setPending(null);
  }, []);

  // Runs when the page is hidden (navigated away) or unmounted.
  useEffect(() => reset, [reset]);

  const run = useCallback(
    async (key: K, create: () => Promise<string>, onError?: (error: unknown) => void) => {
      if (locked.current) return;
      locked.current = true;
      setPending(key);
      let href: string;
      try {
        href = await create();
      } catch (error) {
        reset();
        onError?.(error);
        return;
      }
      clearTimeout(timer.current);
      timer.current = setTimeout(reset, NAVIGATION_GRACE_MS);
      router.push(href);
    },
    [reset, router],
  );

  return { pending, run, reset };
}
