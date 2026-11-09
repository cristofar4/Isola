/**
 * Batch Studio end to end, with the real on-device engine. Every download is
 * opened and measured; nothing is inferred from notifications.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 PAYSTACK_SECRET_KEY=sk_test_isola_e2e \
 *   PAYSTACK_API_BASE=http://127.0.0.1:4010 npm start
 *   BASE_URL=http://localhost:3000 npm run test:batch
 */
import { chromium } from "playwright";
import { unzipSync } from "fflate";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";
import { startFakePaystack, upgradeToPro } from "./lib/paystack.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output", "batch");
mkdirSync(OUT, { recursive: true });
const PRODUCT = join(process.cwd(), "e2e", "fixtures", "product.jpg"); // 1600×1280
const SERUM = join(process.cwd(), "public", "samples", "serum-bottle.jpg"); // 1200×1800
const PORTRAIT = join(process.cwd(), "public", "samples", "portrait-curly.jpg"); // 1400×2100, fine hair
const SKY = join(process.cwd(), "public", "samples", "sky.jpg");

let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const visible = (l) => l.filter({ visible: true });
const card = (p, name) => p.locator(`[data-batch-item="${name}"]`).filter({ visible: true });

/** Decode a file in the browser: size, alpha at points, and the bounding box of "subject" pixels. */
async function inspect(page, file, { points = [], subject = null } = {}) {
  const b64 = readFileSync(file).toString("base64");
  return page.evaluate(
    async ({ b64, points, subject }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      const px = (x, y) => Array.from(d.slice((y * bmp.width + x) * 4, (y * bmp.width + x) * 4 + 4));
      let transparent = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] === 0) transparent++;
      let box = null;
      if (subject) {
        // Subject = pixels that differ clearly from the background colour (or are opaque on transparent images).
        let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
        for (let y = 0; y < bmp.height; y += 2)
          for (let x = 0; x < bmp.width; x += 2) {
            const i = (y * bmp.width + x) * 4;
            const on = subject.alpha ? d[i + 3] > 128 : Math.abs(d[i] - subject.bg[0]) + Math.abs(d[i + 1] - subject.bg[1]) + Math.abs(d[i + 2] - subject.bg[2]) > 60;
            if (on) {
              x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
            }
          }
        if (x1 >= 0) box = { x0: x0 / bmp.width, y0: y0 / bmp.height, x1: x1 / bmp.width, y1: y1 / bmp.height };
      }
      return { width: bmp.width, height: bmp.height, transparent: transparent / (d.length / 4), samples: points.map(([x, y]) => px(x, y)), box };
    },
    { b64, points, subject },
  );
}

/** The card preview image, saved to disk. */
async function savePreview(page, name, file) {
  const src = await card(page, name).locator("img").first().getAttribute("src");
  const b64 = await page.evaluate(async (src) => {
    const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, src);
  writeFileSync(file, Buffer.from(b64, "base64"));
  return file;
}

async function download(page, click, name) {
  const pending = page.waitForEvent("download", { timeout: 120_000 });
  await click();
  const d = await pending;
  mkdirSync(join(OUT, "downloads"), { recursive: true });
  const file = join(OUT, "downloads", name ?? d.suggestedFilename());
  await d.saveAs(file);
  return { file, suggested: d.suggestedFilename() };
}

async function statusText(page) {
  return (await page.locator("[data-batch-status]").innerText()).replace(/\s+/g, " ");
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

const mailbox = await startMailbox();
const paystack = await startFakePaystack();
const browser = await chromium.launch();

// Fixtures made in the browser: a PNG with real transparency, and a PNG whose header is valid but whose pixels are garbage.
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const b64 = await p.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = new OffscreenCanvas(1000, 800);
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0, 1000, 800);
    g.clearRect(0, 0, 300, 800); // left 30% transparent in the source
    const blob = await c.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, readFileSync(PRODUCT).toString("base64"));
  const png = Buffer.from(b64, "base64");
  writeFileSync(join(OUT, "cutout-source.png"), png);
  const garbage = Buffer.alloc(4000);
  for (let i = 0; i < garbage.length; i++) garbage[i] = (i * 7919) % 251;
  writeFileSync(join(OUT, "broken.png"), Buffer.concat([png.subarray(0, 33), garbage]));
  writeFileSync(join(OUT, "not-an-image.png"), "this is plain text, not a picture");
  await ctx.close();
}
const TRANSPARENT = join(OUT, "cutout-source.png");
const BROKEN = join(OUT, "broken.png");
const NOT_IMAGE = join(OUT, "not-an-image.png");

