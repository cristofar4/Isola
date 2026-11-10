/**
 * Public API end to end: key lifecycle in the Account page, authentication,
 * real server-side processing (every response image is decoded and measured),
 * plan rules, validation, rate limits, CORS and the docs playground.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 PAYSTACK_SECRET_KEY=sk_test_isola_e2e \
 *   PAYSTACK_API_BASE=http://127.0.0.1:4010 ISOLA_API_RATE_LIMIT_PER_HOUR=15 npm start
 *   BASE_URL=http://localhost:3000 npm run test:api
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";
import { startFakePaystack, upgradeToPro } from "./lib/paystack.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output", "api");
mkdirSync(OUT, { recursive: true });
const PRODUCT = join(process.cwd(), "e2e", "fixtures", "product.jpg"); // 1600×1280
let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const product = readFileSync(PRODUCT);
async function call(path, { key, body, type, headers = {}, method } = {}) {
  const h = { ...headers };
  if (key) h.Authorization = `Bearer ${key}`;
  if (type) h["Content-Type"] = type;
  return fetch(`${BASE}${path}`, { method: method ?? (body ? "POST" : "GET"), headers: h, body });
}
function form(bytes = product, fields = {}, name = "product.jpg") {
  const f = new FormData();
  f.append("image", new Blob([bytes]), name);
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

/** Decode an image in the browser and measure it. */
let probe;
async function measure(bytes, points = []) {
  return probe.evaluate(
    async ({ b64, points }) => {
      const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([data]), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext("2d");
      g.drawImage(bmp, 0, 0);
      const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
      let opaque = 0;
      let marked = 0;
      const w5 = Math.round(bmp.width / 5);
      const h5 = Math.round(bmp.height / 5);
      for (let y = 0; y < h5; y++) for (let x = 0; x < w5; x++) if (d[(y * bmp.width + x) * 4 + 3] > 0) marked++;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 127) opaque++;
      const px = (x, y) => Array.from(d.slice((y * bmp.width + x) * 4, (y * bmp.width + x) * 4 + 4));
      return { width: bmp.width, height: bmp.height, coverage: opaque / (d.length / 4), cornerMarked: marked / (w5 * h5), samples: points.map(([x, y]) => px(x, y)) };
    },
    { b64: Buffer.from(bytes).toString("base64"), points },
  );
}

const mailbox = await startMailbox();
const paystack = await startFakePaystack();
const browser = await chromium.launch();
probe = await (await browser.newContext()).newPage();
await probe.goto(`${BASE}/privacy`);

/* 1. Keys in the Account page --------------------------------------------- */
const freeAccount = await createConfirmedAccount(browser, BASE, mailbox, { name: "Api Free" });
const freeCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
await signInContext(freeCtx, BASE, freeAccount);
const page = await freeCtx.newPage();
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
const card = page.getByRole("region", { name: "API keys" });
await card.getByText("No keys yet").waitFor();
await card.getByLabel("Key name").fill("Shop backend");
await card.getByRole("button", { name: "Create key" }).click();
const keyField = card.getByLabel("New API key");
await keyField.waitFor();
const freeKey = (await keyField.innerText()).trim();
check("Creating a key shows it once", /^isola_sk_[A-Za-z0-9_-]{32}$/.test(freeKey), freeKey.slice(0, 13) + "…");
await card.getByRole("button", { name: "I've saved it" }).click();
check("The list shows a preview, never the key", (await card.getByText("Shop backend").isVisible()) && !(await page.content()).includes(freeKey));
await page.reload({ waitUntil: "networkidle" });
await card.getByText("Shop backend").waitFor();
check("After a reload the full key is gone for good", !(await page.content()).includes(freeKey) && (await card.getByText(`${freeKey.slice(0, 13)}…${freeKey.slice(-4)}`).isVisible()));
await page.screenshot({ path: join(OUT, "account-api-keys.png"), fullPage: true });
await page.goto(`${BASE}/developers`, { waitUntil: "networkidle" });
const panel = page.locator('[data-api-access="signed-in"]');
await panel.getByText("You have 1 API key.").waitFor({ timeout: 10_000 });
check(
  "Signed in, the docs show your plan and keys instead of the sign-up invitation",
  (await panel.getByText("Free plan").isVisible()) && (await page.locator('[data-api-access="signed-out"]').count()) === 0 && (await panel.getByRole("link", { name: "Manage API keys" }).getAttribute("href")) === "/account#api-keys",
);
await page.screenshot({ path: join(OUT, "docs-signed-in.png") });

