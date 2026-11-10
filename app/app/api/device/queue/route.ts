import { handleRouteError, jsonOk } from "@/lib/http";
import { listDeviceQueue, publicOrderView } from "@/lib/orders";

export async function GET() {
  try {
    return jsonOk({ orders: listDeviceQueue().map(publicOrderView) });
  } catch (error) {
    return handleRouteError(error);
  }
}
