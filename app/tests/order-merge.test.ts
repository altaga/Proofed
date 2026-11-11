import { describe, expect, it } from "vitest";
import { getStatusRank, mergeEvents, mergeOrders } from "../lib/order-merge";

describe("order-merge monotonicity", () => {
  it("never downgrades a more advanced status to an older status", () => {
    const existingFailed = [
      {
        id: "ord_123",
        status: "DELIVERY_FAILED",
        updated_at: "2026-11-11T21:02:00Z",
      },
    ];

    const staleIncomingAuthorized = [
      {
        id: "ord_123",
        status: "AUTHORIZED",
        updated_at: "2026-11-11T21:01:00Z",
      },
    ];

    // Merging stale server response with existing failed state must keep DELIVERY_FAILED
    const merged = mergeOrders(staleIncomingAuthorized, existingFailed);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("DELIVERY_FAILED");
    expect(merged[0].updated_at).toBe("2026-11-11T21:02:00Z");
  });

  it("upgrades when incoming status is more advanced", () => {
    const existingAuthorized = [
      {
        id: "ord_123",
        status: "AUTHORIZED",
        updated_at: "2026-11-11T21:01:00Z",
      },
    ];

    const newerFailed = [
      {
        id: "ord_123",
        status: "DELIVERY_FAILED",
        updated_at: "2026-11-11T21:02:00Z",
      },
    ];

    const merged = mergeOrders(newerFailed, existingAuthorized);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe("DELIVERY_FAILED");
  });

  it("never downgrades CAPTURED to AUTHORIZED or DELIVERY_CONFIRMED", () => {
    const existingCaptured = [
      {
        id: "ord_456",
        status: "CAPTURED",
        updated_at: "2026-11-11T21:05:00Z",
      },
    ];

    const staleAuth = [
      {
        id: "ord_456",
        status: "AUTHORIZED",
        updated_at: "2026-11-11T21:00:00Z",
      },
    ];

    const merged = mergeOrders(staleAuth, existingCaptured);
    expect(merged[0].status).toBe("CAPTURED");
  });

  it("monotonically merges event logs without dropping past events", () => {
    const existingEvents = [
      { id: 3, order_id: "ord_123", event: "DELIVERY_FAILED" },
      { id: 2, order_id: "ord_123", event: "PAYPAL_AUTHORIZED" },
      { id: 1, order_id: "ord_123", event: "PAYPAL_ORDER_CREATED" },
    ];

    // Stale server instance only knows events 1 and 2
    const staleEvents = [
      { id: 2, order_id: "ord_123", event: "PAYPAL_AUTHORIZED" },
      { id: 1, order_id: "ord_123", event: "PAYPAL_ORDER_CREATED" },
    ];

    const merged = mergeEvents(staleEvents, existingEvents);
    expect(merged).toHaveLength(3);
    expect(merged[0].id).toBe(3);
    expect(merged[0].event).toBe("DELIVERY_FAILED");
  });
});
