import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/catalog-seed";
import { closeDb } from "../lib/db";
import { createCheckout, failDelivery, storeEvidence } from "../lib/orders";
import { evaluateFraudAudit } from "../lib/fraud-audit";

beforeEach(() => {
  process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), "proofed-fraud-")), "test.sqlite");
  closeDb();
  seedCatalog();
});

afterEach(() => {
  closeDb();
});

describe("Fraud Audit & Anti-Abuse Guardrail", () => {
  it("permits refund when physical delivery genuinely failed (Door #742)", async () => {
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });

    failDelivery({
      orderId: order.id,
      pickupCode: order.pickup_code!,
      reason: "wrong_address",
      note: "Door #742 mismatch (+120m away)",
    });

    const audit = evaluateFraudAudit(order.id, "refund");
    expect(audit.allowed).toBe(true);
    expect(audit.policyDecision).toBe("APPROVED");
    expect(audit.riskScore).toBeLessThan(0.15);
    expect(audit.flags).toContain("GENUINE_DELIVERY_FAILURE_VERIFIED");
  });

  it("BLOCKS refund when delivery was physically confirmed at doorstep #744 (friendly fraud)", async () => {
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });

    storeEvidence({
      orderId: order.id,
      kind: "delivery_confirm",
      pickupCode: order.pickup_code!,
      note: "Agent certified: Door #744 matches manifest destination",
      photoBase64: "dGVzdC1waG90bw==",
    });

    const audit = evaluateFraudAudit(order.id, "refund");
    expect(audit.allowed).toBe(false);
    expect(audit.policyDecision).toBe("BLOCKED");
    expect(audit.riskLevel).toBe("CRITICAL");
    expect(audit.riskScore).toBeGreaterThan(0.9);
    expect(audit.flags).toContain("CONTRADICTS_PHYSICAL_PROOF");
    expect(audit.auditExplanation).toMatch(/Refund BLOCKED/);
  });

  it("permits initial re-dispatch for legitimate address correction", async () => {
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });

    failDelivery({
      orderId: order.id,
      pickupCode: order.pickup_code!,
      reason: "wrong_address",
    });

    const audit1 = evaluateFraudAudit(order.id, "retry");
    expect(audit1.allowed).toBe(true);
    expect(audit1.policyDecision).toBe("APPROVED");
    expect(audit1.riskLevel).toBe("LOW");
  });
});