/* 2. Authentication -------------------------------------------------------- */
let res = await call("/api/v1/me");
let json = await res.json();
check("No key → 401 missing_api_key", res.status === 401 && json.error.code === "missing_api_key");
res = await call("/api/v1/me", { key: "isola_sk_not-a-real-key-000000000000000" });
json = await res.json();
check("Unknown key → 401 invalid_api_key", res.status === 401 && json.error.code === "invalid_api_key");
res = await call("/api/v1/me", { headers: { "X-Api-Key": freeKey } });
json = await res.json();
check("X-Api-Key works and /me describes the Free plan", res.status === 200 && json.plan.name === "free" && json.output.watermark === true && json.output.maxSide === 1000, JSON.stringify(json.output));
const limit = json.rateLimit.limit;

/* 3. Free key: real cutout, plan rules -------------------------------------- */
res = await call("/api/v1/remove-background", { key: freeKey, body: form() });
let bytes = Buffer.from(await res.arrayBuffer());
writeFileSync(join(OUT, "free-cutout.png"), bytes);
let m = await measure(bytes, [[3, 3]]);
check(
  "Free key: PNG cutout scaled to 1000px with the watermark",
  res.status === 200 && res.headers.get("content-type") === "image/png" && m.width === 1000 && m.height === 800 && res.headers.get("x-isola-watermark") === "true" && m.cornerMarked > 0.01,
  `${res.status} ${m.width}×${m.height}, ${(m.cornerMarked * 100).toFixed(1)}% of the corner marked`,
);
check("Rate-limit headers on every response", Number(res.headers.get("x-ratelimit-remaining")) === limit - 1 && res.headers.get("x-ratelimit-limit") === String(limit));
res = await call("/api/v1/remove-background", { key: freeKey, body: form(product, { output: "mask" }) });
json = await res.json();
check("Masks need Pro", res.status === 403 && json.error.code === "pro_required");

/* 4. Validation ------------------------------------------------------------ */
res = await call("/api/v1/remove-background", { key: freeKey, body: form(Buffer.from("hello, not an image"), {}, "note.png") });
check("Non-images → 415", res.status === 415 && (await res.json()).error.code === "unsupported_media_type");
const tiny = Buffer.from(await probe.evaluate(async () => {
  const c = new OffscreenCanvas(20, 20);
  c.getContext("2d").fillRect(0, 0, 20, 20);
  return Array.from(new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()));
}));
res = await call("/api/v1/remove-background", { key: freeKey, body: form(tiny, {}, "tiny.png") });
check("Images under the minimum size → 422", res.status === 422 && (await res.json()).error.code === "image_too_small");
res = await call("/api/v1/remove-background", { key: freeKey, body: form(product, { format: "gif" }) });
check("Unknown options → 400 with the reason", res.status === 400 && /format/.test((await res.json()).error.message));
res = await call("/api/v1/remove-background", { key: freeKey, body: "plain text", type: "text/plain" });
check("Unsupported body types → 415", res.status === 415);
res = await call("/api/v1/remove-background", { key: freeKey, body: Buffer.alloc(31 * 1024 * 1024), type: "image/png" });
check("Bodies over 30 MB → 413", res.status === 413 && (await res.json()).error.code === "payload_too_large");

