import { AuthUnavailableError, getAuth } from "@/server/auth";

async function handle(request: Request) {
  try {
    const auth = await getAuth();
    return await auth.handler(request);
  } catch (error) {
    const message =
      error instanceof AuthUnavailableError
        ? `Accounts aren't configured on this deployment: ${error.message}`
        : "Accounts are temporarily unavailable.";
    if (!(error instanceof AuthUnavailableError)) console.error("[auth]", error instanceof Error ? error.message : error);
    return Response.json({ code: "AUTH_UNAVAILABLE", message }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = handle;
export const POST = handle;
