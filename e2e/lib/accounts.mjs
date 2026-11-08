// Creates real accounts through the app's own API, confirming the email by
// following the link from the captured verification email when required.
import { linkIn } from "./mail.mjs";

let counter = 0;

export function uniqueEmail(prefix = "user") {
  counter++;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

/** Sign up and confirm the email. The returned credentials can sign in anywhere. */
export async function createConfirmedAccount(browser, base, mailbox, { name = "Test User", email = uniqueEmail(), password = "test-password-1" } = {}) {
  const context = await browser.newContext();
  const response = await context.request.post(`${base}/api/auth/sign-up/email`, {
    data: { name, email, password, callbackURL: "/verify-email?next=/account" },
    headers: { origin: base },
  });
  if (!response.ok()) throw new Error(`Sign-up failed: HTTP ${response.status()} ${await response.text()}`);
  const body = await response.json();
  if (!body.token) {
    const mail = await mailbox.waitFor(email, /Confirm your email/);
    const link = linkIn(mail, "/api/auth/verify-email");
    if (!link) throw new Error("No verification email arrived. Is the server running with SMTP_URL pointing at the test mailbox?");
    await context.request.get(link);
  }
  await context.close();
  return { name, email, password };
}

/** Put a session cookie into `context` by signing in through the API. */
export async function signInContext(context, base, { email, password }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await context.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: base } });
    if (response.ok()) return;
    // Production rate limits allow only a few sign-ins per 10 s per IP.
    if (response.status() === 429) await new Promise((r) => setTimeout(r, 11_000));
    else throw new Error(`Sign-in failed: HTTP ${response.status()} ${await response.text()}`);
  }
  throw new Error("Sign-in kept hitting the rate limit.");
}
