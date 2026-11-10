import "server-only";

import { describeUserAgent, type DeviceKind } from "@/lib/user-agent";
import { getAuth } from "./auth";

/** One signed-in browser, as the account owner sees it. Never includes the session token. */
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

interface SessionRow {
  id: string;
  token: string;
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
}

async function activeSessions(userId: string): Promise<SessionRow[]> {
  const ctx = await (await getAuth()).$context;
  const rows = (await ctx.internalAdapter.listSessions(userId)) as SessionRow[];
  const now = Date.now();
  return rows.filter((s) => new Date(s.expiresAt).getTime() > now);
}

export async function listDevices(userId: string, currentSessionId: string): Promise<DeviceSummary[]> {
  const iso = (d: Date | string) => new Date(d).toISOString();
  return (await activeSessions(userId))
    .map((s) => {
      const ua = describeUserAgent(s.userAgent);
      return {
        id: s.id,
        current: s.id === currentSessionId,
        label: ua.label,
        kind: ua.kind,
        ipAddress: s.ipAddress || null,
        signedInAt: iso(s.createdAt),
        lastActiveAt: iso(s.updatedAt),
        expiresAt: iso(s.expiresAt),
      };
    })
    .sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt.localeCompare(a.lastActiveAt));
}

/** Signs one of the owner's other devices out. Returns false if there's no such session on this account. */
export async function signOutDevice(userId: string, sessionId: string): Promise<boolean> {
  const session = (await activeSessions(userId)).find((s) => s.id === sessionId);
  if (!session) return false;
  const ctx = await (await getAuth()).$context;
  await ctx.internalAdapter.deleteSession(session.token);
  return true;
}
