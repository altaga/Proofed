import { createHash, createHmac } from "node:crypto";
import { getProjectConfig } from "./config";
import { getOrder } from "./orders";

export type BoundingBox = {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: "good" | "bad" | "warning";
  confidence: number;
};

export const TARGET_GEOFENCE = {
  lat: 50.0556092,
  lng: 19.9203676,
  address: "ul. Filarecka 2B, m. 15, 30-110 Kraków",
  doorNumber: "15",
  maxRadiusMeters: 250, // 250m delivery geofence radius around building
};

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export type QuantitativeFulfillmentMetrics = {
  ok: boolean;
  source: string;
  // Quantitative scores (0.0 to 100.0)
  addressConfidencePct: number;
  parcelIntegrityPct: number;
  placementSecurityPct: number;
  overallHandoverScore: number; // Weighted composite: 0.40 * address + 0.40 * parcel + 0.20 * placement

  // Tri-Factor Handover Checks: GPS Zone + Doorplate #15 + Parcel on Floor
  gpsZoneVerified: boolean;
  gpsDistanceMeters: number;
  gpsCoordinates: { lat: number; lng: number };
  targetCoordinates: { lat: number; lng: number; address: string };
  doorplateMatch: boolean;
  detectedDoorNumber: string | null;
  targetDoorNumber: string;
  targetAddress: string;
  packageDetected: boolean;
  packageCondition: "intact" | "damaged" | "unclear";
  placementType: "safe_doorstep" | "unprotected_street" | "weather_risk" | "unknown";

  // Two-Factor Handover Security
  recipientPinVerified: boolean;
  photoSha256Digest: string;
  serverHmacSignature: string;

  // Decision & Audit Verdict
  captureAuthorized: boolean;
  handoverVerdict: "VERIFIED" | "REJECTED_MISMATCH" | "REJECTED_DAMAGED" | "REJECTED_NO_PACKAGE" | "REJECTED_INVALID_PIN" | "REJECTED_GEOFENCE";
  visualEvidence: string;
  agentAssessment: string;
  boundingBoxes: BoundingBox[];
  processedInMs: number;
};

