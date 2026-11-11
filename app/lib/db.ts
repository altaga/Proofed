import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createClient, type Client } from "@libsql/client";

export type SqlRow = Record<string, unknown>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS catalog_items (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  category TEXT NOT NULL,
  stock INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  buyer_note TEXT,
  budget_cents INTEGER,
  currency TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  pickup_code TEXT NOT NULL,
  pickup_deadline_at TEXT,
  fulfillment_station TEXT NOT NULL DEFAULT 'kiosk-1',
  paypal_order_id TEXT,
  paypal_authorization_id TEXT,
  paypal_capture_id TEXT,
  paypal_refund_id TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  authorized_at TEXT,
  delivered_at TEXT,
  captured_at TEXT,
  voided_at TEXT,
  refunded_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS stock_reservations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  qty INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  released_at TEXT,
  consumed_at TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  pickup_code TEXT,
  note TEXT,
  photo_sha256 TEXT,
  photo_mime TEXT,
  photo_bytes INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paypal_idempotency (
  operation TEXT NOT NULL,
  order_id TEXT NOT NULL,
  paypal_request_id TEXT NOT NULL,
  response_json TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (operation, order_id)
);

CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  paypal_event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  verification TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_trace_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_paypal_order ON orders(paypal_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_paypal_auth ON orders(paypal_authorization_id);
CREATE INDEX IF NOT EXISTS idx_orders_pickup ON orders(pickup_code);
CREATE INDEX IF NOT EXISTS idx_events_order ON event_log(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_order ON stock_reservations(order_id);
`;

type GlobalDb = typeof globalThis & {
  __proofedDb?: DatabaseSync;
  __proofedDbPath?: string;
  __libsqlClient?: Client;
  __libsqlSchemaReady?: boolean;
};

export function isCloudDbEnabled(): boolean {
  return Boolean(process.env.TURSO_DATABASE_URL || process.env.TURSO_URL);
}

export function getLibsqlClient(): Client | null {
  const url = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) return null;
  const g = globalThis as GlobalDb;
  if (!g.__libsqlClient) {
    g.__libsqlClient = createClient({
      url,
      authToken,
    });
  }
  return g.__libsqlClient;
}

export async function ensureCloudSchema(): Promise<void> {
  const client = getLibsqlClient();
  if (!client) return;
  const g = globalThis as GlobalDb;
  if (g.__libsqlSchemaReady) return;

  const statements = SCHEMA.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await client.execute(statement);
    } catch {
      // Ignore if table/index exists
    }
  }
  g.__libsqlSchemaReady = true;
}

export async function syncOrderToCloud(orderId: string): Promise<void> {
  const client = getLibsqlClient();
  if (!client) return;
  try {
    await ensureCloudSchema();
    const db = getDb();
    const orderRow = db.prepare("SELECT * FROM orders WHERE id = $id").get({ id: orderId }) as Record<string, unknown> | undefined;
    if (!orderRow) return;

    await client.execute({
      sql: `INSERT INTO orders (
              id, status, buyer_note, budget_cents, currency, subtotal_cents, pickup_code,
              pickup_deadline_at, fulfillment_station, paypal_order_id, paypal_authorization_id,
              paypal_capture_id, paypal_refund_id, failure_reason, created_at, updated_at,
              authorized_at, delivered_at, captured_at, voided_at, refunded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              status = excluded.status,
              buyer_note = excluded.buyer_note,
              budget_cents = excluded.budget_cents,
              currency = excluded.currency,
              subtotal_cents = excluded.subtotal_cents,
              pickup_code = excluded.pickup_code,
              pickup_deadline_at = excluded.pickup_deadline_at,
              fulfillment_station = excluded.fulfillment_station,
              paypal_order_id = excluded.paypal_order_id,
              paypal_authorization_id = excluded.paypal_authorization_id,
              paypal_capture_id = excluded.paypal_capture_id,
              paypal_refund_id = excluded.paypal_refund_id,
              failure_reason = excluded.failure_reason,
              updated_at = excluded.updated_at,
              authorized_at = excluded.authorized_at,
              delivered_at = excluded.delivered_at,
              captured_at = excluded.captured_at,
              voided_at = excluded.voided_at,
              refunded_at = excluded.refunded_at;`,
      args: [
        orderRow.id as string,
        orderRow.status as string,
        (orderRow.buyer_note as string) ?? null,
        (orderRow.budget_cents as number) ?? null,
        orderRow.currency as string,
        orderRow.subtotal_cents as number,
        orderRow.pickup_code as string,
        (orderRow.pickup_deadline_at as string) ?? null,
        orderRow.fulfillment_station as string,
        (orderRow.paypal_order_id as string) ?? null,
        (orderRow.paypal_authorization_id as string) ?? null,
        (orderRow.paypal_capture_id as string) ?? null,
        (orderRow.paypal_refund_id as string) ?? null,
        (orderRow.failure_reason as string) ?? null,
        orderRow.created_at as string,
        orderRow.updated_at as string,
        (orderRow.authorized_at as string) ?? null,
        (orderRow.delivered_at as string) ?? null,
        (orderRow.captured_at as string) ?? null,
        (orderRow.voided_at as string) ?? null,
        (orderRow.refunded_at as string) ?? null,
      ],
    });

    const items = db.prepare("SELECT * FROM order_items WHERE order_id = $id").all({ id: orderId }) as Array<Record<string, unknown>>;
    for (const item of items) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO order_items (order_id, sku, name, unit_price_cents, qty)
              VALUES (?, ?, ?, ?, ?);`,
        args: [
          item.order_id as string,
          item.sku as string,
          item.name as string,
          item.unit_price_cents as number,
          item.qty as number,
        ],
      });
    }

    const events = db.prepare("SELECT * FROM event_log WHERE order_id = $id").all({ id: orderId }) as Array<Record<string, unknown>>;
    for (const ev of events) {
      await client.execute({
        sql: `INSERT OR IGNORE INTO event_log (order_id, event, from_status, to_status, actor, detail_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?);`,
        args: [
          ev.order_id as string,
          ev.event as string,
          (ev.from_status as string) ?? null,
          (ev.to_status as string) ?? null,
          ev.actor as string,
          ev.detail_json as string,
          ev.created_at as string,
        ],
      });
    }
  } catch (error) {
    console.warn("[Turso Cloud Sync] Warning: Failed to sync order to cloud:", error);
  }
}

