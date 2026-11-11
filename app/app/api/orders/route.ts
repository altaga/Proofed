import { handleRouteError, jsonOk, readJson } from "@/lib/http";
import { courierOrderView, createCheckout, listOrders, publicOrderView } from "@/lib/orders";

export async function GET(request: Request) {
  try {
    const view = new URL(request.url).searchParams.get("view");
    const mapper = view === "courier" ? courierOrderView : publicOrderView;
    return jsonOk({ orders: listOrders().map(mapper) });
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
    }>(request);
    const order = await createCheckout({
      items: body.items,
      budgetCents: body.budget_cents,
      note: body.note,
      actor: "shopper",
      autoAuthorize: false,
    });
    return jsonOk({ order: publicOrderView(order) }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