const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Batch Tester" });

/* 1. Signed out: the introduction, the walkthrough and the sample project -- */
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));
await page.goto(`${BASE}/batch`, { waitUntil: "networkidle" });
check(
  "Signed-out visitors get the Batch Studio introduction",
  (await page.getByRole("heading", { level: 1 }).innerText()).replace(/\s+/g, " ") === "Your entire collection. One effortless workflow." &&
    (await page.locator("#batch-files").count()) === 0 &&
    (await page.locator('main a[href="/sign-up?next=%2Fbatch"]').count()) === 2,
);
check("It says Batch Studio is part of Pro", await page.getByText(/Batch Studio is part of Pro/).isVisible());
const carousel = page.getByRole("region", { name: "How Batch Studio works" });
check("The walkthrough has four steps", (await carousel.getByRole("tab").count()) === 4);
await carousel.getByRole("tab", { name: /Export ZIP/ }).click();
check("Choosing a step shows it", (await carousel.getByRole("tab", { name: /Export ZIP/ }).getAttribute("aria-selected")) === "true" && (await carousel.getByText("Everything in one download.").isVisible()));
await carousel.getByRole("button", { name: "Next step" }).click();
check("Next wraps around to the first step", (await carousel.getByRole("tab", { name: /Upload/ }).getAttribute("aria-selected")) === "true");
await page.mouse.move(5, 5);
await page.waitForTimeout(6600);
check("It plays on its own", (await carousel.getByRole("tab", { name: /Remove backgrounds/ }).getAttribute("aria-selected")) === "true");
await carousel.getByRole("button", { name: "Pause the walkthrough" }).click();
await page.mouse.move(5, 5);
await page.waitForTimeout(6600);
check("Pause stops it", (await carousel.getByRole("tab", { name: /Remove backgrounds/ }).getAttribute("aria-selected")) === "true");

// The sample project uses the real compositor: apply a look, then download real files.
const sample = page.locator("#try-it");
await sample.locator('[data-sample-preview="rendered"]').first().waitFor({ timeout: 15_000 });
await sample.getByRole("radio", { name: "Blue" }).click();
await sample.getByLabel("Padding").fill("20");
await sample.getByRole("button", { name: "Apply to samples" }).click();
await sample.getByRole("button", { name: "Applied to samples" }).waitFor();
await page.waitForFunction(() => document.querySelector("[data-sample-grid] img")?.getAttribute("alt")?.includes("blue background, 20% padding"));
let sampleZip = await download(page, () => sample.getByRole("button", { name: /Download sample ZIP/ }).click(), "sample.zip");
const sampleEntries = unzipSync(readFileSync(sampleZip.file));
writeFileSync(join(OUT, "sample-sneaker.png"), sampleEntries["sneaker.png"]);
const sampleImg = await inspect(page, join(OUT, "sample-sneaker.png"), { points: [[4, 4]], subject: { bg: [221, 230, 251] } });
check(
  "Sample ZIP: three square PNGs with the applied background and padding",
  Object.keys(sampleEntries).sort().join() === "handbag.png,serum.png,sneaker.png" &&
    sampleImg.width === sampleImg.height &&
    sampleImg.samples[0].slice(0, 3).join() === "221,230,251" &&
    sampleImg.box && Math.abs(Math.min(sampleImg.box.x0, sampleImg.box.y0, 1 - sampleImg.box.x1, 1 - sampleImg.box.y1) - 0.2) < 0.02,
  `${sampleImg.width}×${sampleImg.height}, corner ${sampleImg.samples[0]}, margin ${sampleImg.box ? Math.min(sampleImg.box.x0, sampleImg.box.y0, 1 - sampleImg.box.x1, 1 - sampleImg.box.y1).toFixed(3) : "?"}`,
);

