import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  firstAuthorization,
  getPaypalAuthorization,
  getPaypalCapture,
  getPaypalOrder,
  getPaypalRefund,
} from "../../lib/paypal";
import { approveOnPaypal, redactSecrets, resolveApprovalLink, safeScreenshot } from "./helpers";

const haveBuyer = Boolean(process.env.PAYPAL_BUYER_EMAIL && process.env.PAYPAL_BUYER_PASSWORD);
const havePaypal = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

type PublicOrder = {
  id: string;
  status: string;
  subtotal_cents: number;
  currency: string;
  pickup_code: string | null;
  failure_reason: string | null;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  paypal_refund_id: string | null;
};

test.describe.configure({ mode: "serial" });
test.skip(!haveBuyer || !havePaypal, "Requires PayPal REST and sandbox buyer credentials");

let buyerPage: Page;

test.beforeAll(async ({ browser }) => {
  buyerPage = await browser.newPage();
});

test.afterAll(async () => {
  await buyerPage?.close();
});

async function jsonFetch(
  request: APIRequestContext,
  url: string,
  init?: { method?: string; data?: unknown },
) {
  const res = await request.fetch(url, {
    method: init?.method ?? (init?.data ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    data: init?.data === undefined ? undefined : JSON.stringify(init.data),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok(), status: res.status(), body };
}

async function createShopOrder(request: APIRequestContext, sku: string, budgetCents: number) {
  const result = await jsonFetch(request, "/api/orders", {
    method: "POST",
    data: { items: [{ sku, qty: 1 }], budget_cents: budgetCents, note: "e2e sandbox buyer" },
  });
  expect(result.ok, `create order failed ${result.status}: ${JSON.stringify(result.body)}`).toBe(true);
  return result.body.order as PublicOrder;
}

async function getAppOrder(request: APIRequestContext, orderId: string) {
  const result = await jsonFetch(request, `/api/orders/${orderId}`);
  expect(result.ok, `get order failed ${result.status}: ${JSON.stringify(result.body)}`).toBe(true);
  return result.body.order as PublicOrder;
}

async function approveCreatedOrder(order: PublicOrder) {
  expect(order.paypal_order_id).toBeTruthy();
  const paypalOrderId = order.paypal_order_id as string;
  const url = await resolveApprovalLink(paypalOrderId);
  expect(url.toLowerCase()).toContain("sandbox.paypal.com");
  expect(url.toLowerCase()).toMatch(/approve|checkoutnow|hermes|token=/);
  try {
    const approved = await approveOnPaypal(buyerPage, url, paypalOrderId);
    expect(["APPROVED", "COMPLETED"]).toContain(approved.status);
    return approved;
  } catch (error) {
    await safeScreenshot(buyerPage, "approve-failed").catch(() => undefined);
    throw new Error(redactSecrets(error instanceof Error ? error.message : String(error)));
  }
}

test("approves, reconciles, authorizes, captures at /device, then refunds", async ({ request }) => {
  const created = await createShopOrder(request, "DC-KEY-01", 2000);
  expect(created.status).toBe("CREATED");
  expect(created.subtotal_cents).toBe(1200);
  expect(created.paypal_order_id).toMatch(/^[A-Z0-9]+$/);

  const approvedRemote = await approveCreatedOrder(created);
  expect(approvedRemote.status).toBe("APPROVED");
  expect(firstAuthorization(approvedRemote)?.id ?? null).toBeFalsy();

  const rec = await jsonFetch(request, "/api/jobs/reconcile", { method: "POST" });
  expect(rec.ok, `reconcile failed ${rec.status}: ${JSON.stringify(rec.body)}`).toBe(true);

  const afterReconcile = await getAppOrder(request, created.id);
  expect(afterReconcile.status).toBe("APPROVED");
  expect(afterReconcile.paypal_authorization_id).toBeFalsy();

  const authorized = await jsonFetch(request, "/api/paypal/authorize", {
    method: "POST",
    data: { orderId: created.id },
  });
  expect(authorized.ok, `authorize failed ${authorized.status}: ${JSON.stringify(authorized.body)}`).toBe(true);
  const authorizedOrder = authorized.body.order as PublicOrder;
  expect(authorizedOrder.status).toBe("AUTHORIZED");
  expect(authorizedOrder.paypal_authorization_id).toBeTruthy();
  expect(authorizedOrder.pickup_code).toMatch(/^[A-Z0-9]+$/);

  const remoteAuth = await getPaypalAuthorization(authorizedOrder.paypal_authorization_id as string);
  expect(remoteAuth.status).toBe("CREATED");

  await buyerPage.goto("/device");
  await buyerPage.locator(".kiosk-code").fill(authorizedOrder.pickup_code as string);
  await buyerPage.getByRole("button", { name: "Hand over & charge" }).click();
  await expect(buyerPage.locator(".oknote")).toContainText("CAPTURED", { timeout: 90_000 });

  const captured = await getAppOrder(request, created.id);
  expect(captured.status).toBe("CAPTURED");
  expect(captured.paypal_capture_id).toBeTruthy();

  const remoteCapture = await getPaypalCapture(captured.paypal_capture_id as string);
  expect(["COMPLETED", "PENDING"]).toContain(remoteCapture.status);

  const remoteOrderAfterCapture = await getPaypalOrder(created.paypal_order_id as string);
  expect(["COMPLETED", "APPROVED"]).toContain(remoteOrderAfterCapture.status);

  const refunded = await jsonFetch(request, "/api/paypal/refund", {
    method: "POST",
    data: { orderId: created.id, confirm: true },
  });
  expect(refunded.ok, `refund failed ${refunded.status}: ${JSON.stringify(refunded.body)}`).toBe(true);
  const refundedOrder = refunded.body.order as PublicOrder;
  expect(refundedOrder.status).toBe("REFUNDED");
  expect(refundedOrder.paypal_refund_id).toBeTruthy();

  const remoteRefund = await getPaypalRefund(refundedOrder.paypal_refund_id as string);
  expect(["COMPLETED", "PENDING"]).toContain(remoteRefund.status);

  const rec2 = await jsonFetch(request, "/api/jobs/reconcile", { method: "POST" });
  expect(rec2.ok).toBe(true);
  const final = await getAppOrder(request, created.id);
  expect(final.status).toBe("REFUNDED");

  console.log("e2e capture+refund", {
    appOrderId: created.id,
    paypalOrderId: created.paypal_order_id,
    authorizationId: authorizedOrder.paypal_authorization_id,
    authorizationStatus: remoteAuth.status,
    captureId: captured.paypal_capture_id,
    captureStatus: remoteCapture.status,
    refundId: refundedOrder.paypal_refund_id,
    refundStatus: remoteRefund.status,
    finalAppStatus: final.status,
  });
});

test("approves, authorizes, reports a station jam at /device, then substitutes", async ({ request }) => {
  const created = await createShopOrder(request, "DC-PIN-01", 2000);
  expect(created.status).toBe("CREATED");
  expect(created.subtotal_cents).toBe(850);
  expect(created.paypal_order_id).toMatch(/^[A-Z0-9]+$/);

  const approvedRemote = await approveCreatedOrder(created);
  expect(approvedRemote.status).toBe("APPROVED");

  const authorized = await jsonFetch(request, "/api/paypal/authorize", {
    method: "POST",
    data: { orderId: created.id },
  });
  expect(authorized.ok, `authorize failed ${authorized.status}: ${JSON.stringify(authorized.body)}`).toBe(true);
  const authorizedOrder = authorized.body.order as PublicOrder;
  expect(authorizedOrder.status).toBe("AUTHORIZED");
  expect(authorizedOrder.paypal_authorization_id).toBeTruthy();

  const remoteAuth = await getPaypalAuthorization(authorizedOrder.paypal_authorization_id as string);
  expect(remoteAuth.status).toBe("CREATED");

  await buyerPage.goto("/device");
  await buyerPage.locator(".kiosk-code").fill(authorizedOrder.pickup_code as string);
  await buyerPage.getByRole("button", { name: "Problem with pickup?" }).click();
  await buyerPage.getByRole("button", { name: "Station jammed" }).click();
  await expect(buyerPage.getByText("DELIVERY_FAILED").first()).toBeVisible({ timeout: 30_000 });

  const failed = await getAppOrder(request, created.id);
  expect(failed.status).toBe("DELIVERY_FAILED");
  expect(failed.failure_reason).toBe("jam");

  const substitute = buyerPage.getByRole("button", { name: /Substitute with/ }).first();
  await expect(substitute).toBeVisible({ timeout: 30_000 });
  await substitute.click();
  await buyerPage.getByRole("button", { name: "Confirm substitution" }).click();
  await expect(buyerPage.getByRole("heading", { name: "Hold released" })).toBeVisible({ timeout: 90_000 });
  await expect(buyerPage.getByText(/Replacement order/)).toBeVisible();

  const voided = await getAppOrder(request, created.id);
  expect(voided.status).toBe("VOIDED");

  const remoteVoid = await getPaypalAuthorization(authorizedOrder.paypal_authorization_id as string);
  expect(remoteVoid.status).toBe("VOIDED");

  const listed = await jsonFetch(request, "/api/orders");
  expect(listed.ok).toBe(true);
  const replacement = (listed.body.orders as PublicOrder[]).find(
    (item) => item.id !== created.id && item.status === "CREATED" && item.paypal_order_id,
  );
  expect(replacement, "expected a replacement AUTHORIZE order").toBeTruthy();
  const remoteReplacement = await getPaypalOrder(replacement!.paypal_order_id as string);
  expect(remoteReplacement.status).toBe("CREATED");
  expect(remoteReplacement.intent).toBe("AUTHORIZE");

  const rec = await jsonFetch(request, "/api/jobs/reconcile", { method: "POST" });
  expect(rec.ok).toBe(true);
  const final = await getAppOrder(request, created.id);
  expect(final.status).toBe("VOIDED");

  console.log("e2e jam+substitute", {
    appOrderId: created.id,
    paypalOrderId: created.paypal_order_id,
    authorizationId: authorizedOrder.paypal_authorization_id,
    authorizationStatusBeforeVoid: remoteAuth.status,
    authorizationStatusAfterVoid: remoteVoid.status,
    replacementOrderId: replacement?.id,
    replacementPaypalOrderId: replacement?.paypal_order_id,
    replacementPaypalStatus: remoteReplacement.status,
    finalAppStatus: final.status,
  });
});
