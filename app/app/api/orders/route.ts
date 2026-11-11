import { handleRouteError, jsonOk, readJson } from "@/lib/http";
import { createCheckout, listOrders, publicOrderView } from "@/lib/orders";

export async function GET() {
  try {
    return jsonOk({ orders: listOrders().map(publicOrderView) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      items: unknown;
      budget_cents?: number;
      note?: string;
      autoAuthorize?: boolean;
    }>(request);
    const order = await createCheckout({
      items: body.items,
      budgetCents: body.budget_cents,
      note: body.note,
      actor: "shopper",
      autoAuthorize: body.autoAuthorize ?? false,
    });
    return jsonOk({ order: publicOrderView(order) }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
