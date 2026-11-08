/**
 * Account journey: sign up, session in the header, sign out, failed and
 * successful sign-in, profile edit, password change, protected page redirect
 * and account deletion.
 *
 *   BASE_URL=http://localhost:3000 node e2e/auth.mjs
 */
import { chromium } from "playwright";
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

const email = `e2e-${Date.now()}@example.com`;
const password = "first-password-1";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => check("No page errors", false, e.message));

// Protected page redirects when signed out.
await page.goto(`${BASE}/account`);
await page.waitForURL(/\/sign-in\?next=%2Faccount/);
check("Account page redirects signed-out visitors to sign-in", true);
await page.screenshot({ path: join(OUT, "auth-sign-in.png") });

// Sign up.
await page.getByRole("link", { name: "Create an account" }).click();
await page.waitForURL("**/sign-up");
await page.getByLabel("Name").filter({ visible: true }).fill("Ada Lovelace");
await page.getByLabel("Email").filter({ visible: true }).fill(email);
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill("short");
await page.getByRole("button", { name: "Create account" }).click();
check("Short passwords are rejected before submitting", await page.getByText("Use at least 8 characters.").filter({ visible: true }).isVisible());
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill(password);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL("**/account");
await page.getByText("Signed in as").filter({ visible: true }).waitFor();
check("Sign-up creates the account and opens it", (await page.getByText("Signed in as").filter({ visible: true }).innerText()).includes("Ada Lovelace"));
check("Header shows the account menu", await page.getByRole("button", { name: /Account menu for Ada Lovelace/ }).isVisible());
await page.screenshot({ path: join(OUT, "auth-account.png"), fullPage: true });

// Duplicate sign-up is refused.
const other = await browser.newContext();
const otherPage = await other.newPage();
await otherPage.goto(`${BASE}/sign-up`);
await otherPage.getByLabel("Name").filter({ visible: true }).fill("Someone Else");
await otherPage.getByLabel("Email").filter({ visible: true }).fill(email);
await otherPage.getByLabel("Password", { exact: true }).filter({ visible: true }).fill("another-password");
await otherPage.getByRole("button", { name: "Create account" }).click();
const dup = otherPage.getByRole("alert").filter({ hasText: "already exists" });
await dup.waitFor({ timeout: 10_000 });
check("Signing up twice with one email is refused", true);
await other.close();

// Edit profile.
await page.getByLabel("Name").filter({ visible: true }).fill("Ada King");
await page.getByRole("button", { name: "Save profile" }).click();
await page.getByText("Profile saved.").filter({ visible: true }).waitFor();
await page.reload();
check("Profile name changes persist", (await page.getByText("Signed in as").filter({ visible: true }).innerText()).includes("Ada King"));

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
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/account");
check("Sign-in returns to the requested page", true);

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
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("alert").filter({ hasText: "don't match" }).waitFor({ timeout: 10_000 });
check("Deleted accounts can no longer sign in", true);

// Mobile menu shows account links.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const m = await mobile.newPage();
await m.goto(BASE);
await m.getByRole("button", { name: "Open menu" }).click();
check("Mobile menu offers sign-in and sign-up", (await m.getByRole("link", { name: "Create account" }).isVisible()) && (await m.getByRole("dialog").getByRole("link", { name: "Sign in" }).isVisible()));
await mobile.close();

await browser.close();
console.log(`\n${total - failures}/${total} account checks passed`);
process.exit(failures ? 1 : 0);
