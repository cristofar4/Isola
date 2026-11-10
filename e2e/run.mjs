/**
 * End-to-end verification of the core workflow against a running server.
 *
 *   npm run build && SMTP_URL=smtp://127.0.0.1:2525 PAYSTACK_SECRET_KEY=sk_test_isola_e2e \
 *     PAYSTACK_API_BASE=http://127.0.0.1:4010 npm start
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Background removal requires an account, so this signs in with accounts it
 * creates (confirming the email through a local SMTP mailbox). The server
 * downloads the model on first use if it isn't in ./models yet.
 * Writes downloads and screenshots to e2e/output/.
 */
import { chromium } from "playwright";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";
import { startFakePaystack, upgradeToPro } from "./lib/paystack.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output");
mkdirSync(OUT, { recursive: true });
// Fixed test photo (1600×1280 product shot) so pixel probes don't depend on marketing samples.
const SAMPLE = join(process.cwd(), "e2e", "fixtures", "product.jpg");

let failures = 0;
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function waitReady(page, timeout = 180_000) {
  await page.waitForFunction(
    () => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Export image");
      return b && !b.disabled;
    },
    null,
    { timeout },
  );
}

async function decode(page, file, points = []) {
  const b64 = readFileSync(file).toString("base64");
  return page.evaluate(
    async ({ b64, points }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const all = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
      let transparent = 0;
      for (let i = 3; i < all.length; i += 4) if (all[i] === 0) transparent++;
      const px = (x, y) => Array.from(all.slice((y * bmp.width + x) * 4, (y * bmp.width + x) * 4 + 4));
      return { width: bmp.width, height: bmp.height, transparent: transparent / (all.length / 4), samples: points.map(([x, y]) => px(x, y)) };
    },
    { b64, points },
  );
}

function pngColorType(file) {
  const b = readFileSync(file);
  return b.subarray(1, 4).toString() === "PNG" ? b[25] : null;
}

async function exportImage(page, { format, name, width }) {
  await page.getByRole("button", { name: "Export image" }).click();
  const dialog = page.getByRole("dialog", { name: "Export image" });
  await dialog.getByRole("radio", { name: new RegExp(format) }).check();
  if (width) await dialog.getByLabel("Width (px)").fill(String(width));
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  const file = join(OUT, name);
  await (await download).saveAs(file);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  return file;
}

async function toScreen(page, x, y) {
  const canvas = page.locator("[data-view]");
  const [scale, tx, ty] = (await canvas.getAttribute("data-view")).split(",").map(Number);
  const box = await canvas.boundingBox();
  return { x: box.x + tx + x * scale, y: box.y + ty + y * scale, scale };
}

async function stroke(page, from, to) {
  const a = await toScreen(page, from.x, from.y);
  const b = await toScreen(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

const browser = await chromium.launch();
const mailbox = await startMailbox();
const paystack = await startFakePaystack();
const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "E2E Tester" });
// Full-resolution exports and Batch Studio are Pro features (free-plan limits are covered by test:billing).
{
  const upgrader = await browser.newContext();
  await signInContext(upgrader, BASE, account);
  await upgradeToPro(upgrader, BASE);
  await upgrader.close();
}

/* 0. Background removal needs an account ------------------------------ */
{
  const anon = await browser.newContext();
  const res = await anon.request.get(`${BASE}/api/models/isnet-general-use.onnx`);
  check("The model is only served to signed-in users", res.status() === 401, `HTTP ${res.status()} when signed out`);
  await anon.close();
}

/* 1. Honest unavailable state + retry after failure ------------------- */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signInContext(context, BASE, account);
  const page = await context.newPage();
  await context.route("**/api/models/**", (route) => route.fulfill({ status: 404, contentType: "application/json", body: '{"code":"model-missing"}' }));
  await page.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Try the sneaker example" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "isn't installed" });
  await alert.waitFor({ timeout: 60_000 });
  check("Missing model shows an honest unavailable state", true, (await alert.innerText()).split("\n")[0]);
  await context.unroute("**/api/models/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await waitReady(page);
  check("Retry after failure succeeds with the preserved original", true);
  await context.close();
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (e) => check("No page errors", false, e.message));

