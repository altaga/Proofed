import { handleRouteError, jsonOk } from "@/lib/http";
import { reconcileOrders } from "@/lib/orders";

export async function POST() {
  try {
    return jsonOk(await reconcileOrders());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET() {
  return POST();
}
