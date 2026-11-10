import { sandboxOrderUrl, sandboxPaymentUrl } from "@/lib/sandbox-links";

export type TxItem = {
  sku: string;
  name: string;
  qty: number;
  unit_price_cents?: number;
};

export type TxOrder = {
  id: string;
  status: string;
  formatted_total: string;
  pickup_code?: string | null;
  paypal_order_id?: string | null;
  paypal_authorization_id?: string | null;
  paypal_capture_id?: string | null;
  paypal_refund_id?: string | null;
  failure_reason?: string | null;
  items?: TxItem[];
  created_at?: string;
  updated_at?: string;
  authorized_at?: string | null;
  delivered_at?: string | null;
  captured_at?: string | null;
  voided_at?: string | null;
  refunded_at?: string | null;
};

export type TxQuote = {
  ok: boolean;
  formatted_total?: string;
  errors?: string[];
  lines?: Array<{ sku: string; name: string; qty: number; unit_price_cents?: number }>;
};

export type TxEvent = {
  id?: number;
  event: string;
  actor: string;
  from_status?: string | null;
  to_status?: string | null;
  created_at: string;
  detail_json?: string;
};

export type TxStep = {
  key: string;
  label: string;
  state: "done" | "current" | "pending" | "branch";
  timestamp?: string | null;
  actor?: string;
  paypalId?: string | null;
  paypalHref?: string;
  note?: string;
};

export type MoneyKind = "quoted" | "held" | "captured" | "voided" | "refunded" | "failed" | "none";

export function moneyKind(status?: string | null): MoneyKind {
  switch (status) {
    case "CREATED":
    case "APPROVED":
      return "quoted";
    case "AUTHORIZED":
    case "DELIVERY_CONFIRMED":
      return "held";
    case "CAPTURED":
      return "captured";
    case "VOIDED":
    case "CANCELLED":
      return "voided";
    case "REFUNDED":
      return "refunded";
    case "DELIVERY_FAILED":
    case "FAILED":
    case "EXPIRED":
      return "failed";
    default:
      return "none";
  }
}

export function moneySentence(order?: TxOrder | null, quote?: TxQuote | null): string {
  if (order) {
    const amt = order.formatted_total;
    const reason = order.failure_reason ? ` (${order.failure_reason.replaceAll("_", " ")})` : "";
    switch (order.status) {
      case "CREATED":
        return `${amt} quoted. No PayPal hold yet — approve the button to place it.`;
      case "APPROVED":
        return `Shopper approved ${amt}. The hold is not in place until authorization completes.`;
      case "AUTHORIZED":
        return `${amt} held on the shopper’s PayPal, not charged yet.`;
      case "DELIVERY_CONFIRMED":
        return `Handover recorded. Capturing ${amt} now.`;
      case "DELIVERY_FAILED":
        return `${amt} still held. Handover failed${reason}.`;
      case "CAPTURED":
        return `${amt} captured. The shopper was charged.`;
      case "VOIDED":
        return `Hold released. The shopper was not charged.`;
      case "REFUNDED":
        return `${amt} refunded to the shopper.`;
      case "CANCELLED":
        return `Order cancelled before a hold was placed.`;
      case "EXPIRED":
        return `The authorization expired. The shopper was not charged.`;
      case "FAILED":
        return `Payment failed${reason}.`;
      default:
        return `${amt} · ${order.status}`;
    }
  }
  if (quote) {
    if (!quote.ok) {
      return quote.errors?.join(" ") || "The quote was rejected by the policy engine.";
    }
    return `${quote.formatted_total ?? "Quote"} priced from the catalog. No PayPal hold yet.`;
  }
  return "No transaction yet. Send a shop request or enter a pickup code.";
}

export function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function actorLabel(actor?: string | null): string {
  const map: Record<string, string> = {
    agent: "Agent",
    shopper: "Shopper",
    system: "Backend",
    device: "Kiosk",
    kiosk: "Kiosk",
    merchant: "Merchant",
    reconcile: "Reconcile",
    paypal: "PayPal",
    backend: "Backend",
  };
  return map[actor || ""] || actor || "Backend";
}

function findEvent(events: TxEvent[], names: string[]) {
  return [...events].reverse().find((item) => names.includes(item.event));
}

export function itemLine(order?: TxOrder | null, quote?: TxQuote | null): string {
  const items = order?.items?.length
    ? order.items
    : quote?.lines?.map((line) => ({ sku: line.sku, name: line.name, qty: line.qty })) || [];
  if (!items.length) return "No items yet";
  return items.map((item) => `${item.name} × ${item.qty}`).join(", ");
}

