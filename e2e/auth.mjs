/**
 * Account journey: sign up, email confirmation, session in the header, sign
 * out, failed and successful sign-in, profile edit, password change,
 * protected page redirect and account deletion.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 npm start   (email confirmation needs a mail service)
 *   BASE_URL=http://localhost:3000 node e2e/auth.mjs
 */
import { chromium } from "playwright";
import { linkIn, startMailbox } from "./lib/mail.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output");
mkdirSync(OUT, { recursive: true });
let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

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

const email = `e2e-${Date.now()}@example.com`;
const password = "first-password-1";
const mailbox = await startMailbox();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => check("No page errors", false, e.message));

// Protected page redirects when signed out.
await page.goto(`${BASE}/account`);
await page.waitForURL(/\/sign-in\?next=%2Faccount/);
check("Account page redirects signed-out visitors to sign-in", true);
await page.screenshot({ path: join(OUT, "auth-sign-in.png") });

// The sign-in screen, as designed: focused, with a way back and a real before/after.
check(
  "Sign in shows its badge, heading and line",
  (await page.getByText("Sign in", { exact: true }).first().isVisible()) &&
    (await page.getByRole("heading", { level: 1 }).innerText()) === "Welcome back." &&
    (await page.getByText("Your next great image starts here.").isVisible()),
);
check(
  "Only the logo and Back to home sit above the form (no site menu)",
  (await page.getByRole("link", { name: "Back to home" }).getAttribute("href")) === "/" && (await page.getByRole("navigation", { name: "Main" }).count()) === 0,
);
check("The before/after divider can be dragged or moved with the keyboard", await page.getByRole("slider", { name: /Comparison divider/ }).isVisible());
check("Remember me starts unticked", (await page.getByRole("checkbox", { name: "Remember me" }).isChecked()) === false);
{
  const legal = page.getByRole("contentinfo");
  check("Footer links to Privacy and Terms", (await legal.getByRole("link", { name: "Privacy" }).getAttribute("href")) === "/privacy" && (await legal.getByRole("link", { name: "Terms" }).getAttribute("href")) === "/terms");
  const art = await page.getByRole("slider", { name: /Comparison divider/ }).boundingBox();
  const form = await page.getByLabel("Email").boundingBox();
  check("On wide screens the picture sits beside the form", art && form && art.x < form.x && Math.abs(art.y - form.y) < 400);
}

