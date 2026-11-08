// Checks the Server engine option against a deployment with a provider configured.
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/editor`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Try the sneaker example" }).click();
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Export image" && !b.disabled), null, { timeout: 120000 });
const server = page.getByRole("radio", { name: "Server" });
await server.waitFor({ timeout: 10000 });
await server.click();
console.log("privacy note:", await page.getByText(/Your image is uploaded/).innerText());
await page.getByRole("button", { name: /Reprocess with Server/ }).click();
const banner = page.getByText(/Reprocessing failed/);
await banner.waitFor({ timeout: 60000 });
console.log("result:", await banner.innerText());
await browser.close();
