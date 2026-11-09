import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { confirmDelivery, publicOrderView } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orderId?: string;
      pickupCode?: string;
      note?: string;
      photoBase64?: string;
      photoMime?: string;
    }>(request);
    if (!body.pickupCode) return jsonError("PICKUP_CODE_REQUIRED", "pickupCode is required.", 400);
    const order = await confirmDelivery({
      orderId: body.orderId,
      pickupCode: body.pickupCode,
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
