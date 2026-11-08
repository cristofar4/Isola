/**
 * Plans and billing: free-plan watermark and size cap, Pro-only Batch Studio,
 * upgrading through Paystack checkout, and the safety checks around payments.
 *
 *   SMTP_URL=smtp://127.0.0.1:2525 PAYSTACK_SECRET_KEY=sk_test_isola_e2e \
 *   PAYSTACK_API_BASE=http://127.0.0.1:4010 npm start
 *   BASE_URL=http://localhost:3000 npm run test:billing
 *
 * Paystack itself isn't reachable from tests, so e2e/lib/paystack.mjs stands in
 * for its API; ISOLA's real checkout, verification and webhook code runs.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createConfirmedAccount, signInContext } from "./lib/accounts.mjs";
import { startMailbox } from "./lib/mail.mjs";
import { proUntil, startFakePaystack } from "./lib/paystack.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = join(process.cwd(), "e2e", "output");
mkdirSync(OUT, { recursive: true });
const FIXTURE = join(process.cwd(), "e2e", "fixtures", "product.jpg");
const DAY = 24 * 60 * 60 * 1000;
let failures = 0;
let total = 0;
function check(name, ok, detail = "") {
  total++;
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}
const visible = (l) => l.filter({ visible: true });

async function waitReady(page) {
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 180_000 });
}

/** Export a transparent PNG and measure it in the browser. */
async function exportAndMeasure(page, name) {
  await page.getByRole("button", { name: "Export image" }).click();
  const dialog = page.getByRole("dialog", { name: "Export image" });
  await dialog.getByRole("radio", { name: /Transparent PNG/ }).check();
  const notice = await dialog.getByText("Free plan:").isVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  const file = join(OUT, name);
  await (await download).saveAs(file);
  await page.keyboard.press("Escape");
  const b64 = readFileSync(file).toString("base64");
  const stats = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: "none" });
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0);
    // Top-left fifth of the image is background in the fixture photo.
    const w = Math.round(bmp.width / 5);
    const h = Math.round(bmp.height / 5);
    const region = ctx.getImageData(0, 0, w, h).data;
    let marked = 0;
    for (let i = 3; i < region.length; i += 4) if (region[i] > 0) marked++;
    return { width: bmp.width, height: bmp.height, backgroundMarked: marked / (w * h) };
  }, b64);
  return { ...stats, notice };
}

const mailbox = await startMailbox();
const paystack = await startFakePaystack();
const browser = await chromium.launch();

// Pricing page.
{
  const anon = await browser.newContext();
  const page = await anon.newPage();
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
  check("Pricing shows Pro at ₦14,000 a month", (await visible(page.getByText("₦14,000")).count()) > 0 && (await visible(page.getByText("/ month")).isVisible()));
  const upgrade = page.getByRole("link", { name: "Upgrade to Pro" });
  check("Signed-out visitors are sent to create an account to upgrade", (await upgrade.getAttribute("href"))?.startsWith("/sign-up"));
  await page.screenshot({ path: join(OUT, "pricing.png"), fullPage: true });
  await anon.close();
}

