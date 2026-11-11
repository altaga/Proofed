import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getProjectConfig } from "./config";
import {
  getDb,
  isCloudDbEnabled,
  nowIso,
  rowToObject,
  syncOrderFromCloud,
  syncOrderToCloud,
  withTransaction,
} from "./db";
import { newId, newPickupCode, newRequestId } from "./ids";
import { formatMoney } from "./money";
import {
  PolicyError,
  alternativesWithinBudget,
  availableStock,
  quoteItems,
  type QuotedLine,
  type RequestedItem,
} from "./policy";
import {
  PaypalHttpError,
  authorizePaypalOrder,
  capturePaypalAuthorization,
  createPaypalOrder,
  firstAuthorization,
  getPaypalAuthorization,
  getPaypalOrder,
  refundPaypalCapture,
  voidPaypalAuthorization,
  type PaypalOrder,
} from "./paypal";
import { assertTransition, type OrderStatus } from "./state-machine";
import { analyzeFulfillmentImage } from "./vision-audit";

export type OrderRecord = {
  id: string;
  status: OrderStatus;
  buyer_note: string | null;
  budget_cents: number | null;
  currency: string;
  subtotal_cents: number;
  pickup_code: string;
  pickup_deadline_at: string | null;
  fulfillment_station: string;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  paypal_refund_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  authorized_at: string | null;
  delivered_at: string | null;
  captured_at: string | null;
  voided_at: string | null;
  refunded_at: string | null;
};

export type OrderItemRecord = {
  id: number;
  order_id: string;
  sku: string;
  name: string;
  unit_price_cents: number;
  qty: number;
};

export type EvidenceRecord = {
  id: string;
  order_id: string;
  kind: string;
  pickup_code: string | null;
  note: string | null;
  photo_sha256: string | null;
  photo_mime: string | null;
  photo_bytes: number | null;
  created_at: string;
};

export type EventRecord = {
  id: number;
  order_id: string | null;
  event: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  detail_json: string;
  created_at: string;
};

export type OrderDetails = OrderRecord & {
  items: OrderItemRecord[];
  evidence: EvidenceRecord[];
};

function db() {
  return getDb();
}

export function getOrder(id: string): OrderRecord | null {
  const row = db().prepare("SELECT * FROM orders WHERE id = $id").get({ id });
  return row ? rowToObject<OrderRecord>(row) : null;
}

export function getOrderByPaypalOrderId(paypalOrderId: string): OrderRecord | null {
  const row = db()
    .prepare("SELECT * FROM orders WHERE paypal_order_id = $paypalOrderId")
    .get({ paypalOrderId });
  return row ? rowToObject<OrderRecord>(row) : null;
}

export function requireOrder(id: string): OrderRecord {
  const order = getOrder(id);
  if (!order) throw new PolicyError("ORDER_NOT_FOUND", `Order ${id} was not found.`);
  return order;
}

export function listOrderItems(orderId: string): OrderItemRecord[] {
  return db()
    .prepare("SELECT * FROM order_items WHERE order_id = $orderId")
    .all({ orderId })
    .map((row) => rowToObject<OrderItemRecord>(row));
}

export function listEvidence(orderId: string): EvidenceRecord[] {
  return db()
    .prepare("SELECT * FROM evidence WHERE order_id = $orderId ORDER BY created_at ASC")
    .all({ orderId })
    .map((row) => rowToObject<EvidenceRecord>(row));
}

export function getOrderDetails(id: string): OrderDetails {
  const order = requireOrder(id);
  return { ...order, items: listOrderItems(id), evidence: listEvidence(id) };
}

export function listOrders(): OrderDetails[] {
  const rows = db().prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
  return rows.map((row) => {
    const order = rowToObject<OrderRecord>(row);
    return { ...order, items: listOrderItems(order.id), evidence: listEvidence(order.id) };
  });
}

export function listEvents(orderId?: string, limit = 200): EventRecord[] {
  const rows = orderId
    ? db()
        .prepare(
          "SELECT * FROM event_log WHERE order_id = $orderId ORDER BY id DESC LIMIT $limit",
        )
        .all({ orderId, limit })
    : db().prepare("SELECT * FROM event_log ORDER BY id DESC LIMIT $limit").all({ limit });
  return rows.map((row) => rowToObject<EventRecord>(row));
}

export function appendEvent(input: {
  orderId?: string | null;
  event: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actor: string;
  detail?: unknown;
}) {
  const created = nowIso();
  const prevRow = db()
    .prepare("SELECT detail_json FROM event_log ORDER BY id DESC LIMIT 1")
    .get() as { detail_json?: string } | undefined;
  let prevSig = "GENESIS";
  if (prevRow?.detail_json) {
    try {
      const parsed = JSON.parse(prevRow.detail_json) as { _sig?: string };
      if (parsed._sig) prevSig = parsed._sig;
    } catch {
      // ignore parse errors on legacy rows
    }
  }
  const secret =
    process.env.EVENT_SIGNING_SECRET ||
    process.env.PAYPAL_CLIENT_SECRET ||
    "proofed-tamper-evident-hmac-key";
  const baseDetail =
    input.detail && typeof input.detail === "object" && !Array.isArray(input.detail)
      ? (input.detail as Record<string, unknown>)
      : { value: input.detail ?? {} };
  const canonical = JSON.stringify({
    prevSig,
    orderId: input.orderId ?? null,
    event: input.event,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    actor: input.actor,
    created,
    detail: baseDetail,
  });
  const sig = createHmac("sha256", secret).update(canonical).digest("hex");
  const signedDetail = {
    ...baseDetail,
    _prev_sig: prevSig.slice(0, 16),
    _sig: sig,
  };

  db()
    .prepare(
      `INSERT INTO event_log (order_id, event, from_status, to_status, actor, detail_json, created_at)
       VALUES ($orderId, $event, $fromStatus, $toStatus, $actor, $detail, $created)`,
    )
    .run({
      orderId: input.orderId ?? null,
      event: input.event,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      actor: input.actor,
      detail: JSON.stringify(signedDetail),
      created,
    });
}

function uniquePickupCode(): string {
  for (let i = 0; i < 12; i += 1) {
    const code = newPickupCode();
    const existing = db()
      .prepare(
        "SELECT id FROM orders WHERE pickup_code = $code AND status NOT IN ('VOIDED','REFUNDED','CANCELLED','EXPIRED','FAILED')",
      )
      .get({ code });
    if (!existing) return code;
  }
  return newPickupCode() + newPickupCode();
}

export function ensureRequestId(operation: string, orderId: string): string {
  const existing = db()
    .prepare(
      "SELECT paypal_request_id FROM paypal_idempotency WHERE operation = $operation AND order_id = $orderId",
    )
    .get({ operation, orderId }) as { paypal_request_id: string } | undefined;
  if (existing) return existing.paypal_request_id;
  const paypalRequestId = newRequestId();
  db()
    .prepare(
      `INSERT INTO paypal_idempotency (operation, order_id, paypal_request_id, response_json, created_at)
       VALUES ($operation, $orderId, $paypalRequestId, NULL, $created)`,
    )
    .run({ operation, orderId, paypalRequestId, created: nowIso() });
  return paypalRequestId;
}

export function saveIdempotentResponse(operation: string, orderId: string, response: unknown) {
  db()
    .prepare(
      `UPDATE paypal_idempotency
       SET response_json = $response
       WHERE operation = $operation AND order_id = $orderId`,
    )
    .run({ operation, orderId, response: JSON.stringify(response) });
}

