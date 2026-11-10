import { handleRouteError, jsonOk } from "@/lib/http";
import { merchantStats } from "@/lib/orders";

export async function GET() {
  try {
    return jsonOk({ stats: merchantStats() });
  } catch (error) {
    return handleRouteError(error);
  }
}
