import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../lib/db";
import {
  PaypalHttpError,
  authorizePaypalOrder,
  createPaypalOrder,
  getPaypalOrder,
} from "../lib/paypal";
import { authorizeOrder, createCheckout } from "../lib/orders";
import { PolicyError } from "../lib/policy";
import { newRequestId } from "../lib/ids";
import { handlePaypalWebhook } from "../lib/webhooks";

const havePaypal = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

describe.skipIf(!havePaypal)("PayPal sandbox integration", () => {
  beforeEach(() => {
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), "proofed-paypal-")), "test.sqlite");
    closeDb();
  });
  afterEach(() => closeDb());

  it("creates an AUTHORIZE order and fetches it back", async () => {
    const requestId = newRequestId();
    const created = await createPaypalOrder({
      amountCents: 1200,
      currency: "USD",
      description: "Proofed integration probe",
      invoiceId: `probe-${requestId.slice(0, 12)}`,
      customId: `probe-${requestId.slice(0, 12)}`,
      brandName: "Proofed",
      requestId,
    });
    expect(created.id).toMatch(/^[A-Z0-9]+$/);
    expect(created.status).toBe("CREATED");
    expect(created.intent).toBe("AUTHORIZE");
    const fetched = await getPaypalOrder(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.status).toBe("CREATED");
  });

  it("reuses PayPal-Request-Id instead of creating a second order", async () => {
    const requestId = `idem-${newRequestId().slice(0, 20)}`;
    const first = await createPaypalOrder({
      amountCents: 850,
      currency: "USD",
      description: "Proofed idempotency probe",
      invoiceId: requestId,
      customId: requestId,
      brandName: "Proofed",
      requestId,
    });
    const second = await createPaypalOrder({
      amountCents: 850,
      currency: "USD",
      description: "Proofed idempotency probe",
      invoiceId: requestId,
      customId: requestId,
      brandName: "Proofed",
      requestId,
    });
    expect(second.id).toBe(first.id);
  });

  it("refuses to authorize an order the buyer has not approved", async () => {
    const created = await createPaypalOrder({
      amountCents: 600,
      currency: "USD",
      description: "Proofed unapproved authorize probe",
      invoiceId: `unapp-${newRequestId().slice(0, 10)}`,
      customId: `unapp-${newRequestId().slice(0, 10)}`,
      brandName: "Proofed",
      requestId: newRequestId(),
    });
    try {
      await authorizePaypalOrder(created.id, newRequestId());
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PaypalHttpError);
      expect((error as PaypalHttpError).hasIssue("ORDER_NOT_APPROVED")).toBe(true);
    }
  });

  it("creates a shop checkout against sandbox and blocks authorize until approval", async () => {
    const order = await createCheckout({
      items: [{ sku: "DC-KEY-01", qty: 1 }],
      budgetCents: 2000,
      actor: "test",
    });
    expect(order.subtotal_cents).toBe(1200);
    expect(order.paypal_order_id).toBeTruthy();
    expect(order.status).toBe("CREATED");
    try {
      await authorizeOrder(order.id, "test");
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyError);
      expect((error as PolicyError).code).toBe("ORDER_NOT_APPROVED");
    }
  });

  it("does not mutate state when webhook verification is unconfigured", async () => {
    delete process.env.PAYPAL_WEBHOOK_ID;
    const request = new Request("http://localhost/api/paypal/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "WH-TEST-UNVERIFIED",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { id: "not-a-real-capture" },
      }),
    });
    const result = await handlePaypalWebhook(request);
    expect(result.status).toBe(200);
    expect((result.body as { accepted?: boolean }).accepted).toBe(false);
  });
});

describe.skipIf(havePaypal)("PayPal credentials missing", () => {
  it("skips sandbox tests when credentials are absent", () => {
    expect(havePaypal).toBe(false);
  });
});