export function loadIdempotentResponse<T>(operation: string, orderId: string): T | null {
  const row = db()
    .prepare(
      "SELECT response_json FROM paypal_idempotency WHERE operation = $operation AND order_id = $orderId",
    )
    .get({ operation, orderId }) as { response_json: string | null } | undefined;
  if (!row?.response_json) return null;
  return JSON.parse(row.response_json) as T;
}

function applyStatus(order: OrderRecord, to: OrderStatus, extraSql = "", extraParams: Record<string, unknown> = {}) {
  assertTransition(order.status, to);
  const now = nowIso();
  db()
    .prepare(
      `UPDATE orders SET status = $to, updated_at = $now ${extraSql} WHERE id = $id`,
    )
    .run({ ...extraParams, to, now, id: order.id });
}

function reload(id: string): OrderRecord {
  return requireOrder(id);
}

function releaseReservations(orderId: string) {
  db()
    .prepare(
      `UPDATE stock_reservations
       SET released_at = $now
       WHERE order_id = $orderId AND released_at IS NULL AND consumed_at IS NULL`,
    )
    .run({ orderId, now: nowIso() });
}

function consumeReservations(orderId: string) {
  const reservations = db()
    .prepare(
      `SELECT sku, qty FROM stock_reservations
       WHERE order_id = $orderId AND released_at IS NULL AND consumed_at IS NULL`,
    )
    .all({ orderId }) as Array<{ sku: string; qty: number }>;
  const now = nowIso();
  for (const reservation of reservations) {
    db()
      .prepare("UPDATE catalog_items SET stock = stock - $qty WHERE sku = $sku")
      .run({ sku: reservation.sku, qty: reservation.qty });
    const item = db()
      .prepare("SELECT stock FROM catalog_items WHERE sku = $sku")
      .get({ sku: reservation.sku }) as { stock: number };
    if (item.stock < 0) {
      throw new PolicyError("STOCK_CORRUPT", `Stock for ${reservation.sku} would go negative.`);
    }
  }
  db()
    .prepare(
      `UPDATE stock_reservations
       SET consumed_at = $now
       WHERE order_id = $orderId AND released_at IS NULL AND consumed_at IS NULL`,
    )
    .run({ orderId, now });
}

function restoreStockFromItems(orderId: string) {
  const items = listOrderItems(orderId);
  for (const item of items) {
    db()
      .prepare("UPDATE catalog_items SET stock = stock + $qty WHERE sku = $sku")
      .run({ sku: item.sku, qty: item.qty });
  }
}

function extendReservations(orderId: string, expiresAt: string) {
  db()
    .prepare(
      `UPDATE stock_reservations
       SET expires_at = $expiresAt
       WHERE order_id = $orderId AND released_at IS NULL AND consumed_at IS NULL`,
    )
    .run({ orderId, expiresAt });
}

export function summarizeOrder(order: OrderDetails | OrderRecord) {
  const items = "items" in order ? order.items : listOrderItems(order.id);
  const cfg = getProjectConfig();
  return {
    ...order,
    items,
    formatted_total: formatMoney(order.subtotal_cents, order.currency || cfg.currency),
  };
}

export async function createCheckout(input: {
  items: unknown;
  budgetCents?: number;
  note?: string;
  actor?: string;
  autoAuthorize?: boolean;
}): Promise<OrderDetails> {
  const cfg = getProjectConfig();
  const quote = quoteItems(input.items, input.budgetCents, cfg.currency);
  if (!quote.ok) {
    throw new PolicyError("QUOTE_REJECTED", quote.errors.join(" "), { errors: quote.errors, quote });
  }

  const orderId = newId("ord");
  const pickupCode = uniquePickupCode();
  const now = nowIso();
  const reservationExpiry = new Date(
    Date.now() + cfg.stockReservationMinutes * 60 * 1000,
  ).toISOString();

  withTransaction(() => {
    db()
      .prepare(
        `INSERT INTO orders (
           id, status, buyer_note, budget_cents, currency, subtotal_cents, pickup_code,
           fulfillment_station, created_at, updated_at
         ) VALUES (
           $id, 'CREATED', $note, $budget, $currency, $subtotal, $pickup,
           'kiosk-1', $now, $now
         )`,
      )
      .run({
        id: orderId,
        note: input.note ?? null,
        budget: input.budgetCents ?? null,
        currency: cfg.currency,
        subtotal: quote.subtotal_cents,
        pickup: pickupCode,
        now,
      });
    const insertItem = db().prepare(
      `INSERT INTO order_items (order_id, sku, name, unit_price_cents, qty)
       VALUES ($orderId, $sku, $name, $unit, $qty)`,
    );
    const insertRes = db().prepare(
      `INSERT INTO stock_reservations (id, order_id, sku, qty, expires_at)
       VALUES ($id, $orderId, $sku, $qty, $expires)`,
    );
    for (const line of quote.lines) {
      insertItem.run({
        orderId,
        sku: line.sku,
        name: line.name,
        unit: line.unit_price_cents,
        qty: line.qty,
      });
      insertRes.run({
        id: newId("res"),
        orderId,
        sku: line.sku,
        qty: line.qty,
        expires: reservationExpiry,
      });
    }
    appendEvent({
      orderId,
      event: "ORDER_CREATED",
      fromStatus: null,
      toStatus: "CREATED",
      actor: input.actor ?? "agent",
      detail: {
        subtotal_cents: quote.subtotal_cents,
        items: quote.lines,
        budget_cents: input.budgetCents ?? null,
      },
    });
  });

  try {
    const requestId = ensureRequestId("create_order", orderId);
    const cached = loadIdempotentResponse<PaypalOrder>("create_order", orderId);
    const paypalItems = quote.lines.map((l) => {
      let desc = l.name;
      try {
        const itemCatalogStmt = db().prepare("SELECT description, category FROM catalog WHERE sku = $sku");
        const cat = itemCatalogStmt.get({ sku: l.sku }) as { description?: string; category?: string } | undefined;
        if (cat?.description) desc = cat.description;
      } catch {
        // catalog table might not exist in isolated unit test environments
      }
      return {
        name: l.name,
        description: desc,
        sku: l.sku,
        unitPriceCents: l.unit_price_cents,
        qty: l.qty,
        category: "PHYSICAL_GOODS" as const,
      };
    });

    const paypalOrder =
      cached ??
      (await createPaypalOrder({
        amountCents: quote.subtotal_cents,
        currency: cfg.currency,
        description: `Proofed Autonomous Commerce · Doorstep Courier Handover (Hold pending PIN verification)`,
        invoiceId: orderId,
        customId: `${orderId} | PIN_AUTH_GATE`,
        brandName: "Proofed Autonomous Commerce",
        requestId,
        items: paypalItems,
        shippingAddress: {
          fullName: "Doorstep Delivery Recipient",
          addressLine1: "ul. Filarecka 2B / 15",
          adminArea2: "Kraków",
          adminArea1: "Małopolskie",
          postalCode: "30-110",
          countryCode: "PL",
        },
      }));
    saveIdempotentResponse("create_order", orderId, paypalOrder);
    db()
      .prepare(
        "UPDATE orders SET paypal_order_id = $paypalOrderId, updated_at = $now WHERE id = $id",
      )
      .run({ paypalOrderId: paypalOrder.id, now: nowIso(), id: orderId });
    appendEvent({
      orderId,
      event: "PAYPAL_ORDER_CREATED",
      actor: "system",
      toStatus: "CREATED",
      detail: { paypal_order_id: paypalOrder.id, intent: paypalOrder.intent, status: paypalOrder.status },
    });

    if (input.autoAuthorize) {
      const authId = `AUTH-PP-${orderId.slice(-6)}`;
      const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db()
        .prepare(
          `UPDATE orders
           SET status = 'AUTHORIZED',
               paypal_authorization_id = $authId,
               authorized_at = $now,
               pickup_deadline_at = $deadline,
               updated_at = $now
           WHERE id = $id`,
        )
        .run({
          authId,
          now: nowIso(),
          deadline,
          id: orderId,
        });
      appendEvent({
        orderId,
        event: "PAYPAL_AUTHORIZED",
        fromStatus: "CREATED",
        toStatus: "AUTHORIZED",
        actor: input.actor ?? "shopper",
        detail: {
          paypal_authorization_id: authId,
          mode: "auto_pilot",
          intent: "AUTHORIZE",
        },
      });
    }
  } catch (error) {
    withTransaction(() => {
      releaseReservations(orderId);
      const current = requireOrder(orderId);
      applyStatus(current, "FAILED", ", failure_reason = $reason", {
        reason: "PAYPAL_CREATE_FAILED",
      });
      appendEvent({
        orderId,
        event: "PAYPAL_CREATE_FAILED",
        fromStatus: "CREATED",
        toStatus: "FAILED",
        actor: "system",
        detail: { message: error instanceof Error ? error.message : "paypal_error" },
      });
    });
    throw error;
  }

  return getOrderDetails(orderId);
}

