import { chromium } from "file:///c:/Users/VAI/Github/Proofed/app/node_modules/@playwright/test/index.mjs";
import path from "node:path";
import { mkdirSync } from "node:fs";

const outDir = path.resolve("docs/screenshots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2, // crisp retina screenshots
});

const page = await context.newPage();

// 1. Seed a fresh AUTHORIZED order so all views are populated
console.log("Seeding fresh demo order...");
const seedRes = await fetch("https://proofed-ai.vercel.app/api/demo/seed-held", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sku: "DC-KEY-01", note: "Demo Presentation Order" }),
});
const seedData = await seedRes.json();
const activeOrder = seedData.order;
console.log("Seeded order:", activeOrder?.id, "PIN:", activeOrder?.pickup_code);

// 2. Capture Client (/client)
console.log("Capturing /client...");
await page.goto("https://proofed-ai.vercel.app/client", { waitUntil: "networkidle", timeout: 30000 });
if (activeOrder) {
  await page.evaluate((ord) => {
    window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify([ord]));
  }, activeOrder);
  await page.reload({ waitUntil: "networkidle" });
}
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(outDir, "client.png") });
await page.screenshot({ path: path.join(outDir, "shop.png") });

// 3. Capture Delivery (/delivery)
console.log("Capturing /delivery...");
await page.goto("https://proofed-ai.vercel.app/delivery", { waitUntil: "networkidle", timeout: 30000 });
if (activeOrder) {
  await page.evaluate((ord) => {
    window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify([ord]));
  }, activeOrder);
  await page.reload({ waitUntil: "networkidle" });
}
await page.waitForTimeout(1500);

// Capture Step 1
await page.screenshot({ path: path.join(outDir, "delivery-step1.png") });

// Advance to Step 2
const step2Btn = page.locator("button.step-btn-primary:has-text('Continue to Door Photo')").first();
if (await step2Btn.isVisible().catch(() => false)) {
  await step2Btn.click();
  await page.waitForTimeout(1000);
}

// Click Door #15 sample scenario
console.log("Capturing Door #15 verified scenario...");
const door15Btn = page.getByText("Door #15 (Correct)").first();
if (await door15Btn.isVisible().catch(() => false)) {
  await door15Btn.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: path.join(outDir, "delivery.png") });
await page.screenshot({ path: path.join(outDir, "delivery-door15.png") });

// Click Door #14 sample scenario
console.log("Capturing Door #14 wrong door scenario...");
const door14Btn = page.getByText("Door #14 (Wrong door)").first();
if (await door14Btn.isVisible().catch(() => false)) {
  await door14Btn.click();
  await page.waitForTimeout(2000);
}
await page.screenshot({ path: path.join(outDir, "delivery-door14.png") });

// 4. Capture Merchant (/merchant)
console.log("Capturing /merchant...");
await page.goto("https://proofed-ai.vercel.app/merchant", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);
const firstRow = page.locator(".orders-table-row, .order-item-card, tr.ag-row, .merchant-order-item").first();
if (await firstRow.isVisible().catch(() => false)) {
  await firstRow.click().catch(() => {});
  await page.waitForTimeout(1000);
}
await page.screenshot({ path: path.join(outDir, "merchant.png") });

// 5. Capture Backend Monitor (/backend)
console.log("Capturing /backend...");
await page.goto("https://proofed-ai.vercel.app/backend", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(outDir, "backend.png") });

// 6. Capture Presenter Demo (/demo)
console.log("Capturing /demo...");
await page.goto("https://proofed-ai.vercel.app/demo", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(outDir, "demo.png") });

await browser.close();
console.log("All screenshots successfully captured in docs/screenshots/!");