// Signing in from the page opens the workspace.
await page.locator('main a[href="/sign-in?next=%2Fbatch"]').last().click();
await page.waitForURL("**/sign-in**");
await page.getByLabel("Email").fill(account.email);
await page.getByLabel("Password", { exact: true }).fill(account.password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((u) => u.pathname === "/batch", { timeout: 30_000 });
await page.locator("#batch-files").waitFor({ state: "attached", timeout: 20_000 });
check("After signing in, /batch is the workspace", (await page.getByRole("heading", { level: 1 }).innerText()) === "Batch Studio");
await page.locator("#batch-files").setInputFiles(PRODUCT);
await visible(page.getByText("Pro required")).first().waitFor({ timeout: 20_000 });
check("On a free account, images wait for Pro with a clear reason", await visible(page.getByText("Batch Studio is part of Pro")).isVisible());
const exportAll = visible(page.getByRole("button", { name: /^Export all ready/ })).last();
check("Export is disabled until something is finished, with a reason", (await exportAll.isDisabled()) && (await visible(page.locator("#batch-export-reason")).innerText()).length > 0);

/* 2. Upgrade: a full page load later the batch is restored and starts ---- */
// Wait until the batch is in IndexedDB (saving is debounced), as it would be by the time someone pays.
const savedCount = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("isola-batch");
        r.onsuccess = () => {
          const db = r.result;
          if (!db.objectStoreNames.contains("items")) return resolve(0);
          const q = db.transaction("items").objectStore("items").count();
          q.onsuccess = () => resolve(q.result);
          q.onerror = () => resolve(0);
        };
        r.onerror = () => resolve(0);
      }),
  );
for (let t = Date.now(); Date.now() - t < 10_000 && (await savedCount()) !== 1; ) await page.waitForTimeout(200);
await upgradeToPro(ctx, BASE);
await page.reload({ waitUntil: "networkidle" });
check(
  "The batch is restored from this browser after a reload",
  await card(page, "product.jpg").waitFor({ timeout: 15_000 }).then(() => true, () => false),
);

