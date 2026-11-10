import { validatePreset } from "@/lib/brand-presets";
import { createPreset, listPresets, PresetError } from "@/server/brand-presets";
import { sessionUser } from "@/server/session-route";

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** GET /api/presets → the signed-in account's brand presets, the default first. */
export async function GET(request: Request) {
  const who = await sessionUser(request, "Sign in to use brand presets.");
  if ("error" in who) return who.error;
  return json(200, { presets: await listPresets(who.userId) });
}

/** POST /api/presets → creates a preset after validating every field. */
export async function POST(request: Request) {
  const who = await sessionUser(request, "Sign in to use brand presets.");
  if ("error" in who) return who.error;
  const checked = validatePreset(await request.json().catch(() => null));
  if (!checked.ok) return json(400, { code: "invalid_preset", message: checked.errors.join(" "), errors: checked.errors });
  try {
    return json(201, { preset: await createPreset(who.userId, checked.value) });
  } catch (error) {
    if (error instanceof PresetError) return json(error.status, { code: error.code, message: error.message });
    throw error;
  }
}
