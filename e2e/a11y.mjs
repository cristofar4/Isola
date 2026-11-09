// Accessibility audit with axe-core (install with: npm i --no-save axe-core).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let total = 0;
async function audit(label) {
  await page.addScriptTag({ content: axe });
  const result = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
  });
  total += result.length;
  console.log(`${label}: ${result.length} violation(s)`);
  for (const v of result) console.log(`  [${v.impact}] ${v.id}: ${v.help}\n     ${v.nodes.join("\n     ")}`);
}
for (const route of ["/", "/batch", "/developers", "/developers/api", "/developers/api-reference", "/developers/processing", "/developers/browser-requirements", "/developers/engine-adapter", "/developers/server-endpoints", "/developers/errors-limits", "/developers/privacy-storage", "/tools", "/support", "/privacy", "/pricing", "/sign-in", "/sign-up", "/forgot-password", "/verify-email?error=INVALID_TOKEN", "/editor"]) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await audit(route);
}
// Background removal and the account page need a signed-in, confirmed account.
const mailbox = await startMailbox();
const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Audit User" });
await signInContext(page.context(), BASE, account);
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("button", { name: "Try the sneaker example" }).click();
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 120000 });
await audit("/editor (image ready)");
await page.getByRole("button", { name: "Export image" }).click();
await page.waitForTimeout(500);
await audit("/editor (export dialog)");
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await page.getByText("Signed in as").filter({ visible: true }).waitFor();
await audit("/account (signed in)");
// Batch Studio with images in it (free account: they wait for Pro), the menus and the settings tabs.
await page.goto(`${BASE}/batch`, { waitUntil: "networkidle" });
await page.locator("#batch-files").setInputFiles(["e2e/fixtures/product.jpg", "public/samples/serum-bottle.jpg"]);
await page.getByText("Pro required").filter({ visible: true }).first().waitFor();
await page.locator("[data-batch-item] input[type=checkbox]").first().check();
await audit("/batch (images, selection)");
await page.getByRole("tab", { name: "Export" }).click();
await audit("/batch (export settings)");
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Settings" }).click();
await page.waitForTimeout(600);
await audit("/batch (mobile settings drawer)");
await page.keyboard.press("Escape");
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Account menu/ }).click();
await page.waitForTimeout(300);
await audit("/ (account menu open)");
await mailbox.close();
await browser.close();
process.exit(total ? 1 : 0);