function syncFromPaypalOrder(order: OrderRecord, paypalOrder: PaypalOrder, actor: string) {
  const auth = firstAuthorization(paypalOrder);
  if (paypalOrder.status === "APPROVED" && order.status === "CREATED") {
    applyStatus(order, "APPROVED");
    appendEvent({
      orderId: order.id,
      event: "PAYPAL_ORDER_APPROVED",
      fromStatus: order.status,
      toStatus: "APPROVED",
      actor,
      detail: { paypal_order_id: paypalOrder.id },
    });
    return reload(order.id);
  }
  if (auth?.id && (order.status === "CREATED" || order.status === "APPROVED")) {
    const cfg = getProjectConfig();
    const deadline = new Date(Date.now() + cfg.pickupTimeoutMinutes * 60 * 1000).toISOString();
    applyStatus(
      order,
      "AUTHORIZED",
      ", paypal_authorization_id = $authId, authorized_at = $now2, pickup_deadline_at = $deadline",
      { authId: auth.id, now2: nowIso(), deadline },
    );
    extendReservations(order.id, deadline);
    appendEvent({
      orderId: order.id,
      event: "PAYPAL_AUTHORIZED",
      fromStatus: order.status,
      toStatus: "AUTHORIZED",
      actor,
      detail: { paypal_authorization_id: auth.id, paypal_status: auth.status },
    });
    return reload(order.id);
  }
  return reload(order.id);
}

export async function authorizeOrder(
  orderId: string,
  actor = "shopper",
  simulateApproval = false,
): Promise<OrderDetails> {
  const order = requireOrder(orderId);
  if (!order.paypal_order_id) {
    throw new PolicyError("NO_PAYPAL_ORDER", "This order has no PayPal order id.");
  }
  if (order.status === "AUTHORIZED") return getOrderDetails(orderId);
  if (order.status !== "CREATED" && order.status !== "APPROVED") {
    throw new PolicyError("CANNOT_AUTHORIZE", `Cannot authorize an order in status ${order.status}.`);
  }

  if (simulateApproval) {
    const authId = `AUTH-DEMO-${orderId.slice(-6).toUpperCase()}`;
    const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    applyStatus(
      order,
      "AUTHORIZED",
      ", paypal_authorization_id = $authId, authorized_at = $now, pickup_deadline_at = $deadline",
      { authId, now: nowIso(), deadline },
    );
    appendEvent({
      orderId,
      event: "PAYPAL_AUTHORIZED",
      fromStatus: order.status,
      toStatus: "AUTHORIZED",
      actor,
      detail: { paypal_authorization_id: authId, mode: "simulated_demo_approval" },
    });
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  }

  const cached = loadIdempotentResponse<PaypalOrder>("authorize", orderId);
  if (cached) {
    syncFromPaypalOrder(order, cached, actor);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  }

  try {
    const requestId = ensureRequestId("authorize", orderId);
    const paypalOrder = await authorizePaypalOrder(order.paypal_order_id, requestId);
    saveIdempotentResponse("authorize", orderId, paypalOrder);
    syncFromPaypalOrder(requireOrder(orderId), paypalOrder, actor);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  } catch (error) {
    if (error instanceof PaypalHttpError) {
      if (error.hasIssue("ORDER_NOT_APPROVED")) {
        appendEvent({
          orderId,
          event: "AUTHORIZE_BLOCKED_NOT_APPROVED",
          actor,
          detail: { issues: error.issues, debugId: error.debugId },
        });
        throw new PolicyError(
          "ORDER_NOT_APPROVED",
          "The buyer has not approved this PayPal order yet. Use the PayPal button to approve, then try again.",
          { debugId: error.debugId },
        );
      }
      try {
        const latest = await getPaypalOrder(order.paypal_order_id);
        syncFromPaypalOrder(requireOrder(orderId), latest, "reconcile");
        const updated = requireOrder(orderId);
        if (updated.status === "AUTHORIZED") return getOrderDetails(orderId);
      } catch {
        // keep original error
      }
    }
    appendEvent({
      orderId,
      event: "AUTHORIZE_FAILED",
      actor,
      detail: { message: error instanceof Error ? error.message : "authorize_failed" },
    });
    throw error;
  }
}

export function storeEvidence(input: {
  orderId: string;
  kind: string;
  pickupCode?: string;
  note?: string;
  photoBase64?: string;
  photoMime?: string;
}): EvidenceRecord {
  let photoSha: string | null = null;
  let photoMime: string | null = null;
  let photoBytes: number | null = null;
  if (input.photoBase64) {
    const raw = input.photoBase64.includes(",")
      ? input.photoBase64.slice(input.photoBase64.indexOf(",") + 1)
      : input.photoBase64;
    const buffer = Buffer.from(raw, "base64");
    if (buffer.length > 2 * 1024 * 1024) {
      throw new PolicyError("PHOTO_TOO_LARGE", "Optional photo must be 2MB or smaller.");
    }
    if (buffer.length > 0) {
      photoSha = createHash("sha256").update(buffer).digest("hex");
      photoMime = input.photoMime || "application/octet-stream";
      photoBytes = buffer.length;
      const evidenceBase = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME ? "/tmp" : process.cwd();
      const dir = path.join(evidenceBase, "data", "evidence");
      mkdirSync(dir, { recursive: true });
      const ext = photoMime.includes("png") ? "png" : photoMime.includes("jpeg") || photoMime.includes("jpg") ? "jpg" : "bin";
      writeFileSync(path.join(dir, `${photoSha}.${ext}`), buffer);
    }
  }
  const record: EvidenceRecord = {
    id: newId("evd"),
    order_id: input.orderId,
    kind: input.kind,
    pickup_code: input.pickupCode ?? null,
    note: input.note ?? null,
    photo_sha256: photoSha,
    photo_mime: photoMime,
    photo_bytes: photoBytes,
    created_at: nowIso(),
  };
  db()
    .prepare(
      `INSERT INTO evidence (id, order_id, kind, pickup_code, note, photo_sha256, photo_mime, photo_bytes, created_at)
       VALUES ($id, $order_id, $kind, $pickup_code, $note, $photo_sha256, $photo_mime, $photo_bytes, $created_at)`,
    )
    .run(record);
  return record;
}

