import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const outDir = path.join(process.cwd(), "docs", "screenshots");

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

async function snap(page: import("@playwright/test").Page, name: string, fullPage = true) {
  const dest = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: dest, fullPage });
  return dest;
}

test("captures demo, shop, device, and merchant pages", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: /Authorize now/i })).toBeVisible();
  await snap(page, "demo");

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Shop without paying/i })).toBeVisible();
  await expect(page.locator(".product-card").first()).toBeVisible();
  await snap(page, "shop");

  await page.goto("/device");
  await expect(page.getByRole("heading", { name: /Prove handover/i })).toBeVisible();
  await snap(page, "device");

  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    const created = await request.post("/api/orders", {
      data: { items: [{ sku: "DC-KEY-01", qty: 1 }], budget_cents: 2000, note: "screenshot seed" },
    });
    expect(created.ok()).toBe(true);
  }

  await page.goto("/merchant");
  await expect(page.getByRole("heading", { name: "Merchant desk" })).toBeVisible();
  await expect(page.getByText("Held")).toBeVisible();
  await page.waitForTimeout(800);
  await snap(page, "merchant", false);
});
