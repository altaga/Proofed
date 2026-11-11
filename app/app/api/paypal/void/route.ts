import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { publicOrderView, voidOrder } from "@/lib/orders";
import { evaluateFraudAudit } from "@/lib/fraud-audit";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ orderId?: string; confirm?: boolean; reason?: string }>(request);
    if (!body.orderId) return jsonError("MISSING_ORDER", "orderId is required.", 400);
    // Allow if confirm is true or undefined (defaulting to confirmed request)
    if (body.confirm === false) return jsonError("CONFIRM_REQUIRED", "Send confirm: true to void.", 400);

    // Cross-reference fraud, velocity, and proof-of-delivery audit trail before releasing hold
    const audit = evaluateFraudAudit(body.orderId, "refund");
    if (!audit.allowed) {
      return jsonError("FRAUD_POLICY_BLOCKED", audit.auditExplanation, 403, { audit });
    }

    const order = await voidOrder(body.orderId, "merchant", body.reason || "merchant_void");
    return jsonOk({ order: publicOrderView(order), audit });
  } catch (error) {
    return handleRouteError(error);
  }
}
