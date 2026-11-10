import { handleRouteError, jsonOk } from "@/lib/http";
import { listEvents } from "@/lib/orders";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId") || undefined;
    return jsonOk({ events: listEvents(orderId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
