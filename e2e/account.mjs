/**
 * Account page: header, overview, section links, devices (list and sign out
 * one or all others), password field layout, phones, and that deleting an
 * account removes its API keys.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 npm start
 *   BASE_URL=http://localhost:3000 npm run test:account
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";

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

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const sessionOf = async (context) => (await (await context.request.get(`${BASE}/api/auth/get-session`)).json())?.session ?? null;

const mailbox = await startMailbox();
const browser = await chromium.launch();
const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Grace Hopper" });

// Three browsers: this desktop, a phone and another desktop.
const phone = await browser.newContext({ userAgent: IPHONE });
await signInContext(phone, BASE, account);
const laptop = await browser.newContext();
await signInContext(laptop, BASE, account);
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await signInContext(context, BASE, account);
await context.request.post(`${BASE}/api/keys`, { data: { name: "Shop backend" }, headers: { origin: BASE } });

const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await page.locator("[data-device]").first().waitFor();

/* Header and overview ----------------------------------------------------- */
check("The heading is your name, with your plan beside it", (await page.getByRole("heading", { level: 1 }).innerText()) === "Grace Hopper" && (await page.locator("header").getByText("Free", { exact: true }).isVisible()));
check("Your email shows as confirmed", await page.getByLabel("Email confirmed").first().isVisible());
check(
  "Quick links to the editor and Batch Studio",
  (await page.getByRole("link", { name: "Open the editor" }).last().getAttribute("href")) === "/editor" && (await page.locator("main").getByRole("link", { name: "Batch Studio" }).getAttribute("href")) === "/batch",
);
// Confirming the email signed in one more browser, so count what the server reports.
const deviceCount = (await (await context.request.get(`${BASE}/api/account/devices`)).json()).devices.length;
const overview = page.getByRole("group", { name: "Overview" });
const overviewText = (await overview.innerText()).replace(/\s+/g, " ");
check(
  "Overview shows the plan, API keys and signed-in devices",
  /Plan Free/.test(overviewText) && /1 key/.test(overviewText) && overviewText.includes(`${deviceCount} signed in`) && deviceCount >= 3,
  overviewText,
);

/* Section links ----------------------------------------------------------- */
const nav = page.getByRole("navigation", { name: "Account sections" });
const labels = (await nav.getByRole("link").allInnerTexts()).map((t) => t.trim());
check("Section links cover every setting", labels.join("|") === "Plan & billing|API keys|Profile|Password & sign-in|Devices|Delete account", labels.join(", "));
await nav.getByRole("link", { name: "Devices" }).click();
await page.waitForTimeout(700);
check("Choosing a section scrolls there and highlights it", new URL(page.url()).hash === "#devices" && (await nav.locator('[aria-current="location"]').innerText()).trim() === "Devices");
await page.screenshot({ path: join(OUT, "account-devices.png") });

/* Devices ----------------------------------------------------------------- */
const devices = page.getByRole("list", { name: "Signed-in devices" });
const current = devices.locator('[data-device="current"]');
check("This device is listed first and marked", (await devices.locator("li").first().getAttribute("data-device")) === "current" && (await current.getByText("This device").isVisible()));
check("Other devices are named from their browser", await devices.getByText("Safari on iPhone").isVisible());
check("This device has no Sign out button of its own in the list", (await current.getByRole("button").count()) === 0);

const listed = await context.request.get(`${BASE}/api/account/devices`);
const listBody = await listed.text();
const tokens = (await Promise.all([phone, laptop, context].map(async (c) => (await c.cookies()).find((k) => k.name.endsWith("session_token"))?.value ?? "")))
  .map((v) => decodeURIComponent(v).split(".")[0])
  .filter(Boolean);
check("The device list never includes session tokens", listed.ok() && tokens.length === 3 && tokens.every((t) => !listBody.includes(t)));

const phoneRow = devices.locator("li").filter({ hasText: "Safari on iPhone" });
await phoneRow.getByRole("button", { name: /^Sign out Safari on iPhone/ }).click();
await page.getByText("Signed out Safari on iPhone.").waitFor();
check("Signing out one device ends that device's session", (await sessionOf(phone)) === null && (await sessionOf(laptop)) !== null);
check("…and it leaves the list", (await devices.getByText("Safari on iPhone").count()) === 0 && (await devices.locator("li").count()) === deviceCount - 1);

