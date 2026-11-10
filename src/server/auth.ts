import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";
import { accountExistsEmail, getEmailTransport, passwordResetEmail, verificationEmail } from "./email";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password";

const RESET_TOKEN_MINUTES = 60;
const VERIFY_TOKEN_HOURS = 24;

/**
 * Send outside the request so response time doesn't reveal whether an account
 * exists for the address (Better Auth answers unknown emails immediately).
 */
function sendLater(task: () => Promise<void>) {
  const run = () => task().catch((error) => console.error("[email] send failed:", error instanceof Error ? error.message : error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Accounts, powered by Better Auth.
 *
 * - Email and password sign-up/sign-in is always on.
 * - Google and GitHub sign-in are enabled only when their OAuth credentials are
 *   set (see README → Accounts). Buttons for providers that aren't configured
 *   are never shown.
 * - Storage: Postgres when DATABASE_URL is a postgres:// URL, otherwise a local
 *   SQLite file (Node's built-in node:sqlite) at ISOLA_SQLITE_PATH or
 *   .data/isola.db. SQLite is for development and single-server deployments.
 * - Tables are created on first use unless ISOLA_AUTH_AUTO_MIGRATE=false.
 */

export type SocialProvider = "google" | "github";

export function enabledSocialProviders(): SocialProvider[] {
  const providers: SocialProvider[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) providers.push("github");
  return providers;
}

/** Why accounts can't work on this deployment, or null when they can. */
export function authConfigurationProblem(): string | null {
  if (process.env.NODE_ENV === "production" && !process.env.BETTER_AUTH_SECRET && !process.env.AUTH_SECRET) {
    return "BETTER_AUTH_SECRET is not set on the server.";
  }
  return null;
}

function list(value: string | undefined): string[] | undefined {
  const items = value?.split(",").map((s) => s.trim()).filter(Boolean);
  return items?.length ? items : undefined;
}

/**
 * Plan fields live on the user row (written only by the server, never by
 * updateUser) and verified payments get their own table, keyed by the
 * provider's reference so a payment can never be counted twice.
 */
const planFields = {
  plan: { type: "string", required: false, defaultValue: "free", input: false },
  proUntil: { type: "date", required: false, input: false },
  proRenews: { type: "boolean", required: false, defaultValue: false, input: false },
  /** "monthly" or "yearly": how the latest Pro payment was billed. */
  proInterval: { type: "string", required: false, input: false },
  paystackCustomerCode: { type: "string", required: false, input: false, returned: false },
  paystackSubscriptionCode: { type: "string", required: false, input: false, returned: false },
} as const;

const billingTables = {
  id: "isola-billing",
  schema: {
    payment: {
      fields: {
        reference: { type: "string", required: true, unique: true },
        userId: { type: "string", required: true, references: { model: "user", field: "id", onDelete: "cascade" } },
        amount: { type: "number", required: true },
        currency: { type: "string", required: true },
        paidAt: { type: "date", required: true },
        provider: { type: "string", required: true },
      },
    },
  },
} satisfies BetterAuthPlugin;

/** Answers to "Was this page helpful?" on the developer docs: the page, yes/no and when. Nothing about the person. */
const docsTables = {
  id: "isola-docs",
  schema: {
    docFeedback: {
      fields: {
        page: { type: "string", required: true },
        helpful: { type: "boolean", required: true },
        createdAt: { type: "date", required: true },
      },
    },
  },
} satisfies BetterAuthPlugin;

/**
 * API keys for the public API. Only a SHA-256 hash of each key is stored;
 * the key itself is shown once, when it's created.
 */
const apiKeyTables = {
  id: "isola-api-keys",
  schema: {
    apiKey: {
      fields: {
        userId: { type: "string", required: true, references: { model: "user", field: "id", onDelete: "cascade" } },
        name: { type: "string", required: true },
        keyHash: { type: "string", required: true, unique: true },
        start: { type: "string", required: true },
        end: { type: "string", required: true },
        createdAt: { type: "date", required: true },
        lastUsedAt: { type: "date", required: false },
        requestCount: { type: "number", required: false, defaultValue: 0 },
      },
    },
  },
} satisfies BetterAuthPlugin;

function createDatabase(): BetterAuthOptions["database"] {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    return new Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_MAX || 5) });
  }
  const file = process.env.ISOLA_SQLITE_PATH || join(process.cwd(), ".data", "isola.db");
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

function createOptions(): BetterAuthOptions {
  const email = getEmailTransport();
  const google =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
      : {};
  const github =
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
      : {};
  return {
    appName: "ISOLA",
    baseURL: process.env.BETTER_AUTH_URL || undefined,
    database: createDatabase(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      autoSignIn: true,
      // With an email service, new accounts must confirm their address before signing in.
      requireEmailVerification: Boolean(email),
      resetPasswordTokenExpiresIn: RESET_TOKEN_MINUTES * 60,
      revokeSessionsOnPasswordReset: true,
      // Sign-up answers the same way for taken emails (so it can't be used to find
      // accounts); the real owner gets a heads-up instead.
      onExistingUserSignUp: email
        ? async ({ user }, request) => {
            const origin = process.env.BETTER_AUTH_URL || (request ? new URL(request.url).origin : "");
            const message = accountExistsEmail({ name: user.name, signInUrl: `${origin}/sign-in`, resetUrl: `${origin}/forgot-password` });
            sendLater(() => email.send({ to: user.email, ...message }));
          }
        : undefined,
      // Completing a reset proves control of the mailbox, so the address counts as verified.
      onPasswordReset: async ({ user }) => {
        if (user.emailVerified) return;
        const auth = await getAuth();
        const context = await auth.$context;
        await context.internalAdapter.updateUser(user.id, { emailVerified: true });
      },
      // Only offered when an email transport is configured (see ./email.ts).
      sendResetPassword: email
        ? async ({ user, url }) => {
            const message = passwordResetEmail({ name: user.name, url, minutes: RESET_TOKEN_MINUTES });
            sendLater(() => email.send({ to: user.email, ...message }));
          }
        : undefined,
    },
    emailVerification: email
      ? {
          sendOnSignUp: true,
          // The sign-in form requests a fresh link itself, so it can point back to the page the person was on.
          sendOnSignIn: false,
          autoSignInAfterVerification: true,
          expiresIn: VERIFY_TOKEN_HOURS * 60 * 60,
          sendVerificationEmail: async ({ user, url }) => {
            const message = verificationEmail({ name: user.name, url, hours: VERIFY_TOKEN_HOURS });
            sendLater(() => email.send({ to: user.email, ...message }));
          },
        }
      : undefined,
    socialProviders: { ...google, ...github },
    account: {
      accountLinking: {
        enabled: true,
        // Never attach an OAuth login to an account whose email hasn't been proven.
        requireLocalEmailVerified: true,
      },
    },
    user: { deleteUser: { enabled: true }, additionalFields: planFields },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: process.env.NODE_ENV === "production",
      window: 60,
      max: 100,
      // Better Auth's built-in stricter limits still apply to sign-in, sign-up,
      // password changes and reset requests. Reading the current session is
      // cheap and happens on every page, so it isn't throttled.
      customRules: { "/get-session": false },
    },
    advanced: {
      cookiePrefix: "isola",
      // Rate limits are keyed by client IP. Name the header your proxy sets
      // (e.g. cf-connecting-ip on Cloudflare); without one, limits are shared.
      ipAddress: {
        ipAddressHeaders: list(process.env.ISOLA_CLIENT_IP_HEADERS) ?? ["x-forwarded-for"],
        trustedProxies: list(process.env.ISOLA_TRUSTED_PROXIES),
      },
    },
    trustedOrigins: list(process.env.ISOLA_TRUSTED_ORIGINS),
    plugins: [nextCookies(), billingTables, docsTables, apiKeyTables],
  };
}

