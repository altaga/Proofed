import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeFulfillmentImage } from "../lib/vision-audit";
import { executeAgentTool } from "../lib/agent-tools";
import { captureOrder, confirmDelivery, courierOrderView, createCheckout } from "../lib/orders";
import { seedCatalog } from "../lib/catalog-seed";
import { closeDb } from "../lib/db";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../lib/paypal", () => ({
  createPaypalOrder: vi.fn().mockResolvedValue({ id: "MOCK-PP-ORDER", status: "CREATED" }),
  authorizePaypalOrder: vi.fn().mockResolvedValue({ id: "MOCK-AUTH-ID", status: "COMPLETED" }),
  voidPaypalAuthorization: vi.fn().mockResolvedValue(true),
  capturePaypalAuthorization: vi.fn().mockResolvedValue({ id: "MOCK-CAP-ID", status: "COMPLETED" }),
}));

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "mock-client-id";
  process.env.PAYPAL_CLIENT_SECRET = "mock-client-secret";
  process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), "proofed-vision-")), "test.sqlite");
  closeDb();
  seedCatalog();
});

afterEach(() => {
  closeDb();
});

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

  it("tri-factor gate: blocks capture when GPS is outside delivery geofence (+850m away)", async () => {
    seedCatalog();
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });

    // Device located in central Kraków or Warsaw, far from Filarecka 2B (> 250m)
    await expect(
      confirmDelivery({
        orderId: order.id,
        pickupCode: order.pickup_code!,
        presetId: "correct",
        gpsCoordinates: { lat: 50.0647, lng: 19.9450 }, // Main Square Kraków, ~2.5km away
        note: "Attempt handover outside delivery geofence",
      }),
    ).rejects.toThrow(/Server-side quantitative vision gate blocked capture/);
  });

  it("tri-factor gate: passes when GPS zone, Door #15, and intact parcel are all verified", async () => {
    seedCatalog();
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });

    // Exact or near coordinates at Filarecka 2B, Kraków (< 250m)
    const captured = await confirmDelivery({
      orderId: order.id,
      pickupCode: order.pickup_code!,
      presetId: "correct",
      gpsCoordinates: { lat: 50.0556092, lng: 19.9203676 },
      note: "Tri-factor verified: on-site GPS + Door #15 + Box on floor",
    });

    expect(captured.status).toBe("CAPTURED");
  });

  it("security P0: blocks captureOrder() on AUTHORIZED orders that have not completed physical handover verification", async () => {
    seedCatalog();
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });
    expect(order.status).toBe("AUTHORIZED");

    await expect(captureOrder(order.id, "merchant")).rejects.toThrow(
      /Physical handover evidence and recipient PIN must be verified first/,
    );
  });

  it("security P0: fails closed when non-preset vision verification lacks an image or GPS coordinates", async () => {
    const missingPhoto = await analyzeFulfillmentImage({
      presetId: "custom",
      gpsCoordinates: { lat: 50.0556092, lng: 19.9203676 },
    });
    expect(missingPhoto.captureAuthorized).toBe(false);
    expect(missingPhoto.overallHandoverScore).toBe(0);
    expect(missingPhoto.source).toBe("fail-closed-missing-evidence");

    const missingGps = await analyzeFulfillmentImage({
      presetId: "custom",
      imageBase64: "data:image/jpeg;base64,dGVzdA==",
    });
    expect(missingGps.gpsZoneVerified).toBe(false);
    expect(missingGps.captureAuthorized).toBe(false);
  });

  it("security P0: redacts pickup_code in courierOrderView()", async () => {
    seedCatalog();
    const order = await createCheckout({
      items: [{ sku: "PAN-COF-ETH", qty: 1 }],
      autoAuthorize: true,
    });
    expect(order.pickup_code).toBeTruthy();

    const courierView = courierOrderView(order);
    expect(courierView.pickup_code).toBeNull();
    expect(courierView.pickup_code_masked).toBe("••••••");
    expect(courierView.pin_required).toBe(true);
  });
});