/* 3. Mixed batch: valid images, a transparent PNG, a corrupt and a fake file */
let maxProcessing = 0;
const sampler = setInterval(async () => {
  try {
    const m = (await statusText(page)).match(/(\d+) processing/);
    if (m) maxProcessing = Math.max(maxProcessing, Number(m[1]));
  } catch {}
}, 200);
await page.locator("#batch-files").setInputFiles([SERUM, PORTRAIT, TRANSPARENT, BROKEN, NOT_IMAGE]);
await visible(page.getByRole("alert").filter({ hasText: "not-an-image.png" })).waitFor();
check("An invalid file is rejected on its own; the rest are added", (await page.locator("[data-batch-item]").filter({ visible: true }).count()) === 5);
await settle(page);
clearInterval(sampler);
let status = await statusText(page);
check("Each image finishes independently; one corrupt file fails", /4 ready/.test(status) && /1 failed/.test(status) && /4 of 5 ready/.test(status), status);
check("Processing respects the concurrency limit", maxProcessing <= 1, `max ${maxProcessing} at once`);
check(
  "The corrupt image explains why it failed",
  await card(page, "broken.png").getByText(/couldn't decode/i).isVisible(),
);
const downloadButtons = await visible(page.getByRole("button", { name: /^Download .*\.(jpg|png)$/ })).count();
check("Every finished image has a visible Download button (no hover needed)", downloadButtons === 4, `${downloadButtons} buttons`);
await page.screenshot({ path: join(OUT, "batch-mixed.png") });

/* 4. Individual downloads ------------------------------------------------ */
let dl = await download(page, () => card(page, "product.jpg").getByRole("button", { name: "Download product.jpg" }).click());
let img = await inspect(page, dl.file, { points: [[10, 10], [760, 600]] });
check("Single download: original name, full size, real alpha", dl.suggested === "product.png" && img.width === 1600 && img.height === 1280 && img.samples[0][3] === 0 && img.samples[1][3] === 255, `${dl.suggested} ${img.width}×${img.height} corner α${img.samples[0][3]} subject α${img.samples[1][3]}`);
dl = await download(page, () => card(page, "cutout-source.png").getByRole("button", { name: /^Download/ }).click());
img = await inspect(page, dl.file, { points: [[100, 400], [150, 100]] });
check("Transparent source areas stay transparent", img.width === 1000 && img.height === 800 && img.samples[0][3] === 0 && img.samples[1][3] === 0, `${img.width}×${img.height}`);
dl = await download(page, () => card(page, "portrait-curly.jpg").getByRole("button", { name: /^Download/ }).click());
img = await inspect(page, dl.file, { subject: { alpha: true } });
check("Portrait downloads at full size with alpha", img.width === 1400 && img.height === 2100 && img.transparent > 0.2, `${(img.transparent * 100).toFixed(0)}% transparent`);

/* 5. Selected ZIP vs Export all ready ------------------------------------ */
await card(page, "product.jpg").getByRole("checkbox").check();
await card(page, "serum-bottle.jpg").getByRole("checkbox").check();
await card(page, "broken.png").getByRole("checkbox").check();
dl = await download(page, () => page.getByRole("button", { name: "Download selected ZIP" }).click(), "selected.zip");
let names = Object.keys(unzipSync(readFileSync(dl.file))).sort();
check("Selected ZIP holds only the selected finished images", names.join() === "product.png,serum-bottle.png", names.join(", "));
let report = await page.locator("[data-export-report]").innerText();
check("The failed selection is reported as left out", /broken\.png \(processing failed\)/.test(report), report);
dl = await download(page, () => visible(page.getByRole("button", { name: /^Export all ready/ })).last().click(), "all.zip");
const allEntries = unzipSync(readFileSync(dl.file));
names = Object.keys(allEntries).sort();
report = await page.locator("[data-export-report]").innerText();
check("Export all ready includes every finished image, whatever is selected", names.join() === "cutout-source.png,portrait-curly.png,product.png,serum-bottle.png", `${names.join(", ")} | ${report}`);
writeFileSync(join(OUT, "zip-serum.png"), allEntries["serum-bottle.png"]);
img = await inspect(page, join(OUT, "zip-serum.png"), { points: [[5, 5]] });
check("ZIP entries are full-resolution transparent PNGs", img.width === 1200 && img.height === 1800 && img.samples[0][3] === 0, `${img.width}×${img.height}`);

/* 6. Refine in the editor and come back ---------------------------------- */
await card(page, "product.jpg").getByRole("button", { name: /^Refine/ }).click();
await page.waitForURL("**/editor");
await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Erase brush"]')].some((b) => !b.disabled && b.offsetParent), null, { timeout: 60_000 });
check("Refine opens the image in the editor with its mask", await visible(page.getByText("From Batch Studio.")).isVisible());
await page.getByRole("button", { name: "Erase brush" }).first().click();
{
  const canvas = page.locator("[data-view]");
  const [scale, tx, ty] = (await canvas.getAttribute("data-view")).split(",").map(Number);
  const box = await canvas.boundingBox();
  const at = (x, y) => ({ x: box.x + tx + x * scale, y: box.y + ty + y * scale });
  const a = at(730, 600);
  const b = at(790, 600);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}
await page.waitForTimeout(1200);
await page.getByRole("link", { name: /Back to Batch Studio/ }).click();
await page.waitForURL((u) => u.pathname === "/batch");
await card(page, "product.jpg").getByText("Edited").waitFor({ timeout: 15_000 });
dl = await download(page, () => card(page, "product.jpg").getByRole("button", { name: "Download product.jpg" }).click());
img = await inspect(page, dl.file, { points: [[760, 600], [600, 700]] });
check("The editor's brush work comes back to the batch", img.samples[0][3] === 0 && img.samples[1][3] === 255, `erased α${img.samples[0][3]}, untouched α${img.samples[1][3]}`);
await card(page, "product.jpg").getByRole("button", { name: /^Refine/ }).click();
await page.waitForURL("**/editor");
await page.waitForTimeout(500);
const editorCopies = await page.getByRole("complementary", { name: "Images" }).getByText("product.jpg").count();
check("Refining again reuses the same editor image", editorCopies === 1, `${editorCopies} copies in the editor`);
await page.getByRole("link", { name: /Back to Batch Studio/ }).click();
await page.waitForURL((u) => u.pathname === "/batch");

/* 7. Settings: draft, apply to the selection only, exports match previews */
await card(page, "broken.png").getByRole("checkbox").uncheck();
const panel = page.getByRole("complementary", { name: "Batch settings" });
await panel.getByRole("radio", { name: "Soft grey" }).click();
await panel.getByRole("tab", { name: "Layout" }).click();
await panel.getByRole("button", { name: "Square (1:1)" }).click();
await panel.getByLabel("Padding percentage").fill("10");
await panel.getByRole("radio", { name: "Bottom centre" }).click();
await panel.getByRole("tab", { name: "Export" }).click();
await panel.getByLabel("Export format").selectOption("jpeg");
await panel.getByRole("switch", { name: "Keep original filenames" }).click();
check("Unapplied settings are flagged as a draft", await panel.getByText(/Not applied yet/).isVisible());
dl = await download(page, () => card(page, "serum-bottle.jpg").getByRole("button", { name: /^Download/ }).click());
check("Downloads keep using applied settings until the draft is applied", dl.suggested === "serum-bottle.png", dl.suggested);
await panel.getByRole("button", { name: "Apply to 2 selected" }).click();
await panel.getByText(/Applied to 2 images/).waitFor();
dl = await download(page, () => page.getByRole("button", { name: "Download selected ZIP" }).click(), "styled.zip");
const styled = unzipSync(readFileSync(dl.file));
names = Object.keys(styled).sort();
check("Applied settings rename and re-encode only the selection", names.join() === "product-isola.jpg,serum-bottle-isola.jpg", names.join(", "));
writeFileSync(join(OUT, "styled-product.jpg"), styled["product-isola.jpg"]);
const exp = await inspect(page, join(OUT, "styled-product.jpg"), { points: [[5, 5]], subject: { bg: [238, 239, 236] } });
check("Square canvas, soft grey, opaque JPEG at full size", exp.width === 1600 && exp.height === 1600 && Math.abs(exp.samples[0][0] - 238) < 4 && exp.samples[0][3] === 255, `${exp.width}×${exp.height} corner ${exp.samples[0]}`);
check(
  "Padding and bottom alignment are honoured",
  exp.box && Math.abs(exp.box.y1 - 0.9) < 0.02 && exp.box.y0 > 0.1 - 0.02 && exp.box.x0 > 0.08,
  exp.box ? `subject ${exp.box.x0.toFixed(3)}–${exp.box.x1.toFixed(3)} × ${exp.box.y0.toFixed(3)}–${exp.box.y1.toFixed(3)}` : "no subject",
);
await savePreview(page, "product.jpg", join(OUT, "preview-product.png"));
const prev = await inspect(page, join(OUT, "preview-product.png"), { subject: { bg: [238, 239, 236] } });
const diff = prev.box && exp.box ? Math.max(...["x0", "x1", "y0", "y1"].map((k) => Math.abs(prev.box[k] - exp.box[k]))) : 1;
check("The card preview matches the exported file", prev.width / prev.height === 1 && diff < 0.02, `max edge difference ${(diff * 100).toFixed(1)}%`);
dl = await download(page, () => card(page, "portrait-curly.jpg").getByRole("button", { name: /^Download/ }).click());
check("Images outside the selection keep their own settings", dl.suggested === "portrait-curly.png", dl.suggested);

/* 8. Shadow renders in previews and exports ------------------------------ */
/** Share of pixels that are white in `a` but visibly darker in `b`. */
async function shadowDelta(page, fileA, fileB) {
  return page.evaluate(
    async ([a64, b64]) => {
      const load = async (b64) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const bmp = await createImageBitmap(new Blob([bytes]));
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const g = c.getContext("2d");
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, bmp.width, bmp.height).data;
      };
      const [a, b] = [await load(a64), await load(b64)];
      let changed = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i] >= 254 && a[i + 1] >= 254 && a[i + 2] >= 254 && b[i] < 250) changed++;
      return changed / (a.length / 4);
    },
    [readFileSync(fileA).toString("base64"), readFileSync(fileB).toString("base64")],
  );
}
await page.getByRole("button", { name: "Clear selection" }).click();
await card(page, "portrait-curly.jpg").getByRole("checkbox").check();
await panel.getByRole("tab", { name: "Background" }).click();
await panel.getByRole("radio", { name: "White" }).click();
await panel.getByRole("tab", { name: "Layout" }).click();
await panel.getByRole("button", { name: "Square (1:1)" }).click();
await panel.getByRole("radio", { name: "Centre", exact: true }).click();
await panel.getByRole("tab", { name: "Export" }).click();
await panel.getByLabel("Export format").selectOption("png");
await panel.getByRole("button", { name: "Apply to 1 selected" }).click();
await panel.getByText(/Applied to 1 image/).waitFor();
const noShadow = await download(page, () => card(page, "portrait-curly.jpg").getByRole("button", { name: /^Download/ }).click(), "portrait-no-shadow.png");
await savePreview(page, "portrait-curly.jpg", join(OUT, "preview-no-shadow.png"));
await panel.getByRole("tab", { name: "Layout" }).click();
await panel.getByRole("switch", { name: "Soft shadow" }).click();
await panel.getByRole("button", { name: "Apply to 1 selected" }).click();
await panel.getByText(/Applied to 1 image/).waitFor();
await page.waitForTimeout(500);
const withShadow = await download(page, () => card(page, "portrait-curly.jpg").getByRole("button", { name: /^Download/ }).click(), "portrait-shadow.png");
await savePreview(page, "portrait-curly.jpg", join(OUT, "preview-shadow.png"));
const shadowed = await inspect(page, withShadow.file);
check("Shadow export: square white PNG at full size", shadowed.width === 2100 && shadowed.height === 2100, `${shadowed.width}×${shadowed.height}`);
const exportDelta = await shadowDelta(page, noShadow.file, withShadow.file);
const previewDelta = await shadowDelta(page, join(OUT, "preview-no-shadow.png"), join(OUT, "preview-shadow.png"));
check("Soft shadow darkens the white background in the exported file", exportDelta > 0.003, `${(exportDelta * 100).toFixed(2)}% of pixels`);
check("…and the preview shows the same shadow", previewDelta > 0.003 && Math.abs(previewDelta - exportDelta) < 0.02, `${(previewDelta * 100).toFixed(2)}% in the preview`);

