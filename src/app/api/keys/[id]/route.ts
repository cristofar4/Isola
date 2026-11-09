import { deleteKey } from "@/server/api-keys";
import { sessionUser } from "@/server/session-route";

/** DELETE /api/keys/:id → revokes the key immediately. */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await sessionUser(request);
  if ("error" in who) return who.error;
  const { id } = await ctx.params;
  const deleted = await deleteKey(who.userId, id);
  return Response.json(
    deleted ? { code: "ok", message: "Key deleted." } : { code: "not-found", message: "No such key on this account." },
    { status: deleted ? 200 : 404, headers: { "Cache-Control": "no-store" } },
  );
}