const account = await createConfirmedAccount(browser, BASE, mailbox, { name: "Free Then Pro" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await signInContext(context, BASE, account);
const page = await context.newPage();

// Free plan: watermark and preview size.
await page.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
await page.locator("input[type=file][multiple]").first().setInputFiles(FIXTURE);
await waitReady(page);
const free = await exportAndMeasure(page, "billing-free.png");
check("Free export explains the plan limits", free.notice);
check("Free exports are limited to the preview size", free.width === 1000 && free.height === 800, `${free.width}×${free.height}`);
check("Free exports carry a watermark", free.backgroundMarked > 0.01, `${(free.backgroundMarked * 100).toFixed(1)}% of background marked`);

// Free plan: Batch Studio is Pro only.
await page.goto(`${BASE}/batch`, { waitUntil: "networkidle" });
check("Batch Studio explains it's part of Pro", await visible(page.getByText("Batch Studio is part of Pro")).isVisible());
await page.locator("#batch-files").setInputFiles(FIXTURE);
await page.getByText("Pro required").first().waitFor({ timeout: 15_000 });
check("Free accounts can't process batches", true);

// Upgrade through checkout from the pricing page.
await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Upgrade to Pro" }).click();
await page.waitForURL((u) => u.pathname === "/account", { timeout: 30_000 });
check("Checkout returns to the account page", new URL(page.url()).searchParams.get("upgraded") === "1");
check("The account shows Pro after paying", await visible(page.getByText("Payment confirmed. Welcome to Pro.")).waitFor({ timeout: 10_000 }).then(() => true, () => false));
const firstReference = [...paystack.txs.values()].at(-1).reference;
const until1 = await proUntil(context, BASE);
check("Pro lasts one month from payment", until1 && Math.abs(until1 - Date.now() - 30 * DAY) < 60_000);
const sentAmount = [...paystack.txs.values()].at(-1);
check("Checkout charges ₦14,000 in kobo, in naira", sentAmount.amount === 1_400_000 && sentAmount.currency === "NGN", `${sentAmount.amount} ${sentAmount.currency}`);

// Pro: no watermark, full resolution, batches work.
// Coming back from checkout is a full page load, so the editor starts empty again.
await page.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
await page.locator("input[type=file][multiple]").first().setInputFiles(FIXTURE);
await waitReady(page);
const pro = await exportAndMeasure(page, "billing-pro.png");
check("Pro exports keep full resolution", pro.width === 1600 && pro.height === 1280, `${pro.width}×${pro.height}`);
check("Pro exports have no watermark", pro.backgroundMarked < 0.001 && !pro.notice, `${(pro.backgroundMarked * 100).toFixed(2)}% marked`);
await page.goto(`${BASE}/batch`, { waitUntil: "networkidle" });
await page.locator("#batch-files").setInputFiles(FIXTURE);
await page.locator("[data-batch-status]").getByText(/1 ready/).waitFor({ timeout: 180_000 });
check("Pro accounts can process batches", true);

// Replaying the same payment changes nothing.
await context.request.get(`${BASE}/billing/callback?reference=${firstReference}`);
check("A payment can't be counted twice", (await proUntil(context, BASE)) === until1);

// Someone else's payment can't be claimed.
const other = await createConfirmedAccount(browser, BASE, mailbox, { name: "Other Payer" });
const otherContext = await browser.newContext();
await signInContext(otherContext, BASE, other);
const otherCheckout = await (await otherContext.request.post(`${BASE}/api/billing/checkout`, { headers: { origin: BASE } })).json();
const otherRef = new URL(otherCheckout.url).pathname.split("/").pop();
paystack.complete(otherRef);
const mismatch = await context.request.get(`${BASE}/billing/callback?reference=${otherRef}`, { maxRedirects: 0 });
check("A payment from another account is refused", (mismatch.headers().location ?? "").includes("payment=mismatch") && (await proUntil(context, BASE)) === until1);

// Underpayment is refused.
const short = await (await otherContext.request.post(`${BASE}/api/billing/checkout`, { headers: { origin: BASE } })).json();
const shortRef = new URL(short.url).pathname.split("/").pop();
paystack.complete(shortRef, { amountPaid: 100 });
const shortRes = await otherContext.request.get(`${BASE}/billing/callback?reference=${shortRef}`, { maxRedirects: 0 });
check("A payment below the Pro price is refused", (shortRes.headers().location ?? "").includes("payment=incomplete") && (await proUntil(otherContext, BASE)) === null);

// Webhooks: forged ones are rejected, renewals extend Pro once.
const forged = await paystack.webhook(BASE, { event: "charge.success", data: { reference: firstReference } }, "not-a-real-signature");
check("Webhooks with a bad signature are rejected", forged.status === 401, `HTTP ${forged.status}`);
const renewal = await (await context.request.post(`${BASE}/api/billing/checkout`, { headers: { origin: BASE } })).json();
const renewalRef = new URL(renewal.url).pathname.split("/").pop();
paystack.complete(renewalRef);
const hook = await paystack.webhook(BASE, { event: "charge.success", data: { reference: renewalRef } });
const until2 = await proUntil(context, BASE);
check("A renewal payment extends Pro by a month", hook.status === 200 && until2 && Math.abs(until2 - until1 - 30 * DAY) < 60_000);
await paystack.webhook(BASE, { event: "charge.success", data: { reference: renewalRef } });
check("Repeated webhooks don't extend Pro again", (await proUntil(context, BASE)) === until2);

// Subscription management.
const customer = paystack.txs.get(renewalRef).customer_code;
await paystack.webhook(BASE, { event: "subscription.create", data: { subscription_code: "SUB_e2e", customer: { customer_code: customer, email: account.email } } });
await page.goto(`${BASE}/account`, { waitUntil: "networkidle" });
const manage = visible(page.getByRole("link", { name: "Manage subscription" }));
check("Subscribers can manage their subscription", await manage.waitFor({ timeout: 10_000 }).then(() => true, () => false));
const manageRes = await context.request.get(`${BASE}/api/billing/manage`, { maxRedirects: 0 });
check("Manage subscription opens Paystack's page", (manageRes.headers().location ?? "").includes("/manage/SUB_e2e"));
await page.screenshot({ path: join(OUT, "account-pro.png"), fullPage: true });

await browser.close();
await paystack.close();
await mailbox.close();
console.log(`\n${total - failures}/${total} billing checks passed`);
process.exit(failures ? 1 : 0);
