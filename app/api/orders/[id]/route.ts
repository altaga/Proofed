import { handleRouteError, jsonOk } from "@/lib/http";
import { getOrderDetails, listEvents, publicOrderView } from "@/lib/orders";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const order = getOrderDetails(id);
    return jsonOk({ order: publicOrderView(order), events: listEvents(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
