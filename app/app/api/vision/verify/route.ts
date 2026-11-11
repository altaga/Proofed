import { NextResponse } from "next/server";
import { analyzeFulfillmentImage } from "@/lib/vision-audit";

export const dynamic = "force-dynamic";

type VisionVerifyBody = {
  image?: string;
  targetDoorNumber?: string;
  targetAddress?: string;
  presetId?: "correct" | "wrong_door" | "damaged" | "custom";
  recipientPin?: string;
  orderId?: string;
  gpsCoordinates?: { lat: number; lng: number };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VisionVerifyBody;
    const metrics = await analyzeFulfillmentImage({
      image: body.image,
      targetDoorNumber: body.targetDoorNumber,
      targetAddress: body.targetAddress,
      presetId: body.presetId,
      recipientPin: body.recipientPin,
      orderId: body.orderId,
      gpsCoordinates: body.gpsCoordinates,
    });

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("Vision verify route error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "vision_failed" },
      { status: 500 },
    );
  }
}