function assertPickupCode(order: OrderRecord, code?: string) {
  if (!code) throw new PolicyError("PICKUP_CODE_REQUIRED", "Recipient handover PIN is required.");
  if (code.trim().toUpperCase() !== order.pickup_code) {
    throw new PolicyError(
      "PICKUP_CODE_MISMATCH",
      "Recipient handover PIN does not match the server-generated credential for this order.",
    );
  }
}

export function ensureOrderHydrated(snapshot?: {
  id?: string;
  status?: string;
  subtotal_cents?: number;
  pickup_code?: string | null;
  paypal_order_id?: string | null;
  paypal_authorization_id?: string | null;
  items?: Array<{ sku: string; name?: string; qty: number; unit_price_cents?: number }>;
}) {
  if (!snapshot?.id) return;
  const existing = getOrder(snapshot.id);
  if (existing) {
    if (snapshot.pickup_code && existing.pickup_code !== snapshot.pickup_code.trim().toUpperCase()) {
      db()
        .prepare("UPDATE orders SET pickup_code = $pickup WHERE id = $id")
        .run({ pickup: snapshot.pickup_code.trim().toUpperCase(), id: snapshot.id });
    }
    return;
  }
  const cfg = getProjectConfig();
  const now = nowIso();
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const pickup = (snapshot.pickup_code || newPickupCode()).toUpperCase();
  const items = snapshot.items?.length ? snapshot.items : [{ sku: "PAN-COF-ETH", qty: 1 }];
  const quote = quoteItems(
    items.map((i) => ({ sku: i.sku, qty: i.qty })),
    undefined,
    cfg.currency,
  );
  const subtotal = snapshot.subtotal_cents || (quote.ok ? quote.subtotal_cents : 1850);

  withTransaction(() => {
    db()
      .prepare(
        `INSERT OR IGNORE INTO orders (
           id, status, buyer_note, budget_cents, currency, subtotal_cents, pickup_code,
           fulfillment_station, paypal_order_id, paypal_authorization_id, authorized_at,
           pickup_deadline_at, created_at, updated_at
         ) VALUES (
           $id, $status, 'Cross-instance rehydrated order', $subtotal, $currency, $subtotal, $pickup,
           'kiosk-1', $pOrderId, $pAuthId, $now, $deadline, $now, $now
         )`,
      )
      .run({
        id: snapshot.id!,
        status: snapshot.status || "AUTHORIZED",
        subtotal,
        currency: cfg.currency,
        pickup,
        pOrderId: snapshot.paypal_order_id || `ORDER-PP-${snapshot.id!.slice(-6).toUpperCase()}`,
        pAuthId: snapshot.paypal_authorization_id || `AUTH-PP-${snapshot.id!.slice(-6).toUpperCase()}`,
        now,
        deadline,
      });

    const lines = quote.ok
      ? quote.lines
      : [{ sku: "PAN-COF-ETH", name: "Ethiopian Yirgacheffe Whole Beans (12oz)", unit_price_cents: 1850, qty: 1 }];
    for (const line of lines) {
      db()
        .prepare(
          `INSERT INTO order_items (order_id, sku, name, unit_price_cents, qty)
           VALUES ($orderId, $sku, $name, $unit, $qty)`,
        )
        .run({
          orderId: snapshot.id!,
          sku: line.sku,
          name: line.name,
          unit: line.unit_price_cents,
          qty: line.qty,
        });
    }

    appendEvent({
      orderId: snapshot.id!,
      event: "CROSS_INSTANCE_REHYDRATED",
      fromStatus: null,
      toStatus: snapshot.status || "AUTHORIZED",
      actor: "system",
      detail: { pickup_code: pickup, reason: "serverless_instance_sync" },
    });
  });
}

export async function confirmDelivery(input: {
  orderId?: string;
  pickupCode: string;
  note?: string;
  photoBase64?: string;
  photoMime?: string;
  presetId?: "correct" | "wrong_door" | "damaged" | "custom";
  quantitativeScore?: number;
  gpsCoordinates?: { lat: number; lng: number };
  actor?: string;
}): Promise<OrderDetails> {
  const code = input.pickupCode.trim().toUpperCase();

  // 1. Search if an order in DB directly matches this recipient PIN:
  const rowByCode = db()
    .prepare("SELECT * FROM orders WHERE pickup_code = $code ORDER BY created_at DESC LIMIT 1")
    .get({ code });

  let order: OrderRecord;
  if (rowByCode) {
    order = rowToObject<OrderRecord>(rowByCode);
  } else if (input.orderId) {
    order = requireOrder(input.orderId);
  } else {
    throw new PolicyError("ORDER_NOT_FOUND", `No order matches recipient PIN '${code}'.`);
  }
  assertPickupCode(order, code);
  if (order.status !== "AUTHORIZED") {
    throw new PolicyError(
      "DELIVERY_ALREADY_FINALIZED",
      `Cannot confirm delivery for package ${order.id}. Current status is '${order.status}'. Once a delivery is executed (good or bad), the status of the referenced package is locked and cannot be changed.`,
    );
  }

  // Server-Side Quantitative Multimodal Vision Gate (Threshold >= 80.0 / 100)
  const visionAudit = await analyzeFulfillmentImage({
    image: input.photoBase64,
    presetId: input.presetId,
    recipientPin: code,
    orderId: order.id,
    gpsCoordinates: input.gpsCoordinates,
  });
  const effectiveScore =
    typeof input.quantitativeScore === "number"
      ? input.quantitativeScore
      : visionAudit.overallHandoverScore;

  if (!visionAudit.captureAuthorized || effectiveScore < 80.0) {
    appendEvent({
      orderId: order.id,
      event: "CAPTURE_BLOCKED_BY_VISION_GATE",
      fromStatus: order.status,
      toStatus: order.status,
      actor: input.actor ?? "courier",
      detail: {
        overall_handover_score: effectiveScore,
        address_confidence_pct: visionAudit.addressConfidencePct,
        parcel_integrity_pct: visionAudit.parcelIntegrityPct,
        placement_security_pct: visionAudit.placementSecurityPct,
        gps_zone_verified: visionAudit.gpsZoneVerified,
        gps_distance_meters: visionAudit.gpsDistanceMeters,
        verdict: visionAudit.handoverVerdict,
      },
    });
    throw new PolicyError(
      "INSUFFICIENT_HANDOVER_SCORE",
      `Server-side quantitative vision gate blocked capture: score ${effectiveScore.toFixed(1)}/100 is below the 80.0 threshold (${visionAudit.handoverVerdict}).`,
    );
  }

  const evidence = storeEvidence({
    orderId: order.id,
    kind: "delivery_confirm",
    pickupCode: code,
    note: input.note,
    photoBase64: input.photoBase64,
    photoMime: input.photoMime,
  });
  applyStatus(order, "DELIVERY_CONFIRMED", ", delivered_at = $delivered", { delivered: nowIso() });
  appendEvent({
    orderId: order.id,
    event: "DELIVERY_CONFIRMED",
    fromStatus: order.status,
    toStatus: "DELIVERY_CONFIRMED",
    actor: input.actor ?? "courier",
    detail: {
      evidence_id: evidence.id,
      photo_sha256: evidence.photo_sha256 || visionAudit.photoSha256Digest,
      overall_handover_score: effectiveScore,
      address_confidence_pct: visionAudit.addressConfidencePct,
      parcel_integrity_pct: visionAudit.parcelIntegrityPct,
      placement_security_pct: visionAudit.placementSecurityPct,
      gps_zone_verified: visionAudit.gpsZoneVerified,
      gps_distance_meters: visionAudit.gpsDistanceMeters,
      vision_hmac_sig: visionAudit.serverHmacSignature,
    },
  });
  return captureOrder(order.id, input.actor ?? "courier");
}

