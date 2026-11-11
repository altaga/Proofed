import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";
import { ensureOrderHydrated, publicOrderView, voidOrder } from "@/lib/orders";
import { evaluateFraudAudit } from "@/lib/fraud-audit";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      orderId?: string;
      confirm?: boolean;
      reason?: string;
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
    if (body.confirm === false) return jsonError("CONFIRM_REQUIRED", "Send confirm: true to void.", 400);
    if (body.orderSnapshot) ensureOrderHydrated(body.orderSnapshot);

    // Cross-reference fulfillment evidence and policy rules before releasing authorization
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
