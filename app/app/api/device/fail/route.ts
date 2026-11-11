import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { ensureOrderHydrated, failDelivery, publicOrderView } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orderId?: string;
      pickupCode?: string;
      reason?: string;
      note?: string;
      photoBase64?: string;
      photoMime?: string;
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
    if (!body.pickupCode) return jsonError("PICKUP_CODE_REQUIRED", "pickupCode is required.", 400);
    if (body.orderSnapshot) ensureOrderHydrated(body.orderSnapshot);
    const order = failDelivery({
      orderId: body.orderId,
      pickupCode: body.pickupCode,
      reason: body.reason || "unspecified",
      note: body.note,
      photoBase64: body.photoBase64,
      photoMime: body.photoMime,
      actor: "device",
    });
    return jsonOk({ order: publicOrderView(order) });
  } catch (error) {
    return handleRouteError(error);
  }
}
