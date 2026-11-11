import { existsSync, readFileSync } from "node:fs";
import { seedCatalog } from "../lib/catalog-seed";
import { closeDb, getDb, resetCloudDb } from "../lib/db";

function loadLocalEnv() {
  const path = ".env";
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const db = getDb();
db.exec(`
  DELETE FROM evidence;
  DELETE FROM event_log;
  DELETE FROM stock_reservations;
  DELETE FROM order_items;
  DELETE FROM paypal_idempotency;
  DELETE FROM webhook_events;
  DELETE FROM orders;
  DELETE FROM agent_messages;
  DELETE FROM agent_sessions;
`);
seedCatalog(true);

async function performReset() {
  await resetCloudDb();
  await maybeSeedLiveHolds();
}

async function maybeSeedLiveHolds() {
  if (!process.argv.includes("--live-holds")) return;
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    console.log("Skipped live holds: PayPal credentials are not set.");
    return;
  }
  const { createCheckout } = await import("../lib/orders");
  for (const sku of ["DC-KEY-01", "DC-PIN-01"]) {
    const order = await createCheckout({
      items: [{ sku, qty: 1 }],
      budgetCents: 2000,
      note: "demo reset live hold",
      actor: "system",
    });
    console.log(`Seeded real CREATED order ${order.id} (PayPal id present: ${Boolean(order.paypal_order_id)})`);
  }
}

performReset()
  .then(() => {
    closeDb();
    console.log("Demo reset complete: catalog restored to seed stock, orders and chats cleared.");
  })
  .catch((error) => {
    closeDb();
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