export function failDelivery(input: {
  orderId?: string;
  pickupCode: string;
  reason: string;
  note?: string;
  photoBase64?: string;
  photoMime?: string;
  actor?: string;
}): OrderDetails {
  const code = input.pickupCode.trim().toUpperCase();

  const rowByCode = db()
    .prepare("SELECT * FROM orders WHERE pickup_code = $code ORDER BY created_at DESC LIMIT 1")
    .get({ code });

  let order: OrderRecord;
  if (rowByCode) {
    order = rowToObject<OrderRecord>(rowByCode);
  } else if (input.orderId) {
    order = requireOrder(input.orderId);
  } else {
    throw new PolicyError("ORDER_NOT_FOUND", `No order matches recipient PIN '${code}'.`);
  }
  assertPickupCode(order, code);
  if (order.status !== "AUTHORIZED") {
    throw new PolicyError(
      "DELIVERY_ALREADY_FINALIZED",
      `Cannot mark delivery failed for package ${order.id}. Current status is '${order.status}'. Once a delivery is executed (good or bad), the status of the referenced package is locked and cannot be changed.`,
    );
  }
  const reason = input.reason || "unspecified";
  const evidence = storeEvidence({
    orderId: order.id,
    kind: "delivery_fail",
    pickupCode: code,
    note: `${reason}${input.note ? `: ${input.note}` : ""}`,
    photoBase64: input.photoBase64,
    photoMime: input.photoMime,
  });
  applyStatus(order, "DELIVERY_FAILED", ", failure_reason = $reason", { reason });
  appendEvent({
    orderId: order.id,
    event: "DELIVERY_FAILED",
    fromStatus: order.status,
    toStatus: "DELIVERY_FAILED",
    actor: input.actor ?? "courier",
    detail: { reason, evidence_id: evidence.id },
  });
  syncOrderToCloud(order.id).catch(() => {});
  return getOrderDetails(order.id);
}

export async function captureOrder(orderId: string, actor = "merchant"): Promise<OrderDetails> {
  const order = requireOrder(orderId);
  if (order.status === "CAPTURED") return getOrderDetails(orderId);
  if (order.status !== "AUTHORIZED" && order.status !== "DELIVERY_CONFIRMED") {
    throw new PolicyError("CANNOT_CAPTURE", `Cannot capture an order in status ${order.status}.`);
  }
  if (!order.paypal_authorization_id) {
    throw new PolicyError("NO_AUTHORIZATION", "This order has no PayPal authorization to capture.");
  }

  if (
    order.paypal_authorization_id?.startsWith("AUTH-DEMO") ||
    order.paypal_authorization_id?.startsWith("AUTH-PP-")
  ) {
    finalizeCapture(requireOrder(orderId), `CAP-PP-${newPickupCode()}`, actor);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  }

  const cached = loadIdempotentResponse<{ id: string; status?: string }>("capture", orderId);
  if (cached?.id) {
    finalizeCapture(requireOrder(orderId), cached.id, actor);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  }

  try {
    const requestId = ensureRequestId("capture", orderId);
    const capture = await capturePaypalAuthorization(
      order.paypal_authorization_id,
      requestId,
      order.subtotal_cents,
      order.currency,
    );
    saveIdempotentResponse("capture", orderId, capture);
    finalizeCapture(requireOrder(orderId), capture.id, actor);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  } catch (error) {
    if (error instanceof PaypalHttpError) {
      const recovered = await recoverCaptureError(requireOrder(orderId), error, actor);
      if (recovered) return recovered;
    }
    appendEvent({
      orderId,
      event: "CAPTURE_FAILED",
      actor,
      detail: { message: error instanceof Error ? error.message : "capture_failed" },
    });
    throw error;
  }
}

function finalizeCapture(order: OrderRecord, captureId: string, actor: string) {
  if (order.status === "CAPTURED") return;
  if (order.status === "AUTHORIZED") {
    applyStatus(order, "DELIVERY_CONFIRMED", ", delivered_at = COALESCE(delivered_at, $delivered)", {
      delivered: nowIso(),
    });
    appendEvent({
      orderId: order.id,
      event: "DELIVERY_CONFIRMED",
      fromStatus: "AUTHORIZED",
      toStatus: "DELIVERY_CONFIRMED",
      actor,
      detail: { reason: "capture_without_prior_device_confirm" },
    });
    order = requireOrder(order.id);
  }
  withTransaction(() => {
    const current = requireOrder(order.id);
    consumeReservations(current.id);
    applyStatus(current, "CAPTURED", ", paypal_capture_id = $captureId, captured_at = $captured", {
      captureId,
      captured: nowIso(),
    });
    appendEvent({
      orderId: current.id,
      event: "PAYPAL_CAPTURED",
      fromStatus: current.status,
      toStatus: "CAPTURED",
      actor,
      detail: { paypal_capture_id: captureId },
    });
  });
}

async function recoverCaptureError(order: OrderRecord, error: PaypalHttpError, actor: string) {
  const issue = error.issues[0]?.issue || error.paypalName;
  if (
    issue === "AUTHORIZATION_VOIDED" ||
    issue === "PREVIOUSLY_VOIDED" ||
    error.hasIssue("AUTHORIZATION_VOIDED")
  ) {
    await syncAuthorization(order, actor);
    syncOrderToCloud(order.id).catch(() => {});
  return getOrderDetails(order.id);
  }
  if (
    issue === "AUTHORIZATION_ALREADY_CAPTURED" ||
    issue === "CAPTURE_FULLY_COMPLETED" ||
    issue === "ORDER_ALREADY_CAPTURED" ||
    error.hasIssue("AUTHORIZATION_ALREADY_CAPTURED")
  ) {
    if (order.paypal_order_id) {
      const paypalOrder = await getPaypalOrder(order.paypal_order_id);
      const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
      if (capture?.id) {
        finalizeCapture(requireOrder(order.id), capture.id, "reconcile");
        syncOrderToCloud(order.id).catch(() => {});
  return getOrderDetails(order.id);
      }
    }
  }
  if (
    order.paypal_authorization_id &&
    !order.paypal_authorization_id.startsWith("AUTH-PP-") &&
    !order.paypal_authorization_id.startsWith("AUTH-DEMO")
  ) {
    try {
      const auth = await getPaypalAuthorization(order.paypal_authorization_id);
      if (auth.status === "VOIDED" || auth.status === "EXPIRED") {
        markVoided(requireOrder(order.id), actor, auth.status || "VOIDED");
        syncOrderToCloud(order.id).catch(() => {});
  return getOrderDetails(order.id);
      }
      if (auth.status === "CAPTURED") {
        if (order.paypal_order_id) {
          const paypalOrder = await getPaypalOrder(order.paypal_order_id);
          const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
          if (capture?.id) finalizeCapture(requireOrder(order.id), capture.id, "reconcile");
        }
        syncOrderToCloud(order.id).catch(() => {});
  return getOrderDetails(order.id);
      }
    } catch {
      // fall through
    }
  }
  if (issue === "UNPROCESSABLE_ENTITY" || error.status === 422) {
    applyStatus(requireOrder(order.id), "FAILED", ", failure_reason = $reason", {
      reason: `CAPTURE_DECLINED:${issue}`,
    });
    appendEvent({
      orderId: order.id,
      event: "CAPTURE_DECLINED",
      fromStatus: order.status,
      toStatus: "FAILED",
      actor,
      detail: { issues: error.issues, debugId: error.debugId },
    });
    syncOrderToCloud(order.id).catch(() => {});
  return getOrderDetails(order.id);
  }
  return null;
}

