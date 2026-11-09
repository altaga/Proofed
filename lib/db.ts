import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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

type GlobalDb = typeof globalThis & { __proofedDb?: DatabaseSync; __proofedDbPath?: string };

function resolveDbPath(): string {
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
  db.exec("PRAGMA journal_mode = WAL;");
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
