"use client";

import { createAuthClient } from "better-auth/react";
import { PASSWORD_MIN } from "./password";

/** Browser client for /api/auth. Same origin, so no base URL is needed. */
export const authClient = createAuthClient();

export function safeNext(value: string | null | undefined, fallback = "/studio"): string {
  // Only allow same-site relative paths to avoid open redirects.
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match an account.",
  USER_ALREADY_EXISTS: "An account with this email already exists. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Sign in instead.",
  PASSWORD_TOO_SHORT: `Use at least ${PASSWORD_MIN} characters for your password.`,
  PASSWORD_TOO_LONG: "Use at most 128 characters for your password.",
  INVALID_EMAIL: "Enter a valid email address.",
  INVALID_PASSWORD: "That password is incorrect.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "This account signs in with Google or GitHub, so it has no password.",
  SESSION_EXPIRED: "For your security, sign in again to do this.",
  AUTH_UNAVAILABLE: "Accounts aren't available on this deployment right now.",
  RESET_PASSWORD_DISABLED: "Password reset by email isn't set up on this deployment.",
  INVALID_TOKEN: "This link is invalid or has expired. Request a new one.",
  TOKEN_EXPIRED: "This link has expired. Request a new one.",
  EMAIL_NOT_VERIFIED: "Confirm your email address first. We've sent you a new link.",
  USER_NOT_FOUND: "We couldn't find an account for that link.",
  account_not_linked:
    "An account with this email already exists and uses a password. Sign in with your password instead.",
  email_doesn_t_match: "That account uses a different email address.",
  access_denied: "Sign-in was cancelled.",
};

export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  if (!error) return "Something went wrong. Please try again.";
  if (error.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (error.code && messages[error.code]) return messages[error.code];
  return error.message || "Something went wrong. Please try again.";
}

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return messages[code] ?? "Sign-in with that provider didn't complete. Please try again.";
}

/** Where verification links send people after confirming. */
export function verifyCallback(next: string) {
  return `/verify-email?next=${encodeURIComponent(next)}`;
}

/**
 * Make every useSession() consumer (header, gates) refetch. Needed when the
 * session was created elsewhere, e.g. by confirming an email in another tab.
 */
export function refreshSession() {
  authClient.$store.notify("$sessionSignal");
}
