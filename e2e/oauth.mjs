// Verifies Google/GitHub buttons appear when configured and start a real OAuth
// redirect with the expected callback. Run against a server that has
// GOOGLE_CLIENT_ID/SECRET and GITHUB_CLIENT_ID/SECRET set (placeholders are fine).
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
let failures = 0;
for (const [label, host, callback] of [
  ["Google", "accounts.google.com", "/api/auth/callback/google"],
  ["GitHub", "github.com", "/api/auth/callback/github"],
]) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Don't leave the test environment: capture the provider request and stop it.
  let target = null;
  await context.route(`https://${host}/**`, (route) => {
    target = new URL(route.request().url());
    return route.fulfill({ status: 200, body: "stopped by test" });
  });
  await page.goto(`${BASE}/sign-in?next=/editor`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: `Continue with ${label}` }).click();
  await page.waitForURL(new RegExp(host.replace(".", "\\.")), { timeout: 15000 }).catch(() => {});
  const redirect = target?.searchParams.get("redirect_uri") ?? "";
  const ok = target !== null && redirect === `${BASE}${callback}` && target.searchParams.get("state");
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label} button redirects to ${target?.host}${target?.pathname} with redirect_uri=${redirect}`);
  await context.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
