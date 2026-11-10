import { NextResponse } from "next/server";
import { handlePaypalWebhook } from "@/lib/webhooks";

export async function POST(request: Request) {
  const result = await handlePaypalWebhook(request);
  return NextResponse.json(result.body, { status: result.status });
}