/* 9. Cancel and retry ----------------------------------------------------- */
writeFileSync(join(OUT, "serum-copy.jpg"), readFileSync(SERUM));
await page.locator("#batch-files").setInputFiles([join(OUT, "serum-copy.jpg"), SKY]);
await visible(page.getByText(/1 processing/)).first().waitFor({ timeout: 60_000 });
const processingCard = page.locator("[data-batch-item]").filter({ has: page.locator('[data-status="processing"]') }).first();
const cancelledName = await processingCard.getAttribute("data-batch-item");
await processingCard.getByRole("button", { name: "Cancel", exact: true }).click();
await card(page, cancelledName).getByText("Cancelled").waitFor({ timeout: 30_000 });
await settle(page);
status = await statusText(page);
check("Cancelling one image doesn't stop the queue", /1 cancelled/.test(status) && /5 ready/.test(status), status);
await card(page, cancelledName).getByRole("button", { name: "Retry" }).click();
await settle(page);
status = await statusText(page);
check("A cancelled image can be retried", /6 ready/.test(status), status);
await card(page, "broken.png").getByRole("button", { name: "Retry" }).click();
await settle(page);
check("Retrying a bad file fails again with a message, not a spinner", /1 failed/.test(await statusText(page)));

/* 10. Remove, reload, still there ---------------------------------------- */
await card(page, "broken.png").getByRole("button", { name: "More actions for broken.png" }).click();
await page.getByRole("menuitem", { name: "Remove from batch" }).click();
await page.waitForTimeout(800);
await page.reload({ waitUntil: "networkidle" });
await card(page, "product.jpg").getByText("Edited").waitFor({ timeout: 20_000 });
status = await statusText(page);
check("After a reload, finished results and edits are still there", /6 ready/.test(status) && (await card(page, "broken.png").count()) === 0, status);
dl = await download(page, () => card(page, "product.jpg").getByRole("button", { name: "Download product.jpg" }).click());
check("Restored items download without reprocessing", dl.suggested === "product-isola.jpg", dl.suggested);
await page.screenshot({ path: join(OUT, "batch-desktop.png") });