/* 2. Signed out, landing uploads go to sign-in; the editor waits for an account */
await page.goto(BASE, { waitUntil: "networkidle" });
let picker = false;
page.once("filechooser", () => (picker = true));
await page.getByRole("button", { name: "Upload image" }).click();
await page.waitForURL((u) => u.pathname === "/sign-in");
let url = new URL(page.url());
check("Signed out, Upload on the landing page goes to sign-in (no file picker)", !picker && url.searchParams.get("next") === "/editor" && url.searchParams.get("reason") === "upload", url.pathname + url.search);
check("The sign-in page says why", await page.getByText("Sign in to upload your images.").filter({ visible: true }).isVisible());
check(
  "Switching to Create an account keeps the way back",
  (await page.getByRole("link", { name: "Create an account" }).filter({ visible: true }).getAttribute("href")) === "/sign-up?next=%2Feditor&reason=upload",
);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Try the sneaker example" }).click();
await page.waitForURL((u) => u.pathname === "/sign-in");
check("Signed out, the example photos also go to sign-in", new URL(page.url()).searchParams.get("next") === "/editor");

// In the editor itself, a signed-out upload waits with a sign-in prompt instead of processing.
await page.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
const chooser = page.waitForEvent("filechooser");
await page.getByRole("button", { name: "Upload images" }).click();
await (await chooser).setFiles(SAMPLE);
const gate = page.getByText("Sign in to remove the background").filter({ visible: true });
await gate.waitFor({ timeout: 30_000 });
check("Signed-out visitors are asked to sign in before removal", true);
await page.getByRole("link", { name: "Sign in", exact: true }).filter({ visible: true }).first().click();
await page.waitForURL((u) => u.pathname === "/sign-in");
await page.getByLabel("Email").filter({ visible: true }).fill(account.email);
await page.getByLabel("Password", { exact: true }).filter({ visible: true }).fill(account.password);
await page.getByRole("button", { name: "Sign in" }).click();
if (await page.getByRole("alert").filter({ hasText: "Too many attempts" }).waitFor({ timeout: 3000 }).then(() => true, () => false)) {
  await page.waitForTimeout(11_000);
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.waitForURL((u) => u.pathname === "/editor");
const started = Date.now();
await waitReady(page);
check("After signing in, the same upload is processed without re-uploading", true);
check("Background removed on device", true, `${((Date.now() - started) / 1000).toFixed(1)}s incl. model load`);
await page.screenshot({ path: join(OUT, "editor-desktop.png") });

/* 3. Transparent PNG export: dimensions + real alpha ------------------- */
const subject = { x: 760, y: 600 };
const corner = { x: 10, y: 10 };
let file = await exportImage(page, { format: "Transparent PNG", name: "01-transparent.png" });
let img = await decode(page, file, [
  [corner.x, corner.y],
  [subject.x, subject.y],
]);
check("Export keeps original dimensions", img.width === 1600 && img.height === 1280, `${img.width}×${img.height}`);
check("PNG has an RGBA alpha channel", pngColorType(file) === 6, `colour type ${pngColorType(file)}`);
check("Background pixels are fully transparent (no checkerboard)", img.samples[0][3] === 0 && img.transparent > 0.5, `${(img.transparent * 100).toFixed(1)}% transparent`);
check("Subject pixels are opaque", img.samples[1][3] === 255, `alpha ${img.samples[1][3]}`);
const original = await decode(page, SAMPLE, [[subject.x, subject.y]]);

/* 4. Erase, restore, undo, redo --------------------------------------- */
await page.getByRole("button", { name: "Erase brush" }).first().click();
await stroke(page, { x: subject.x - 30, y: subject.y }, { x: subject.x + 30, y: subject.y });
file = await exportImage(page, { format: "Transparent PNG", name: "02-erased.png" });
img = await decode(page, file, [[subject.x, subject.y]]);
check("Erase brush clears the mask", img.samples[0][3] === 0, `alpha ${img.samples[0][3]}`);

await page.getByRole("button", { name: "Restore brush" }).first().click();
await stroke(page, { x: subject.x - 30, y: subject.y }, { x: subject.x + 30, y: subject.y });
file = await exportImage(page, { format: "Transparent PNG", name: "03-restored.png" });
img = await decode(page, file, [[subject.x, subject.y]]);
const rgbMatch = img.samples[0].slice(0, 3).every((v, i) => Math.abs(v - original.samples[0][i]) <= 1);
check("Restore brush recovers the original pixels", img.samples[0][3] === 255 && rgbMatch, `rgba ${img.samples[0]} vs original ${original.samples[0]}`);

await page.keyboard.press("Control+z");
file = await exportImage(page, { format: "Transparent PNG", name: "04-undo.png" });
img = await decode(page, file, [[subject.x, subject.y]]);
check("Undo reverts the restore stroke", img.samples[0][3] === 0, `alpha ${img.samples[0][3]}`);
await page.keyboard.press("Control+Shift+z");
file = await exportImage(page, { format: "Transparent PNG", name: "05-redo.png" });
img = await decode(page, file, [[subject.x, subject.y]]);
check("Redo re-applies it", img.samples[0][3] === 255, `alpha ${img.samples[0][3]}`);
await page.getByRole("button", { name: "Move" }).first().click();

/* 5. Comparison view ------------------------------------------------- */
await page.keyboard.press("\\");
const divider = page.getByRole("slider", { name: "Comparison divider" });
check("Comparison divider is shown and keyboard accessible", (await divider.getAttribute("aria-valuenow")) === "50");
await divider.focus();
await page.keyboard.press("ArrowRight");
check("Arrow keys move the divider", (await divider.getAttribute("aria-valuenow")) === "52");
await page.screenshot({ path: join(OUT, "editor-compare.png") });
await page.keyboard.press("\\");

/* 6. Solid colour background in PNG and JPEG ------------------------- */
await page.getByRole("radio", { name: "Colour" }).click();
await page.getByRole("radio", { name: "#4163F4" }).click();
file = await exportImage(page, { format: "PNG with background", name: "06-blue.png" });
img = await decode(page, file, [[corner.x, corner.y]]);
check("PNG with background uses the chosen colour", img.samples[0].join() === "65,99,244,255", `rgba ${img.samples[0]}`);
file = await exportImage(page, { format: "JPEG", name: "07-blue.jpg" });
img = await decode(page, file, [[corner.x, corner.y]]);
check("JPEG is opaque with the background", img.samples[0][3] === 255 && Math.abs(img.samples[0][2] - 244) < 6, `rgba ${img.samples[0]}`);

/* 7. Shadow ------------------------------------------------------------ */
await page.getByRole("switch", { name: "Drop shadow" }).click();
await page.getByRole("radio", { name: "None" }).click();
file = await exportImage(page, { format: "Transparent PNG", name: "08-shadow.png" });
img = await decode(page, file, [[subject.x, 980]]);
check("Shadow exports as semi-transparent pixels", img.samples[0][3] > 0 && img.samples[0][3] < 255, `alpha below subject ${img.samples[0][3]}`);
await page.getByRole("switch", { name: "Drop shadow" }).click();

/* 8. Crop + resize ----------------------------------------------------- */
await page.getByRole("button", { name: "Fit to subject" }).click();
const cropText = await page.getByText(/^Crop: \d+ × \d+ px/).innerText();
const [, cw, ch] = cropText.match(/(\d+) × (\d+)/);
file = await exportImage(page, { format: "Transparent PNG", name: "09-crop.png" });
img = await decode(page, file);
check("Crop exports at crop dimensions", img.width === Number(cw) && img.height === Number(ch), `${img.width}×${img.height} vs ${cw}×${ch}`);
file = await exportImage(page, { format: "Transparent PNG", name: "10-resized.png", width: 400 });
img = await decode(page, file);
check("Resize exports at the chosen size", img.width === 400 && Math.abs(img.height - Math.round((400 * ch) / cw)) <= 1, `${img.width}×${img.height}`);

/* 9. Invalid and oversized files are rejected clearly ---------------- */
const fake = join(OUT, "not-an-image.png");
writeFileSync(fake, "definitely not an image");
const huge = join(OUT, "huge-header.png");
const header = Buffer.alloc(64);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(header);
header.writeUInt32BE(9000, 16);
header.writeUInt32BE(9000, 20);
header[24] = 8;
header[25] = 6;
writeFileSync(huge, header);
const input = page.locator('input[type=file][multiple]').first();
await input.setInputFiles([fake, huge]);
const rejection = page.getByRole("alert").filter({ hasText: "not-an-image.png" });
await rejection.waitFor({ timeout: 10_000 });
const rejectionText = await rejection.innerText();
check("Invalid file rejected by content", /supported image/.test(rejectionText), rejectionText.replace(/\s+/g, " ").slice(0, 160));
check("Oversized dimensions rejected before decoding", /9,000/.test(rejectionText));

/* 10. Transparent input --------------------------------------------- */
await input.setInputFiles(join(OUT, "01-transparent.png"));
await page.waitForTimeout(500);
await waitReady(page);
file = await exportImage(page, { format: "Transparent PNG", name: "11-from-transparent.png" });
img = await decode(page, file, [[corner.x, corner.y], [subject.x, subject.y]]);
check("Transparent input keeps transparency", img.samples[0][3] === 0 && img.samples[1][3] > 200, `corner ${img.samples[0][3]}, subject ${img.samples[1][3]}`);

/* 11. Large image ---------------------------------------------------- */
const largeB64 = await page.evaluate(async () => {
  const bmp = await createImageBitmap(await (await fetch("/samples/sneaker-white.jpg")).blob());
  const c = new OffscreenCanvas(6000, 4000);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#d9dbe0";
  ctx.fillRect(0, 0, 6000, 4000);
  ctx.drawImage(bmp, 500, 0, 5000, 4000);
  const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
});
const largeFile = join(OUT, "large-6000x4000.jpg");
writeFileSync(largeFile, Buffer.from(largeB64, "base64"));
const largeStart = Date.now();
await input.setInputFiles(largeFile);
await page.waitForTimeout(500);
await waitReady(page);
file = await exportImage(page, { format: "Transparent PNG", name: "12-large.png" });
img = await decode(page, file, [[20, 20]]);
check("24 MP image processes and exports at full size", img.width === 6000 && img.height === 4000 && img.samples[0][3] === 0, `${img.width}×${img.height} in ${((Date.now() - largeStart) / 1000).toFixed(1)}s`);
await page.screenshot({ path: join(OUT, "editor-multi.png") });
await context.close();

/* 12. Batch Studio has its own suite: npm run test:batch (e2e/batch.mjs). */

/* 13. Mobile layout --------------------------------------------------- */
{
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await signInContext(mobile, BASE, account);
  const m = await mobile.newPage();
  await m.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
  await m.getByRole("button", { name: "Try the portrait example" }).click();
  await m.waitForFunction(() => document.body.innerText.includes("Ready") || !!document.querySelector('[aria-label="Erase brush"]:not([disabled])'), null, { timeout: 180_000 });
  await m.waitForFunction(() => [...document.querySelectorAll('[aria-label="Erase brush"]')].some((b) => !b.disabled && b.offsetParent), null, { timeout: 180_000 });
  const toolbar = m.getByRole("toolbar", { name: "Tools" }).filter({ visible: true });
  check("Mobile shows a bottom toolbar instead of side panels", (await toolbar.count()) === 1 && !(await m.getByRole("complementary", { name: "Properties" }).isVisible()));
  await m.screenshot({ path: join(OUT, "editor-mobile.png") });
  await m.getByRole("button", { name: "Adjustments" }).click();
  const sheet = m.getByRole("dialog", { name: "Adjustments" });
  await sheet.waitFor();
  check("Adjustments open in an accessible bottom sheet", await sheet.getByText("Background", { exact: true }).isVisible());
  await m.screenshot({ path: join(OUT, "editor-mobile-sheet.png") });
  await m.keyboard.press("Escape");
  await mobile.close();
}

await browser.close();
await mailbox.close();
await paystack.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures ? 1 : 0);
