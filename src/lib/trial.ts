"use client";

import { create } from "zustand";

/**
 * Guest tries on this device: a few background removals without an account,
 * counted by the server in a signed cookie (src/server/trial.ts). Example
 * photos don't use a try.
 */

export interface TrialState {
  status: "unknown" | "loading" | "ready" | "unavailable";
  enabled: boolean;
  signedIn: boolean;
  limit: number;
  used: number;
  remaining: number;
  /** Set when the visitor has just used their last try (shows the "make more?" prompt once). */
  endedAt: number | null;
}

export const useTrial = create<TrialState>(() => ({ status: "unknown", enabled: false, signedIn: false, limit: 0, used: 0, remaining: 0, endedAt: null }));

type Reply = Partial<Pick<TrialState, "enabled" | "signedIn" | "limit" | "used" | "remaining">> & { granted?: boolean; code?: string; message?: string };

function take(body: Reply) {
  useTrial.setState((s) => ({
    status: "ready",
    enabled: body.enabled ?? s.enabled,
    signedIn: body.signedIn ?? s.signedIn,
    limit: body.limit ?? s.limit,
    used: body.used ?? s.used,
    remaining: body.remaining ?? s.remaining,
  }));
}

let loading: Promise<void> | null = null;

/** Where this visitor stands (starts a trial on the server if they have none). */
export function loadTrial(force = false): Promise<void> {
  if (loading && !force) return loading;
  useTrial.setState((s) => (s.status === "ready" ? s : { status: "loading" }));
  loading = fetch("/api/trial", { cache: "no-store", credentials: "same-origin" })
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      take((await r.json()) as Reply);
    })
    .catch(() => {
      loading = null;
      useTrial.setState({ status: "unavailable", enabled: false });
    });
  return loading;
}

let queue: Promise<unknown> = Promise.resolve();

/** One request at a time, so each one sees the cookie the last one set. */
function post(action: "claim" | "release"): Promise<Reply | null> {
  const run = queue.then(() => send(action));
  queue = run.catch(() => undefined);
  return run;
}

async function send(action: "claim" | "release"): Promise<Reply | null> {
  try {
    const r = await fetch("/api/trial", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = (await r.json()) as Reply;
    take(body);
    return { ...body, granted: r.ok && body.granted === true };
  } catch {
    return null;
  }
}

/** Use one try. Resolves true when the removal may go ahead. */
export async function claimTry(): Promise<boolean> {
  const reply = await post("claim");
  return Boolean(reply?.granted);
}

/** Give a try back (the removal it was for didn't finish). */
export async function releaseTry() {
  await post("release");
}

/** Called when a guest's removal finishes: the last one opens the "make more?" prompt. */
export function noteTryUsed() {
  const s = useTrial.getState();
  if (!s.signedIn && s.enabled && s.remaining === 0) useTrial.setState({ endedAt: Date.now() });
}

export function dismissTrialEnded() {
  useTrial.setState({ endedAt: null });
}

/** Sign-up link that brings the visitor back to the editor, explaining why they're there. */
export const TRIAL_SIGN_UP = "/sign-up?next=%2Feditor&reason=trial";
export const TRIAL_SIGN_IN = "/sign-in?next=%2Feditor&reason=trial";