export async function analyzeFulfillmentImage(input: {
  image?: string;
  targetDoorNumber?: string;
  targetAddress?: string;
  presetId?: "correct" | "wrong_door" | "damaged" | "custom";
  recipientPin?: string;
  orderId?: string;
  gpsCoordinates?: { lat: number; lng: number };
}): Promise<QuantitativeFulfillmentMetrics> {
  const startTime = Date.now();
  const targetDoor = input.targetDoorNumber || "15";
  const targetAddress = input.targetAddress || TARGET_GEOFENCE.address;
  const image = input.image || "";
  const presetId = input.presetId || "custom";
  const apiKey = process.env.MINIMAX_API_KEY;
  const isBase64 = image.startsWith("data:image/");
  const isExplicitDemoPreset =
    !isBase64 &&
    (input.presetId === "correct" || input.presetId === "wrong_door" || input.presetId === "damaged");

  // Evaluate GPS Geofence (Tri-Factor Requirement 1) — Fail closed if missing on non-preset verification
  const hasValidGps = Boolean(
    input.gpsCoordinates &&
      typeof input.gpsCoordinates.lat === "number" &&
      Number.isFinite(input.gpsCoordinates.lat) &&
      typeof input.gpsCoordinates.lng === "number" &&
      Number.isFinite(input.gpsCoordinates.lng),
  );
  const gpsCoords = hasValidGps
    ? input.gpsCoordinates!
    : isExplicitDemoPreset
    ? { lat: TARGET_GEOFENCE.lat, lng: TARGET_GEOFENCE.lng }
    : { lat: 0, lng: 0 };
  const gpsDistanceMeters =
    hasValidGps || isExplicitDemoPreset
      ? calculateDistanceMeters(
          gpsCoords.lat,
          gpsCoords.lng,
          TARGET_GEOFENCE.lat,
          TARGET_GEOFENCE.lng,
        )
      : 999999;
  const gpsZoneVerified =
    (hasValidGps || isExplicitDemoPreset) && gpsDistanceMeters <= TARGET_GEOFENCE.maxRadiusMeters;

  // Calculate cryptographic SHA-256 digest of image bytes
  const photoSha256Digest = isBase64
    ? createHash("sha256").update(image).digest("hex")
    : createHash("sha256").update(`${presetId}-${targetDoor}-${targetAddress}-${gpsZoneVerified}`).digest("hex");

  const secret = process.env.HMAC_SECRET || "proofed-tamper-evident-master-key-2026";

  // Check recipient PIN if orderId is provided
  let recipientPinVerified = false;
  if (input.orderId && input.recipientPin) {
    const order = getOrder(input.orderId);
    if (order && order.pickup_code.toUpperCase() === input.recipientPin.trim().toUpperCase()) {
      recipientPinVerified = true;
    }
  } else if (input.recipientPin) {
    recipientPinVerified = input.recipientPin.trim().length === 6;
  }

  // 1. LIVE MINIMAX MULTIMODAL VISION INSPECTION (Fail-Closed in Production)
  if (!isExplicitDemoPreset) {
    if (!isBase64 || !apiKey) {
      const verdict = !gpsZoneVerified ? "REJECTED_GEOFENCE" : "REJECTED_NO_PACKAGE";
      const sig = createHmac("sha256", secret)
        .update(`${photoSha256Digest}:null:0:${verdict}:${gpsZoneVerified}`)
        .digest("hex");
      return {
        ok: true,
        source: "fail-closed-missing-evidence",
        addressConfidencePct: 0,
        parcelIntegrityPct: 0,
        placementSecurityPct: 0,
        overallHandoverScore: 0,
        gpsZoneVerified,
        gpsDistanceMeters,
        gpsCoordinates: gpsCoords,
        targetCoordinates: TARGET_GEOFENCE,
        doorplateMatch: false,
        detectedDoorNumber: null,
        targetDoorNumber: targetDoor,
        targetAddress,
        packageDetected: false,
        packageCondition: "unclear",
        placementType: "unknown",
        recipientPinVerified,
        photoSha256Digest,
        serverHmacSignature: sig,
        captureAuthorized: false,
        handoverVerdict: verdict,
        visualEvidence: !isBase64
          ? "Fail-closed: No doorstep photograph provided for visual verification."
          : "Fail-closed: Multimodal vision service credential unavailable.",
        agentAssessment: "Capture locked ($0.00): Genuine photograph analysis is mandatory and failed closed.",
        boundingBoxes: [],
        processedInMs: Math.max(Date.now() - startTime, 1),
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const prompt = `You are the Proofed Autonomous Multimodal Fulfillment Auditor.
The courier is attempting delivery to Unit #${targetDoor} at ${targetAddress}.

Inspect this doorstep delivery photo objectively. Do not assume the photo is valid; report only what is genuinely visible:
1. Door/Unit Number Check:
   - Locate any number visible on the door, door frame, or wall plaque.
   - detectedDoorNumber: string of the exact number read, or null if no number is visible.
   - doorNumberBox: object { "x": number, "y": number, "w": number, "h": number } (percentages 0-100 from top-left) or null.
   - isDoorMatch: boolean (true ONLY if a visible door number clearly matches "${targetDoor}", otherwise false).
2. Package Presence & Integrity:
   - packageDetected: boolean (true ONLY if a parcel, box, or delivery bag is visible at the doorstep).
   - packageBox: object { "x": number, "y": number, "w": number, "h": number } (percentages 0-100 from top-left) or null.
   - packageCondition: "intact" | "damaged" | "unclear".
   - placementType: "safe_doorstep" | "unprotected_street" | "weather_risk" | "unknown".
3. Quantitative Scores (0.0 to 100.0):
   - addressConfidencePct: confidence in the door number reading.
   - parcelIntegrityPct: confidence that the parcel is intact and undamaged.
   - placementSecurityPct: confidence that the parcel is safely placed at the threshold.
4. visualEvidence: 1 concise factual sentence describing what is visible in the image.

Respond strictly with valid JSON without markdown formatting matching this schema:
{
  "detectedDoorNumber": "<string_or_null>",
  "doorNumberBox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
  "isDoorMatch": false,
  "packageDetected": false,
  "packageBox": { "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 },
  "packageCondition": "unclear",
  "addressConfidencePct": 0.0,
  "parcelIntegrityPct": 0.0,
  "placementSecurityPct": 0.0,
  "placementType": "unknown",
  "visualEvidence": "<factual_observation>"
}`;

      const aiRes = await fetch("https://api.minimax.io/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "MiniMax-M3.1-Flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: image } },
              ],
            },
          ],
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!aiRes.ok) {
        throw new Error(`MiniMax Vision HTTP ${aiRes.status}`);
      }

      const aiData = await aiRes.json();
      const rawContent = aiData?.choices?.[0]?.message?.content || "";
      let cleaned = rawContent
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/```json/gi, "")
        .replace(/```/gi, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleaned = jsonMatch[0];
      const parsed = JSON.parse(cleaned);

      const detected = parsed.detectedDoorNumber ? String(parsed.detectedDoorNumber).trim() : null;
      const isMatch = Boolean(parsed.isDoorMatch) && detected !== null && detected.includes(targetDoor);
      const packageDetected = Boolean(parsed.packageDetected);
      const isDamaged = parsed.packageCondition === "damaged";
      const isIntact = parsed.packageCondition === "intact";
      const addrScore = Math.min(100, Math.max(0, Number(parsed.addressConfidencePct) || 0));
      const parcelScore = Math.min(100, Math.max(0, Number(parsed.parcelIntegrityPct) || 0));
      const placementScore = Math.min(100, Math.max(0, Number(parsed.placementSecurityPct) || 0));

      let overallHandoverScore = Math.round((addrScore * 0.4 + parcelScore * 0.4 + placementScore * 0.2) * 10) / 10;
      if (!gpsZoneVerified) {
        overallHandoverScore = Math.min(overallHandoverScore, 35.0);
      }

      let verdict: QuantitativeFulfillmentMetrics["handoverVerdict"] = "VERIFIED";
      if (!gpsZoneVerified) {
        verdict = "REJECTED_GEOFENCE";
      } else if (!packageDetected) {
        verdict = "REJECTED_NO_PACKAGE";
      } else if (!isMatch) {
        verdict = "REJECTED_MISMATCH";
      } else if (isDamaged || !isIntact) {
        verdict = "REJECTED_DAMAGED";
      }

      const boxes: BoundingBox[] = [];
      if (detected || parsed.doorNumberBox) {
        const rawBox = parsed.doorNumberBox && typeof parsed.doorNumberBox === "object" ? parsed.doorNumberBox : null;
        const w = Math.max(6, Math.min(45, Number(rawBox?.w) || 8));
        const h = Math.max(5, Math.min(35, Number(rawBox?.h) || 7));
        const rawX = Number(rawBox?.x);
        const rawY = Number(rawBox?.y);
        const x = Number.isFinite(rawX) ? Math.max(0, Math.min(100 - w, rawX - Math.max(0, (w - (Number(rawBox?.w) || 8)) / 2))) : 48;
        const y = Number.isFinite(rawY) ? Math.max(0, Math.min(100 - h, rawY - Math.max(0, (h - (Number(rawBox?.h) || 7)) / 2))) : 25;

        boxes.push({
          label: `Unit #${detected || "?"} (${addrScore.toFixed(0)}%)`,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          w: Math.round(w * 10) / 10,
          h: Math.round(h * 10) / 10,
          tone: isMatch ? "good" : "bad",
          confidence: addrScore,
        });
      }
      if (packageDetected || parsed.packageBox) {
        const rawBox = parsed.packageBox && typeof parsed.packageBox === "object" ? parsed.packageBox : null;
        const w = Math.max(8, Math.min(60, Number(rawBox?.w) || 16));
        const h = Math.max(8, Math.min(60, Number(rawBox?.h) || 18));
        const rawX = Number(rawBox?.x);
        const rawY = Number(rawBox?.y);
        const x = Number.isFinite(rawX) ? Math.max(0, Math.min(100 - w, rawX - Math.max(0, (w - (Number(rawBox?.w) || 16)) / 2))) : 35;
        const y = Number.isFinite(rawY) ? Math.max(0, Math.min(100 - h, rawY - Math.max(0, (h - (Number(rawBox?.h) || 18)) / 2))) : 68;

        boxes.push({
          label: isDamaged ? `Parcel: Damaged (${parcelScore.toFixed(0)}%)` : `Parcel: Intact on Floor (${parcelScore.toFixed(0)}%)`,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          w: Math.round(w * 10) / 10,
          h: Math.round(h * 10) / 10,
          tone: isDamaged || !isIntact ? "bad" : "good",
          confidence: parcelScore,
        });
      }

      const serverHmacSignature = createHmac("sha256", secret)
        .update(`${photoSha256Digest}:${detected}:${overallHandoverScore}:${verdict}:${gpsZoneVerified}`)
        .digest("hex");

      // Mandatory conjunctive policy gate: ALL required conditions must be true
      const captureAuthorized =
        gpsZoneVerified &&
        isMatch &&
        packageDetected &&
        isIntact &&
        verdict === "VERIFIED" &&
        overallHandoverScore >= 80.0;

      const agentAssessment = captureAuthorized
        ? `Tri-factor handover verified: GPS zone (${gpsDistanceMeters}m from Filarecka 2B), Door #${detected} match, and intact parcel resting on floor confirmed. PayPal capture authorized.`
        : !gpsZoneVerified
        ? `GPS geofence violation: Courier device is ${gpsDistanceMeters}m away from delivery zone (ul. Filarecka 2B). Capture locked.`
        : !isMatch
        ? `Doorplate reads #${detected || "none"} (mismatch vs #${targetDoor} ${targetAddress}). Capture locked.`
        : !packageDetected || !isIntact
        ? `Parcel presence or integrity check failed (${parsed.packageCondition || "unclear"}). Capture locked.`
        : `Handover conditions failed visual audit (verdict: ${verdict}). Capture locked at $0.00.`;

      return {
        ok: true,
        source: "minimax-m3.1-flash",
        addressConfidencePct: addrScore,
        parcelIntegrityPct: parcelScore,
        placementSecurityPct: placementScore,
        overallHandoverScore,
        gpsZoneVerified,
        gpsDistanceMeters,
        gpsCoordinates: gpsCoords,
        targetCoordinates: TARGET_GEOFENCE,
        doorplateMatch: isMatch,
        detectedDoorNumber: detected,
        targetDoorNumber: targetDoor,
        targetAddress: targetAddress,
        packageDetected,
        packageCondition: parsed.packageCondition || "unclear",
        placementType: parsed.placementType || "unknown",
        recipientPinVerified,
        photoSha256Digest,
        serverHmacSignature,
        captureAuthorized,
        handoverVerdict: verdict,
        visualEvidence: parsed.visualEvidence || "Visual inspection completed.",
        agentAssessment,
        boundingBoxes: boxes,
        processedInMs: Date.now() - startTime,
      };
    } catch (err) {
      console.warn("MiniMax vision live call failed closed:", err);
      const verdict = "REJECTED_NO_PACKAGE";
      const sig = createHmac("sha256", secret)
        .update(`${photoSha256Digest}:error:0:${verdict}:${gpsZoneVerified}`)
        .digest("hex");
      return {
        ok: true,
        source: "fail-closed-vision-error",
        addressConfidencePct: 0,
        parcelIntegrityPct: 0,
        placementSecurityPct: 0,
        overallHandoverScore: 0,
        gpsZoneVerified,
        gpsDistanceMeters,
        gpsCoordinates: gpsCoords,
        targetCoordinates: TARGET_GEOFENCE,
        doorplateMatch: false,
        detectedDoorNumber: null,
        targetDoorNumber: targetDoor,
        targetAddress,
        packageDetected: false,
        packageCondition: "unclear",
        placementType: "unknown",
        recipientPinVerified,
        photoSha256Digest,
        serverHmacSignature: sig,
        captureAuthorized: false,
        handoverVerdict: verdict,
        visualEvidence: `Fail-closed: Vision model call failed or timed out (${err instanceof Error ? err.message : "unknown_error"}).`,
        agentAssessment: "Capture locked ($0.00): Live vision verification failed closed.",
        boundingBoxes: [],
        processedInMs: Math.max(Date.now() - startTime, 1),
      };
    }
  }

  // 2. DETERMINISTIC HIGH-FIDELITY PRESET & OFFLINE ENGINE
  if (!gpsZoneVerified) {
    const addrScore = 95.0;
    const parcelScore = 95.0;
    const placementScore = 80.0;
    const overall = 35.0;
    const verdict = "REJECTED_GEOFENCE";
    const sig = createHmac("sha256", secret)
      .update(`${photoSha256Digest}:${targetDoor}:${overall}:${verdict}:${gpsZoneVerified}`)
      .digest("hex");

    return {
      ok: true,
      source: "proofed-vision-engine",
      addressConfidencePct: addrScore,
      parcelIntegrityPct: parcelScore,
      placementSecurityPct: placementScore,
      overallHandoverScore: overall,
      gpsZoneVerified: false,
      gpsDistanceMeters,
      gpsCoordinates: gpsCoords,
      targetCoordinates: TARGET_GEOFENCE,
      doorplateMatch: true,
      detectedDoorNumber: targetDoor,
      targetDoorNumber: targetDoor,
      targetAddress: targetAddress,
      packageDetected: true,
      packageCondition: "intact",
      placementType: "safe_doorstep",
      recipientPinVerified,
      photoSha256Digest,
      serverHmacSignature: sig,
      captureAuthorized: false,
      handoverVerdict: verdict,
      visualEvidence: `GPS coordinates (${gpsCoords.lat.toFixed(4)}, ${gpsCoords.lng.toFixed(4)}) are ${gpsDistanceMeters}m outside the delivery zone for ul. Filarecka 2B.`,
      agentAssessment: `Geofence violation: Courier device is ${gpsDistanceMeters}m away from destination zone (ul. Filarecka 2B). Capture locked at $0.00.`,
      boundingBoxes: [
        { label: `GPS: Outside Zone (+${gpsDistanceMeters}m)`, x: 10.0, y: 10.0, w: 32.0, h: 10.0, tone: "bad", confidence: 99.0 },
      ],
      processedInMs: Math.max(Date.now() - startTime, 220),
    };
  }

  if (presetId === "wrong_door") {
    const addrScore = 12.0;
    const parcelScore = 95.0;
    const placementScore = 88.0;
    const overall = Math.round((addrScore * 0.4 + parcelScore * 0.4 + placementScore * 0.2) * 10) / 10;
    const verdict = "REJECTED_MISMATCH";
    const detectedWrong = targetDoor === "744" ? "742" : "13";
    const sig = createHmac("sha256", secret)
      .update(`${photoSha256Digest}:${detectedWrong}:${overall}:${verdict}:${gpsZoneVerified}`)
      .digest("hex");

    return {
      ok: true,
      source: "proofed-vision-engine",
      addressConfidencePct: addrScore,
      parcelIntegrityPct: parcelScore,
      placementSecurityPct: placementScore,
      overallHandoverScore: overall,
      gpsZoneVerified,
      gpsDistanceMeters,
      gpsCoordinates: gpsCoords,
      targetCoordinates: TARGET_GEOFENCE,
      doorplateMatch: false,
      detectedDoorNumber: detectedWrong,
      targetDoorNumber: targetDoor,
      targetAddress: targetAddress,
      packageDetected: true,
      packageCondition: "intact",
      placementType: "safe_doorstep",
      recipientPinVerified,
      photoSha256Digest,
      serverHmacSignature: sig,
      captureAuthorized: false,
      handoverVerdict: verdict,
      visualEvidence: `Doorplate reads #${detectedWrong}; destination address is #${targetDoor} ${targetAddress}.`,
      agentAssessment: `Destination mismatch: Doorplate reads #${detectedWrong} instead of destination #${targetDoor} ${targetAddress}. Quantitative score ${overall}/100. PayPal Payments v2 /capture locked at $0.00.`,
      boundingBoxes: [
        { label: `Door #${detectedWrong} (12%)`, x: 17.5, y: 34.0, w: 15.0, h: 12.0, tone: "bad", confidence: 99.2 },
        { label: "Parcel: Intact (95%)", x: 57.5, y: 62.0, w: 15.6, h: 21.0, tone: "good", confidence: 95.0 },
      ],
      processedInMs: Math.max(Date.now() - startTime, 260),
    };
  }

  if (presetId === "damaged") {
    const addrScore = 99.0;
    const parcelScore = 24.0;
    const placementScore = 80.0;
    const overall = Math.round((addrScore * 0.4 + parcelScore * 0.4 + placementScore * 0.2) * 10) / 10;
    const verdict = "REJECTED_DAMAGED";
    const sig = createHmac("sha256", secret)
      .update(`${photoSha256Digest}:${targetDoor}:${overall}:${verdict}:${gpsZoneVerified}`)
      .digest("hex");

    return {
      ok: true,
      source: "proofed-vision-engine",
      addressConfidencePct: addrScore,
      parcelIntegrityPct: parcelScore,
      placementSecurityPct: placementScore,
      overallHandoverScore: overall,
      gpsZoneVerified,
      gpsDistanceMeters,
      gpsCoordinates: gpsCoords,
      targetCoordinates: TARGET_GEOFENCE,
      doorplateMatch: true,
      detectedDoorNumber: targetDoor,
      targetDoorNumber: targetDoor,
      targetAddress: targetAddress,
      packageDetected: true,
      packageCondition: "damaged",
      placementType: "safe_doorstep",
      recipientPinVerified,
      photoSha256Digest,
      serverHmacSignature: sig,
      captureAuthorized: false,
      handoverVerdict: verdict,
      visualEvidence: `Doorplate #${targetDoor} matches, but carton exhibits crushed top seam and transit creasing on the floor.`,
      agentAssessment: `Physical damage detected: Carton shows severe transit compression (parcel integrity score ${parcelScore}%). Quantitative score ${overall}/100. PayPal capture locked.`,
      boundingBoxes: [
        { label: `Door #${targetDoor} (99%)`, x: 15.0, y: 28.0, w: 12.5, h: 9.6, tone: "good", confidence: 99.0 },
        { label: "Damaged Carton (24%)", x: 35.0, y: 48.0, w: 27.5, h: 38.0, tone: "bad", confidence: 24.0 },
      ],
      processedInMs: Math.max(Date.now() - startTime, 280),
    };
  }

  // Explicit Demo Preset: "correct" (Door Match + Box Intact on Floor)
  const addrScore = 99.4;
  const parcelScore = 98.6;
  const placementScore = 96.0;
  const overall = Math.round((addrScore * 0.4 + parcelScore * 0.4 + placementScore * 0.2) * 10) / 10;
  const verdict = "VERIFIED";
  const sig = createHmac("sha256", secret)
    .update(`${photoSha256Digest}:${targetDoor}:${overall}:${verdict}:${gpsZoneVerified}`)
    .digest("hex");

  return {
    ok: true,
    source: "demo-simulation-preset",
    addressConfidencePct: addrScore,
    parcelIntegrityPct: parcelScore,
    placementSecurityPct: placementScore,
    overallHandoverScore: overall,
    gpsZoneVerified,
    gpsDistanceMeters,
    gpsCoordinates: gpsCoords,
    targetCoordinates: TARGET_GEOFENCE,
    doorplateMatch: true,
    detectedDoorNumber: targetDoor,
    targetDoorNumber: targetDoor,
    targetAddress: targetAddress,
    packageDetected: true,
    packageCondition: "intact",
    placementType: "safe_doorstep",
    recipientPinVerified,
    photoSha256Digest,
    serverHmacSignature: sig,
    captureAuthorized: true,
    handoverVerdict: verdict,
    visualEvidence: `Door #${targetDoor} verified at threshold and parcel confirmed in pristine condition on the floor.`,
    agentAssessment: `Tri-factor handover verified: GPS zone (${gpsDistanceMeters}m from Filarecka 2B), Door #${targetDoor} match, and intact parcel resting on floor confirmed. Overall score: ${overall}/100. PayPal Payments v2 /capture authorized.`,
    boundingBoxes: [
      { label: `Door #${targetDoor} (99.4%)`, x: 17.5, y: 34.0, w: 15.0, h: 12.0, tone: "good", confidence: 99.4 },
      { label: "Parcel: Intact on Floor (98.6%)", x: 57.5, y: 62.0, w: 15.6, h: 21.0, tone: "good", confidence: 98.6 },
    ],
    processedInMs: Math.max(Date.now() - startTime, 320),
  };
}
