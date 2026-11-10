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
await page.locator("[data-device]").first().waitFor();
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
await page.keyboard.press("Escape");
// The studio, with the batch above waiting in this browser.
await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
await page.locator("[data-queue-summary]").waitFor();
await page.waitForTimeout(600);
await audit("/studio (dashboard)");
await page.keyboard.press("Control+k");
await page.getByRole("dialog", { name: "Search the studio" }).waitFor();
await page.waitForTimeout(600);
await audit("/studio (command palette)");
await page.keyboard.press("Escape");
await page.goto(`${BASE}/studio/presets?new=1`, { waitUntil: "networkidle" });
await page.getByRole("form", { name: "New brand preset" }).waitFor();
await page.waitForTimeout(500);
await audit("/studio/presets (editor open)");
// Asset library, projects, a project board, trash and downloads.
await page.goto(`${BASE}/studio/assets`, { waitUntil: "networkidle" });
await page.getByText("Your library is empty").waitFor();
await audit("/studio/assets (empty)");
await page.locator("#library-files").setInputFiles(["public/showcase/batch/sneaker-cutout.webp", "public/samples/serum-bottle.jpg"]);
await page.locator("[data-asset]").nth(1).waitFor();
await page.locator('[data-asset="sneaker-cutout.webp"]').getByRole("button", { name: /Show details/ }).click();
await page.locator("[data-asset-details]").filter({ visible: true }).waitFor();
await page.locator('[data-asset="serum-bottle.jpg"]').getByRole("checkbox").check();
await page.waitForTimeout(400);
await audit("/studio/assets (details, selection)");
await page.locator("[data-asset-details]").filter({ visible: true }).getByRole("button", { name: "Use in project" }).click();
await page.waitForURL("**/studio/projects/**");
await page.waitForFunction(() => document.querySelectorAll("[data-version] img").length === 3, null, { timeout: 60_000 });
await audit("/studio/projects/[id] (board)");
await page.getByRole("tab", { name: /^Review/ }).click();
await audit("/studio/projects/[id] (review)");
await page.getByRole("tab", { name: "History" }).click();
await audit("/studio/projects/[id] (history)");
await page.goto(`${BASE}/studio/projects?new=1`, { waitUntil: "networkidle" });
await page.getByRole("dialog", { name: "New project" }).waitFor();
await page.waitForTimeout(400);
await audit("/studio/projects (new project)");
await page.keyboard.press("Escape");
await page.goto(`${BASE}/studio/trash`, { waitUntil: "networkidle" });
await audit("/studio/trash");
await page.goto(`${BASE}/studio/downloads`, { waitUntil: "networkidle" });
await audit("/studio/downloads");
// Batch Studio inside the studio, Scene Studio and Motion Studio.
await page.goto(`${BASE}/studio/batch`, { waitUntil: "networkidle" });
await page.locator("#batch-files").waitFor({ state: "attached" });
await audit("/studio/batch");
await page.goto(`${BASE}/studio/scenes`, { waitUntil: "networkidle" });
await audit("/studio/scenes (empty)");
await page.getByRole("button", { name: "Sample scene" }).click();
await page.waitForURL("**/studio/scenes/**", { timeout: 60_000 });
await page.locator("[data-save-state=saved]").filter({ visible: true }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
await audit("/studio/scenes/[id] (editor)");
await page.getByRole("tab", { name: "Scene", exact: true }).click();
await audit("/studio/scenes/[id] (scene tab)");
await page.getByRole("tab", { name: "Export", exact: true }).click();
await audit("/studio/scenes/[id] (export tab)");
await page.getByRole("button", { name: "Animate scene" }).first().click();
await page.getByRole("dialog", { name: "Choose a motion style" }).waitFor();
await page.waitForTimeout(800);
await audit("/studio/scenes/[id] (choose a motion style)");
await page.getByRole("dialog", { name: "Choose a motion style" }).getByRole("button", { name: "Animate in Motion Studio" }).click();
await page.waitForURL("**/motion/**", { timeout: 30_000 });
await page.locator("[data-viewer]").waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
await audit("/motion/[id] (assemble)");
for (const ws of ["Animate", "Colour", "Sound", "Deliver"]) {
  await page.getByRole("button", { name: ws, exact: true }).click();
  await page.waitForTimeout(700);
  await audit(`/motion/[id] (${ws.toLowerCase()})`);
}
await page.goto(`${BASE}/studio/motion`, { waitUntil: "networkidle" });
await audit("/studio/motion");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Open studio menu" }).click();
await page.waitForTimeout(500);
await audit("/studio (phone menu)");
await mailbox.close();
await browser.close();
process.exit(total ? 1 : 0);
