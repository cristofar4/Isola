import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getAuth } from "./auth";
import { planOf } from "./billing";

/**
 * API keys: `isola_sk_` followed by 32 random URL-safe characters (192
 * bits). Only the SHA-256 hash is stored, so a database leak doesn't reveal
 * usable keys, and the key is shown to its owner exactly once.
 */
export const KEY_PREFIX = "isola_sk_";
export const MAX_KEYS_PER_ACCOUNT = 10;

export interface ApiKeyRow {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  start: string;
  end: string;
  createdAt: Date | string;
  lastUsedAt?: Date | string | null;
  requestCount?: number | null;
}

/** What the owner sees: never the hash, never the key. */
export interface ApiKeySummary {
  id: string;
  name: string;
  /** e.g. "isola_sk_Ab3…Xy9z" */
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
}

export function hashKey(key: string) {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function looksLikeKey(value: string) {
  return value.startsWith(KEY_PREFIX) && /^[A-Za-z0-9_-]{30,80}$/.test(value);
}

function summary(row: ApiKeyRow): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    preview: `${row.start}…${row.end}`,
    createdAt: new Date(row.createdAt).toISOString(),
    lastUsedAt: row.lastUsedAt ? new Date(row.lastUsedAt).toISOString() : null,
    requestCount: Number(row.requestCount ?? 0),
  };
}

async function adapter() {
  const auth = await getAuth();
  return (await auth.$context).adapter;
}

export class ApiKeyError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}

export async function listKeys(userId: string): Promise<ApiKeySummary[]> {
  const db = await adapter();
  const rows = await db.findMany<ApiKeyRow>({ model: "apiKey", where: [{ field: "userId", value: userId }], sortBy: { field: "createdAt", direction: "desc" } });
  return rows.map(summary);
}

export function cleanName(value: unknown): string {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return name || "API key";
}

/** Create a key. Returns the secret once; it can't be recovered later. */
export async function createKey(userId: string, name: string): Promise<{ key: string; summary: ApiKeySummary }> {
  const db = await adapter();
  const count = await db.count({ model: "apiKey", where: [{ field: "userId", value: userId }] });
  if (count >= MAX_KEYS_PER_ACCOUNT) {
    throw new ApiKeyError(`An account can have up to ${MAX_KEYS_PER_ACCOUNT} keys. Delete one you no longer use.`, 409, "too_many_keys");
  }
  const key = KEY_PREFIX + randomBytes(24).toString("base64url");
  const row = await db.create<Omit<ApiKeyRow, "id">, ApiKeyRow>({
    model: "apiKey",
    data: {
      userId,
      name,
      keyHash: hashKey(key),
      start: key.slice(0, KEY_PREFIX.length + 4),
      end: key.slice(-4),
      createdAt: new Date(),
      lastUsedAt: null,
      requestCount: 0,
    },
  });
  return { key, summary: summary(row) };
}

export async function deleteKey(userId: string, id: string): Promise<boolean> {
  const db = await adapter();
  const row = await db.findOne<ApiKeyRow>({ model: "apiKey", where: [{ field: "id", value: id }] });
  if (!row || row.userId !== userId) return false;
  await db.delete({ model: "apiKey", where: [{ field: "id", value: id }] });
  return true;
}

/** Removes every key on an account (used when the account is deleted). */
export async function deleteAllKeys(userId: string): Promise<void> {
  const db = await adapter();
  await db.deleteMany({ model: "apiKey", where: [{ field: "userId", value: userId }] });
}

export interface ResolvedKey {
  key: ApiKeyRow;
  pro: boolean;
  proUntil: string | null;
}

/** Look up a presented key. Returns null for unknown or deleted keys. */
export async function resolveKey(presented: string): Promise<ResolvedKey | null> {
  if (!looksLikeKey(presented)) return null;
  const auth = await getAuth();
  const ctx = await auth.$context;
  const key = await ctx.adapter.findOne<ApiKeyRow>({ model: "apiKey", where: [{ field: "keyHash", value: hashKey(presented) }] });
  if (!key) return null;
  const user = (await ctx.internalAdapter.findUserById(key.userId)) as { proUntil?: Date | string | null; proRenews?: boolean | null } | null;
  if (!user) return null;
  const plan = planOf(user);
  return { key, pro: plan.pro, proUntil: plan.proUntil };
}

const usageChains = new Map<string, Promise<void>>();

/**
 * Count a request against the key (best effort; never blocks the response).
 * Updates for one key are applied one after another, each re-reading the
 * current count, so concurrent requests aren't lost on this server instance.
 */
export function recordUse(key: ApiKeyRow): Promise<void> {
  const previous = usageChains.get(key.id) ?? Promise.resolve();
  const next = previous.then(async () => {
    try {
      const db = await adapter();
      const current = await db.findOne<ApiKeyRow>({ model: "apiKey", where: [{ field: "id", value: key.id }] });
      if (!current) return;
      await db.update({
        model: "apiKey",
        where: [{ field: "id", value: key.id }],
        update: { lastUsedAt: new Date(), requestCount: Number(current.requestCount ?? 0) + 1 },
      });
    } catch (error) {
      console.error("[api] couldn't record key use:", error instanceof Error ? error.message : error);
    }
  });
  usageChains.set(key.id, next);
  void next.finally(() => {
    if (usageChains.get(key.id) === next) usageChains.delete(key.id);
  });
  return next;
}
