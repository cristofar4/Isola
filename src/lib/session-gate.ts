"use client";

import { useEffect, useRef } from "react";
import { authClient } from "./auth-client";
import { planFromUser } from "./plan";

/**
 * Background removal needs an account. The server enforces this (the model
 * is only served to signed-in users); this module lets the UI check first so
 * it can explain instead of failing.
 */

let cached: { at: number; signedIn: boolean; pro: boolean } | null = null;

/** Whether the visitor is signed in and on Pro (cached for a few seconds). */
export async function sessionAccess(): Promise<{ signedIn: boolean; pro: boolean }> {
  if (cached && Date.now() - cached.at < 3000) return cached;
  let signedIn = false;
  let pro = false;
  try {
    const { data } = await authClient.getSession();
    signedIn = Boolean(data?.session);
    pro = planFromUser(data?.user as Parameters<typeof planFromUser>[0]).pro;
  } catch {
    signedIn = false;
  }
  cached = { at: Date.now(), signedIn, pro };
  return cached;
}

export async function isSignedIn(): Promise<boolean> {
  return (await sessionAccess()).signedIn;
}

export function forgetSession() {
  cached = null;
}

/** Calls `onSignIn` whenever the visitor goes from signed out to signed in. */
export function useOnSignIn(onSignIn: () => void) {
  const { data, isPending } = authClient.useSession();
  const signedIn = Boolean(data?.session);
  const previous = useRef<boolean | null>(null);
  const callback = useRef(onSignIn);
  useEffect(() => {
    callback.current = onSignIn;
  });
  useEffect(() => {
    if (isPending) return;
    if (signedIn && previous.current === false) {
      forgetSession();
      callback.current();
    }
    previous.current = signedIn;
  }, [signedIn, isPending]);
  return { signedIn, isPending };
}

export function signInHref(next: string, mode: "sign-in" | "sign-up" = "sign-in") {
  return `/${mode}?next=${encodeURIComponent(next)}`;
}
