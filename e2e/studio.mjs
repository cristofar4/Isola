/**
 * Studio: the signed-in dashboard, brand presets (API and pages), the command
 * palette, the consistency check with a marketplace target and its one-click
 * fix, export sets (checked file by file), recent exports and phones.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 PAYSTACK_SECRET_KEY=sk_test_isola_e2e PAYSTACK_API_BASE=http://127.0.0.1:4010 npm start
 *   BASE_URL=http://localhost:3000 npm run test:studio
 */
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";
import { startFakePaystack, upgradeToPro } from "./lib/paystack.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output", "studio");
mkdirSync(OUT, { recursive: true });
const PRODUCT = join(process.cwd(), "e2e", "fixtures", "product.jpg");
const SNEAKER = join(process.cwd(), "public", "samples", "sneaker-white.jpg");
const SERUM = join(process.cwd(), "public", "samples", "serum-bottle.jpg");

let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const visible = (l) => l.filter({ visible: true });

async function download(page, click, name) {
  const pending = page.waitForEvent("download", { timeout: 180_000 });
  await click();
  const d = await pending;
  const file = join(OUT, name ?? d.suggestedFilename());
  await d.saveAs(file);
  return { file, suggested: d.suggestedFilename() };
}

async function settle(page, timeout = 300_000) {
  await page.waitForFunction(
    () => {
      const t = document.querySelector("[data-batch-status]")?.textContent ?? "";
      return !/processing|queued/.test(t) && document.querySelectorAll("[data-batch-item]").length > 0;
    },
    null,
    { timeout },
  );
}

async function imagesLoaded(locator) {
  return locator.evaluateAll((imgs) => imgs.filter((i) => i.complete && i.naturalWidth > 0).length);
}

const mailbox = await startMailbox();
const paystack = await startFakePaystack();
const browser = await chromium.launch();
const errors = [];

