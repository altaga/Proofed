import { describe, expect, it } from "vitest";
import { analyzeFulfillmentImage } from "../lib/vision-audit";
import { executeAgentTool } from "../lib/agent-tools";
import { confirmDelivery, createCheckout } from "../lib/orders";
import { seedCatalog } from "../lib/catalog-seed";

describe("Quantitative Multimodal Vision Audit & Agent Tool", () => {
  it("computes passing quantitative scores (>= 80/100) for valid handover", async () => {
    const result = await analyzeFulfillmentImage({
      presetId: "correct",
      targetDoorNumber: "744",
      targetAddress: "744 Maple Street",
      recipientPin: "2X58YU",
    });

    expect(result.ok).toBe(true);
    expect(result.doorplateMatch).toBe(true);
    expect(result.packageCondition).toBe("intact");
    expect(result.addressConfidencePct).toBeGreaterThanOrEqual(95);
    expect(result.parcelIntegrityPct).toBeGreaterThanOrEqual(95);
    expect(result.overallHandoverScore).toBeGreaterThanOrEqual(80);
    expect(result.captureAuthorized).toBe(true);
    expect(result.handoverVerdict).toBe("VERIFIED");
    expect(result.photoSha256Digest).toBeDefined();
    expect(result.serverHmacSignature).toBeDefined();
  });

  it("quantitatively blocks capture for destination mismatch (#742 vs #744)", async () => {
    const result = await analyzeFulfillmentImage({
      presetId: "wrong_door",
      targetDoorNumber: "744",
      targetAddress: "744 Maple Street",
    });

    expect(result.doorplateMatch).toBe(false);
    expect(result.detectedDoorNumber).toBe("742");
    expect(result.addressConfidencePct).toBeLessThan(50);
    expect(result.overallHandoverScore).toBeLessThan(80);
    expect(result.captureAuthorized).toBe(false);
    expect(result.handoverVerdict).toBe("REJECTED_MISMATCH");
  });

  it("quantitatively blocks capture for transit damaged parcel", async () => {
    const result = await analyzeFulfillmentImage({
      presetId: "damaged",
      targetDoorNumber: "744",
      targetAddress: "744 Maple Street",
    });

    expect(result.doorplateMatch).toBe(true);
    expect(result.packageCondition).toBe("damaged");
    expect(result.parcelIntegrityPct).toBeLessThan(50);
    expect(result.overallHandoverScore).toBeLessThan(80);
    expect(result.captureAuthorized).toBe(false);
    expect(result.handoverVerdict).toBe("REJECTED_DAMAGED");
  });

  it("executes through the agent tool verify_handover_evidence returning quantitative metrics", async () => {
    const toolRes = await executeAgentTool("verify_handover_evidence", {
      target_door_number: "744",
      target_address: "744 Maple Street",
      preset_id: "correct",
      recipient_pin: "2X58YU",
    });

    expect(toolRes.ok).toBe(true);
    expect(toolRes.name).toBe("verify_handover_evidence");
    const payload = toolRes.result as {
      quantitative_scores: {
        address_confidence_pct: number;
        parcel_integrity_pct: number;
        placement_security_pct: number;
        overall_handover_score: number;
      };
      capture_authorized: boolean;
      verdict: string;
    };
    expect(payload.quantitative_scores.overall_handover_score).toBeGreaterThanOrEqual(80);
    expect(payload.capture_authorized).toBe(true);
    expect(payload.verdict).toBe("VERIFIED");
  });

  it("enforces server-side vision score gate in confirmDelivery blocking capture when score < 80", async () => {
    seedCatalog();
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });

    await expect(
      confirmDelivery({
        orderId: order.id,
        pickupCode: order.pickup_code!,
        presetId: "wrong_door",
        note: "Bypass attempt with valid PIN but wrong door photo",
      }),
    ).rejects.toThrow(/Server-side quantitative vision gate blocked capture/);

    await expect(
      confirmDelivery({
        orderId: order.id,
        pickupCode: order.pickup_code!,
        presetId: "damaged",
        note: "Bypass attempt with valid PIN but damaged parcel photo",
      }),
    ).rejects.toThrow(/Server-side quantitative vision gate blocked capture/);

    const captured = await confirmDelivery({
      orderId: order.id,
      pickupCode: order.pickup_code!,
      presetId: "correct",
      note: "Valid PIN + passing vision audit",
    });
    expect(captured.status).toBe("CAPTURED");
  });
});
