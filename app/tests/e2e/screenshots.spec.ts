import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { approveOnPaypal, redactSecrets, resolveApprovalLink, safeScreenshot } from "./helpers";

const outDir = existsSync(path.join(process.cwd(), "docs"))
  ? path.join(process.cwd(), "docs", "screenshots")
  : path.join(process.cwd(), "..", "docs", "screenshots");
const haveBuyer = Boolean(process.env.PAYPAL_BUYER_EMAIL && process.env.PAYPAL_BUYER_PASSWORD);
const havePaypal = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

test.beforeAll(() => {
  mkdirSync(outDir, { recursive: true });
});

async function snap(page: Page, name: string) {
  const dest = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  return dest;
}

async function assertContrast(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .options({ runOnly: { type: "rule", values: ["color-contrast"] } })
    .analyze();
  const details = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html.slice(0, 180),
      failureSummary: node.failureSummary,
    })),
  }));
  expect(details, `${label} contrast: ${JSON.stringify(details, null, 2)}`).toEqual([]);
}

async function jsonFetch(request: APIRequestContext, url: string, init?: { method?: string; data?: unknown }) {
  const res = await request.fetch(url, {
    method: init?.method ?? (init?.data ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    data: init?.data === undefined ? undefined : JSON.stringify(init.data),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok(), status: res.status(), body };
}

test("captures populated shop, device, merchant, and presenter views", async ({ page, request }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("/");
  await expect(page.getByTestId("page-shop")).toBeVisible();
  await expect(page.getByTestId("transaction-panel")).toBeVisible();
  try {
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".agent-step:not(.pending)").first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("agent-log")).toBeVisible();
    await expect(page.getByTestId("transaction-panel")).toContainText("$12.00", { timeout: 15_000 });
    await expect(page.locator(".product-card").first()).toBeVisible({ timeout: 15_000 });
  } catch {
    // Still capture the shop layout if the model is slow or unavailable.
  }
  await snap(page, "shop");
  await assertContrast(page, "shop");

  if (havePaypal && haveBuyer) {
    const created = await jsonFetch(request, "/api/orders", {
      method: "POST",
      data: { items: [{ sku: "DC-KEY-01", qty: 1 }], budget_cents: 2000, note: "screenshot populated flow" },
    });
    expect(created.ok, `create order failed ${created.status}`).toBe(true);
    const order = created.body.order as {
      id: string;
      paypal_order_id: string;
      pickup_code?: string | null;
    };
    expect(order.paypal_order_id).toBeTruthy();
    const url = await resolveApprovalLink(order.paypal_order_id);
    try {
      const approved = await approveOnPaypal(page, url, order.paypal_order_id);
      expect(["APPROVED", "COMPLETED"]).toContain(approved.status);
    } catch (error) {
      await safeScreenshot(page, "screenshot-approve-failed").catch(() => undefined);
      throw new Error(redactSecrets(error instanceof Error ? error.message : String(error)));
    }

    await jsonFetch(request, "/api/jobs/reconcile", { method: "POST" });
    const authorized = await jsonFetch(request, "/api/paypal/authorize", {
      method: "POST",
      data: { orderId: order.id },
    });
    expect(authorized.ok, `authorize failed ${authorized.status}`).toBe(true);
    const authorizedOrder = authorized.body.order as { pickup_code: string; status: string };
    expect(authorizedOrder.pickup_code).toBeTruthy();

    await page.goto("/device");
    await expect(page.getByTestId("page-pickup")).toBeVisible();
    await page.locator(".kiosk-code").fill(authorizedOrder.pickup_code);
    await page.getByRole("button", { name: "Hand over & charge" }).click();
    await expect(page.locator(".oknote")).toContainText("CAPTURED", { timeout: 90_000 });
    await expect(page.getByTestId("transaction-panel")).toBeVisible();
    await page.waitForTimeout(700);
    await snap(page, "device");
    await assertContrast(page, "device");

    await page.goto("/merchant");
    await expect(page.getByTestId("page-merchant")).toBeVisible();
    await expect(page.getByText(order.id)).toBeVisible({ timeout: 15_000 });
    await page.getByText(order.id).first().click();
    await expect(page.getByTestId("order-drawer")).toBeVisible();
    await expect(page.getByTestId("order-drawer").getByTestId("transaction-panel")).toBeVisible();
    await expect(page.getByTestId("order-drawer").getByText("What happened")).toBeVisible();
    await expect(page.getByTestId("order-drawer").locator(".agent-step").first()).toBeVisible();
    await snap(page, "merchant");
    await assertContrast(page, "merchant");
  } else {
    await page.goto("/device");
    await expect(page.getByTestId("page-pickup")).toBeVisible();
    await snap(page, "device");
    await assertContrast(page, "device");

    if (havePaypal) {
      await jsonFetch(request, "/api/orders", {
        method: "POST",
        data: { items: [{ sku: "DC-KEY-01", qty: 1 }], budget_cents: 2000, note: "screenshot seed" },
      });
    }
    await page.goto("/merchant");
    await expect(page.getByTestId("page-merchant")).toBeVisible();
    await page.waitForTimeout(600);
    await snap(page, "merchant");
    await assertContrast(page, "merchant");
  }

  await page.goto("/demo");
  await expect(page.getByTestId("page-presenter")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Presenter" })).toBeVisible();
  await expect(page.getByTestId("transaction-panel")).toBeVisible();
  await page.waitForTimeout(1500);
  await snap(page, "demo");
  await assertContrast(page, "demo");

  await page.goto("/gallery");
  await expect(page.getByTestId("page-gallery")).toBeVisible();
  await page.waitForTimeout(1200);
  await snap(page, "gallery");
  await assertContrast(page, "gallery");
});