export async function syncOrderFromCloud(orderId: string): Promise<boolean> {
  const client = getLibsqlClient();
  if (!client) return false;
  try {
    await ensureCloudSchema();
    const res = await client.execute({
      sql: "SELECT * FROM orders WHERE id = ?;",
      args: [orderId],
    });
    if (!res.rows || res.rows.length === 0) return false;
    const cloudOrder = res.rows[0] as Record<string, unknown>;

    const db = getDb();
    db.prepare(
      `INSERT INTO orders (
         id, status, buyer_note, budget_cents, currency, subtotal_cents, pickup_code,
         pickup_deadline_at, fulfillment_station, paypal_order_id, paypal_authorization_id,
         paypal_capture_id, paypal_refund_id, failure_reason, created_at, updated_at,
         authorized_at, delivered_at, captured_at, voided_at, refunded_at
       ) VALUES (
         $id, $status, $buyer_note, $budget_cents, $currency, $subtotal_cents, $pickup_code,
         $pickup_deadline_at, $fulfillment_station, $paypal_order_id, $paypal_authorization_id,
         $paypal_capture_id, $paypal_refund_id, $failure_reason, $created_at, $updated_at,
         $authorized_at, $delivered_at, $captured_at, $voided_at, $refunded_at
       ) ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         buyer_note = excluded.buyer_note,
         budget_cents = excluded.budget_cents,
         currency = excluded.currency,
         subtotal_cents = excluded.subtotal_cents,
         pickup_code = excluded.pickup_code,
         pickup_deadline_at = excluded.pickup_deadline_at,
         fulfillment_station = excluded.fulfillment_station,
         paypal_order_id = excluded.paypal_order_id,
         paypal_authorization_id = excluded.paypal_authorization_id,
         paypal_capture_id = excluded.paypal_capture_id,
         paypal_refund_id = excluded.paypal_refund_id,
         failure_reason = excluded.failure_reason,
         updated_at = excluded.updated_at,
         authorized_at = excluded.authorized_at,
         delivered_at = excluded.delivered_at,
         captured_at = excluded.captured_at,
         voided_at = excluded.voided_at,
         refunded_at = excluded.refunded_at;`,
    ).run({
      id: cloudOrder.id as string,
      status: cloudOrder.status as string,
      buyer_note: (cloudOrder.buyer_note as string) ?? null,
      budget_cents: (cloudOrder.budget_cents as number) ?? null,
      currency: cloudOrder.currency as string,
      subtotal_cents: cloudOrder.subtotal_cents as number,
      pickup_code: cloudOrder.pickup_code as string,
      pickup_deadline_at: (cloudOrder.pickup_deadline_at as string) ?? null,
      fulfillment_station: cloudOrder.fulfillment_station as string,
      paypal_order_id: (cloudOrder.paypal_order_id as string) ?? null,
      paypal_authorization_id: (cloudOrder.paypal_authorization_id as string) ?? null,
      paypal_capture_id: (cloudOrder.paypal_capture_id as string) ?? null,
      paypal_refund_id: (cloudOrder.paypal_refund_id as string) ?? null,
      failure_reason: (cloudOrder.failure_reason as string) ?? null,
      created_at: cloudOrder.created_at as string,
      updated_at: cloudOrder.updated_at as string,
      authorized_at: (cloudOrder.authorized_at as string) ?? null,
      delivered_at: (cloudOrder.delivered_at as string) ?? null,
      captured_at: (cloudOrder.captured_at as string) ?? null,
      voided_at: (cloudOrder.voided_at as string) ?? null,
      refunded_at: (cloudOrder.refunded_at as string) ?? null,
    });

    const itemsRes = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?;",
      args: [orderId],
    });
    for (const item of itemsRes.rows) {
      db.prepare(
        `INSERT OR IGNORE INTO order_items (order_id, sku, name, unit_price_cents, qty)
         VALUES ($orderId, $sku, $name, $unit, $qty)`,
      ).run({
        orderId: item.order_id as string,
        sku: item.sku as string,
        name: item.name as string,
        unit: item.unit_price_cents as number,
        qty: item.qty as number,
      });
    }

    return true;
  } catch (error) {
    console.warn("[Turso Cloud Sync] Warning: Failed to fetch order from cloud:", error);
    return false;
  }
}

