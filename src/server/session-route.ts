import "server-only";

import { AuthUnavailableError, getAuth } from "./auth";

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Session-only management: these routes are for the Account page, not for API clients. */
export async function sessionUser(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (request.method !== "GET" && origin && host && new URL(origin).host !== host) {
    return { error: json(403, { code: "forbidden", message: "Cross-origin requests aren't allowed." }) };
  }
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return { error: json(401, { code: "auth-required", message: "Sign in to manage API keys." }) };
    return { userId: session.user.id };
  } catch (error) {
    if (error instanceof AuthUnavailableError) return { error: json(503, { code: "auth-unavailable", message: error.message }) };
    throw error;
  }
}