/* 1. Signed out -------------------------------------------------------------- */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/studio`);
  await page.waitForURL(/\/sign-in\?next=%2Fstudio/);
  check("The studio asks signed-out visitors to sign in first", true);
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("Get started leads to Create account", (await page.getByRole("link", { name: "Get started" }).first().getAttribute("href")) === "/sign-up");
  const anon = await ctx.request.get(`${BASE}/api/presets`);
  check("Brand presets need a session", anon.status() === 401, `HTTP ${anon.status()}`);
  await ctx.close();
}

/* 2. A free account: empty studio, brand presets, palette, editor export ----- */
const free = await createConfirmedAccount(browser, BASE, mailbox, { name: "Ada Lovelace" });
const freeCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await signInContext(freeCtx, BASE, free);
const page = await freeCtx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
check("The studio greets you", (await page.getByRole("heading", { level: 1 }).innerText()) === "Your studio, in sync." && (await page.getByText("Welcome back, Ada").isVisible()));
const sidebar = page.getByRole("navigation", { name: "Studio" });
const navText = (await sidebar.innerText()).replace(/\s+/g, " ");
check("The sidebar has the studio's sections and tools", ["Home", "Image editor", "Batch Studio", "Brand presets", "Export sets", "Quality review", "Projects", "Asset library", "Downloads", "Trash", "Help", "Settings"].every((t) => navText.includes(t)), navText);
const tools = page.getByRole("region", { name: "Quick start tools" });
const toolHrefs = await tools.getByRole("link").evaluateAll((a) => a.map((x) => x.getAttribute("href")));
check("Quick start tools open the real tools", JSON.stringify(toolHrefs.slice(0, 4)) === JSON.stringify(["/editor", "/editor?tool=restore", "/batch", "/editor?panel=background"]) && toolHrefs[5] === "/batch?export=set", toolHrefs.join(" "));
check("An empty studio says so instead of showing made-up work", (await page.getByText("Nothing in production yet.").isVisible()) && (await page.locator("[data-consistency-card]").getByText("Example", { exact: true }).isVisible()));

// Brand preset from the dashboard card.
const presetCard = page.locator("[data-brand-preset-card]");
await presetCard.getByRole("button", { name: "Create brand preset" }).click();
await presetCard.getByRole("list", { name: "Brand colours" }).waitFor();
await presetCard.getByLabel("Padding").selectOption("8");
await presetCard.getByText("Saved to your account.").waitFor();
let presets = (await (await freeCtx.request.get(`${BASE}/api/presets`)).json()).presets;
check("A brand preset is created and edited in place, saved to the account", presets.length === 1 && presets[0].isDefault && presets[0].layout.padding === 8, JSON.stringify(presets[0]?.layout));
check("Apply preset links to Batch Studio with that preset", (await presetCard.getByRole("link", { name: /Apply preset/ }).getAttribute("href")) === `/batch?preset=${presets[0].id}`);

// The API checks everything it's given.
const bad = await freeCtx.request.post(`${BASE}/api/presets`, { headers: { origin: BASE }, data: { name: "", colors: [{ hex: "blue" }], layout: { canvas: "huge" } } });
const badBody = await bad.json();
check("Invalid presets are refused with reasons", bad.status() === 400 && badBody.errors.length >= 3, badBody.message);
const foreign = await freeCtx.request.post(`${BASE}/api/presets`, { headers: { origin: "https://evil.example" }, data: {} });
check("Presets can't be changed from other sites", foreign.status() === 403, `HTTP ${foreign.status()}`);
{
  const other = await createConfirmedAccount(browser, BASE, mailbox, { name: "Someone Else" });
  const otherCtx = await browser.newContext();
  await signInContext(otherCtx, BASE, other);
  const put = await otherCtx.request.put(`${BASE}/api/presets/${presets[0].id}`, { headers: { origin: BASE }, data: { ...presets[0], name: "Taken" } });
  const del = await otherCtx.request.delete(`${BASE}/api/presets/${presets[0].id}`, { headers: { origin: BASE } });
  check("Nobody else can edit or delete your presets", put.status() === 404 && del.status() === 404, `PUT ${put.status()}, DELETE ${del.status()}`);
  await otherCtx.close();
}

// A second preset from the presets page, via Create → Brand preset.
await page.getByRole("button", { name: "Create", exact: true }).click();
await page.getByRole("menuitem", { name: "Brand preset" }).click();
await page.waitForURL("**/studio/presets**");
const form = page.getByRole("form", { name: "New brand preset" });
await form.waitFor();
await form.getByLabel("Preset name").fill("Catalogue white");
await form.getByLabel("Background").selectOption("white");
await form.getByLabel("Format").selectOption("jpeg");
await form.getByLabel("Use as my default preset").check();
await page.waitForTimeout(400);
check("The preset editor shows a live preview drawn by the export renderer", (await imagesLoaded(form.locator("[data-preset-preview]"))) === 1);
await page.screenshot({ path: join(OUT, "presets-editor.png") });
await form.getByRole("button", { name: "Create preset" }).click();
const created = page.locator('[data-preset="Catalogue white"]');
await created.waitFor();
check(
  "A new default preset takes over as the default",
  (await created.getByText("Default", { exact: true }).isVisible()) && (await page.locator('[data-preset="My brand"]').getByText("Default", { exact: true }).count()) === 0,
);
presets = (await (await freeCtx.request.get(`${BASE}/api/presets`)).json()).presets;
const white = presets.find((p) => p.name === "Catalogue white");

// Command palette.
await page.keyboard.press("Control+k");
const palette = page.getByRole("dialog", { name: "Search the studio" });
await palette.waitFor();
await page.keyboard.type("catalogue white");
const option = palette.getByRole("option", { name: /Apply “Catalogue white”/ });
await option.waitFor();
check("⌘K finds your brand presets", await option.isVisible());
await page.keyboard.press("Enter");
await page.waitForURL(`**/batch?preset=${white.id}`);
await page.getByText("Brand preset “Catalogue white” loaded").waitFor({ timeout: 20_000 });
check("…and applying one loads it into Batch settings", await visible(page.getByText(/1:1 \(Square\), 12% padding, white background, soft shadow, JPEG\. It's in Batch settings/)).first().isVisible());

// An export from the editor is remembered.
await page.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Try the sneaker example" }).click();
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 180_000 });
await page.getByRole("button", { name: "Export image" }).click();
const exportDialog = page.getByRole("dialog", { name: "Export image" });
const editorExport = await download(page, () => exportDialog.getByRole("button", { name: "Download" }).click(), "editor-export.png");
await page.waitForTimeout(1000);
await page.keyboard.press("Escape");
await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
const recent = page.locator("[data-recent-exports]");
await recent.getByText(/sneaker/i).first().waitFor({ timeout: 10_000 });
const again = await download(page, () => recent.getByRole("button", { name: "Download again" }).click(), "editor-again.png");
check("Editor exports appear in Recent exports and download again byte for byte", readFileSync(again.file).equals(readFileSync(editorExport.file)), `${readFileSync(again.file).length} bytes`);
await freeCtx.close();

/* 3. A Pro account: batch, consistency check, export set, dashboard ---------- */
const pro = await createConfirmedAccount(browser, BASE, mailbox, { name: "Grace Hopper" });
const proCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await signInContext(proCtx, BASE, pro);
await upgradeToPro(proCtx, BASE);
const p = await proCtx.newPage();
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(`${BASE}/batch?preset=catalogue`, { waitUntil: "networkidle" });
await p.locator("#batch-files").setInputFiles([PRODUCT, SNEAKER, SERUM]);
await settle(p);
await visible(p.getByRole("status").getByRole("button", { name: "Apply to all 3 images" })).click();
await p.waitForTimeout(1500);

// Consistency check against Amazon's main-image rules.
await visible(p.getByRole("button", { name: /^Check consistency/ })).click();
const panel = p.getByRole("dialog", { name: "Consistency check" });
await panel.getByRole("radio", { name: "Amazon main image" }).click();
await panel.getByText(/suggestions? for/).waitFor({ timeout: 30_000 });
const fills = await panel.getByText("Product fills 80% of the frame").count();
check("The check measures each product's real fill: 10% padding leaves 80%, under Amazon's 85%", fills === 3, `${fills} images flagged`);
await p.screenshot({ path: join(OUT, "consistency-amazon.png") });
await panel.getByRole("button", { name: "Make all 3 Amazon-ready" }).click();
await panel.getByText("Applied to 3 images").waitFor({ timeout: 30_000 });
await panel.locator("[data-consistency-summary]").getByText(/^All 3 images meet the Amazon main image checks/).waitFor({ timeout: 30_000 });
const after = (await panel.innerText()).replace(/\s+/g, " ");
const left = (await panel.getByRole("list", { name: "Images with suggestions" }).innerText()).replace(/\s+/g, " ");
check("One click fixes every Amazon issue on every image", !/Product fills|Not a pure white background|px on the longest side/.test(left), left.slice(0, 160));
check(
  "…and it still points out what no setting can fix: the small serum bottle is enlarged 2.7×",
  (await panel.locator('[data-check-item="serum-bottle.jpg"]').getByText(/^Enlarged \d/).isVisible()) && /1 other suggestion below/.test(after),
);
await p.keyboard.press("Escape");

// Export set: three destinations, every file checked.
await visible(p.getByRole("button", { name: "Export set" })).first().click();
const setDialog = p.getByRole("dialog", { name: "Export set" });
// Default destinations are Square, Portrait and Wide: swap Portrait for the marketplace size.
await setDialog.getByText("Portrait 4:5", { exact: true }).click();
await setDialog.getByText("Marketplace 1:1", { exact: true }).click();
check(
  "Destinations toggle like checkboxes",
  !(await setDialog.getByRole("checkbox", { name: /Portrait 4:5/ }).isChecked()) && (await setDialog.getByRole("checkbox", { name: /Marketplace 1:1/ }).isChecked()),
);
await setDialog.locator("[data-export-set-summary]").getByText("3 images × 3 destinations = 9 files").waitFor();
await p.waitForTimeout(800);
check("The export set previews every destination with a real image", (await imagesLoaded(setDialog.locator("img"))) >= 3);
const zip = await download(p, () => setDialog.getByRole("button", { name: "Download export set" }).click(), "export-set.zip");
const entries = unzipSync(readFileSync(zip.file));
const names = Object.keys(entries).sort();
const sizes = {};
for (const n of names) {
  const meta = await sharp(Buffer.from(entries[n])).metadata();
  sizes[n] = `${meta.width}x${meta.height}`;
}
check(
  "The ZIP has a folder per destination with every image",
  names.length === 9 && ["square-1080x1080/", "wide-1920x1080/", "marketplace-2000x2000/"].every((f) => names.filter((n) => n.startsWith(f)).length === 3),
  names.join(", "),
);
check("Every file has its destination's exact size", names.every((n) => sizes[n] === n.split("/")[0].split("-")[1]), JSON.stringify(sizes));
{
  const market = names.find((n) => n.startsWith("marketplace-"));
  const { data } = await sharp(Buffer.from(entries[market])).extract({ left: 0, top: 0, width: 4, height: 4 }).raw().toBuffer({ resolveWithObject: true });
  check("Marketplace images are JPEG on pure white", market.endsWith(".jpg") && data[0] === 255 && data[1] === 255 && data[2] === 255, `${market} corner ${data[0]},${data[1]},${data[2]}`);
}
check("Batch Studio reports what was downloaded", await visible(p.getByText(/Downloaded 9 files \(3 images × 3 destinations\)/)).isVisible());

// The dashboard reflects all of it.
await p.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
await p.locator("[data-queue-summary]").waitFor({ timeout: 15_000 });
check("Production queue shows the real batch", /3 ready/.test(await p.locator("[data-queue-summary]").innerText()), await p.locator("[data-queue-summary]").innerText());
check("Continue creating shows the collection", await p.locator('[data-continue="batch"]').getByText("Collection · 3 images").isVisible());
const consistency = p.locator("[data-consistency-card]");
await consistency.getByText(/meet the Amazon main image checks/).waitFor({ timeout: 30_000 });
check(
  "The consistency card measures the saved batch against the chosen destination and shows what's left",
  (await consistency.getByText("Amazon main image", { exact: true }).isVisible()) && (await consistency.locator('[data-issue-kind="enlarged"]').count()) === 1,
);
const destinations = p.locator("[data-destinations-card]");
await p.waitForFunction(() => document.querySelectorAll("[data-destinations-card] img").length === 3 && [...document.querySelectorAll("[data-destinations-card] img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30_000 });
check("Destination previews are drawn from the first finished image", (await destinations.locator("img").first().getAttribute("alt")).includes("as Square 1:1"));
const bar = p.locator("[data-recent-exports]");
check("Recent exports shows the export set", await bar.getByText("Export set · 9 files").isVisible());
const zipAgain = await download(p, () => bar.getByRole("button", { name: "Download again" }).click(), "export-set-again.zip");
check("…and downloads it again unchanged", readFileSync(zipAgain.file).equals(readFileSync(zip.file)));
await p.screenshot({ path: join(OUT, "studio-pro.png"), fullPage: true });

// Jump to an image from the palette: Batch Studio opens it in the editor.
await p.keyboard.press("Control+k");
await p.keyboard.type("serum");
await p.getByRole("option", { name: /serum-bottle\.jpg/ }).waitFor();
await p.keyboard.press("Enter");
await p.waitForURL((u) => u.pathname === "/editor", { timeout: 60_000 });
await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 60_000 });
check("⌘K opens a batch image straight in the editor", await visible(p.getByText("serum-bottle.jpg")).first().isVisible());

/* 4. Phones ------------------------------------------------------------------ */
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signInContext(mobile, BASE, pro);
  const m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
  check("No sideways scrolling in the studio on phones", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await m.getByRole("button", { name: "Open studio menu" }).click();
  const drawer = m.getByRole("dialog", { name: "Studio menu" });
  await drawer.getByRole("link", { name: "Brand presets" }).click();
  await m.waitForURL("**/studio/presets");
  await m.waitForTimeout(400);
  check("The phone menu navigates and closes", !(await drawer.isVisible()));
  await m.screenshot({ path: join(OUT, "studio-presets-mobile.png"), fullPage: true });
  await mobile.close();
}

check("No page errors", errors.length === 0, errors.join(" | "));
await browser.close();
await paystack.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} studio checks passed`);
process.exit(failures ? 1 : 0);
