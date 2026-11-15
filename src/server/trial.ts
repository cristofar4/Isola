import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { serverSecret } from "./auth";

/**
 * Guest tries: a visitor without an account can remove a few backgrounds
 * before being asked to create one. The count lives in a signed, HttpOnly
 * cookie, so the page can't change it, but clearing cookies starts over. It's
 * a trial, not a wall: processing happens in the browser either way.
 *
 * ISOLA_GUEST_TRIES sets how many (default 3, 0 turns guest tries off).
 */

export const TRIAL_COOKIE = "isola_trial";
const MAX_AGE = 60 * 60 * 24 * 30;

export function guestTries(): number {
  const raw = process.env.ISOLA_GUEST_TRIES;
  if (raw === undefined || raw.trim() === "") return 3;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(20, Math.max(0, n)) : 3;
}

export interface Trial {
  id: string;
  used: number;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", `isola-trial:${secret}`).update(payload).digest("base64url");
}

function encode(trial: Trial, secret: string) {
  const payload = Buffer.from(JSON.stringify({ v: 1, id: trial.id, used: trial.used })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function cookieValue(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TRIAL_COOKIE) return rest.join("=");
  }
  return null;
}

/** The visitor's trial, if they have a valid one. */
export function readTrial(request: Request): Trial | null {
  const secret = serverSecret();
  const raw = cookieValue(request);
  if (!secret || !raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: number; id?: unknown; used?: unknown };
    if (data.v !== 1 || typeof data.id !== "string" || typeof data.used !== "number" || !Number.isInteger(data.used) || data.used < 0) return null;
    return { id: data.id, used: data.used };
  } catch {
    return null;
  }
}

export function newTrial(): Trial {
  return { id: randomUUID(), used: 0 };
}

/** A Set-Cookie header for this trial (null when the server has no secret to sign it with). */
export function trialCookie(trial: Trial, request: Request): string | null {
  const secret = serverSecret();
  if (!secret) return null;
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `${TRIAL_COOKIE}=${encode(trial, secret)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function trialState(trial: Trial) {
  const limit = guestTries();
  return { limit, used: Math.min(trial.used, limit), remaining: Math.max(0, limit - trial.used) };
}
