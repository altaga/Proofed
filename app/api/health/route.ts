import { getProjectConfig, envFlag } from "@/lib/config";
import { getDb } from "@/lib/db";
import { jsonOk } from "@/lib/http";

export async function GET() {
  getDb();
  const cfg = getProjectConfig();
  return jsonOk({
    ok: true,
    name: cfg.name,
    venueName: cfg.venueName,
    paypalConfigured: envFlag("PAYPAL_CLIENT_ID") && envFlag("PAYPAL_CLIENT_SECRET"),
    minimaxConfigured: envFlag("MINIMAX_API_KEY"),
    webhookConfigured: envFlag("PAYPAL_WEBHOOK_ID"),
  });
}
