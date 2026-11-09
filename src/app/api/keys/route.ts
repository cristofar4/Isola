import { ApiKeyError, cleanName, createKey, listKeys } from "@/server/api-keys";
import { sessionUser } from "@/server/session-route";

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** GET /api/keys → the signed-in account's keys (never the secrets). */
export async function GET(request: Request) {
  const who = await sessionUser(request);
  if ("error" in who) return who.error;
  return json(200, { keys: await listKeys(who.userId) });
}

/** POST /api/keys { name } → { key, summary }. The key is returned this once only. */
export async function POST(request: Request) {
  const who = await sessionUser(request);
  if ("error" in who) return who.error;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  try {
    const created = await createKey(who.userId, cleanName(body.name));
    return json(201, created);
  } catch (error) {
    if (error instanceof ApiKeyError) return json(error.status, { code: error.code, message: error.message });
    throw error;
  }
}