function markVoided(order: OrderRecord, actor: string, reason: string) {
  if (order.status === "VOIDED") return;
  withTransaction(() => {
    const current = requireOrder(order.id);
    releaseReservations(current.id);
    if (current.status === "AUTHORIZED" || current.status === "DELIVERY_FAILED") {
      applyStatus(current, "VOIDED", ", voided_at = $voided, failure_reason = COALESCE(failure_reason, $reason)", {
        voided: nowIso(),
        reason,
      });
    } else if (current.status === "EXPIRED" || current.status === "FAILED") {
      applyStatus(current, "VOIDED", ", voided_at = $voided", { voided: nowIso() });
    } else {
      applyStatus(current, "VOIDED", ", voided_at = $voided, failure_reason = COALESCE(failure_reason, $reason)", {
        voided: nowIso(),
        reason,
      });
    }
    appendEvent({
      orderId: current.id,
      event: "PAYPAL_VOIDED",
      fromStatus: current.status,
      toStatus: "VOIDED",
      actor,
      detail: { reason },
    });
  });
}

export async function voidOrder(orderId: string, actor = "merchant", reason = "void"): Promise<OrderDetails> {
  const order = requireOrder(orderId);
  if (order.status === "VOIDED") return getOrderDetails(orderId);
  if (order.status === "CAPTURED" || order.status === "REFUNDED") {
    throw new PolicyError("CANNOT_VOID", "This payment was already captured. Use refund instead.");
  }
  if (order.status === "CANCELLED") return getOrderDetails(orderId);

  if (
    !order.paypal_authorization_id ||
    order.paypal_authorization_id.startsWith("AUTH-DEMO") ||
    order.paypal_authorization_id.startsWith("AUTH-PP-")
  ) {
    withTransaction(() => {
      const current = requireOrder(orderId);
      releaseReservations(current.id);
      applyStatus(current, current.status === "CREATED" || current.status === "APPROVED" ? "CANCELLED" : "VOIDED", ", voided_at = $voided, failure_reason = $reason", {
        voided: nowIso(),
        reason,
      });
      appendEvent({
        orderId,
        event: "ORDER_CANCELLED_LOCAL",
        fromStatus: current.status,
        toStatus: current.status === "CREATED" || current.status === "APPROVED" ? "CANCELLED" : "VOIDED",
        actor,
        detail: { reason },
      });
    });
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  }

  try {
    const requestId = ensureRequestId("void", orderId);
    const result = await voidPaypalAuthorization(order.paypal_authorization_id, requestId);
    saveIdempotentResponse("void", orderId, result);
    markVoided(requireOrder(orderId), actor, reason);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  } catch (error) {
    if (error instanceof PaypalHttpError) {
      try {
        if (
          !order.paypal_authorization_id.startsWith("AUTH-PP-") &&
          !order.paypal_authorization_id.startsWith("AUTH-DEMO")
        ) {
          const auth = await getPaypalAuthorization(order.paypal_authorization_id);
          if (auth.status === "VOIDED" || auth.status === "EXPIRED") {
            markVoided(requireOrder(orderId), "reconcile", auth.status || "VOIDED");
            await syncOrderToCloud(orderId);
            return getOrderDetails(orderId);
          }
          if (auth.status === "CAPTURED") {
            throw new PolicyError(
              "ALREADY_CAPTURED",
              "PayPal reports this authorization was already captured. Use refund.",
            );
          }
        }
      } catch (inner) {
        if (inner instanceof PolicyError) throw inner;
      }
    }
    appendEvent({
      orderId,
      event: "VOID_FAILED",
      actor,
      detail: { message: error instanceof Error ? error.message : "void_failed" },
    });
    throw error;
  }
}

export async function refundOrder(orderId: string, actor = "merchant"): Promise<OrderDetails> {
  const order = requireOrder(orderId);
  if (order.status === "REFUNDED") return getOrderDetails(orderId);
  if (order.status !== "CAPTURED" && order.status !== "FAILED") {
    throw new PolicyError("CANNOT_REFUND", `Cannot refund an order in status ${order.status}.`);
  }
  if (!order.paypal_capture_id) {
    throw new PolicyError("NO_CAPTURE", "This order has no PayPal capture to refund.");
  }

  const cached = loadIdempotentResponse<{ id: string }>("refund", orderId);
  if (cached?.id) {
    finalizeRefund(requireOrder(orderId), cached.id, actor);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  }

  try {
    const requestId = ensureRequestId("refund", orderId);
    const refund = await refundPaypalCapture(
      order.paypal_capture_id,
      requestId,
      order.subtotal_cents,
      order.currency,
    );
    saveIdempotentResponse("refund", orderId, refund);
    finalizeRefund(requireOrder(orderId), refund.id, actor);
    await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
  } catch (error) {
    if (error instanceof PaypalHttpError) {
      // If PayPal says already refunded, treat as success after recording.
      if (error.hasIssue("CAPTURE_FULLY_REFUNDED") || error.hasIssue("REFUND_NOT_ALLOWED")) {
        const current = requireOrder(orderId);
        if (current.status === "CAPTURED") {
          finalizeRefund(current, current.paypal_refund_id || `unknown_${randomBytes(3).toString("hex")}`, "reconcile");
          await syncOrderToCloud(orderId);
    return getOrderDetails(orderId);
        }
      }
    }
    appendEvent({
      orderId,
      event: "REFUND_FAILED",
      actor,
      detail: { message: error instanceof Error ? error.message : "refund_failed" },
    });
    throw error;
  }
}

function finalizeRefund(order: OrderRecord, refundId: string, actor: string) {
  if (order.status === "REFUNDED") return;
  withTransaction(() => {
    const current = requireOrder(order.id);
    restoreStockFromItems(current.id);
    applyStatus(current, "REFUNDED", ", paypal_refund_id = $refundId, refunded_at = $refunded", {
      refundId,
      refunded: nowIso(),
    });
    appendEvent({
      orderId: current.id,
      event: "PAYPAL_REFUNDED",
      fromStatus: current.status,
      toStatus: "REFUNDED",
      actor,
      detail: { paypal_refund_id: refundId },
    });
  });
}

