// Utility: screenshot a route at a given width. Usage: node e2e/shot.mjs /path out.png [width] [fullPage]
import { chromium } from "playwright";
const [, , route = "/", out = "shot.png", width = "1280", full = "true"] = process.argv;
const base = process.env.BASE_URL || "http://localhost:3100";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text().slice(0, 300)));
await page.goto(base + route, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: out, fullPage: full === "true" });
await browser.close();