export function buildTxSteps(order: TxOrder, events: TxEvent[] = []): TxStep[] {
  const status = order.status;
  const quoteEvent = findEvent(events, ["ORDER_CREATED", "PAYPAL_ORDER_CREATED"]);
  const holdEvent = findEvent(events, ["PAYPAL_AUTHORIZED", "ORDER_AUTHORIZED"]);
  const handEvent = findEvent(events, ["DELIVERY_CONFIRMED", "HANDOVER_CONFIRMED"]);
  const failEvent = findEvent(events, ["DELIVERY_FAILED"]);
  const capEvent = findEvent(events, ["PAYPAL_CAPTURED", "ORDER_CAPTURED"]);
  const voidEvent = findEvent(events, ["PAYPAL_VOIDED", "ORDER_VOIDED"]);
  const refundEvent = findEvent(events, ["PAYPAL_REFUNDED", "ORDER_REFUNDED"]);
  const subEvent = findEvent(events, ["RECOVERY_SUBSTITUTE"]);

  const reached = (keys: string[]) => keys.includes(status);
  const pastQuote = status !== undefined;
  const pastHold = reached([
    "AUTHORIZED",
    "DELIVERY_CONFIRMED",
    "DELIVERY_FAILED",
    "CAPTURED",
    "VOIDED",
    "REFUNDED",
  ]);
  const approved = status === "APPROVED";
  const pastHand = reached(["DELIVERY_CONFIRMED", "CAPTURED", "REFUNDED"]);
  const pastCap = reached(["CAPTURED", "REFUNDED"]);

  const steps: TxStep[] = [
    {
      key: "quote",
      label: "Quote",
      state: status === "CREATED" ? "current" : pastQuote ? "done" : "pending",
      timestamp: order.created_at || quoteEvent?.created_at,
      actor: actorLabel(quoteEvent?.actor || "agent"),
      paypalId: order.paypal_order_id,
      paypalHref: order.paypal_order_id ? sandboxOrderUrl(order.paypal_order_id) : undefined,
      note: "Catalog-priced cart sent to PayPal",
    },
    {
      key: "hold",
      label: "Hold placed",
      state:
        status === "AUTHORIZED" || status === "DELIVERY_FAILED" || approved
          ? "current"
          : pastHold
            ? "done"
            : "pending",
      timestamp: order.authorized_at || holdEvent?.created_at,
      actor: approved && !pastHold ? "Shopper" : "Shopper + PayPal",
      paypalId: order.paypal_authorization_id,
      paypalHref: order.paypal_authorization_id ? sandboxPaymentUrl(order.paypal_authorization_id) : undefined,
      note: approved && !pastHold ? "Shopper approved; waiting for authorization" : "PayPal authorized",
    },
    {
      key: "handover",
      label: "Handover verified",
      state:
        status === "DELIVERY_FAILED"
          ? "branch"
          : status === "DELIVERY_CONFIRMED"
            ? "current"
            : pastHand
              ? "done"
              : "pending",
      timestamp: order.delivered_at || handEvent?.created_at || failEvent?.created_at,
      actor: "Kiosk",
      note:
        status === "DELIVERY_FAILED"
          ? `Failed${order.failure_reason ? `: ${order.failure_reason.replaceAll("_", " ")}` : ""}`
          : "Pickup station recorded evidence",
    },
    {
      key: "captured",
      label: "Captured",
      state: status === "CAPTURED" ? "current" : pastCap ? "done" : "pending",
      timestamp: order.captured_at || capEvent?.created_at,
      actor: "PayPal",
      paypalId: order.paypal_capture_id,
      paypalHref: order.paypal_capture_id ? sandboxPaymentUrl(order.paypal_capture_id) : undefined,
    },
  ];

  if (status === "VOIDED" || voidEvent) {
    steps.push({
      key: "voided",
      label: "Voided",
      state: status === "VOIDED" ? "current" : "branch",
      timestamp: order.voided_at || voidEvent?.created_at,
      actor: actorLabel(voidEvent?.actor || "kiosk"),
      paypalId: order.paypal_authorization_id,
      paypalHref: order.paypal_authorization_id ? sandboxPaymentUrl(order.paypal_authorization_id) : undefined,
      note: "Hold released, shopper not charged",
    });
  }
  if (status === "REFUNDED" || refundEvent || order.paypal_refund_id) {
    steps.push({
      key: "refunded",
      label: "Refunded",
      state: status === "REFUNDED" ? "current" : "branch",
      timestamp: order.refunded_at || refundEvent?.created_at,
      actor: actorLabel(refundEvent?.actor || "merchant"),
      paypalId: order.paypal_refund_id,
      paypalHref: order.paypal_refund_id ? sandboxPaymentUrl(order.paypal_refund_id) : undefined,
    });
  }
  if (subEvent) {
    steps.push({
      key: "substituted",
      label: "Substituted",
      state: "branch",
      timestamp: subEvent.created_at,
      actor: actorLabel(subEvent.actor),
      note: "Original hold released; a replacement AUTHORIZE order was created",
    });
  }
  if (status === "CANCELLED") {
    steps.push({
      key: "cancelled",
      label: "Cancelled",
      state: "current",
      timestamp: order.updated_at,
      actor: actorLabel(voidEvent?.actor || "backend"),
    });
  }
  return steps;
}