export async function syncOrderByPickupCodeFromCloud(pickupCode: string): Promise<boolean> {
  const client = getLibsqlClient();
  if (!client) return false;
  try {
    await ensureCloudSchema();
    const res = await client.execute({
      sql: "SELECT id FROM orders WHERE pickup_code = ? ORDER BY created_at DESC LIMIT 1;",
      args: [pickupCode.toUpperCase()],
    });
    if (!res.rows || res.rows.length === 0) return false;
    const cloudOrderId = res.rows[0].id as string;
    return syncOrderFromCloud(cloudOrderId);
  } catch (err) {
    console.warn("[Turso Cloud Sync] Warning: Failed to sync order by pickup code:", err);
    return false;
  }
}

export async function resetCloudDb(): Promise<void> {
  const client = getLibsqlClient();
  if (!client) return;
  try {
    await ensureCloudSchema();
    await client.batch([
      "DELETE FROM evidence;",
      "DELETE FROM event_log;",
      "DELETE FROM stock_reservations;",
      "DELETE FROM order_items;",
      "DELETE FROM paypal_idempotency;",
      "DELETE FROM webhook_events;",
      "DELETE FROM orders;",
      "DELETE FROM agent_messages;",
      "DELETE FROM agent_sessions;",
    ]);
  } catch (error) {
    console.warn("[Turso Cloud Sync] Warning: Failed to reset cloud database:", error);
  }
}

function resolveDbPath(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "app.sqlite");
  }
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  return path.join(process.cwd(), "data", "app.sqlite");
}

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalDb;
  const dbPath = resolveDbPath();
  if (g.__proofedDb && g.__proofedDbPath === dbPath) return g.__proofedDb;
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA journal_mode = WAL;");
  } catch {
    db.exec("PRAGMA journal_mode = MEMORY;");
  }
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  g.__proofedDb = db;
  g.__proofedDbPath = dbPath;
  return db;
}

export function closeDb() {
  const g = globalThis as GlobalDb;
  if (g.__proofedDb) {
    g.__proofedDb.close();
    g.__proofedDb = undefined;
    g.__proofedDbPath = undefined;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback failures
    }
    throw error;
  }
}

export function rowToObject<T>(row: unknown): T {
  return { ...(row as object) } as T;
}
