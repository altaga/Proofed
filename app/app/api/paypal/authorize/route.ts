import { syncOrderFromCloud } from "@/lib/db";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { authorizeOrder, ensureOrderHydrated, publicOrderView } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orderId?: string;
      simulateApproval?: boolean;
      orderSnapshot?: {
        id?: string;
        status?: string;
        subtotal_cents?: number;
        pickup_code?: string | null;
        paypal_order_id?: string | null;
        paypal_authorization_id?: string | null;
        items?: Array<{ sku: string; name?: string; qty: number; unit_price_cents?: number }>;
      };
    }>(request);
    if (!body.orderId) return jsonError("MISSING_ORDER", "orderId is required.", 400);
    await syncOrderFromCloud(body.orderId);
    if (body.orderSnapshot) ensureOrderHydrated(body.orderSnapshot);
    const order = await authorizeOrder(body.orderId, "shopper", body.simulateApproval);
    return jsonOk({ order: publicOrderView(order) });
  } catch (error) {
    return handleRouteError(error);
  }
}
