/**
 * Regressions from the live-site audit, checked on a Free account the way a
 * person would hit them, with downloaded files opened and measured:
 *
 *  A. Create buttons work again after you come back from the new film/scene.
 *  B. Undo/redo of a ratio crop restores the ratio selection with the crop,
 *     and coming back to the crop tool doesn't re-crop on its own.
 *  C. Image export: what the dialog says about size agrees with the file.
 *  D. Motion export on Free: the resolution choice shows the real size, and
 *     the file matches.
 *  H. A finished render says it's ready to download, not that it was.
 *  F. The Motion preview gets usable room on a laptop-sized window.
 *  Profile: your account lives in the studio (old /account sends you there).
 *  G. /tools lists Scene Studio and Motion Studio and keeps the destination
 *     through sign-in.
 *  Phone: main-thread blocking while a 12 MP photo is placed (reported).
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 npm start
 *   BASE_URL=http://localhost:3000 node e2e/regressions.mjs
 */
import { chromium, devices } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output", "regressions");
mkdirSync(OUT, { recursive: true });
const BIG_PHOTO = process.env.BIG_PHOTO || null; // a 12 MP JPEG for the phone measurement (optional)
/** Run only some parts, e.g. ONLY=phone or ONLY=A,B (default: all). */
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map((x) => x.trim()) : null;
const wanted = (name) => !ONLY || ONLY.some((o) => name.split("/").includes(o) || name === o);

