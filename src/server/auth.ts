import "server-only";

/**
 * Authentication boundary. ISOLA has no accounts yet, so `getSession` always
 * returns null. When accounts are added, implement it with your auth provider
 * (session cookie, OAuth, etc.) and use it in route handlers; usage limits
 * (`src/server/usage.ts`) and entitlements (`src/server/billing.ts`) are
 * already keyed by a subject string so they can follow the account id.
 */

export interface Session {
  accountId: string;
  email: string;
}

export async function getSession(_request: Request): Promise<Session | null> {
  void _request;
  return null;
}
