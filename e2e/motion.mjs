/**
 * Scene Studio and Motion Studio, end to end on a Pro account:
 * a scene with backdrops, formats and exports; Animate scene with every
 * motion style previewed; shots, the timeline, keyframes and curves; colour
 * that leaves the product untouched; sound with real meters; video import;
 * missing media; Update from scene; and a real export checked with ffprobe,
 * frame-compared against the preview.
 *
 *   start the app as for test:batch (SMTP + fake Paystack), then
 *   BASE_URL=http://localhost:3000 npm run test:motion
 * Needs ffmpeg/ffprobe on the PATH to make test media and inspect exports.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import sharp from "sharp";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";
import { startFakePaystack, upgradeToPro } from "./lib/paystack.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output", "motion");
mkdirSync(OUT, { recursive: true });
let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

// Test media, made here (no third-party footage or music).
const TONE = join(OUT, "tone.wav");
const CLIP = join(OUT, "clip.mp4");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3:sample_rate=48000", "-ac", "2", TONE]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=2", "-f", "lavfi", "-i", "sine=frequency=660:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", CLIP]);
const probe = (file) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]).toString());

const mailbox = await startMailbox();
const paystack = await startFakePaystack();
const browser = await chromium.launch();
const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Motion Tester" });
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, acceptDownloads: true });
await signInContext(context, BASE, account);
await upgradeToPro(context, BASE);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

async function download(click, name) {
  const pending = page.waitForEvent("download", { timeout: 240_000 });
  await click();
  const d = await pending;
  const file = join(OUT, name ?? d.suggestedFilename());
  await d.saveAs(file);
  return file;
}

/** A small fingerprint of a canvas (16×16 RGB), to tell frames apart or compare them. */
const fingerprint = (selector) =>
  page.evaluate((sel) => {
    const src = document.querySelector(sel);
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const ctx = c.getContext("2d");
    ctx.drawImage(src, 0, 0, 16, 16);
    return Array.from(ctx.getImageData(0, 0, 16, 16).data);
  }, selector);
const diff = (a, b) => a.reduce((s, v, i) => (i % 4 === 3 ? s : s + Math.abs(v - b[i])), 0) / ((a.length / 4) * 3);
/** The colour of one point of the viewer (fractions of its size). */
const viewerPixel = (fx, fy) =>
  page.evaluate(
    ([x, y]) => {
      const c = document.querySelector("[data-viewer]");
      const d = c.getContext("2d").getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data;
      return [d[0], d[1], d[2]];
    },
    [fx, fy],
  );

/* 1. Scene Studio ----------------------------------------------------------- */
await page.goto(`${BASE}/studio/scenes`, { waitUntil: "networkidle" });
check("Scene Studio is in the studio sidebar and starts empty", (await page.getByText("No scenes yet").isVisible()) && (await page.getByRole("complementary", { name: "Studio sidebar" }).getByRole("link", { name: "Scene Studio" }).getAttribute("aria-current")) === "page");
await page.getByRole("button", { name: "Sample scene" }).click();
await page.waitForURL("**/studio/scenes/**", { timeout: 60_000 });
const sceneUrl = page.url();
await page.locator("[data-save-state=saved]").filter({ visible: true }).waitFor({ timeout: 30_000 });
await page.getByRole("tab", { name: "Scene", exact: true }).click();
const layerNames = await page.locator("[data-layer]").evaluateAll((els) => els.map((e) => e.getAttribute("data-layer")));
check("The sample scene has separate layers: title, product, its shadow and the backdrop", JSON.stringify(layerNames) === JSON.stringify(["Text", "Serum", "Serum shadow", "Backdrop"]), layerNames.join(", "));
await page.locator('[data-backdrop="marble"]').click();
await page.waitForTimeout(400);
const marble = await page.locator('[data-backdrop="marble"]').getAttribute("aria-pressed");
await page.keyboard.press("Control+z");
await page.waitForTimeout(400);
check("Backdrops change the set, and undo brings the last one back", marble === "true" && (await page.locator('[data-backdrop="ivory-plinth"]').getAttribute("aria-pressed")) === "true");
await page.locator('[data-layer="Serum"] button').first().click();
const posX = page.getByLabel("Position X");
await posX.fill("600");
await posX.press("Enter");
await page.locator("[data-save-state=saved]").filter({ visible: true }).waitFor({ timeout: 10_000 });
await page.reload({ waitUntil: "networkidle" });
await page.locator('[data-layer-panel]').waitFor();
check("Numeric placement is saved in this browser (it survives a reload)", (await page.getByLabel("Position X").inputValue()) === "600");
await page.getByRole("button", { name: "Add Wide 16:9" }).click();
await page.locator('[data-format="wide"]').waitFor();
await page.getByRole("tab", { name: "Export", exact: true }).click();
await page.getByRole("checkbox", { name: /Wide 16:9/ }).check();
const zipFile = await download(() => page.getByRole("button", { name: /Download 2 formats/ }).click(), "scene-formats.zip");
const zipped = unzipSync(readFileSync(zipFile));
const sizes = {};
for (const [n, data] of Object.entries(zipped)) {
  const m = await sharp(Buffer.from(data)).metadata();
  sizes[n.split("/")[0]] = `${m.width}x${m.height}`;
}
check("Linked formats export together at full size on Pro (one folder each)", sizes["square-1-1"] === "1080x1080" && sizes["wide-16-9"] === "1920x1080", JSON.stringify(sizes));