let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const text = async (locator) => ((await locator.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
async function download(page, click, name) {
  const pending = page.waitForEvent("download", { timeout: 300_000 });
  await click();
  const d = await pending;
  const file = join(OUT, name);
  await d.saveAs(file);
  return file;
}
/** Run one part; if it breaks (e.g. a control is stuck disabled), record that and carry on with the next part. */
async function part(name, fn) {
  if (!wanted(name)) return;
  try {
    await fn();
  } catch (error) {
    check(`${name} (could not finish)`, false, String(error?.message ?? error).split("\n")[0].slice(0, 200));
  }
}
const ready = (page) => page.waitForFunction(() => [...document.querySelectorAll('[aria-label="Erase brush"]')].some((b) => !b.disabled && b.offsetParent), null, { timeout: 240_000 });

const mailbox = await startMailbox();
const browser = await chromium.launch();
const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Audit Free" });
const ctx = await browser.newContext({ viewport: { width: 1363, height: 936 }, acceptDownloads: true });
await signInContext(ctx, BASE, account);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

/* A. Create buttons after coming back --------------------------------------- */
await part("A", async () => {
  await page.goto(`${BASE}/studio/motion`, { waitUntil: "networkidle" });
  const section = page.getByRole("region", { name: "New film" });
  await section.getByRole("button").first().click();
  await page.waitForURL(/\/studio\/motion\/[^/]+$/, { timeout: 30_000 });
  await page.locator("[data-viewer]").waitFor({ timeout: 30_000 });
  // Back to the list in-app (the films page is kept mounted by the router).
  await page.locator("aside").getByRole("link", { name: "Motion Studio" }).click();
  await page.waitForURL(`${BASE}/studio/motion`);
  await page.waitForTimeout(1500);
  const disabled = await section.getByRole("button").evaluateAll((bs) => bs.filter((b) => b.disabled).length);
  check("A. After making a film and coming back, every new-film button works again (no refresh)", disabled === 0, `${disabled} of 4 still disabled`);
  // And a second film can be made straight away.
  await section.getByRole("button").nth(1).click({ timeout: 5000 });
  const second = await page.waitForURL(/\/studio\/motion\/[^/]+$/, { timeout: 15_000 }).then(() => true, () => false);
  check("A. …and a second film opens from the same list", second);

  await page.goto(`${BASE}/studio/scenes`, { waitUntil: "networkidle" });
  const scenes = page.getByRole("region", { name: "New scene" });
  await page.getByRole("button", { name: "Sample scene", exact: true }).click();
  await page.waitForURL(/\/studio\/scenes\/[^/]+$/, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.locator("aside").getByRole("link", { name: "Scene Studio" }).click();
  await page.waitForURL(`${BASE}/studio/scenes`);
  await page.waitForTimeout(1500);
  const sceneDisabled = (await scenes.getByRole("button").evaluateAll((bs) => bs.filter((b) => b.disabled).length)) + ((await page.getByRole("button", { name: "Sample scene", exact: true }).isDisabled()) ? 1 : 0);
  check("A. The same in Scene Studio (new scene and Sample scene work again)", sceneDisabled === 0, `${sceneDisabled} still disabled`);
});

/* B. Crop ratio and undo ------------------------------------------------------ */
await part("B", async () => {
  await page.goto(`${BASE}/studio/editor`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Try the sneaker example" }).click();
  await ready(page);
  const props = page.getByRole("complementary", { name: "Properties" });
  const ratios = props.getByRole("radiogroup", { name: /ratio/i });
  const cropText = async () => (await text(props.getByText(/^Crop: /))).match(/(\d+) × (\d+)/)?.slice(1, 3).join("×");
  const checked = async () => (await ratios.getByRole("radio", { checked: true }).allInnerTexts()).join(",");
  await ratios.getByRole("radio", { name: "1:1" }).click();
  await page.waitForTimeout(400);
  const after11 = { size: await cropText(), ratio: await checked() };
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(400);
  const undone = { size: await cropText(), ratio: await checked() };
  check("B. 1:1 crops 1600 × 1200 to 1200 × 1200", after11.size === "1200×1200" && after11.ratio === "1:1", JSON.stringify(after11));
  check("B. Undo restores 1600 × 1200 and the ratio that went with it (not 1:1)", undone.size === "1600×1200" && undone.ratio !== "1:1", JSON.stringify(undone));
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(400);
  const redone = { size: await cropText(), ratio: await checked() };
  check("B. Redo brings back 1200 × 1200 with 1:1 selected", redone.size === "1200×1200" && redone.ratio === "1:1", JSON.stringify(redone));
  await page.keyboard.press("Control+z");
  await page.keyboard.press("v");
  await page.keyboard.press("c");
  await page.waitForTimeout(600);
  const back = await cropText();
  check("B. After undo, leaving and re-entering the crop tool doesn't re-crop on its own", back === "1600×1200", back);
});

/* C. Image export sizes agree with the file --------------------------------- */
await part("C", async () => {
  await page.getByRole("complementary", { name: "Properties" }).getByRole("button", { name: "Export image" }).click();
  const dialog = page.getByRole("dialog", { name: "Export image" });
  await dialog.waitFor();
  const before = await text(dialog);
  const file = await download(page, () => dialog.getByRole("button", { name: "Download" }).click(), "free-export.png");
  const meta = await sharp(file).metadata();
  const fileSize = `${meta.width.toLocaleString("en-US")} × ${meta.height.toLocaleString("en-US")}`;
  await page.waitForTimeout(500);
  const after = await text(dialog);
  check("C. The Free export file is capped to 1,000px on the longest side", meta.width === 1000 && meta.height === 750, `${meta.width}×${meta.height}`);
  const claimsOriginal = /Same pixel size as the original \(1600 × 1200 px\)\.?/.test(before) && !before.includes(`Your file will be ${fileSize} px`);
  check("C. The dialog never presents 1600 × 1200 as the file's size without saying the file is 1,000 × 750", !claimsOriginal, before.match(/Size.{0,220}/)?.[0]);
  check("C. The dialog states the file's real size before downloading", before.includes(`Your file will be ${fileSize} px`) && before.includes(`File: ${fileSize} px`), before.slice(0, 160));
  check("C. The download message gives the size written in the file", after.includes(`${fileSize} px`) && /Downloaded/.test(after), after.match(/(Saved|Downloaded).{0,120}/)?.[0]);
  await page.keyboard.press("Escape");
});

/* D + H + F. Motion on Free ---------------------------------------------------- */
await part("D/H/F", async () => {
  await page.goto(`${BASE}/studio/scenes`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Sample scene", exact: true }).click();
  await page.waitForURL(/\/studio\/scenes\/[^/]+$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Animate scene" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Choose a motion style" });
  await dialog.waitFor();
  await dialog.locator('[data-style="slow-reveal"]').click();
  await dialog.getByRole("button", { name: "Animate in Motion Studio" }).click();
  await page.waitForURL("**/studio/motion/**", { timeout: 30_000 });
  await page.locator("[data-viewer]").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  const box = await page.locator("[data-viewer]").boundingBox();
  const sidebar = await page.locator("#studio-sidebar").boundingBox();
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  check("F. At 1363 × 936 the preview gets usable room (at least 320px each way)", box && box.width >= 320 && box.height >= 320, `${Math.round(box?.width ?? 0)} × ${Math.round(box?.height ?? 0)} preview · sidebar ${Math.round(sidebar?.width ?? 0)}px`);
  check("F. No sideways page scrolling in the film editor", scrollW <= 1363, `${scrollW}px`);
  await page.screenshot({ path: join(OUT, "motion-1363x936.png") });

  await page.getByRole("button", { name: "Export video" }).first().click();
  const deliver = page.locator("[data-deliver]");
  await deliver.waitFor();
  await deliver.getByLabel("Resolution").selectOption("1080");
  const option = await deliver.getByLabel("Resolution").locator("option:checked").innerText();
  const outLine = await text(page.locator("[data-output-size]"));
  check("D. On Free, 1080p says beside it what the file will really be", /1000 × 1000/.test(option), `option “${option}”`);
  check("D. The output line names the file's size and what was asked for", /Your file: 1000 × 1000/.test(outLine) && /Asked for 1080 × 1080/.test(outLine), outLine);
  await page.getByRole("radio", { name: /MP4 · H\.264/ }).waitFor({ timeout: 20_000 });
  await deliver.getByRole("button", { name: "Export video" }).click();
  await page.locator("[data-export-ready]").waitFor({ timeout: 300_000 });
  const done = await text(page.locator("[data-export-ready]"));
  check("H. A finished render says the file is ready to download, and nothing was downloaded yet", /ready to download/.test(done) && /Nothing has been downloaded yet/.test(done) && !/Downloaded/.test(done), done.slice(0, 160));
  const mp4 = await download(page, () => page.locator("[data-export-ready]").getByRole("button", { name: /^Download/ }).click(), "free-film.mp4");
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", mp4]).toString());
  const v = probe.streams.find((s) => s.codec_type === "video");
  check("D/H. The MP4 is the size, frame rate and length the panel shows", v && done.includes(`${v.width} × ${v.height}`) && v.width === 1000 && v.height === 1000 && v.r_frame_rate === "30/1" && done.includes(`${Number(probe.format.duration).toFixed(1)}s`), `${v?.codec_name} ${v?.width}×${v?.height} ${v?.r_frame_rate} ${Number(probe.format.duration).toFixed(2)}s`);
  await page.locator("[data-export-kept]").filter({ hasText: /Download started/ }).waitFor({ timeout: 10_000 }).catch(() => undefined);
  check("H. After clicking Download it says the download started, and whether Downloads kept it", /Download started/.test(await text(page.locator("[data-export-kept]"))), await text(page.locator("[data-export-kept]")));
});

/* Profile lives in the studio ------------------------------------------------- */
await part("Profile", async () => {
  await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
  check("Profile: the old /account address opens Settings in the studio", new URL(page.url()).pathname === "/studio/settings", new URL(page.url()).pathname);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Account menu/ }).click();
  const items = await page.getByRole("menu").getByRole("menuitem").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? e.textContent?.trim()));
  check("Profile: the landing page's account menu sends you into the studio, not a site account page", !items.includes("/account") && items.includes("/studio/settings"), items.join(" "));
  await page.keyboard.press("Escape");
});

