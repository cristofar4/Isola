/**
 * Asset library and projects, with real processing on a free account:
 * uploads, smart tags, duplicate detection, tags, collections, downloads
 * (with the free plan's rules on cutouts made here), brand colours from an
 * asset, projects with linked versions, quality review, version history,
 * undo/redo, export, the editor round-trip, folders and the trash.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 npm start
 *   BASE_URL=http://localhost:3000 npm run test:library
 */
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output", "library");
mkdirSync(OUT, { recursive: true });
let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function download(page, click, name) {
  const pending = page.waitForEvent("download", { timeout: 120_000 });
  await click();
  const d = await pending;
  const file = join(OUT, name ?? d.suggestedFilename());
  await d.saveAs(file);
  return { file, suggested: d.suggestedFilename() };
}

const PRODUCT = join(process.cwd(), "e2e", "fixtures", "product.jpg");
const COPY = join(OUT, "product-copy.jpg");
await sharp(PRODUCT).resize(800).jpeg({ quality: 80 }).toFile(COPY);
const FILES = [PRODUCT, join(process.cwd(), "public", "samples", "sneaker-white.jpg"), join(process.cwd(), "public", "samples", "serum-bottle.jpg"), join(process.cwd(), "public", "showcase", "batch", "sneaker-cutout.webp"), COPY];

const mailbox = await startMailbox();
const browser = await chromium.launch();
const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Lib Tester" });
const context = await browser.newContext({ viewport: { width: 1536, height: 1000 }, acceptDownloads: true });
await signInContext(context, BASE, account);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const tabCount = async (label) => Number((await page.getByRole("tab", { name: new RegExp(`^${label}`) }).innerText()).match(/(\d+)\s*$/)?.[1] ?? -1);
const card = (name) => page.locator(`[data-asset="${name}"]`);
const details = () => page.locator("[data-asset-details]").filter({ visible: true });

/* 1. Library ----------------------------------------------------------------- */
await page.goto(`${BASE}/studio/assets`, { waitUntil: "networkidle" });
check("An empty library says so", await page.getByText("Your library is empty").isVisible());
await page.locator("#library-files").setInputFiles(FILES);
const report = page.locator("[data-upload-report]");
await report.waitFor({ timeout: 60_000 });
const reportText = (await report.innerText()).replace(/\s+/g, " ");
check("Uploads are added and analysed", /Added 5 assets/.test(reportText), reportText.slice(0, 90));
check("A resized copy is recognised as a duplicate", /product-copy\.jpg looks like product\.jpg/.test(reportText));
check("Files are sorted by kind: photos are originals, transparent images cutouts", (await tabCount("Originals")) === 4 && (await tabCount("Cutouts")) === 1);
await report.getByRole("button", { name: "Move the copies to trash" }).click();
await page.getByText("Moved the duplicates to the trash.").waitFor();
check("The duplicate goes to the trash in one click", (await tabCount("All assets")) === 4 && (await card("product-copy.jpg").count()) === 0);

await card("sneaker-cutout.webp").getByRole("button", { name: /Show details/ }).click();
check("Smart tags come from the pixels", /Transparent/.test(await details().innerText()) && /Portrait|Square/.test(await details().innerText()));

await card("product.jpg").getByRole("button", { name: /Show details/ }).click();
const d1 = (await details().innerText()).replace(/\s+/g, " ");
check("Details show real dimensions, format and transparency", /1600 × 1280/.test(d1) && /JPG/.test(d1) && /Transparency No/.test(d1), d1.slice(0, 120));
await details().getByRole("button", { name: "Add tag" }).click();
await page.getByRole("textbox", { name: "Tag" }).fill("Spring");
await page.getByRole("button", { name: "Add", exact: true }).click();
await details().getByRole("list", { name: "Your tags" }).getByText("Spring").waitFor();
await page.getByRole("combobox", { name: "Tags" }).selectOption("Spring");
check("Tags can be added and filtered on", (await page.locator("[data-asset]").count()) === 1);
await page.getByRole("combobox", { name: "Tags" }).selectOption("all");
await page.getByPlaceholder("Search names, tags and colours").fill("orange");
check("Search finds assets by colour", (await page.locator('[data-asset="product.jpg"]').count()) === 1 && (await page.locator("[data-asset]").count()) < 4);
await page.getByPlaceholder("Search names, tags and colours").fill("");

// Collections and bulk actions.
await card("product.jpg").getByRole("checkbox").check();
await card("sneaker-white.jpg").getByRole("checkbox").check();
const bulk = page.getByRole("toolbar", { name: "Selected assets" });
await bulk.getByRole("button", { name: "Add to collection" }).click();
await page.getByRole("menuitem", { name: "New collection…" }).click();
const nameDialog = page.getByRole("dialog", { name: "New collection" });
await nameDialog.getByLabel("Collection name").fill("Products");
await nameDialog.getByRole("button", { name: "Create" }).click();
await page.getByText("Added to the new collection “Products”.").waitFor();
await bulk.getByRole("button", { name: "Apply tags" }).click();
await page.getByRole("textbox", { name: "Tag" }).fill("Catalogue");
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.getByText("Tagged 2 assets “Catalogue”.").waitFor();
await page.getByRole("group", { name: "Collections" }).getByRole("button", { name: /Products/ }).click();
check("Selected assets go into a new collection and get a tag together", (await page.locator("[data-asset]").count()) === 2);
const zip = await download(page, () => bulk.getByRole("button", { name: "Download" }).click(), "assets.zip");
check("Downloading a selection gives a ZIP of the originals", Object.keys(unzipSync(readFileSync(zip.file))).sort().join() === "product.jpg,sneaker-white.jpg");
await page.getByRole("button", { name: "Clear selection" }).click();
await page.getByRole("group", { name: "Collections" }).getByRole("button", { name: /Products/ }).click();

