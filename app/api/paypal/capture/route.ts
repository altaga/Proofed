import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { captureOrder, publicOrderView } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ orderId?: string; confirm?: boolean }>(request);
    if (!body.orderId) return jsonError("MISSING_ORDER", "orderId is required.", 400);
    if (!body.confirm) return jsonError("CONFIRM_REQUIRED", "Send confirm: true to capture.", 400);
    const order = await captureOrder(body.orderId, "merchant");
    return jsonOk({ order: publicOrderView(order) });
  } catch (error) {
    return handleRouteError(error);
  }
}