/* 11. Mobile: settings drawer and reachable export controls -------------- */
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  await signInContext(mobile, BASE, account);
  const m = await mobile.newPage();
  await m.goto(`${BASE}/batch`, { waitUntil: "networkidle" });
  await m.locator("#batch-files").setInputFiles([PRODUCT, SERUM]);
  await settle(m);
  const bar = await m.locator("[data-batch-export-bar]").boundingBox();
  const exportBtn = visible(m.getByRole("button", { name: /^Export all ready/ })).last();
  const btnBox = await exportBtn.boundingBox();
  check("Mobile export bar stays on screen", bar && bar.y + bar.height <= 845 && btnBox && btnBox.y + btnBox.height <= 845, `bar ${Math.round(bar?.y)}–${Math.round((bar?.y ?? 0) + (bar?.height ?? 0))}`);
  check("No horizontal scrolling on mobile", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  const zip = await download(m, () => exportBtn.click(), "mobile.zip");
  check("Mobile Export all ready downloads a ZIP", Object.keys(unzipSync(readFileSync(zip.file))).length === 2);
  await card(m, "serum-bottle.jpg").getByRole("button", { name: /^Download/ }).scrollIntoViewIfNeeded();
  const last = await card(m, "serum-bottle.jpg").getByRole("button", { name: /^Download/ }).boundingBox();
  const barNow = await m.locator("[data-batch-export-bar]").boundingBox();
  check("The export bar doesn't cover the last image's buttons", last && barNow && last.y + last.height <= barNow.y + 1, `button bottom ${Math.round(last.y + last.height)}, bar top ${Math.round(barNow.y)}`);
  await m.getByRole("button", { name: "Settings" }).click();
  const sheet = m.getByRole("dialog", { name: "Batch settings" });
  await sheet.waitFor();
  await m.waitForTimeout(600);
  check("Settings open in an accessible drawer on mobile", await sheet.getByRole("tab", { name: "Layout" }).isVisible());
  await m.screenshot({ path: join(OUT, "batch-mobile-settings.png") });
  await m.keyboard.press("Escape");
  await m.screenshot({ path: join(OUT, "batch-mobile.png") });
  await mobile.close();
}

await browser.close();
await paystack.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} batch checks passed`);
process.exit(failures ? 1 : 0);