// A cutout made here, and the free plan's rules on downloading it.
await card("serum-bottle.jpg").getByRole("button", { name: /Show details/ }).click();
await details().getByRole("button", { name: "Make a cutout" }).click();
await page.locator('[data-asset-details="serum-bottle-cutout.png"]').filter({ visible: true }).waitFor({ timeout: 180_000 });
check("Make a cutout removes the background on this device and links it to its source", /Made from serum-bottle\.jpg/.test(await details().innerText()) && (await tabCount("Cutouts")) === 2);
const cut = await download(page, () => details().getByRole("button", { name: "Download" }).click(), "serum-cutout.png");
const meta = await sharp(cut.file).metadata();
check("On Free, a cutout made here downloads at most 1,000px (with the watermark)", meta.height === 1000 && meta.width === 667 && meta.hasAlpha, `${meta.width}×${meta.height}`);
await details().getByRole("button", { name: "Save as brand colours" }).click();
await details().getByText(/Saved \d colours as the brand preset/).waitFor();
const presets = (await (await context.request.get(`${BASE}/api/presets`)).json()).presets;
check("An asset's colours become a brand preset", presets.some((p) => p.name === "serum-bottle-cutout colours" && p.colors.length >= 2));
await page.screenshot({ path: join(OUT, "library.png") });

