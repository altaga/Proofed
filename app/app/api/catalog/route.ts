import { handleRouteError, jsonOk } from "@/lib/http";
import { availableStock, listCatalog, searchCatalog } from "@/lib/policy";
import { getProjectConfig } from "@/lib/config";
import { formatMoney } from "@/lib/money";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const cfg = getProjectConfig();
    const items = (q ? searchCatalog(q) : listCatalog(true)).map((item) => ({
      ...item,
      available: availableStock(item.sku),
      formatted_price: formatMoney(item.price_cents, cfg.currency),
      image: `/products/${item.sku}.svg`,
    }));
    return jsonOk({ items, currency: cfg.currency });
  } catch (error) {
    return handleRouteError(error);
  }
}
