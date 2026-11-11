import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { syncOrderFromCloud } from "@/lib/db";
import { confirmDelivery, ensureOrderHydrated, publicOrderView } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orderId?: string;
      pickupCode?: string;
      note?: string;
      photoBase64?: string;
      photoMime?: string;
      presetId?: "correct" | "wrong_door" | "damaged" | "custom";
      quantitativeScore?: number;
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
    if (!body.pickupCode) return jsonError("PICKUP_CODE_REQUIRED", "Recipient handover PIN (pickupCode) is required.", 400);
    const lookupId = body.orderId || body.orderSnapshot?.id;
    if (lookupId) {
      await syncOrderFromCloud(lookupId);
    }
    if (body.orderSnapshot) ensureOrderHydrated(body.orderSnapshot);
    const order = await confirmDelivery({
      orderId: body.orderId,
      pickupCode: body.pickupCode,
      note: body.note,
      photoBase64: body.photoBase64,
      photoMime: body.photoMime,
      presetId: body.presetId,
      quantitativeScore: body.quantitativeScore,
      actor: "device",
    });
    return jsonOk({ order: publicOrderView(order) });
  } catch (error) {
    return handleRouteError(error);
  }
}
