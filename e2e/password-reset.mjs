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
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const PORT = Number(process.env.SMTP_TEST_PORT || 2525);
const inbox = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  logger: false,
  onData(stream, _session, callback) {
    simpleParser(stream)
      .then((mail) => inbox.push({ to: mail.to?.text ?? "", subject: mail.subject ?? "", text: mail.text ?? "", html: mail.html || "" }))
      .then(() => callback(), callback);
  },
});
await new Promise((resolve) => smtp.listen(PORT, "127.0.0.1", resolve));

let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function waitForMail(to, count, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const mine = inbox.filter((m) => m.to.includes(to));
    if (mine.length >= count) return mine[count - 1];
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
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

// A signed-in session on another "device" that should be revoked by the reset.
const device = await browser.newContext();
const deviceSignUp = await device.request.post(`${BASE}/api/auth/sign-up/email`, {
  data: { name: "Reset Tester", email, password: oldPassword },
  headers: { origin: BASE },
});
check("Test account created", deviceSignUp.ok(), `HTTP ${deviceSignUp.status()}`);

const context = await browser.newContext();
const page = await context.newPage();
page.on("pageerror", (e) => check("No page errors", false, e.message));

// Unknown email: same answer, no email sent.
await page.goto(`${BASE}/forgot-password`);
await visible(page.getByLabel("Email")).fill(`nobody-${Date.now()}@example.com`);
await page.getByRole("button", { name: "Send reset link" }).click();
await page.getByText(/If an account exists for/).waitFor();
await page.waitForTimeout(1500);
check("Unknown emails get the same response and no email", inbox.length === 0, `${inbox.length} emails`);

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

await browser.close();
await new Promise((resolve) => smtp.close(resolve));
console.log(`\n${total - failures}/${total} password reset checks passed`);
process.exit(failures ? 1 : 0);
