/**
 * Accounts with no setup at all: no BETTER_AUTH_SECRET, no email service.
 * Create account signs you straight in, sign out and sign in work, and the
 * generated secret is kept in .data/auth-secret, readable only by its owner.
 *
 *   npm run build && npm start      (with no auth or email settings)
 *   BASE_URL=http://localhost:3000 npm run test:quickstart
 */
import { chromium } from "playwright";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const session = async (page) => (await (await page.request.get(`${BASE}/api/auth/get-session`)).text()) !== "null";

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const email = `quick-${Date.now()}@example.com`;
const password = "quick-start-password-1";

await page.goto(`${BASE}/sign-up`, { waitUntil: "networkidle" });
check("Accounts work without any setup (no configuration warning)", (await page.getByText(/aren't configured/).count()) === 0);
await page.getByLabel("Name", { exact: true }).fill("Quick Start");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL((u) => u.pathname === "/studio", { timeout: 30_000 });
check("Create account signs you straight in and opens the studio", (await session(page)) && (await page.getByText("Check your email").count()) === 0);

await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Sign out", exact: true }).click();
await page.waitForURL(`${BASE}/`);
check("Sign out ends the session", !(await session(page)));

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password", { exact: true }).fill("not-the-password-1");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.getByRole("alert").filter({ hasText: "don't match" }).waitFor({ timeout: 15_000 });
check("A wrong password is refused clearly", true);
await page.getByLabel("Password", { exact: true }).fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((u) => u.pathname === "/studio", { timeout: 30_000 });
check("Sign in opens the studio", await session(page));

const secret = join(process.cwd(), ".data", "auth-secret");
check(
  "The generated secret is kept privately in .data/auth-secret",
  existsSync(secret) && (statSync(secret).mode & 0o077) === 0,
  existsSync(secret) ? `mode ${(statSync(secret).mode & 0o777).toString(8)}` : "missing (is the server running from this folder?)",
);
check("No page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${total - failures}/${total} quick-start checks passed`);
process.exit(failures ? 1 : 0);
