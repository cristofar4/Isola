import { AuthUnavailableError, getAuth } from "@/server/auth";
import { guestTries, newTrial, readTrial, trialCookie, trialState, type Trial } from "@/server/trial";

/**
 * Guest tries (see src/server/trial.ts).
 *
 * GET  /api/trial                       → where the visitor stands (starts a trial if they have none)
 * POST /api/trial { action: "claim" }   → use one try before removing a background
 * POST /api/trial { action: "release" } → give it back when that removal didn't finish
 *
 * Signed-in visitors don't use tries: { signedIn: true }.
 */

function reply(status: number, body: unknown, cookie?: string | null) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

async function signedIn(request: Request) {
  try {
    const auth = await getAuth();
    return Boolean(await auth.api.getSession({ headers: request.headers }));
  } catch (error) {
    if (error instanceof AuthUnavailableError) return null;
    throw error;
  }
}

export async function GET(request: Request) {
  const session = await signedIn(request);
  if (session === null) return reply(200, { enabled: false, signedIn: false, limit: 0, used: 0, remaining: 0 });
  if (session) return reply(200, { enabled: true, signedIn: true });
  if (guestTries() === 0) return reply(200, { enabled: false, signedIn: false, limit: 0, used: 0, remaining: 0 });
  const existing = readTrial(request);
  const trial = existing ?? newTrial();
  return reply(200, { enabled: true, signedIn: false, ...trialState(trial) }, existing ? null : trialCookie(trial, request));
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return reply(403, { code: "forbidden", message: "Cross-origin requests aren't allowed." });
  let action: unknown;
  try {
    action = ((await request.json()) as { action?: unknown }).action;
  } catch {
    action = null;
  }
  if (action !== "claim" && action !== "release") return reply(400, { code: "bad-request", message: 'Send { "action": "claim" } or { "action": "release" }.' });

  const session = await signedIn(request);
  if (session === null) return reply(503, { code: "auth-unavailable", message: "Accounts aren't configured on this server." });
  if (session) return reply(200, { enabled: true, signedIn: true, granted: true });
  if (guestTries() === 0) return reply(403, { code: "trial-off", enabled: false, signedIn: false, limit: 0, used: 0, remaining: 0, message: "Create a free account to remove backgrounds." });

  const current = readTrial(request) ?? newTrial();
  if (action === "release") {
    const next: Trial = { ...current, used: Math.max(0, current.used - 1) };
    return reply(200, { enabled: true, signedIn: false, ...trialState(next) }, trialCookie(next, request));
  }
  const state = trialState(current);
  if (state.remaining <= 0) {
    return reply(403, { code: "trial-used", enabled: true, signedIn: false, ...state, message: `You've used your ${state.limit} free tries. Create a free account to keep going.` }, trialCookie(current, request));
  }
  const next: Trial = { ...current, used: current.used + 1 };
  return reply(200, { enabled: true, signedIn: false, granted: true, ...trialState(next) }, trialCookie(next, request));
}