/* G. Scene and Motion Studio on /tools ---------------------------------------- */
await part("G", async () => {
  const anon = await browser.newContext();
  const p = await anon.newPage();
  await p.goto(`${BASE}/tools`, { waitUntil: "networkidle" });
  const scene = p.locator("main").getByRole("link", { name: /Scene Studio/ });
  const motion = p.locator("main").getByRole("link", { name: /Motion Studio/ });
  check("G. /tools lists Scene Studio and Motion Studio with what they need", (await scene.count()) === 1 && (await motion.count()) === 1 && /Free account/.test(await text(motion)), await text(motion));
  await motion.click();
  await p.waitForURL(/\/sign-in\?next=%2Fstudio%2Fmotion/, { timeout: 15_000 }).catch(() => undefined);
  check("G. Signed out, Motion Studio asks you to sign in and keeps the destination", /\/sign-in\?next=%2Fstudio%2Fmotion/.test(p.url()), p.url());
  await anon.close();
});

/* Phone: main-thread blocking while a large photo is placed --------------------- */
if (BIG_PHOTO && wanted("phone")) {
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  await signInContext(phone, BASE, account);
  const m = await phone.newPage();
  await m.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__long.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: "longtask", buffered: true });
  });
  await m.goto(`${BASE}/studio/editor`, { waitUntil: "networkidle" });
  // Give the engine time to finish loading first, so mostly placing the photo is measured.
  await m.waitForTimeout(25_000);
  const cdp = await phone.newCDPSession(m);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const t0 = await m.evaluate(() => performance.now());
  await m.locator("input[type=file]").first().setInputFiles(BIG_PHOTO);
  await ready(m);
  const t1 = await m.evaluate(() => performance.now());
  const long = await m.evaluate(([a, b]) => window.__long.filter((e) => e.start >= a && e.start <= b), [t0, t1]);
  const blocking = Math.round(long.reduce((s, e) => s + Math.max(0, e.duration - 50), 0));
  const longest = Math.round(Math.max(0, ...long.map((e) => e.duration)));
  console.log(`  Phone (Pixel 7, CPU ×4): 12 MP photo to cutout in ${((t1 - t0) / 1000).toFixed(1)} s · ${long.length} long tasks · longest ${longest} ms · total blocking ${blocking} ms`);
  check("Phone. Placing a 12 MP photo doesn't hold the page still for long (longest task under 1 s)", longest < 1000, `longest ${longest} ms, total blocking ${blocking} ms`);
  await phone.close();
}

check("No page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} regression checks passed`);
process.exit(failures ? 1 : 0);
