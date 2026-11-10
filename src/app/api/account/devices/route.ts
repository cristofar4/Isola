import { listDevices } from "@/server/devices";
import { sessionUser } from "@/server/session-route";

/** GET /api/account/devices → the browsers this account is signed in on (no session tokens). */
export async function GET(request: Request) {
  const who = await sessionUser(request, "Sign in to see your devices.");
  if ("error" in who) return who.error;
  return Response.json({ devices: await listDevices(who.userId, who.sessionId) }, { headers: { "Cache-Control": "no-store" } });
}
