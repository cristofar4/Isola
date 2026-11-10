import { signOutDevice } from "@/server/devices";
import { sessionUser } from "@/server/session-route";

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** DELETE /api/account/devices/:id → signs that device out. This device signs out through /api/auth/sign-out instead. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await sessionUser(request, "Sign in to manage your devices.");
  if ("error" in who) return who.error;
  const { id } = await ctx.params;
  if (id === who.sessionId) return json(400, { code: "current-device", message: "Use Sign out to sign this device out." });
  return (await signOutDevice(who.userId, id))
    ? json(200, { code: "ok", message: "Signed out." })
    : json(404, { code: "not-found", message: "That device is no longer signed in." });
}
