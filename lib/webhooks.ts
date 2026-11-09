import { getDb, nowIso } from "./db";
import {
  appendEvent,
  captureOrder,
  getOrder,
  getOrderByPaypalOrderId,
  refundOrder,
  requireOrder,
  voidOrder,
} from "./orders";

function header(headers: Headers, name: string): string {
  return headers.get(name) || headers.get(name.toLowerCase()) || "";
}

export async function handlePaypalWebhook(request: Request) {
  const raw = await request.text();
  let event: {
    id?: string;
    event_type?: string;
    resource?: Record<string, unknown>;
  };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    return {
      status: 200,
      body: {
        accepted: false,
        reason:
          "PAYPAL_WEBHOOK_ID is not configured. The payload was not trusted and no order state was changed. Point a public HTTPS URL at /api/paypal/webhooks and set PAYPAL_WEBHOOK_ID.",
      },
    };
  }

  const { verifyWebhookSignature } = await import("./paypal");
  const transmissionId = header(request.headers, "paypal-transmission-id");
  const transmissionTime = header(request.headers, "paypal-transmission-time");
  const transmissionSig = header(request.headers, "paypal-transmission-sig");
  const certUrl = header(request.headers, "paypal-cert-url");
  const authAlgo = header(request.headers, "paypal-auth-algo");
  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return { status: 400, body: { error: "Missing PayPal transmission headers" } };
  }

  let verification: "SUCCESS" | "FAILURE";
  try {
    verification = await verifyWebhookSignature({
      authAlgo,
      certUrl,
      transmissionId,
      transmissionSig,
      transmissionTime,
      webhookId,
      webhookEvent: event,
    });
  } catch (error) {
    return {
      status: 502,
      body: { error: error instanceof Error ? error.message : "verify_failed" },
    };
  }

  if (verification !== "SUCCESS") {
    return { status: 400, body: { error: "Webhook signature verification failed" } };
  }

  if (!event.id || !event.event_type) {
    return { status: 400, body: { error: "Webhook missing id or event_type" } };
  }

  const existing = getDb()
    .prepare("SELECT paypal_event_id FROM webhook_events WHERE paypal_event_id = $id")
    .get({ id: event.id });
  if (existing) {
    return { status: 200, body: { duplicate: true, id: event.id } };
  }

  getDb()
    .prepare(
      `INSERT INTO webhook_events (paypal_event_id, event_type, verification, payload_json, processed_at)
       VALUES ($id, $type, $verification, $payload, $processed)`,
    )
    .run({
      id: event.id,
      type: event.event_type,
      verification,
      payload: raw,
      processed: nowIso(),
    });

  const orderId = findOrderId(event.resource || {});
  await applyWebhookEvent(event.event_type, event.resource || {}, orderId);
  appendEvent({
    event: `WEBHOOK_${event.event_type}`,
    actor: "webhook",
    detail: { paypal_event_id: event.id, event_type: event.event_type },
    orderId: orderId ?? null,
  });

  return { status: 200, body: { ok: true, id: event.id, event_type: event.event_type } };
}

function findOrderId(resource: Record<string, unknown>): string | undefined {
  const custom = resource.custom_id as string | undefined;
  const invoice = resource.invoice_id as string | undefined;
  if (custom && getOrder(custom)) return custom;
  if (invoice && getOrder(invoice)) return invoice;
  const id = resource.id as string | undefined;
  if (id) {
    const byPaypal = getOrderByPaypalOrderId(id);
    if (byPaypal) return byPaypal.id;
  }
  const supplementary = resource.supplementary_data as
    | { related_ids?: { order_id?: string } }
    | undefined;
  const related = supplementary?.related_ids?.order_id;
  if (related) {
    const byPaypal = getOrderByPaypalOrderId(related);
    if (byPaypal) return byPaypal.id;
  }
  return undefined;
}

async function applyWebhookEvent(
  type: string,
  resource: Record<string, unknown>,
  orderId?: string,
) {
  if (!orderId) return;
  const order = requireOrder(orderId);

  if (type === "CHECKOUT.ORDER.APPROVED" && order.status === "CREATED") {
    getDb()
      .prepare("UPDATE orders SET status = 'APPROVED', updated_at = $ts WHERE id = $id")
      .run({ ts: nowIso(), id: orderId });
    return;
  }
  if (type === "PAYMENT.AUTHORIZATION.VOIDED") {
    await voidOrder(orderId, "webhook", "webhook_voided");
    return;
  }
  if (type === "PAYMENT.CAPTURE.COMPLETED") {
    try {
      await captureOrder(orderId, "webhook");
    } catch {
      // Capture may already be recorded; reconcile will catch leftovers.
    }
    return;
  }
  if (type === "PAYMENT.CAPTURE.REFUNDED" && (order.status === "CAPTURED" || order.status === "REFUNDED")) {
    try {
      await refundOrder(orderId, "webhook");
    } catch {
      // already refunded is fine
    }
  }
}
