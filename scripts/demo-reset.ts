import { seedCatalog } from "../lib/catalog-seed";
import { closeDb, getDb } from "../lib/db";

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
closeDb();
console.log("Demo reset complete: catalog restored to seed stock, orders and chats cleared.");
