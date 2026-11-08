// Accessibility audit with axe-core (install with: npm i --no-save axe-core).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
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
for (const route of ["/", "/batch", "/developers", "/support", "/privacy", "/pricing", "/sign-in", "/editor"]) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await audit(route);
}
await page.getByRole("button", { name: "Try the sneaker example" }).click();
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 120000 });
await audit("/editor (image ready)");
await page.getByRole("button", { name: "Export image" }).click();
await page.waitForTimeout(500);
await audit("/editor (export dialog)");
await browser.close();
process.exit(total ? 1 : 0);
