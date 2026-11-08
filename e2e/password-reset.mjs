/**
 * Password reset by email, end to end, through a real SMTP hop.
 *
 * Starts a local SMTP server that captures messages, so the app server must
 * be started with: SMTP_URL=smtp://127.0.0.1:2525 (or SMTP_TEST_PORT).
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 npm start
 *   BASE_URL=http://localhost:3000 npm run test:reset
 */
import { chromium } from "playwright";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { linkIn, startMailbox } from "./lib/mail.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const mailbox = await startMailbox();

let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function waitForMail(to, count, timeout = 15000) {
  return mailbox.waitFor(to, /Reset your ISOLA password/, count, timeout);
}
const visible = (locator) => locator.filter({ visible: true });

/** Production rate limits allow only a few sign-ins per 10 s per IP; wait it out once if hit. */
async function submitSignIn(page) {
  await page.getByRole("button", { name: "Sign in" }).click();
  const limited = page.getByRole("alert").filter({ hasText: "Too many attempts" });
  const outcome = await Promise.race([
    limited.waitFor({ timeout: 4000 }).then(() => "limited").catch(() => "ok"),
    page.waitForURL((u) => u.pathname === "/account", { timeout: 4000 }).then(() => "ok").catch(() => "ok"),
  ]);
  if (outcome === "limited") {
    console.log("  (rate limited as expected in production; retrying after 11 s)");
    await page.waitForTimeout(11_000);
    await page.getByRole("button", { name: "Sign in" }).click();
  }
}
const atPath = (path) => (u) => u.pathname === path;

const email = `reset-${Date.now()}@example.com`;
const oldPassword = "old-password-1";
const newPassword = "new-password-2";
const browser = await chromium.launch();

// A confirmed account, signed in on another "device" whose session the reset should end.
await createConfirmedAccount(browser, BASE, mailbox, { name: "Reset Tester", email, password: oldPassword });
const device = await browser.newContext();
await signInContext(device, BASE, { email, password: oldPassword });
check("Test account created and signed in elsewhere", (await (await device.request.get(`${BASE}/api/auth/get-session`)).text()) !== "null");

const context = await browser.newContext();
const page = await context.newPage();
page.on("pageerror", (e) => check("No page errors", false, e.message));

// Unknown email: same answer, no email sent.
await page.goto(`${BASE}/forgot-password`);
await visible(page.getByLabel("Email")).fill(`nobody-${Date.now()}@example.com`);
await page.getByRole("button", { name: "Send reset link" }).click();
await page.getByText(/If an account exists for/).waitFor();
await page.waitForTimeout(1500);
check("Unknown emails get the same response and no email", mailbox.count("nobody-", /Reset/) === 0, `${mailbox.count("nobody-", /Reset/)} emails`);

// Request a reset from the sign-in page link.
await page.goto(`${BASE}/sign-in`);
await page.getByRole("link", { name: "Forgot password?" }).click();
await page.waitForURL(atPath("/forgot-password"));
await visible(page.getByLabel("Email")).fill(email);
await page.getByRole("button", { name: "Use a different email" }).isVisible().catch(() => false);
await page.getByRole("button", { name: "Send reset link" }).click();
await page.getByText(/If an account exists for/).waitFor();
const mail = await waitForMail(email, 1);
check("Reset email is delivered over SMTP", Boolean(mail), mail ? `subject "${mail.subject}"` : "nothing received");
const link = mail?.text.match(/https?:\/\/\S+\/api\/auth\/reset-password\/\S+/)?.[0];
check("Email contains a reset link", Boolean(link), link ? new URL(link).pathname.replace(/[^/]+$/, "…") : "");
check("Email has HTML and plain-text versions", Boolean(mail?.html) && Boolean(mail?.text));

// Follow the link.
await page.goto(link);
await page.waitForURL(/\/reset-password\?token=/);
check("Link opens the choose-a-new-password page", true);
await visible(page.getByLabel("New password", { exact: true })).fill(newPassword);
await visible(page.getByLabel("Confirm new password")).fill("something-else");
await page.getByRole("button", { name: "Set new password" }).click();
check("Mismatched confirmation is caught", await visible(page.getByText("The passwords don't match.")).isVisible());
await visible(page.getByLabel("Confirm new password")).fill(newPassword);
await page.getByRole("button", { name: "Set new password" }).click();
await page.getByText("Your password has been changed.").waitFor();
check("New password is saved", true);

// Other sessions were revoked.
const deviceSession = await (await device.request.get(`${BASE}/api/auth/get-session`)).text();
check("Existing sessions are signed out after a reset", deviceSession === "null");

// The link can't be reused.
await page.goto(link);
await page.waitForURL(/\/reset-password\?error=INVALID_TOKEN/);
const reused = await visible(page.getByText(/invalid or has expired/)).waitFor({ timeout: 10_000 }).then(() => true, () => false);
check("Reset links work only once", reused);

// Old password fails, new one works.
await page.goto(`${BASE}/sign-in`);
await visible(page.getByLabel("Email")).fill(email);
await visible(page.getByLabel("Password", { exact: true })).fill(oldPassword);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("alert").filter({ hasText: "don't match" }).waitFor();
check("Old password no longer works", true);
await visible(page.getByLabel("Password", { exact: true })).fill(newPassword);
await submitSignIn(page);
await page.waitForURL(atPath("/account"));
check("New password signs in", true);

// A completed reset proves the mailbox, so it also confirms an unconfirmed email.
const pending = `pending-${Date.now()}@example.com`;
await context.request.post(`${BASE}/api/auth/sign-up/email`, {
  data: { name: "Pending", email: pending, password: "pending-password-1" },
  headers: { origin: BASE },
});
await page.goto(`${BASE}/forgot-password`);
await visible(page.getByLabel("Email")).fill(pending);
await page.getByRole("button", { name: "Send reset link" }).click();
const pendingMail = await mailbox.waitFor(pending, /Reset your ISOLA password/);
await page.goto(linkIn(pendingMail, "/api/auth/reset-password"));
await visible(page.getByLabel("New password", { exact: true })).fill("pending-password-2");
await visible(page.getByLabel("Confirm new password")).fill("pending-password-2");
await page.getByRole("button", { name: "Set new password" }).click();
await page.getByText("Your password has been changed.").waitFor();
const fresh = await browser.newContext();
const confirmedByReset = await signInContext(fresh, BASE, { email: pending, password: "pending-password-2" }).then(
  () => true,
  (e) => (console.log("  ", e.message), false),
);
check("Resetting a password also confirms the email", confirmedByReset);
await fresh.close();

await browser.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} password reset checks passed`);
process.exit(failures ? 1 : 0);
