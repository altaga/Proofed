import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { publicOrderView, voidOrder } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ orderId?: string; confirm?: boolean; reason?: string }>(request);
    if (!body.orderId) return jsonError("MISSING_ORDER", "orderId is required.", 400);
    if (!body.confirm) return jsonError("CONFIRM_REQUIRED", "Send confirm: true to void.", 400);
    const order = await voidOrder(body.orderId, "merchant", body.reason || "merchant_void");
    return jsonOk({ order: publicOrderView(order) });
  } catch (error) {
    return handleRouteError(error);
  }
}