// Sign up.
await page.getByRole("link", { name: "Create an account" }).click();
await page.waitForURL(atPath("/sign-up"));
await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill("Ada Lovelace");
await page.getByLabel("Email").filter({ visible: true }).fill(email);
check(
  "Create account shows its badge, heading, line and password rule",
  (await page.getByRole("heading", { level: 1 }).innerText()) === "Make room for your creativity." &&
    (await page.getByText("Create your ISOLA account to start editing.").isVisible()) &&
    (await page.getByText("Use at least 12 characters.").isVisible()),
);
check(
  "Terms and Privacy Policy are linked from the agreement, Help from the footer",
  (await page.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")) === "/privacy" &&
    (await page.getByRole("contentinfo").getByRole("link", { name: "Help" }).getAttribute("href")) === "/support",
);
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill("short");
check("The password rule counts down as you type", await page.getByText("Use at least 12 characters (7 more).").isVisible());
await page.getByRole("button", { name: "Create account" }).click();
check("Short passwords are rejected before submitting", await page.getByText("Your password needs at least 12 characters.").filter({ visible: true }).isVisible());
const shortSignUp = await page.request.post(`${BASE}/api/auth/sign-up/email`, {
  data: { name: "Too Short", email: `short-${Date.now()}@example.com`, password: "elevenchars" },
  headers: { origin: BASE },
});
check("The server refuses passwords under 12 characters too", shortSignUp.status() === 400, `HTTP ${shortSignUp.status()}`);
await page.screenshot({ path: join(OUT, "auth-sign-up.png") });
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill(password);
await page.getByRole("button", { name: "Create account" }).click();

// Email confirmation.
await page.getByText("Check your email").filter({ visible: true }).waitFor({ timeout: 10_000 });
check("Sign-up asks you to confirm your email", true);
check("There's no session until the email is confirmed", (await (await page.request.get(`${BASE}/api/auth/get-session`)).text()) === "null");
const signupMail = await mailbox.waitFor(email, /Confirm your email/);
check("A confirmation email is sent", Boolean(signupMail), signupMail?.subject ?? "nothing received");

const early = await context.newPage();
await early.goto(`${BASE}/sign-in`);
await early.getByLabel("Email").filter({ visible: true }).fill(email);
await early.getByLabel("Password", { exact: true }).filter({ visible: true }).fill(password);
await submitSignIn(early);
await early.getByText("Confirm your email first").filter({ visible: true }).waitFor({ timeout: 10_000 });
const resent = await mailbox.waitFor(email, /Confirm your email/, 2);
check("Signing in before confirming is blocked and sends a fresh link", Boolean(resent));
await early.close();

const bogus = await context.newPage();
await bogus.goto(`${BASE}/api/auth/verify-email?token=not-a-real-token&callbackURL=${encodeURIComponent("/verify-email?next=/account")}`);
await bogus.waitForURL((u) => u.pathname === "/verify-email" && u.searchParams.has("error"));
check(
  "A bad confirmation link explains itself and offers a new one",
  await bogus.getByRole("button", { name: "Send a new link" }).waitFor({ timeout: 10_000 }).then(() => true, () => false),
);
await bogus.close();

// Confirm in another tab, as from an email client; the original tab carries on.
const confirmTab = await context.newPage();
await confirmTab.goto(linkIn(resent, "/api/auth/verify-email"));
await confirmTab.waitForURL((u) => u.pathname === "/verify-email");
check(
  "The confirmation link confirms the email and signs you in",
  (await confirmTab.getByText("Your email is confirmed.").filter({ visible: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false)) &&
    (await confirmTab.getByText(email).filter({ visible: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false)),
);
await confirmTab.close();
await page.bringToFront();
if (new URL(page.url()).pathname !== "/account") {
  await page.getByRole("button", { name: "I've confirmed my email" }).click();
}
await page.waitForURL(atPath("/account"));
check("The original tab carries on to where you were going", true);
await page.getByRole("region", { name: "Profile" }).waitFor();
check("Account shows the email as confirmed", await page.getByText(/Confirmed\. Email changes/).filter({ visible: true }).isVisible());
check("Sign-up creates the account and opens it", (await page.getByRole("heading", { level: 1 }).innerText()) === "Ada Lovelace");
check("Header shows the account menu", await page.getByRole("button", { name: /Account menu for Ada Lovelace/ }).isVisible());
await page.screenshot({ path: join(OUT, "auth-account.png"), fullPage: true });

// Duplicate sign-up is refused.
const other = await browser.newContext();
const otherPage = await other.newPage();
await otherPage.goto(`${BASE}/sign-up`);
await otherPage.getByLabel("Name", { exact: true }).filter({ visible: true }).fill("Someone Else");
await otherPage.getByLabel("Email").filter({ visible: true }).fill(email);
await otherPage.getByLabel("Password", { exact: true }).filter({ visible: true }).fill("another-password");
await otherPage.getByRole("button", { name: "Create account" }).click();
// With email confirmation on, a taken email gets the same answer as a new one,
// so the form can't reveal who has an account; the real owner is emailed instead.
await otherPage.getByText("Check your email").filter({ visible: true }).waitFor({ timeout: 10_000 });
const heads = await mailbox.waitFor(email, /already have an ISOLA account/);
check("Signing up with a taken email reveals nothing and emails the owner", Boolean(heads), heads?.subject ?? "no email");
await other.close();

// Edit profile.
await page.getByLabel("Name", { exact: true }).filter({ visible: true }).fill("Ada King");
await page.getByRole("button", { name: "Save profile" }).click();
await page.getByText("Profile saved.").filter({ visible: true }).waitFor();
await page.reload();
check("Profile name changes persist", (await page.getByRole("heading", { level: 1 }).innerText()) === "Ada King");

// Sign out from the header menu.
await page.getByRole("button", { name: /Account menu/ }).click();
await page.getByRole("menuitem", { name: "Sign out" }).click();
await page.waitForURL(`${BASE}/`);
await page.getByRole("link", { name: "Sign in" }).first().waitFor();
check("Sign out clears the session", (await (await page.request.get(`${BASE}/api/auth/get-session`)).text()) === "null");

// Wrong password, then correct.
await page.goto(`${BASE}/sign-in?next=/account`);
await page.getByLabel("Email").filter({ visible: true }).fill(email);
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill("wrong-password");
await page.getByRole("button", { name: "Sign in" }).click();
const wrong = page.getByRole("alert").filter({ hasText: "don't match" });
await wrong.waitFor({ timeout: 10_000 });
check("Wrong password shows a clear error", true);
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill(password);
await page.getByRole("checkbox", { name: "Remember me" }).check();
await submitSignIn(page);
await page.waitForURL(atPath("/account"));
check("Sign-in returns to the requested page", true);
{
  const cookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
  const days = cookie && cookie.expires > 0 ? (cookie.expires * 1000 - Date.now()) / 86_400_000 : 0;
  check("Remember me keeps you signed in after the browser closes", days > 2, cookie ? `expires in ${days.toFixed(1)} days` : "no session cookie");
}

// Change password.
await page.getByLabel("Current password").filter({ visible: true }).fill(password);
await page.getByLabel("New password").filter({ visible: true }).fill("second-password-2");
await page.getByRole("button", { name: "Change password" }).click();
await page.getByText(/Password changed/).filter({ visible: true }).waitFor();
check("Password can be changed", true);

// Delete account.
await page.getByRole("button", { name: "Delete account…" }).click();
const dialog = page.getByRole("alertdialog");
await dialog.getByLabel("Password", { exact: true }).filter({ visible: true }).fill("second-password-2");
await dialog.getByLabel('Type "delete" to confirm').filter({ visible: true }).fill("delete");
await dialog.getByRole("button", { name: "Delete account" }).click();
await page.waitForURL(`${BASE}/`);
await page.goto(`${BASE}/sign-in`);
await page.getByLabel("Email").filter({ visible: true }).fill(email);
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill("second-password-2");
await submitSignIn(page);
await page.getByRole("alert").filter({ hasText: "don't match" }).waitFor({ timeout: 15_000 });
check("Deleted accounts can no longer sign in", true);

// Without Remember me, the session lasts only as long as the browser.
{
  const forgetful = await browser.newContext();
  const fp = await forgetful.newPage();
  const account = { email: `forget-${Date.now()}@example.com`, password: "forgetful-password-1" };
  await fp.request.post(`${BASE}/api/auth/sign-up/email`, { data: { name: "Brief Visit", ...account, callbackURL: "/verify-email?next=/account" }, headers: { origin: BASE } });
  const confirm = await mailbox.waitFor(account.email, /Confirm your email/);
  await fp.goto(linkIn(confirm, "/api/auth/verify-email"));
  await fp.waitForURL((u) => u.pathname === "/verify-email");
  await forgetful.clearCookies();
  await fp.goto(`${BASE}/sign-in?next=/account`);
  await fp.getByLabel("Email").fill(account.email);
  await fp.getByLabel("Password", { exact: true }).fill(account.password);
  await submitSignIn(fp);
  await fp.waitForURL(atPath("/account"));
  const cookie = (await forgetful.cookies()).find((c) => c.name.endsWith("session_token"));
  check("Without Remember me, the session cookie ends with the browser", cookie?.expires === -1, cookie ? `expires ${cookie.expires}` : "no session cookie");
  await forgetful.close();
}

// Mobile menu shows account links.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const m = await mobile.newPage();
await m.goto(BASE);
await m.getByRole("button", { name: "Open menu" }).click();
check("Mobile menu offers sign-in and sign-up", (await m.getByRole("link", { name: "Create account" }).isVisible()) && (await m.getByRole("dialog").getByRole("link", { name: "Sign in" }).isVisible()));
for (const path of ["/sign-in", "/sign-up"]) {
  await m.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const art = await m.locator("main img").first().boundingBox();
  const heading = await m.getByRole("heading", { level: 1 }).boundingBox();
  check(
    `On phones, ${path} stacks badge, picture, heading and form without sideways scrolling`,
    (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390 && art && heading && art.y < heading.y,
  );
  await m.screenshot({ path: join(OUT, `auth${path.replace("/", "-")}-mobile.png`), fullPage: true });
}
await mobile.close();

await browser.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} account checks passed`);
process.exit(failures ? 1 : 0);
