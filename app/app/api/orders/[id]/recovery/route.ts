import { handleRouteError, jsonOk } from "@/lib/http";
import { investigateFailure, publicOrderView } from "@/lib/orders";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const investigation = await investigateFailure(id);
    return jsonOk({
      ...investigation,
      order: publicOrderView(investigation.order),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