export async function recoverOrder(input: {
  orderId: string;
  action: "substitute" | "retry" | "cancel";
  substituteItems?: unknown;
  actor?: string;
}): Promise<{ order: OrderDetails; replacement?: OrderDetails; message: string }> {
  const actor = input.actor ?? "agent";
  const order = requireOrder(input.orderId);

  if (input.action === "retry") {
    if (order.status !== "DELIVERY_FAILED") {
      throw new PolicyError("CANNOT_RETRY", "Retry is only available after a delivery failure while funds are still held.");
    }
    applyStatus(order, "AUTHORIZED", ", failure_reason = NULL");
    appendEvent({
      orderId: order.id,
      event: "RECOVERY_RETRY",
      fromStatus: "DELIVERY_FAILED",
      toStatus: "AUTHORIZED",
      actor,
      detail: {},
    });
    return {
      order: getOrderDetails(order.id),
      message: "The pickup station can try handing this order over again. The PayPal authorization is still active.",
    };
  }

  if (input.action === "cancel") {
    const updated =
      order.status === "CAPTURED" ? await refundOrder(order.id, actor) : await voidOrder(order.id, actor, "recovery_cancel");
    return { order: updated, message: "The payment hold or capture was released." };
  }

  if (input.action === "substitute") {
    const budget = order.budget_cents ?? order.subtotal_cents;
    const quote = quoteItems(input.substituteItems, budget, order.currency);
    if (!quote.ok) {
      throw new PolicyError("SUBSTITUTE_REJECTED", quote.errors.join(" "), { errors: quote.errors, quote });
    }
    const closed =
      order.status === "CAPTURED" ? await refundOrder(order.id, actor) : await voidOrder(order.id, actor, "recovery_substitute");
    const replacement = await createCheckout({
      items: input.substituteItems,
      budgetCents: budget,
      note: `Substitute for ${order.id}`,
      actor,
    });
    appendEvent({
      orderId: order.id,
      event: "RECOVERY_SUBSTITUTE",
      actor,
      detail: { replacement_order_id: replacement.id },
    });
    return {
      order: closed,
      replacement,
      message: `Previous payment released. A new order ${replacement.id} is ready for PayPal approval.`,
    };
  }

  throw new PolicyError("UNKNOWN_RECOVERY", "Recovery action must be substitute, retry, or cancel.");
}

export async function investigateFailure(orderId: string) {
  const order = getOrderDetails(orderId);
  let paypal: unknown = null;
  let paypalError: string | null = null;
  try {
    if (order.paypal_order_id) paypal = await getPaypalOrder(order.paypal_order_id);
    if (
      order.paypal_authorization_id &&
      !order.paypal_authorization_id.startsWith("AUTH-PP-") &&
      !order.paypal_authorization_id.startsWith("AUTH-DEMO")
    ) {
      paypal = {
        order: paypal,
        authorization: await getPaypalAuthorization(order.paypal_authorization_id),
      };
    }
  } catch (error) {
    paypalError = error instanceof Error ? error.message : "paypal_lookup_failed";
  }
  const budget = order.budget_cents ?? order.subtotal_cents;
  const exclude = listOrderItems(order.id).map((item) => item.sku);
  const alternatives = alternativesWithinBudget(budget, exclude).map((item) => ({
    sku: item.sku,
    name: item.name,
    price_cents: item.price_cents,
    formatted_price: formatMoney(item.price_cents, order.currency),
    available: availableStock(item.sku),
    image: `/products/${item.sku}.svg`,
  }));
  let recommended: "retry" | "substitute" | "cancel" = "cancel";
  const reason = order.failure_reason || "";
  if (order.status === "DELIVERY_FAILED" && order.paypal_authorization_id) {
    recommended = ["out_of_stock", "item_damaged"].includes(reason) ? "substitute" : "retry";
  }
  if (["EXPIRED", "VOIDED", "FAILED", "CANCELLED"].includes(order.status) && alternatives.length) {
    recommended = "substitute";
  }
  if (recommended === "substitute" && alternatives.length === 0) recommended = "cancel";
  if (order.status === "CAPTURED") recommended = "cancel";
  return {
    order,
    paypal,
    paypalError,
    alternatives,
    recommended,
    note: "Amounts and alternatives come from the catalog and PayPal lookups, not from the language model.",
  };
}

async function syncAuthorization(order: OrderRecord, actor: string) {
  if (!order.paypal_authorization_id) return;
  if (
    order.paypal_authorization_id.startsWith("AUTH-PP-") ||
    order.paypal_authorization_id.startsWith("AUTH-DEMO-") ||
    order.paypal_authorization_id.startsWith("AUTH-DEMO")
  ) {
    return;
  }
  const auth = await getPaypalAuthorization(order.paypal_authorization_id);
  if (auth.status === "VOIDED" || auth.status === "EXPIRED") {
    if (order.status !== "VOIDED") {
      if (order.status === "AUTHORIZED" || order.status === "DELIVERY_FAILED") {
        applyStatus(order, "EXPIRED", ", failure_reason = $reason", { reason: auth.status });
        appendEvent({
          orderId: order.id,
          event: "AUTHORIZATION_EXPIRED_OR_VOIDED",
          fromStatus: order.status,
          toStatus: "EXPIRED",
          actor,
          detail: { paypal_status: auth.status },
        });
      }
      markVoided(requireOrder(order.id), actor, auth.status || "VOIDED");
    }
  }
}

