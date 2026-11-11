import { handleRouteError, jsonOk } from "@/lib/http";
import { getDb, resetCloudDb } from "@/lib/db";
import { seedCatalog } from "@/lib/catalog-seed";

export async function POST() {
  try {
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
    await resetCloudDb();
    return jsonOk({ ok: true, message: "Demo catalog and order states successfully reset to pristine state." });
  } catch (error) {
    return handleRouteError(error);
  }
}