type Auth = ReturnType<typeof betterAuth>;

const globalForAuth = globalThis as unknown as { __isolaAuthInstance?: Promise<Auth> };

async function createAuth(): Promise<Auth> {
  const options = createOptions();
  // Create missing tables before the first request touches them (idempotent).
  if (process.env.ISOLA_AUTH_AUTO_MIGRATE !== "false") {
    const { runMigrations } = await getMigrations(options);
    await runMigrations();
  }
  return betterAuth(options);
}

/** The shared Better Auth instance (one per server process). */
export async function getAuth(): Promise<Auth> {
  const problem = authConfigurationProblem();
  if (problem) throw new AuthUnavailableError(problem);
  globalForAuth.__isolaAuthInstance ??= createAuth().catch((error) => {
    globalForAuth.__isolaAuthInstance = undefined;
    throw error;
  });
  return globalForAuth.__isolaAuthInstance;
}

export class AuthUnavailableError extends Error {}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  /** Linked sign-in methods, e.g. ["credential", "google"]. */
  providers: string[];
  plan: { pro: boolean; proUntil: string | null; renews: boolean; hasSubscription: boolean; interval: "monthly" | "yearly" | null };
}

/** Data Access Layer: the signed-in user, or null. Reads the request, so call it inside <Suspense>. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Read the request first so this is never evaluated at build time.
  const requestHeaders = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  const ctx = await auth.$context;
  const row = await ctx.adapter.findOne<{
    proUntil?: Date | string | null;
    proRenews?: boolean | null;
    proInterval?: string | null;
    paystackSubscriptionCode?: string | null;
  }>({
    model: "user",
    where: [{ field: "id", value: session.user.id }],
  });
  const until = row?.proUntil ? new Date(row.proUntil) : null;
  const pro = Boolean(until && until.getTime() > Date.now());
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    emailVerified: session.user.emailVerified,
    createdAt: new Date(session.user.createdAt).toISOString(),
    providers: accounts.map((a) => a.providerId),
    plan: {
      pro,
      proUntil: until ? until.toISOString() : null,
      renews: pro && Boolean(row?.proRenews),
      hasSubscription: Boolean(row?.paystackSubscriptionCode),
      interval: pro ? (row?.proInterval === "yearly" ? "yearly" : "monthly") : null,
    },
  };
}

/** Like getCurrentUser, but sends signed-out visitors to the sign-in page. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Account id for a request, used to key usage limits; null when signed out. */
export async function accountIdFor(request: Request): Promise<string | null> {
  if (authConfigurationProblem()) return null;
  try {
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user.id ?? null;
  } catch {
    return null;
  }
}