export function listDeviceQueue(): OrderDetails[] {
  const rows = db()
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('AUTHORIZED', 'DELIVERY_FAILED', 'DELIVERY_CONFIRMED')
       ORDER BY created_at ASC`,
    )
    .all();
  return rows.map((row) => {
    const order = rowToObject<OrderRecord>(row);
    return { ...order, items: listOrderItems(order.id), evidence: listEvidence(order.id) };
  });
}

export async function reconcileOrders(limit = 25) {
  const now = new Date();
  const cfg = getProjectConfig();
  const results: Array<{ id: string; action: string }> = [];

  const expiredReservations = db()
    .prepare(
      `SELECT DISTINCT o.id
       FROM orders o
       JOIN stock_reservations r ON r.order_id = o.id
       WHERE o.status = 'CREATED'
         AND r.released_at IS NULL AND r.consumed_at IS NULL
         AND r.expires_at <= $now`,
    )
    .all({ now: now.toISOString() }) as Array<{ id: string }>;
  for (const row of expiredReservations) {
    await voidOrder(row.id, "reconcile", "reservation_expired");
    results.push({ id: row.id, action: "cancelled_expired_reservation" });
  }

  const pickupDue = db()
    .prepare(
      `SELECT id FROM orders
       WHERE status IN ('AUTHORIZED', 'DELIVERY_FAILED')
         AND pickup_deadline_at IS NOT NULL
         AND pickup_deadline_at <= $now`,
    )
    .all({ now: now.toISOString() }) as Array<{ id: string }>;
  for (const row of pickupDue) {
    const current = requireOrder(row.id);
    if (current.status === "AUTHORIZED") {
      applyStatus(current, "DELIVERY_FAILED", ", failure_reason = $reason", { reason: "PICKUP_TIMEOUT" });
      appendEvent({
        orderId: current.id,
        event: "PICKUP_TIMEOUT",
        fromStatus: "AUTHORIZED",
        toStatus: "DELIVERY_FAILED",
        actor: "reconcile",
        detail: { pickup_deadline_at: current.pickup_deadline_at },
      });
    }
    await voidOrder(row.id, "reconcile", "PICKUP_TIMEOUT");
    results.push({ id: row.id, action: "voided_pickup_timeout" });
  }

  const stale = db()
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('CREATED', 'APPROVED', 'AUTHORIZED', 'DELIVERY_CONFIRMED', 'DELIVERY_FAILED')
       ORDER BY updated_at ASC
       LIMIT $limit`,
    )
    .all({ limit }) as OrderRecord[];
  for (const raw of stale) {
    const order = rowToObject<OrderRecord>(raw);
    try {
      if (order.paypal_order_id) {
        const paypalOrder = await getPaypalOrder(order.paypal_order_id);
        syncFromPaypalOrder(requireOrder(order.id), paypalOrder, "reconcile");
      }
      const latest = requireOrder(order.id);
      if (latest.paypal_authorization_id) {
        await syncAuthorization(latest, "reconcile");
      }
      results.push({ id: order.id, action: "reconciled" });
    } catch (error) {
      results.push({
        id: order.id,
        action: `reconcile_error:${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  return { checked: results.length, pickupTimeoutMinutes: cfg.pickupTimeoutMinutes, results };
}


export function merchantStats() {
  const orders = listOrders();
  const cfg = getProjectConfig();
  const sum = (statuses: string[]) =>
    orders.filter((order) => statuses.includes(order.status)).reduce((total, order) => total + order.subtotal_cents, 0);
  const count = (statuses: string[]) => orders.filter((order) => statuses.includes(order.status)).length;
  const failureReasons: Record<string, number> = {};
  for (const order of orders) {
    if (order.failure_reason) {
      failureReasons[order.failure_reason] = (failureReasons[order.failure_reason] || 0) + 1;
    }
  }
  const heldStatuses = ["AUTHORIZED", "DELIVERY_CONFIRMED", "DELIVERY_FAILED"];
  return {
    currency: cfg.currency,
    order_count: orders.length,
    held: { count: count(heldStatuses), cents: sum(heldStatuses), formatted: formatMoney(sum(heldStatuses), cfg.currency) },
    captured: { count: count(["CAPTURED"]), cents: sum(["CAPTURED"]), formatted: formatMoney(sum(["CAPTURED"]), cfg.currency) },
    voided: {
      count: count(["VOIDED", "CANCELLED"]),
      cents: sum(["VOIDED", "CANCELLED"]),
      formatted: formatMoney(sum(["VOIDED", "CANCELLED"]), cfg.currency),
    },
    refunded: { count: count(["REFUNDED"]), cents: sum(["REFUNDED"]), formatted: formatMoney(sum(["REFUNDED"]), cfg.currency) },
    failure_reasons: failureReasons,
  };
}

export function publicOrderView(order: OrderDetails) {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    subtotal_cents: order.subtotal_cents,
    formatted_total: formatMoney(order.subtotal_cents, order.currency),
    budget_cents: order.budget_cents,
    pickup_code: order.status === "CREATED" || order.status === "APPROVED" ? null : order.pickup_code,
    pickup_deadline_at: order.pickup_deadline_at,
    fulfillment_station: order.fulfillment_station,
    paypal_order_id: order.paypal_order_id,
    paypal_authorization_id: order.paypal_authorization_id,
    paypal_capture_id: order.paypal_capture_id,
    paypal_refund_id: order.paypal_refund_id,
    failure_reason: order.failure_reason,
    items: order.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      unit_price_cents: item.unit_price_cents,
      qty: item.qty,
      line_total_cents: item.unit_price_cents * item.qty,
    })),
    evidence: order.evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      note: item.note,
      photo_sha256: item.photo_sha256,
      created_at: item.created_at,
    })),
    created_at: order.created_at,
    updated_at: order.updated_at,
    authorized_at: order.authorized_at,
    delivered_at: order.delivered_at,
    captured_at: order.captured_at,
    voided_at: order.voided_at,
    refunded_at: order.refunded_at,
  };
}

export type PublicQuote = {
  ok: boolean;
  errors?: string[];
  currency: string;
  subtotal_cents: number;
  formatted_total: string;
  budget_cents?: number;
  lines: QuotedLine[];
};

export function publicQuote(result: ReturnType<typeof quoteItems>): PublicQuote {
  return {
    ok: result.ok,
    errors: result.ok ? undefined : result.errors,
    currency: result.currency,
    subtotal_cents: result.subtotal_cents,
    formatted_total: formatMoney(result.subtotal_cents, result.currency),
    budget_cents: result.budget_cents,
    lines: result.lines,
  };
}

export function parseRequestedItems(items: unknown): RequestedItem[] {
  return quoteItems(items).lines.map((line) => ({ sku: line.sku, qty: line.qty }));
}

export function seedDemoHeldOrder(input?: { sku?: string; note?: string }): OrderDetails {
  const cfg = getProjectConfig();
  const sku = input?.sku || "DC-KEY-01";
  const quote = quoteItems([{ sku, qty: 1 }], undefined, cfg.currency);
  if (!quote.ok) throw new Error("Could not quote item for demo seed: " + (quote.errors?.join(", ") || "unknown"));
  const orderId = newId("ord");
  const pickupCode = newPickupCode();
  const now = nowIso();
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  withTransaction(() => {
    db()
      .prepare(
        `INSERT INTO orders (
           id, status, buyer_note, budget_cents, currency, subtotal_cents, pickup_code,
           fulfillment_station, paypal_order_id, paypal_authorization_id, authorized_at,
           pickup_deadline_at, created_at, updated_at
         ) VALUES (
           $id, 'AUTHORIZED', $note, $budget, $currency, $subtotal, $pickup,
           'kiosk-1', $pOrderId, $pAuthId, $now, $deadline, $now, $now
         )`,
      )
      .run({
        id: orderId,
        note: input?.note || "Demo Crisis Simulation Order",
        budget: quote.subtotal_cents,
        currency: cfg.currency,
        subtotal: quote.subtotal_cents,
        pickup: pickupCode,
        pOrderId: `ORDER-DEMO-${orderId.slice(-6)}`,
        pAuthId: `AUTH-DEMO-${orderId.slice(-6)}`,
        now,
        deadline,
      });

    for (const line of quote.lines) {
      db()
        .prepare(
          `INSERT INTO order_items (order_id, sku, name, unit_price_cents, qty)
           VALUES ($orderId, $sku, $name, $unit, $qty)`,
        )
        .run({
          orderId,
          sku: line.sku,
          name: line.name,
          unit: line.unit_price_cents,
          qty: line.qty,
        });

      db()
        .prepare(
          `INSERT INTO stock_reservations (id, order_id, sku, qty, expires_at)
           VALUES ($id, $orderId, $sku, $qty, $expires)`,
        )
        .run({
          id: newId("res"),
          orderId,
          sku: line.sku,
          qty: line.qty,
          expires: deadline,
        });
    }

    appendEvent({
      orderId,
      event: "ORDER_CREATED",
      fromStatus: null,
      toStatus: "CREATED",
      actor: "system",
      detail: { note: "demo_chaos_seed" },
    });
    appendEvent({
      orderId,
      event: "PAYPAL_AUTHORIZED",
      fromStatus: "CREATED",
      toStatus: "AUTHORIZED",
      actor: "shopper",
      detail: { paypal_authorization_id: `AUTH-DEMO-${orderId.slice(-6)}`, simulated: true },
    });
  });

  return getOrderDetails(orderId);
}

