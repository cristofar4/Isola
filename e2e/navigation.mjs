/**
 * Tools menu and the pages it leads to.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 npm start
 *   BASE_URL=http://localhost:3000 npm run test:nav
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
const visible = (l) => l.filter({ visible: true });

const EXPECTED = [
  ["Background remover", "/editor"],
  ["Restore & erase", "/editor?tool=restore"],
  ["Change background", "/editor?panel=background"],
  ["Resize & crop", "/editor?tool=crop"],
  ["Batch Studio", "/batch"],
  ["Product images", "/batch?preset=catalogue"],
  ["Help centre", "/support"],
  ["Developer docs", "/developers"],
];

const mailbox = await startMailbox();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));

/* Desktop menu ------------------------------------------------------------ */
await page.goto(BASE, { waitUntil: "networkidle" });
const nav = page.getByRole("navigation", { name: "Main" });
check("Main navigation lists Tools, Batch Studio, Developers and Pricing", (await nav.innerText()).replace(/\s+/g, " ").includes("Tools Batch Studio Developers Pricing"));
const trigger = nav.getByRole("button", { name: "Tools" });
await trigger.hover();
await page.waitForTimeout(500);
check("Hovering Tools opens the menu", (await trigger.getAttribute("aria-expanded")) === "true");
for (const [label, href] of EXPECTED) {
  const link = visible(nav.getByRole("link", { name: new RegExp(`^${label.replace(/[&]/g, "\\$&")}`) }));
  const actual = (await link.count()) ? await link.first().getAttribute("href") : null;
  check(`Menu: ${label} → ${href}`, actual === href, actual ?? "missing");
}
check("Menu sections match the design", (await nav.getByRole("heading", { name: /Edit an image|Work with more|Learn & build/i }).count()) === 3);
check("Promo card opens the editor", (await visible(nav.getByRole("link", { name: /Open the editor/ })).getAttribute("href")) === "/editor");
check("Footer links to all tools", (await visible(nav.getByRole("link", { name: /Explore all tools/ })).getAttribute("href")) === "/tools");
await page.screenshot({ path: join(OUT, "tools-menu.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("Escape closes the menu", (await trigger.getAttribute("aria-expanded")) === "false");

// Keyboard: focus the trigger, open with Enter, move into the panel with Tab.
await page.reload({ waitUntil: "networkidle" });
await trigger.focus();
await page.keyboard.press("Enter");
await page.waitForTimeout(300);
await page.keyboard.press("Tab");
const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
check("Keyboard users can open the menu and reach its links", focused.startsWith("Background remover"), focused.slice(0, 40));
await page.keyboard.press("Escape");

// Accessibility of the open menu.
if (existsSync("node_modules/axe-core/axe.min.js")) {
  await trigger.click();
  await page.waitForTimeout(400);
  await page.addScriptTag({ content: readFileSync("node_modules/axe-core/axe.min.js", "utf8") });
  const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 2).join(", ")}`));
  check("The open menu has no axe violations", violations.length === 0, violations.join(" | "));
  await page.keyboard.press("Escape");
}

/* Each destination does what the menu says --------------------------------- */
await page.goto(BASE, { waitUntil: "networkidle" });
await trigger.click();
await visible(nav.getByRole("link", { name: /^Restore & erase/ })).click();
await page.waitForURL("**/editor?tool=restore");
check("Restore & erase opens the editor with a matching hint", await visible(page.getByText("Restore & erase:")).isVisible());

await page.goto(`${BASE}/editor?tool=crop`, { waitUntil: "networkidle" });
check("Resize & crop shows its hint", await visible(page.getByText("Resize & crop:")).isVisible());
await page.goto(`${BASE}/editor?panel=background`, { waitUntil: "networkidle" });
check("Change background shows its hint", await visible(page.getByText("Change background:")).isVisible());

await page.goto(BASE, { waitUntil: "networkidle" });
await trigger.click();
await visible(nav.getByRole("link", { name: /^Product images/ })).click();
await page.waitForURL("**/batch?preset=catalogue");
await page.getByText("Catalogue preset:").waitFor();
const sampleAlt = await page.locator("[data-sample-grid] img").first().getAttribute("alt");
check("Signed out, Product images shows the catalogue look on the samples", /white background, 10% padding/.test(sampleAlt ?? ""), sampleAlt ?? "");
check(
  "…and signing in from there keeps the preset",
  (await page.getByRole("link", { name: "Sign in with this preset" }).getAttribute("href")) === "/sign-in?next=%2Fbatch%3Fpreset%3Dcatalogue",
);

await page.goto(BASE, { waitUntil: "networkidle" });
await trigger.click();
await visible(nav.getByRole("link", { name: /Explore all tools/ })).click();
await page.waitForURL("**/tools");
check("All tools page lists every tool", (await page.locator("main ul > li a").count()) === EXPECTED.length);
await page.screenshot({ path: join(OUT, "tools-page.png"), fullPage: true });

/* The editor applies the tool once an image is ready ----------------------- */
const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Nav Tester" });
await signInContext(context, BASE, account);
await page.goto(`${BASE}/batch?preset=catalogue`, { waitUntil: "networkidle" });
await visible(page.getByText("Catalogue preset loaded")).waitFor();
const panel = page.getByRole("complementary", { name: "Batch settings" });
check("Signed in, Product images loads the catalogue preset into Batch settings", (await panel.getByRole("button", { name: "Square (1:1)" }).getAttribute("aria-pressed")) === "true");
await panel.getByRole("tab", { name: "Background" }).click();
check("…with a white background", (await panel.getByRole("radio", { name: "White" }).getAttribute("aria-checked")) === "true");
await page.locator("#batch-files").setInputFiles(join(process.cwd(), "e2e", "fixtures", "product.jpg"));
await page.getByRole("button", { name: "Apply to 1 image" }).first().waitFor();
check("The preset stays a draft until applied, with a one-click apply", await panel.getByText(/Not applied yet/).isVisible());

await page.goto(`${BASE}/editor?tool=restore`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Try the sneaker example" }).click();
await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Restore brush"]')].some((b) => !b.disabled && b.offsetParent), null, { timeout: 180_000 });
await page.waitForTimeout(300);
check("After processing, the restore brush is selected", (await visible(page.getByRole("button", { name: "Restore brush" })).first().getAttribute("aria-pressed")) === "true");
// With an image already open, leave the editor in-app, then pick Resize & crop from the menu.
await page.getByRole("link", { name: "ISOLA home" }).click();
await page.waitForURL((u) => u.pathname === "/");
await trigger.click();
await visible(nav.getByRole("link", { name: /^Resize & crop/ })).click();
await page.waitForURL("**/editor?tool=crop");
await page.waitForTimeout(800);
check("Choosing Resize & crop with an image open selects the crop tool", (await visible(page.getByRole("button", { name: "Crop" })).first().getAttribute("aria-pressed")) === "true");

/* Mobile menu -------------------------------------------------------------- */
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  await m.goto(BASE, { waitUntil: "networkidle" });
  await m.getByRole("button", { name: "Open menu" }).click();
  const sheet = m.getByRole("dialog", { name: "Menu" });
  await sheet.waitFor();
  await m.waitForTimeout(500);
  check("Mobile menu groups the tools like the desktop menu", (await sheet.getByText("Edit an image").isVisible()) && (await sheet.getByText("Learn & build").isVisible()));
  await m.screenshot({ path: join(OUT, "tools-menu-mobile.png") });
  await sheet.getByRole("link", { name: /^Product images/ }).click();
  await m.waitForURL("**/batch?preset=catalogue");
  await m.waitForTimeout(400);
  check("Choosing a tool on mobile navigates and closes the menu", !(await sheet.isVisible()));
  check("No horizontal scrolling on the tools page", await m.goto(`${BASE}/tools`, { waitUntil: "networkidle" }).then(() => m.evaluate(() => document.documentElement.scrollWidth <= 390)));
  await mobile.close();
}

await browser.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} navigation checks passed`);
process.exit(failures ? 1 : 0);