const me = (await sessionOf(context)).id;
const self = await context.request.delete(`${BASE}/api/account/devices/${me}`, { headers: { origin: BASE } });
check("This device can't be removed through the device list", self.status() === 400, `HTTP ${self.status()}`);
const crossOrigin = await context.request.delete(`${BASE}/api/account/devices/${(await sessionOf(laptop)).id}`, { headers: { origin: "https://evil.example" } });
check("Signing devices out from another site is refused", crossOrigin.status() === 403 && (await sessionOf(laptop)) !== null, `HTTP ${crossOrigin.status()}`);
const anon = await fetch(`${BASE}/api/account/devices`);
check("The device list needs a session", anon.status === 401);
{
  const stranger = await browser.newContext();
  const other = await createConfirmedAccount(browser, BASE, mailbox, { name: "Stranger" });
  await signInContext(stranger, BASE, other);
  const res = await stranger.request.delete(`${BASE}/api/account/devices/${(await sessionOf(laptop)).id}`, { headers: { origin: BASE } });
  check("Nobody can sign out someone else's device", res.status() === 404 && (await sessionOf(laptop)) !== null, `HTTP ${res.status()}`);
  await stranger.close();
}

await page.getByRole("button", { name: "Sign out other devices" }).click();
await page.getByText("Signed out of all other devices.").waitFor();
check("Sign out other devices ends every other session and keeps this one", (await sessionOf(laptop)) === null && (await sessionOf(context)) !== null && (await devices.locator("li").count()) === 1);

/* Layout details ----------------------------------------------------------- */
const [currentPw, newPw] = await Promise.all([page.getByLabel("Current password").boundingBox(), page.getByLabel("New password").boundingBox()]);
check("Password fields line up side by side", currentPw && newPw && Math.abs(currentPw.y - newPw.y) < 1 && newPw.x > currentPw.x);
await page.screenshot({ path: join(OUT, "account.png"), fullPage: true });

/* Phones ------------------------------------------------------------------- */
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signInContext(mobile, BASE, account);
  const m = await mobile.newPage();
  await m.goto(`${BASE}/account`, { waitUntil: "networkidle" });
  await m.locator("[data-device]").first().waitFor();
  check("No sideways scrolling on phones", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await m.evaluate(() => window.scrollTo(0, document.getElementById("devices").getBoundingClientRect().top + window.scrollY - 130));
  await m.waitForTimeout(700);
  const chips = m.getByRole("navigation", { name: "Account sections" });
  const box = await chips.boundingBox();
  check(
    "On phones the section links stay pinned under the header and follow the page",
    box && Math.abs(box.y - 64) < 2 && (await chips.locator('[aria-current="location"]').innerText()).trim() === "Devices",
    box ? `top ${box.y}` : "not visible",
  );
  await m.screenshot({ path: join(OUT, "account-mobile.png") });
  await mobile.close();
}

/* Deleting the account removes its API keys -------------------------------- */
{
  const userId = (await (await context.request.get(`${BASE}/api/auth/get-session`)).json()).user.id;
  await page.getByRole("button", { name: "Delete account…" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Password", { exact: true }).fill(account.password);
  await dialog.getByLabel('Type "delete" to confirm').fill("delete");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await page.waitForURL(`${BASE}/`);
  const file = process.env.ISOLA_SQLITE_PATH || join(process.cwd(), ".data", "isola.db");
  if (existsSync(file)) {
    const db = new DatabaseSync(file, { readOnly: true });
    const keys = db.prepare('SELECT COUNT(*) AS n FROM "apiKey" WHERE "userId" = ?').get(userId).n;
    db.close();
    check("Deleting the account removes its API keys", keys === 0, `${keys} left`);
  } else console.log("  (skipped the API key cleanup check: no local SQLite database)");
}

check("No page errors", errors.length === 0, errors.join(" | "));
await browser.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} account page checks passed`);
process.exit(failures ? 1 : 0);
