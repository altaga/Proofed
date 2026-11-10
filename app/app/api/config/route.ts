import { getProjectConfig } from "@/lib/config";
import { jsonOk, handleRouteError } from "@/lib/http";

export async function GET() {
  try {
    const cfg = getProjectConfig();
    return jsonOk({
      name: cfg.name,
      slug: cfg.slug,
      tagline: cfg.tagline,
      venueName: cfg.venueName,
      currency: cfg.currency,
      pickupTimeoutMinutes: cfg.pickupTimeoutMinutes,
      paypalClientId: process.env.PAYPAL_CLIENT_ID || "",
      paypalIntent: "authorize",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
