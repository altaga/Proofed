import { handleRouteError, jsonOk } from "@/lib/http";
import { evaluateFraudAudit } from "@/lib/fraud-audit";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const url = new URL(request.url);
    const action = (url.searchParams.get("action") || "refund") as "refund" | "retry";
    const audit = evaluateFraudAudit(id, action);
    return jsonOk({ audit });
  } catch (error) {
    return handleRouteError(error);
  }
}
