import { listSessionTranscript } from "@/lib/agent";
import { jsonError, jsonOk } from "@/lib/http";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return jsonError("MISSING", "sessionId is required.", 400);
  }
  return jsonOk({ sessionId, messages: listSessionTranscript(sessionId) });
}
