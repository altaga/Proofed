import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  ORDER_STATUSES,
  StateError,
} from "../lib/state-machine";

describe("order state machine", () => {
  it("allows the documented happy path", () => {
    expect(canTransition("CREATED", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "AUTHORIZED")).toBe(true);
    expect(canTransition("CREATED", "AUTHORIZED")).toBe(true);
    expect(canTransition("AUTHORIZED", "DELIVERY_CONFIRMED")).toBe(true);
    expect(canTransition("DELIVERY_CONFIRMED", "CAPTURED")).toBe(true);
    expect(canTransition("CAPTURED", "REFUNDED")).toBe(true);
  });

  it("allows failure and recovery paths", () => {
    expect(canTransition("AUTHORIZED", "DELIVERY_FAILED")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "AUTHORIZED")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "DELIVERY_CONFIRMED")).toBe(true);
    expect(canTransition("DELIVERY_FAILED", "VOIDED")).toBe(true);
    expect(canTransition("AUTHORIZED", "VOIDED")).toBe(true);
    expect(canTransition("DELIVERY_CONFIRMED", "VOIDED")).toBe(true);
    expect(canTransition("CREATED", "CANCELLED")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("CREATED", "CAPTURED")).toBe(false);
    expect(canTransition("CAPTURED", "VOIDED")).toBe(false);
    expect(canTransition("VOIDED", "AUTHORIZED")).toBe(false);
    expect(canTransition("REFUNDED", "CAPTURED")).toBe(false);
    expect(canTransition("DELIVERY_CONFIRMED", "DELIVERY_FAILED")).toBe(false);
    expect(canTransition("CAPTURED", "DELIVERY_FAILED")).toBe(false);
    expect(canTransition("CAPTURED", "DELIVERY_CONFIRMED")).toBe(false);
    expect(() => assertTransition("CREATED", "CAPTURED")).toThrow(StateError);
    expect(() => assertTransition("DELIVERY_CONFIRMED", "DELIVERY_FAILED")).toThrow(StateError);
  });

  it("treats a no-op as legal", () => {
    for (const status of ORDER_STATUSES) {
      expect(() => assertTransition(status, status)).not.toThrow();
    }
  });
});