/* 2. A project ---------------------------------------------------------------- */
await card("product.jpg").getByRole("button", { name: /Show details/ }).click();
await details().getByRole("button", { name: "Use in project" }).click();
await page.waitForURL("**/studio/projects/**");
const boardUrl = page.url();
await page.waitForFunction(() => document.querySelectorAll("[data-version] img").length === 3 && [...document.querySelectorAll("[data-version] img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 180_000 });
check("A project prepares the master and draws Square, Portrait and Wide from it", (await page.locator("[data-master]").getByText("Ready").isVisible()) && (await page.locator("[data-version]").count()) === 3);

// A version adjusted on its own is reviewed against the master.
await page.getByRole("button", { name: "Select Portrait 4:5" }).click();
const pad = page.locator("#version-padding");
await pad.focus();
for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
await page.locator('[data-version="Portrait 4:5"]').getByText("Custom adjustments").waitFor();
await page.getByRole("tab", { name: /^Review/ }).click();
const scale = page.locator('[data-issue="scale"]');
await scale.waitFor();
check("Review finds the version scaled differently, with the real difference", /Portrait 4:5: (slightly )?smaller than the master \(−\d+%\)/.test(await scale.innerText()), (await scale.innerText()).replace(/\s+/g, " "));
await scale.getByRole("button", { name: "Match to master" }).click();
await page.locator('[data-version="Portrait 4:5"]').getByText("Linked to master").waitFor();
check("Match to master links it again and the suggestion goes away", (await page.locator('[data-issue="scale"]').count()) === 0);

// Master changes, history, undo and redo.
await page.getByRole("button", { name: "Select the master" }).click();
await page.getByRole("tab", { name: "Properties" }).click();
const checkedBackground = () => page.evaluate(() => document.querySelector('[role="radiogroup"][aria-label="Background"] [aria-checked="true"]')?.getAttribute("aria-label") ?? null);
const startingBackground = await checkedBackground();
await page.getByRole("radio", { name: /^White #FFFFFF/ }).click();
await page.getByRole("tab", { name: "History" }).click();
await page.locator("[data-history]").getByText("Background updated").waitFor();
check("Every change is recorded in version history", (await page.locator("[data-history] li").count()) >= 4);
await page.getByRole("button", { name: "Undo" }).click();
await page.getByRole("tab", { name: "Properties" }).click();
await page.waitForFunction((label) => document.querySelector('[role="radiogroup"][aria-label="Background"] [aria-checked="true"]')?.getAttribute("aria-label") === label, startingBackground);
check("Undo brings the previous look back", startingBackground !== null && startingBackground !== "White #FFFFFF", startingBackground ?? "");
await page.keyboard.press("Control+Shift+z");
await page.waitForFunction(() => document.querySelector('[role="radiogroup"][aria-label="Background"] [aria-checked="true"]')?.getAttribute("aria-label") === "White #FFFFFF");
check("Redo (Ctrl+Shift+Z) re-applies it", true);
await page.getByRole("tab", { name: "History" }).click();
await page.getByRole("button", { name: "Restore Original imported" }).click();
await page.locator("[data-history]").getByText("Restored “Original imported”").waitFor();
check("Restoring an earlier version is itself a step you can undo", await page.locator("[data-history] li").first().getByText("Current").isVisible());

// A fourth version, then the linked set.
await page.getByRole("button", { name: /Add version/ }).click();
await page.getByRole("menuitem", { name: /Marketplace 1:1/ }).click();
await page.locator('[data-version="Marketplace 1:1"] img').waitFor({ timeout: 30_000 });
await page.getByRole("tab", { name: /^Review/ }).click();
check("The marketplace version meets the fill rule out of the box", (await page.locator('[data-issue="marketplace"]').count()) === 0);
const set = await download(page, () => page.getByRole("button", { name: "Export linked set" }).click(), "linked-set.zip");
const entries = unzipSync(readFileSync(set.file));
const sizes = {};
for (const [n, data] of Object.entries(entries)) {
  const m = await sharp(Buffer.from(data)).metadata();
  sizes[n.split("/")[0]] = `${m.width}x${m.height}`;
}
check(
  "Export linked set: one file per version, in folders, sized by the free plan's 1,000px limit",
  Object.keys(entries).length === 4 && sizes["square-1080x1080"] === "1000x1000" && sizes["portrait-1080x1350"] === "800x1000" && sizes["wide-1920x1080"] === "1000x563" && sizes["marketplace-2000x2000"] === "1000x1000",
  JSON.stringify(sizes),
);
await page.screenshot({ path: join(OUT, "board.png") });

// Refine in the editor: the refined mask comes back as a history step.
await page.getByRole("button", { name: "Refine edges" }).click();
await page.waitForURL("**/editor");
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 60_000 });
const shift = page.getByRole("slider", { name: /Shift/ }).filter({ visible: true }).first();
await shift.focus();
for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(2500);
await page.goto(boardUrl, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "History" }).click();
await page.locator("[data-history]").getByText("Mask refined").waitFor({ timeout: 15_000 });
check("Edges refined in the editor come back to the project", true);

/* 3. Projects page, folders and trash ------------------------------------------- */
await page.goto(`${BASE}/studio/projects`, { waitUntil: "networkidle" });
const pcard = page.locator('[data-project="product"]');
await pcard.waitFor();
check("The project is listed with its status", await pcard.getByText("Ready").isVisible());
await pcard.getByRole("button", { name: "Star product" }).click();
await page.getByRole("tab", { name: "Starred" }).click();
check("Starred projects have their own tab", (await page.locator("[data-project]").count()) === 1);
await page.getByRole("tab", { name: "All projects" }).click();
await pcard.getByRole("button", { name: "More actions for product" }).click();
await page.getByRole("menuitem", { name: "Duplicate" }).click();
await page.locator('[data-project="product copy"]').waitFor();
await page.locator('[data-project="product copy"]').getByRole("button", { name: "More actions for product copy" }).click();
await page.getByRole("menuitem", { name: "Move to folder" }).click();
await page.getByRole("menuitem", { name: "New folder…" }).click();
const folderDialog = page.getByRole("dialog", { name: "New folder" });
await folderDialog.getByLabel("Folder name").fill("Spring");
await folderDialog.getByRole("button", { name: "Create" }).click();
await page.getByText("Moved to the new folder “Spring”.").waitFor();
check("Projects can be duplicated and filed in folders", /1 project/.test(await page.getByRole("button", { name: /Spring/ }).first().innerText()));
await page.locator('[data-project="product copy"]').getByRole("button", { name: "More actions for product copy" }).click();
await page.getByRole("menuitem", { name: "Move to trash" }).click();
await page.goto(`${BASE}/studio/trash`, { waitUntil: "networkidle" });
const trashed = page.locator('[data-trash-item="product copy"]');
await trashed.waitFor();
check("Trash lists trashed projects and assets", (await page.locator('[data-trash-item="product-copy.jpg"]').count()) === 1);
await trashed.getByRole("button", { name: "Delete" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Delete for good" }).click();
await page.getByText("Deleted “product copy”.").waitFor();
await page.locator('[data-trash-item="product-copy.jpg"]').getByRole("button", { name: "Restore" }).click();
await page.getByText("Restored product-copy.jpg.").waitFor();
check("Items can be restored or deleted for good", (await page.locator("[data-trash-item]").count()) === 0);

await page.goto(`${BASE}/studio/downloads`, { waitUntil: "networkidle" });
check("Downloads lists exports from the library and projects", (await page.locator('[data-download="product-linked-set.zip"]').count()) === 1 && (await page.locator('[data-download="assets.zip"], [data-download="isola-assets-2.zip"]').count()) === 1);

/* 4. Phones --------------------------------------------------------------------- */
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await signInContext(mobile, BASE, account);
  const m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/studio/assets", "/studio/projects"]) {
    await m.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    check(`No sideways scrolling on ${path} on phones`, (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  }
  await mobile.close();
}

check("No page errors", errors.length === 0, errors.join(" | "));
await browser.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} library checks passed`);
process.exit(failures ? 1 : 0);
