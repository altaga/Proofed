import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { ensureOrderHydrated, publicOrderView, recoverOrder } from "@/lib/orders";
import { evaluateFraudAudit } from "@/lib/fraud-audit";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orderId?: string;
      action?: "substitute" | "retry" | "cancel" | "confirm_received";
      substitute_items?: unknown;
      confirm?: boolean;
      actor?: string;
      orderSnapshot?: {
        id?: string;
        status?: string;
        subtotal_cents?: number;
        pickup_code?: string | null;
        paypal_order_id?: string | null;
        paypal_authorization_id?: string | null;
        items?: Array<{ sku: string; name?: string; qty: number; unit_price_cents?: number }>;
      };
    }>(request);
    if (!body.orderId) return jsonError("MISSING_ORDER", "orderId is required.", 400);
    if (!body.action) return jsonError("MISSING_ACTION", "action must be substitute, retry, cancel, or confirm_received.", 400);
    if (!body.confirm) return jsonError("CONFIRM_REQUIRED", "Send confirm: true to recover.", 400);
    if (body.orderSnapshot) ensureOrderHydrated(body.orderSnapshot);

    // Cross-reference fulfillment evidence and policy rules before executing recovery
    let audit = { allowed: true, policyRule: "RULE_CUSTOMER_DIRECT_CONFIRMATION", auditExplanation: "Customer confirmed delivery receipt." };
    if (body.action === "cancel" || body.action === "retry") {
      const auditAction = body.action === "cancel" ? "refund" : "retry";
      const evaluated = evaluateFraudAudit(body.orderId, auditAction);
      if (!evaluated.allowed) {
        return jsonError("FRAUD_POLICY_BLOCKED", evaluated.auditExplanation, 403, { audit: evaluated });
      }
      audit = evaluated;
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
