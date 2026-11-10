/** Password length rules, shared by the server (Better Auth) and every password form. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

/** Live guidance under a new-password field. */
export function passwordHint(password: string): { text: string; tone: "muted" | "success" } {
  if (password.length >= PASSWORD_MIN) return { text: `Long enough: ${PASSWORD_MIN}+ characters.`, tone: "success" };
  if (password.length === 0) return { text: `Use at least ${PASSWORD_MIN} characters.`, tone: "muted" };
  const left = PASSWORD_MIN - password.length;
  return { text: `Use at least ${PASSWORD_MIN} characters (${left} more).`, tone: "muted" };
}

export const PASSWORD_TOO_SHORT = `Your password needs at least ${PASSWORD_MIN} characters.`;