// Animate scene: every style previewed on the scene's own layers.
await page.getByRole("button", { name: "Animate scene" }).first().click();
const dialog = page.getByRole("dialog", { name: "Choose a motion style" });
await dialog.waitFor();
await page.waitForTimeout(1500);
const previews = await dialog.locator("[data-style] canvas").evaluateAll((cs) =>
  cs.map((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < d.length; i += 40) {
      min = Math.min(min, d[i]);
      max = Math.max(max, d[i]);
    }
    return max - min;
  }),
);
check("Six motion styles, each previewed by the real renderer (not blank)", previews.length === 6 && previews.every((r) => r > 30), previews.join(","));
check("The scene itself isn't changed by previewing", page.url() === sceneUrl);
await dialog.locator('[data-style="social-launch"]').click();
await dialog.getByRole("button", { name: "Animate in Motion Studio" }).click();
await page.waitForURL("**/motion/**", { timeout: 30_000 });
const filmUrl = page.url();
await page.locator("[data-viewer]").waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);

/* 2. Motion Studio ----------------------------------------------------------- */
const shots = () => page.locator("[data-shot]").evaluateAll((els) => els.map((e) => e.getAttribute("data-shot")));
check("Social launch builds five shots from the scene's layers", JSON.stringify(await shots()) === JSON.stringify(["Hook", "Product", "Detail", "Caption", "End card"]), (await shots()).join(", "));
check("Clips made from scene layers are linked to the scene", (await page.locator("[data-clip]").filter({ hasText: "↔" }).count()) >= 8);
const atStart = await fingerprint("[data-viewer]");
await page.locator('[data-shot="End card"] button').first().click();
await page.waitForTimeout(400);
check("The viewer shows different shots at different times", diff(atStart, await fingerprint("[data-viewer]")) > 8);