/* 5. Pro key: full resolution, masks, formats ------------------------------- */
const proAccount = await createConfirmedAccount(browser, BASE, mailbox, { name: "Api Pro" });
const proCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await signInContext(proCtx, BASE, proAccount);
await upgradeToPro(proCtx, BASE);
const proKey = (await (await proCtx.request.post(`${BASE}/api/keys`, { data: { name: "Pro server" }, headers: { origin: BASE } })).json()).key;
res = await call("/api/v1/remove-background", { key: proKey, body: product, type: "image/jpeg" });
bytes = Buffer.from(await res.arrayBuffer());
writeFileSync(join(OUT, "pro-cutout.png"), bytes);
m = await measure(bytes, [[3, 3], [760, 600]]);
check(
  "Pro key (raw body): full resolution, real alpha, no watermark",
  res.status === 200 && m.width === 1600 && m.height === 1280 && m.samples[0][3] === 0 && m.samples[1][3] === 255 && m.cornerMarked < 0.001 && res.headers.get("x-isola-plan") === "pro",
  `${m.width}×${m.height}, corner α${m.samples[0][3]}, subject α${m.samples[1][3]}, coverage ${(m.coverage * 100).toFixed(1)}%`,
);
const proCutout = bytes;
res = await call("/api/v1/remove-background", { key: proKey, body: form(product, { output: "mask" }) });
bytes = Buffer.from(await res.arrayBuffer());
m = await measure(bytes, [[3, 3], [760, 600]]);
check("Pro masks: greyscale PNG, white subject, black background", res.status === 200 && m.width === 1600 && m.samples[0][0] === 0 && m.samples[1][0] === 255 && m.samples[1][3] === 255, `${m.samples[0]} / ${m.samples[1]}`);
res = await call("/api/v1/remove-background?format=jpeg&background=%23FFFFFF", { key: proKey, body: product, type: "image/jpeg" });
bytes = Buffer.from(await res.arrayBuffer());
m = await measure(bytes, [[3, 3]]);
check("JPEG on white: opaque, white background", res.status === 200 && res.headers.get("content-type") === "image/jpeg" && m.samples[0][0] > 248 && m.samples[0][3] === 255, `${m.samples[0]}`);
res = await call("/api/v1/remove-background", { key: proKey, body: form(product, { background: "#20292D" }) });
bytes = Buffer.from(await res.arrayBuffer());
m = await measure(bytes, [[3, 3]]);
check("PNG on a colour: the corner is that colour", res.status === 200 && m.samples[0].join() === "32,41,45,255", `${m.samples[0]}`);

// Transparent input: areas already transparent stay transparent.
const holed = Buffer.from(await probe.evaluate(async (b64) => {
  const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
  const c = new OffscreenCanvas(1000, 800);
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0, 1000, 800);
  g.clearRect(0, 0, 300, 800);
  return Array.from(new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()));
}, product.toString("base64")));
res = await call("/api/v1/remove-background", { key: proKey, body: form(holed, {}, "holed.png") });
m = await measure(Buffer.from(await res.arrayBuffer()), [[150, 400]]);
check("Transparent source areas stay transparent", res.status === 200 && m.samples[0][3] === 0);

// Same model, same maths: compare with the in-browser engine's export of the same photo.
{
  const p = await proCtx.newPage();
  await p.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
  await p.locator("input[type=file][multiple]").first().setInputFiles(PRODUCT);
  await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 180_000 });
  await p.getByRole("button", { name: "Export image" }).click();
  const dialog = p.getByRole("dialog", { name: "Export image" });
  await dialog.getByRole("radio", { name: /Transparent PNG/ }).check();
  const dl = p.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  const file = join(OUT, "browser-cutout.png");
  await (await dl).saveAs(file);
  const cmp = await probe.evaluate(
    async ([a64, b64]) => {
      const load = async (b64) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]), { premultiplyAlpha: "none" });
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const g = c.getContext("2d");
        g.drawImage(bmp, 0, 0);
        return g.getImageData(0, 0, bmp.width, bmp.height).data;
      };
      const [a, b] = [await load(a64), await load(b64)];
      let sum = 0;
      let close = 0;
      const n = a.length / 4;
      for (let i = 3; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]);
        sum += d;
        if (d <= 32) close++;
      }
      return { mean: sum / n, close: close / n };
    },
    [proCutout.toString("base64"), readFileSync(file).toString("base64")],
  );
  check("API and in-browser cutouts agree", cmp.mean < 3 && cmp.close > 0.99, `mean alpha difference ${cmp.mean.toFixed(2)}/255, ${(cmp.close * 100).toFixed(2)}% within 32`);
  await p.close();
}

