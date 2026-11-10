import { validatePreset } from "@/lib/brand-presets";
import { deletePreset, updatePreset } from "@/server/brand-presets";
import { sessionUser } from "@/server/session-route";

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** PUT /api/presets/:id → replaces the preset (every field is validated again). */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await sessionUser(request, "Sign in to use brand presets.");
  if ("error" in who) return who.error;
  const checked = validatePreset(await request.json().catch(() => null));
  if (!checked.ok) return json(400, { code: "invalid_preset", message: checked.errors.join(" "), errors: checked.errors });
  const preset = await updatePreset(who.userId, (await ctx.params).id, checked.value);
  return preset ? json(200, { preset }) : json(404, { code: "not-found", message: "No such preset on this account." });
}

/** DELETE /api/presets/:id */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await sessionUser(request, "Sign in to use brand presets.");
  if ("error" in who) return who.error;
  return (await deletePreset(who.userId, (await ctx.params).id))
    ? json(200, { code: "ok", message: "Preset deleted." })
    : json(404, { code: "not-found", message: "No such preset on this account." });
}
