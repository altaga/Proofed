import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { authorizeOrder, publicOrderView } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ orderId?: string; simulateApproval?: boolean }>(request);
    if (!body.orderId) return jsonError("MISSING_ORDER", "orderId is required.", 400);
    const order = await authorizeOrder(body.orderId, "shopper", body.simulateApproval);
    return jsonOk({ order: publicOrderView(order) });
  } catch (error) {
    return handleRouteError(error);
  }
}
