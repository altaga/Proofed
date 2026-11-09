import { NextResponse } from "next/server";
import { PolicyError } from "./policy";
import { PaypalHttpError } from "./paypal";
import { StateError } from "./state-machine";

export type ApiErrorBody = {
  error: string;
  code: string;
  details?: unknown;
};

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(code: string, error: string, status: number, details?: unknown) {
  const body: ApiErrorBody = { error, code };
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof PolicyError) {
    return jsonError(error.code, error.message, 400, error.details);
  }
  if (error instanceof StateError) {
    return jsonError("ILLEGAL_TRANSITION", error.message, 409);
  }
  if (error instanceof PaypalHttpError) {
    const status = error.status >= 400 && error.status < 500 ? 409 : 502;
    return jsonError(
      error.issues[0]?.issue || error.paypalName || "PAYPAL_ERROR",
      error.message,
      status,
      { issues: error.issues, debugId: error.debugId },
    );
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  if (message.startsWith("Missing required environment variable")) {
    return jsonError("CONFIG", message, 503);
  }
  console.error("unhandled_route_error", message);
  return jsonError("INTERNAL", "Something went wrong. No payment was invented or guessed.", 500);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new PolicyError("INVALID_JSON", "Request body must be JSON.");
  }
}
