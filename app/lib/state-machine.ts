export const ORDER_STATUSES = [
  "CREATED",
  "APPROVED",
  "AUTHORIZED",
  "DELIVERY_CONFIRMED",
  "CAPTURED",
  "DELIVERY_FAILED",
  "VOIDED",
  "REFUNDED",
  "EXPIRED",
  "CANCELLED",
  "FAILED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  CREATED: ["APPROVED", "AUTHORIZED", "CANCELLED", "EXPIRED", "FAILED"],
  APPROVED: ["AUTHORIZED", "CANCELLED", "EXPIRED", "FAILED"],
  AUTHORIZED: ["DELIVERY_CONFIRMED", "DELIVERY_FAILED", "VOIDED", "EXPIRED", "FAILED"],
  DELIVERY_CONFIRMED: ["CAPTURED", "VOIDED", "FAILED"],
  CAPTURED: ["REFUNDED"],
  DELIVERY_FAILED: ["AUTHORIZED", "VOIDED", "EXPIRED", "FAILED"],
  VOIDED: [],
  REFUNDED: [],
  EXPIRED: ["VOIDED"],
  CANCELLED: [],
  FAILED: ["VOIDED", "REFUNDED"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new StateError(`Illegal status transition ${from} → ${to}`);
  }
}

export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]];
}

export class StateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateError";
  }
}