const serumLabels = () => page.locator('[data-track="Product"] [data-clip="Serum"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const hookLabel = (await serumLabels()).find((l) => l.startsWith("Serum, 00:00:00"));
await page.locator('[data-shot="Hook"]').getByRole("button", { name: "Actions for Hook" }).click();
await page.getByRole("menuitem", { name: "Move later" }).click();
await page.waitForTimeout(300);
const reordered = await shots();
const nowFirst = (await serumLabels()).find((l) => l.startsWith("Serum, 00:00:00"));
await page.keyboard.press("Control+z");
await page.waitForTimeout(300);
check(
  "Reordering the storyboard reorders the timeline, and can be undone",
  reordered[0] === "Product" && nowFirst !== hookLabel && (await shots())[0] === "Hook" && (await serumLabels()).includes(hookLabel),
  `${reordered.join(",")} · first clip ${hookLabel} → ${nowFirst}`,
);

// Split at the playhead, then undo.
await page.locator('[data-shot="Product"] button').first().click();
for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowRight");
const serumClips = () => page.locator('[data-track="Product"] [data-clip="Serum"]').count();
const before = await serumClips();
await page.locator('[data-track="Product"] [data-clip="Serum"]').nth(1).click();
await page.keyboard.press("s");
await page.waitForTimeout(200);
const afterSplit = await serumClips();
await page.keyboard.press("Control+z");
await page.waitForTimeout(200);
check("Split at the playhead (S) makes two clips; undo joins them", afterSplit === before + 1 && (await serumClips()) === before, `${before} → ${afterSplit}`);

// Keyframes, motion path and curves (Animate).
await page.locator('[data-shot="Hook"] button').first().click();
await page.locator('[data-track="Product"] [data-clip="Serum"]').first().click();
await page.getByRole("button", { name: "Animate", exact: true }).click();
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
await page.getByRole("button", { name: "Add Position X keyframe" }).click();
for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowRight");
const px = page.locator('[data-inspector-panel="animate"]').getByRole("textbox", { name: "Position X" });
await px.fill("760");
await px.press("Enter");
await px.blur();
await page.waitForTimeout(300);
check("Position keyframes draw a motion path you can drag", (await page.locator("[data-path-key]").count()) === 2);
for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(150);
const midLinear = Number(await px.inputValue());
await page.locator('[data-inspector-panel="animate"] select[id^="ease-"]').first().selectOption("ease-in");
await page.waitForTimeout(250);
const midEaseIn = Number(await px.inputValue());
const startX = 1067; // the first keyframe (x = 600/1080 of the scene, in a 1920-wide film)
check("Changing a keyframe's ease changes the in-between values (ease-in moves less at first)", midLinear < startX - 50 && midLinear > 800 && Math.abs(midEaseIn - startX) < Math.abs(midLinear - startX) - 20, `linear ${midLinear} → ease-in ${midEaseIn}`);
await page.getByRole("radio", { name: "Scene camera" }).click();
check("Scene camera keyframes are separate from layer keyframes", (await page.getByText(/Moves the whole of Hook/).isVisible()) && (await page.locator('[data-prop="Zoom"]').count()) === 1);

// Colour: a background grade leaves the product's pixels alone.
await page.locator('[data-shot="Product"] button').first().click();
for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
await page.getByRole("button", { name: "Colour", exact: true }).click();
await page.waitForTimeout(500);
// The serum stands at x ≈ 0.556 of the frame (600 of 1080 in the scene), so sample the middle of the bottle.
const productBefore = await viewerPixel(0.556, 0.5);
const cornerBefore = await viewerPixel(0.04, 0.04);
await page.getByLabel(/^Exposure/).focus();
for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(600);
const productAfter = await viewerPixel(0.556, 0.5);
const cornerAfter = await viewerPixel(0.04, 0.04);
check(
  "A background grade brightens the backdrop and leaves the product untouched",
  cornerAfter[0] > cornerBefore[0] + 8 && productAfter.every((v, i) => Math.abs(v - productBefore[i]) <= 2),
  `corner ${cornerBefore}→${cornerAfter}, product ${productBefore}→${productAfter}`,
);
const scopeInk = await page.locator('[data-scopes] canvas[aria-label="RGB parade"]').evaluate((c) => {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
  return n;
});
check("Colour scopes are drawn from the preview's pixels", scopeInk > 50, `${scopeInk} lit points`);

// Sound: import, waveform, real meters.
await page.getByRole("button", { name: "Sound", exact: true }).click();
await page.locator("#motion-sound-files").setInputFiles(TONE);
await page.locator('[data-clip="tone"]').waitFor({ timeout: 20_000 });
check("Imported sound lands on an audio track with its waveform", (await page.locator('[data-clip="tone"] svg path').count()) === 1);
// The sound was added at the playhead; play from there.
await page.locator('[data-clip="tone"]').click();
await page.keyboard.press("Space");
await page.waitForTimeout(900);
const meter = await page.locator('[data-meter-db="L"]').innerText();
await page.keyboard.press("Space");
check("Meters read the actual signal while playing", /^-?\d+(\.\d)? dB$/.test(meter) && Number.parseFloat(meter) > -30, meter);

// Video with its own sound.
await page.getByRole("button", { name: "Assemble", exact: true }).click();
await page.locator("#motion-files").setInputFiles(CLIP);
await page.locator('[data-media="clip.mp4"]').waitFor({ timeout: 30_000 });
check("A video is checked, stored and added with its own sound", (await page.locator('[data-clip="clip"]').count()) === 1 && (await page.locator('[data-clip="clip sound"]').count()) === 1);
await page.locator('[data-clip="clip"]').click();
await page.keyboard.press("Delete");
await page.locator('[data-clip="clip sound"]').click();
await page.keyboard.press("Delete");

// Missing media is shown, and can be relinked.
await page.locator("[data-save-state=saved]").filter({ visible: true }).waitFor({ timeout: 10_000 });
await page.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open("isola-library");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("blobs", "readwrite");
        const store = tx.objectStore("blobs");
        const keys = store.getAllKeys();
        keys.onsuccess = () => {
          for (const k of keys.result) if (String(k).startsWith("media:")) store.delete(k);
        };
        tx.oncomplete = () => {
          db.close();
          resolve(null);
        };
        tx.onerror = () => reject(tx.error);
      };
    }),
);
await page.reload({ waitUntil: "networkidle" });
await page.locator("[data-viewer]").waitFor();
const relink = page.locator('[data-media="tone.wav"]').getByText("Relink");
await relink.waitFor({ timeout: 15_000 });
check("Media missing from this browser is flagged with a way to relink it", await relink.isVisible());
await page.locator('[data-media="tone.wav"] input[type=file]').setInputFiles(TONE);
await page.locator('[data-media="tone.wav"]').getByText("Relink").waitFor({ state: "detached", timeout: 15_000 });
check("Relinking restores it", true);

