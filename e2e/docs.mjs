/**
 * Developer docs: layout, navigation, search, code copy, live browser check,
 * section tracking, feedback and the mobile guide menu.
 *
 *   npm start
 *   BASE_URL=http://localhost:3000 npm run test:docs
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

const PAGES = [
  ["/developers", "Introduction"],
  ["/developers/api", "API quickstart"],
  ["/developers/api-reference", "API reference"],
  ["/developers/processing", "How processing works"],
  ["/developers/browser-requirements", "Browser requirements"],
  ["/developers/engine-adapter", "Engine adapter"],
  ["/developers/server-endpoints", "Server endpoints"],
  ["/developers/errors-limits", "Errors & limits"],
  ["/developers/privacy-storage", "Privacy & storage"],
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1536, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

/* Introduction, as designed ------------------------------------------------ */
await page.goto(`${BASE}/developers`, { waitUntil: "networkidle" });
check("Intro title and lead", (await page.getByRole("heading", { level: 1 }).innerText()) === "Build with a clear picture.");
check("Points to the public API", (await page.getByRole("link", { name: "API quickstart" }).first().getAttribute("href")) === "/developers/api");
check("Four processing steps", (await page.locator("main ol a").filter({ hasText: /Validate image|Load engine|Create mask|Refine & export/ }).count()) === 4);
check("Original → mask → cutout illustration", (await page.getByRole("img", { name: /(Original|Mask|Cutout) of a sneaker photo/ }).count()) === 3);
const toc = page.getByRole("navigation", { name: "On this page" });
const tocLabels = (await toc.getByRole("link").allInnerTexts()).map((t) => t.trim());
check("On this page lists the design's sections", tocLabels.join("|") === "Overview|Processing flow|Engine options|Next steps", tocLabels.join(", "));
const access = page.locator('[data-api-access="signed-out"]');
check(
  "Signed out, the docs invite you to create an account for an API key",
  (await access.isVisible()) && (await access.getByRole("link", { name: "Create account" }).getAttribute("href")) === "/sign-up?next=%2Faccount%23api-keys",
);
check("Header reads ISOLA DEVELOPERS", (await page.getByRole("link", { name: "ISOLA Developers" }).innerText()) === "DEVELOPERS");
await page.screenshot({ path: join(OUT, "docs-intro.png") });

// Copy button puts the real code on the clipboard.
await page.getByRole("button", { name: "Copy" }).first().click();
const clip = await page.evaluate(() => navigator.clipboard.readText());
check("Copy button copies the code sample", clip.startsWith("interface BackgroundRemovalEngine") && (await page.getByText("Copied").first().isVisible()), clip.split("\n")[0]);

// Section tracking follows scrolling.
await page.locator("#engine-options").scrollIntoViewIfNeeded();
await page.evaluate(() => document.getElementById("engine-options").scrollIntoView({ block: "start" }));
await page.waitForTimeout(600);
const current = await toc.locator('[aria-current="location"]').innerText();
check("On this page highlights the section being read", current.trim() === "Engine options", current);

/* Every page: sidebar, anchors, previous/next ------------------------------- */
for (const [i, [href, title]] of PAGES.entries()) {
  const res = await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
  const sidebar = page.getByRole("navigation", { name: "Developer guide" });
  const active = await sidebar.locator('[aria-current="page"]').innerText();
  const anchors = await toc.getByRole("link").evaluateAll((links) => links.map((a) => a.getAttribute("href").slice(1)));
  const missing = [];
  for (const id of anchors) if (!(await page.locator(`[id="${id}"]`).count())) missing.push(id);
  const pager = page.getByRole("navigation", { name: "Previous and next pages" });
  const nextHref = i < PAGES.length - 1 ? await pager.getByRole("link", { name: /Next/ }).getAttribute("href") : null;
  check(
    `${title}: loads, active in sidebar, every section anchor exists`,
    res.ok() && active.trim() === title && missing.length === 0 && anchors.length > 0 && (i === PAGES.length - 1 || nextHref === PAGES[i + 1][0]),
    missing.length ? `missing ${missing.join(", ")}` : `${anchors.length} sections`,
  );
}

