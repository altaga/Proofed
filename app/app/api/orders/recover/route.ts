import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { publicOrderView, recoverOrder } from "@/lib/orders";
import { evaluateFraudAudit } from "@/lib/fraud-audit";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orderId?: string;
      action?: "substitute" | "retry" | "cancel";
      substitute_items?: unknown;
      confirm?: boolean;
      actor?: string;
    }>(request);
    if (!body.orderId) return jsonError("MISSING_ORDER", "orderId is required.", 400);
    if (!body.action) return jsonError("MISSING_ACTION", "action must be substitute, retry, or cancel.", 400);
    if (!body.confirm) return jsonError("CONFIRM_REQUIRED", "Send confirm: true to recover.", 400);

    // Cross-reference fraud, velocity, and proof-of-delivery audit trail before executing recovery
    const auditAction = body.action === "cancel" ? "refund" : "retry";
    const audit = evaluateFraudAudit(body.orderId, auditAction);
    if (!audit.allowed) {
      return jsonError("FRAUD_POLICY_BLOCKED", audit.auditExplanation, 403, { audit });
    }

    const recovered = await recoverOrder({
      orderId: body.orderId,
      action: body.action,
      substituteItems: body.substitute_items,
      actor: body.actor || "merchant",
    });
    return jsonOk({
      message: recovered.message,
      order: publicOrderView(recovered.order),
      replacement: recovered.replacement ? publicOrderView(recovered.replacement) : undefined,
      audit,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
