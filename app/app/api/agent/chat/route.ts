import { runAgentTurn } from "@/lib/agent";
import { handleRouteError, jsonError, jsonOk, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      sessionId?: string;
      message?: string;
      orderId?: string;
      orderStatus?: string;
    }>(request);
    if (!body.message || !body.message.trim()) {
      return jsonError("EMPTY", "Message cannot be empty.", 400);
    }
    const result = await runAgentTurn({
      sessionId: body.sessionId,
      message: body.message,
      orderId: body.orderId,
      orderStatus: body.orderStatus,
    });
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