/* Search ------------------------------------------------------------------- */
await page.goto(`${BASE}/developers`, { waitUntil: "networkidle" });
await page.keyboard.press("/");
check("'/' focuses documentation search", await page.evaluate(() => document.activeElement?.getAttribute("placeholder") === "Search documentation"));
await page.keyboard.type("remove-background");
const options = page.getByRole("option");
await options.first().waitFor();
check("Search finds the endpoint", (await options.first().innerText()).includes("POST /api/v1/remove-background"));
await page.keyboard.press("Enter");
await page.waitForURL("**/developers/api-reference#remove-background");
check("Enter opens the result at its section", true);
await page.getByRole("combobox", { name: "Search documentation" }).first().fill("zebra quantum");
check("No-result searches say so", await page.getByText(/Nothing matches/).isVisible());

/* Live browser check ------------------------------------------------------- */
await page.goto(`${BASE}/developers/browser-requirements`, { waitUntil: "networkidle" });
await page.getByText("This browser can remove backgrounds on the device.").waitFor({ timeout: 10_000 });
const wasm = await page.locator('[data-check="wasm"]').getAttribute("data-ok");
const isolated = await page.locator('[data-check="isolation"]').getAttribute("data-ok");
check("Browser check runs real feature tests", wasm === "true" && isolated === "true", `wasm ${wasm}, cross-origin isolated ${isolated}`);

/* Troubleshooting entries open --------------------------------------------- */
await page.goto(`${BASE}/developers/errors-limits#troubleshooting`, { waitUntil: "networkidle" });
const first = page.locator("details").first();
await first.locator("summary").click();
check("Troubleshooting entries expand", (await first.getAttribute("open")) !== null && (await first.getByText("Fix:").isVisible()));
check("Every upload and engine error code is documented", (await page.locator('tr[id^="code-"]').count()) === 20);

/* Feedback ----------------------------------------------------------------- */
await page.goto(`${BASE}/developers/engine-adapter`, { waitUntil: "networkidle" });
const response = page.waitForResponse((r) => r.url().endsWith("/api/docs/feedback"));
await page.getByRole("button", { name: "Yes, this page was helpful" }).click();
const saved = await response;
check("Feedback is stored", saved.status() === 201 && (await page.getByText("Thanks, that's recorded.").isVisible()), `HTTP ${saved.status()}`);
const bad = await context.request.post(`${BASE}/api/docs/feedback`, { data: { page: "/not-a-doc", helpful: true }, headers: { origin: BASE } });
check("Feedback for unknown pages is refused", bad.status() === 400, `HTTP ${bad.status()}`);
const foreign = await context.request.post(`${BASE}/api/docs/feedback`, { data: { page: "/developers", helpful: true }, headers: { origin: "https://elsewhere.example" } });
check("Cross-origin feedback is refused", foreign.status() === 403, `HTTP ${foreign.status()}`);

/* Links into the docs from elsewhere --------------------------------------- */
await page.goto(BASE, { waitUntil: "networkidle" });
const footer = page.getByRole("contentinfo");
check("Footer links go to the new pages", (await footer.getByRole("link", { name: "Engine adapter" }).getAttribute("href")) === "/developers/engine-adapter" && (await footer.getByRole("link", { name: "API reference" }).getAttribute("href")) === "/developers/api-reference");

/* Help centre -------------------------------------------------------------- */
await page.goto(`${BASE}/support`, { waitUntil: "networkidle" });
check("Help centre lists its topics", (await page.getByRole("navigation", { name: "Help topics" }).getByRole("link").count()) === 8);
await page.getByRole("searchbox", { name: "Search the help centre" }).fill("watermark");
const answer = page.getByRole("link", { name: /How do I remove the watermark/ });
await answer.waitFor();
await answer.click();
await page.waitForTimeout(400);
check("Help search opens the matching answer", (await page.locator("details#watermark").getAttribute("open")) !== null && (await page.getByText("Upgrade to Pro on the").isVisible()));
await page.goto(`${BASE}/support#api-key`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
check("Linking to an answer opens it", (await page.locator("details#api-key").getAttribute("open")) !== null);

/* Mobile ------------------------------------------------------------------- */
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await mobile.newPage();
  await m.goto(`${BASE}/developers`, { waitUntil: "networkidle" });
  check("No horizontal scrolling on phones", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await m.getByRole("button", { name: /Developer guide/ }).click();
  const sheet = m.getByRole("dialog", { name: "Developer guide" });
  await sheet.waitFor();
  await sheet.getByRole("link", { name: "Errors & limits" }).click();
  await m.waitForURL("**/developers/errors-limits");
  await m.waitForTimeout(400);
  check("Mobile guide menu navigates and closes", !(await sheet.isVisible()));
  await mobile.close();
}

check("No page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${total - failures}/${total} docs checks passed`);
process.exit(failures ? 1 : 0);
