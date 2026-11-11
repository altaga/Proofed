import { handleRouteError, jsonOk, readJson } from "@/lib/http";
import { ensureOrderHydrated, listOrders, publicOrderView } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orders?: Array<{
        id: string;
        status: string;
        subtotal_cents?: number;
        pickup_code?: string | null;
        paypal_order_id?: string | null;
        paypal_authorization_id?: string | null;
        items?: Array<{ sku: string; name?: string; qty: number; unit_price_cents?: number }>;
      }>;
    }>(request);

    if (Array.isArray(body.orders)) {
      for (const orderSnapshot of body.orders) {
        ensureOrderHydrated(orderSnapshot);
      }
    }

    return jsonOk({ orders: listOrders().map(publicOrderView) });
  } catch (error) {
    return handleRouteError(error);
  }
}