// Concurrent requests queue on the server and all succeed.
const parallel = await Promise.all([0, 1, 2].map(() => call("/api/v1/remove-background", { key: proKey, body: form() })));
check("Concurrent requests are queued, not dropped", parallel.every((r) => r.status === 200), parallel.map((r) => r.status).join(","));

/* 6. Usage, CORS, rate limit, deletion ------------------------------------- */
await new Promise((r) => setTimeout(r, 500));
json = await (await call("/api/v1/me", { key: proKey })).json();
check("Usage is recorded per key", json.key.requestCount === 8 && json.key.lastUsedAt !== null, `${json.key.requestCount} requests`);
res = await call("/api/v1/remove-background", { method: "OPTIONS", headers: { Origin: "https://shop.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization" } });
check("CORS preflight allows other origins", res.status === 204 && res.headers.get("access-control-allow-origin") === "*" && /authorization/i.test(res.headers.get("access-control-allow-headers") ?? ""));

const rateKey = (await (await proCtx.request.post(`${BASE}/api/keys`, { data: { name: "Rate test" }, headers: { origin: BASE } })).json()).key;
const small = Buffer.from(await probe.evaluate(async () => {
  const c = new OffscreenCanvas(64, 64);
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#c33";
  g.fillRect(16, 16, 32, 32);
  return Array.from(new Uint8Array(await (await c.convertToBlob({ type: "image/png" })).arrayBuffer()));
}));
let last;
for (let i = 0; i < limit; i++) last = await call("/api/v1/remove-background", { key: rateKey, body: form(small, {}, "s.png") });
const over = await call("/api/v1/remove-background", { key: rateKey, body: form(small, {}, "s.png") });
check(`The ${limit + 1}th request in an hour → 429 with Retry-After`, last.status === 200 && over.status === 429 && Number(over.headers.get("retry-after")) > 0 && (await over.json()).error.code === "rate_limited");

await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
await card.getByRole("button", { name: "Delete key Shop backend" }).click();
await page.getByRole("alertdialog").getByRole("button", { name: "Delete key" }).click();
await card.getByText("No keys yet").waitFor();
res = await call("/api/v1/me", { key: freeKey });
check("A deleted key stops working immediately", res.status === 401 && (await res.json()).error.code === "invalid_api_key");
const foreign = await freeCtx.request.post(`${BASE}/api/keys`, { data: { name: "x" }, headers: { origin: "https://evil.example" } });
check("Key management refuses other origins", foreign.status() === 403);
const anon = await fetch(`${BASE}/api/keys`);
check("Key management needs a session", anon.status === 401);

/* 7. Docs playground with a real key --------------------------------------- */
{
  const p = await proCtx.newPage();
  await p.goto(`${BASE}/developers/api`, { waitUntil: "networkidle" });
  const playground = p.locator("[data-playground]");
  await playground.getByLabel("API key").fill(proKey);
  await playground.getByRole("button", { name: "Check key" }).click();
  await playground.getByText('"name": "pro"').waitFor({ timeout: 10_000 });
  check("Playground: Check key shows the plan", true);
  await playground.getByRole("button", { name: "Use the sample photo" }).click();
  await playground.getByText("sneaker-white.jpg", { exact: true }).waitFor();
  await playground.getByRole("button", { name: "Send request" }).click();
  await playground.getByRole("img", { name: "API result" }).waitFor({ timeout: 60_000 });
  check("Playground: a real request returns the cutout and headers", (await playground.getByRole("img", { name: "API result" }).isVisible()) && (await playground.getByText("x-isola-plan").isVisible()));
  await p.screenshot({ path: join(OUT, "playground.png"), fullPage: false });
  await playground.scrollIntoViewIfNeeded();
  await playground.screenshot({ path: join(OUT, "playground-panel.png") });
  await p.close();
}

await browser.close();
await paystack.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} API checks passed`);
process.exit(failures ? 1 : 0);
