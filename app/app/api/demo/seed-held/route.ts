import { handleRouteError, jsonOk, readJson } from "@/lib/http";
import { publicOrderView, seedDemoHeldOrder } from "@/lib/orders";

export async function POST(request: Request) {
  try {
    let sku: string | undefined;
    let note: string | undefined;
    try {
      const body = await readJson<{ sku?: string; note?: string }>(request);
      sku = body.sku;
      note = body.note;
    } catch {
      // Body is optional
    }
    const order = seedDemoHeldOrder({ sku, note });
    return jsonOk({ ok: true, order: publicOrderView(order) });
  } catch (error) {
    return handleRouteError(error);
  }
}