// Update from scene.
await page.goto(sceneUrl, { waitUntil: "networkidle" });
await page.getByRole("tab", { name: "Scene", exact: true }).click();
await page.locator('[data-layer="Text"] button').first().click();
const words = page.getByLabel("Words");
await words.fill("Spring serum");
await words.blur();
await page.locator("[data-save-state=saved]").filter({ visible: true }).waitFor({ timeout: 10_000 });
await page.waitForTimeout(600);
await page.goto(filmUrl, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Review update" }).click();
const update = page.getByRole("dialog", { name: /Update from/ });
await update.waitFor();
const changes = (await update.locator("[data-update-changes]").innerText()).replace(/\s+/g, " ");
await update.getByRole("button", { name: "Update film" }).click();
await page.waitForTimeout(400);
check("Update from scene shows what changed, then updates the linked title", /Your headline” → “Spring serum/.test(changes) && (await page.locator("[data-clip]").filter({ hasText: "Spring serum" }).count()) >= 1, changes.slice(0, 160));
check("…and the scene-changed notice goes away", (await page.getByRole("button", { name: "Review update" }).count()) === 0);

/* 3. Deliver ---------------------------------------------------------------- */
await page.getByRole("button", { name: "Deliver", exact: true }).click();
await page.getByRole("radio", { name: /MP4 · H\.264/ }).waitFor({ timeout: 20_000 });
check("Only formats this browser can encode are offered, labelled by codec", (await page.getByRole("radio", { name: /MP4 · H\.264/ }).count()) === 1, (await page.locator("[data-deliver] [role=radiogroup][aria-label=Format]").innerText()).replace(/\s+/g, " "));
const outSize = (await page.locator("[data-output-size]").innerText()).replace(/\s+/g, " ");
const t0 = Date.now();
await page.locator("[data-deliver]").getByRole("button", { name: "Export film" }).click();
await page.locator("[data-export-progress]").waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.locator("[data-export-ready]").waitFor({ timeout: 240_000 });
const ready = (await page.locator("[data-export-ready]").innerText()).replace(/\s+/g, " ");
const mp4 = await download(() => page.locator("[data-export-ready]").getByRole("button", { name: "Download" }).click(), "film.mp4");
const info = probe(mp4);
const v = info.streams.find((s) => s.codec_type === "video");
const a = info.streams.find((s) => s.codec_type === "audio");
const duration = Number(info.format.duration);
check("The export is a real MP4: H.264 video at the size shown, 30 fps", info.format.format_name.includes("mp4") && v?.codec_name === "h264" && `${v.width} × ${v.height}` === outSize.match(/(\d+ × \d+)/)?.[1] && v.r_frame_rate === "30/1", `${v?.codec_name} ${v?.width}x${v?.height} ${v?.r_frame_rate} · ${outSize}`);
check("…with the film's sound, and the film's length", !!a && ["aac", "opus"].includes(a.codec_name) && Math.abs(duration - Number(ready.match(/(\d+(\.\d)?)s/)?.[1] ?? 0)) < 0.15, `${a?.codec_name} · ${duration.toFixed(2)}s · ${ready}`);
console.log(`  (export took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// Preview = export: the same frame from the viewer and from the file.
await page.locator('[data-shot="Caption"] button').first().click();
for (let i = 0; i < 15; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(500);
const tc = await page.locator("[data-timecode]").innerText();
const [mm, ss, ff] = tc.split(":").map(Number);
const at = mm * 60 + ss + ff / 30;
const previewPx = await fingerprint("[data-viewer]");
// The same frame from the file, at full size, downscaled exactly like the preview fingerprint.
const png = execFileSync("ffmpeg", ["-v", "error", "-ss", (at + 0.5 / 30).toFixed(4), "-i", mp4, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]);
const exportPx = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, 16, 16);
  return Array.from(ctx.getImageData(0, 0, 16, 16).data);
}, png.toString("base64"));
check("The exported frame matches the preview at the same time", diff(previewPx, exportPx) < 8, `mean difference ${diff(previewPx, exportPx).toFixed(1)} (of 255) at ${tc}`);

// Persistence.
await page.reload({ waitUntil: "networkidle" });
await page.locator("[data-viewer]").waitFor();
check("The film (shots, clips, keyframes, sound, export settings) is stored and reloads", JSON.stringify(await shots()) === JSON.stringify(["Hook", "Product", "Detail", "Caption", "End card"]) && (await page.locator('[data-clip="tone"]').count()) === 1 && (await page.locator("[data-clip]").filter({ hasText: "Spring serum" }).count()) >= 1);

await page.goto(`${BASE}/studio/motion`, { waitUntil: "networkidle" });
check("Motion Studio lists the film", (await page.locator('[data-film="Sample scene"]').count()) === 1);
await page.goto(`${BASE}/studio/downloads`, { waitUntil: "networkidle" });
check("Exports appear in Downloads", (await page.locator('[data-download="film.mp4"], [data-download$=".mp4"]').count()) >= 1);

// Phones: the viewer stays usable, panels become tabs.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await signInContext(phone, BASE, account);
const m = await phone.newPage();
m.on("pageerror", (e) => errors.push(e.message));
await m.goto(`${BASE}/studio/scenes`, { waitUntil: "networkidle" });
check("No sideways scrolling on Scene Studio on phones", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
await m.goto(`${BASE}/studio/motion`, { waitUntil: "networkidle" });
check("No sideways scrolling on Motion Studio's films on phones", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
await phone.close();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(filmUrl, { waitUntil: "networkidle" });
await page.locator("[data-viewer]").waitFor();
const vb = await page.locator("[data-viewer]").boundingBox();
check("On a phone the editor keeps a usable viewer with panel tabs", vb && vb.width > 150 && (await page.getByRole("tab", { name: "Timeline" }).isVisible()) && (await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, `viewer ${Math.round(vb?.width ?? 0)}px`);

check("No page errors", errors.length === 0, errors.join(" | "));
await browser.close();
await mailbox.close();
await paystack.close();
console.log(`\n${total - failures}/${total} motion checks passed`);
process.exit(failures ? 1 : 0);
