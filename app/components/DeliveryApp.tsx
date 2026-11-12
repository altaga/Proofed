"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Lock,
  MapPin,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { mergeOrders } from "@/lib/order-merge";
import { EmptyOrderState } from "./EmptyOrderState";

type OrderItem = {
  sku: string;
  name: string;
  qty: number;
};

type DeliveryOrder = {
  id: string;
  status: string;
  subtotal_cents?: number;
  formatted_total: string;
  pickup_code: string | null;
  failure_reason: string | null;
  items: OrderItem[];
  created_at?: string;
  paypal_order_id?: string | null;
  paypal_authorization_id?: string | null;
  paypal_capture_id?: string | null;
};

type PhotoPreset = {
  id: "correct" | "wrong_door" | "damaged";
  shortLabel: string;
  tag: string;
  doorNumber: string;
  imagePath: string;
  expectedStatus: "verified" | "mismatch" | "damaged";
};

type BoundingBox = {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tone: "good" | "bad" | "warning";
  confidence: number;
};

type VisionVerifyResponse = {
  ok: boolean;
  source: string;
  addressConfidencePct?: number;
  parcelIntegrityPct?: number;
  placementSecurityPct?: number;
  overallHandoverScore?: number;
  captureAuthorized?: boolean;
  gpsZoneVerified?: boolean;
  gpsDistanceMeters?: number;
  gpsCoordinates?: { lat: number; lng: number };
  detectedDoorNumber: string | null;
  targetDoorNumber?: string;
  targetAddress?: string;
  doorplateMatch?: boolean;
  isDoorMatch?: boolean;
  packageDetected: boolean;
  packageCondition: string;
  confidence?: number;
  visualEvidence: string;
  agentAssessment?: string;
  boundingBoxes: BoundingBox[];
  handoverVerdict:
    | "VERIFIED"
    | "REJECTED_MISMATCH"
    | "REJECTED_DAMAGED"
    | "REJECTED_NO_PACKAGE"
    | "REJECTED_INVALID_PIN"
    | "REJECTED_GEOFENCE";
  photoSha256Digest?: string;
  serverHmacSignature?: string;
  recipientPinVerified?: boolean;
  processedInMs: number;
  error?: string;
};

const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: "correct",
    shortLabel: "Door #15 (Correct)",
    tag: "Match",
    doorNumber: "15",
    imagePath: "/delivery/door-15.svg",
    expectedStatus: "verified",
  },
  {
    id: "wrong_door",
    shortLabel: "Door #14 (Wrong door)",
    tag: "Mismatch",
    doorNumber: "14",
    imagePath: "/delivery/door-14.svg",
    expectedStatus: "mismatch",
  },
  {
    id: "damaged",
    shortLabel: "Damaged box",
    tag: "Damaged",
    doorNumber: "15",
    imagePath: "/delivery/crushed-box.svg",
    expectedStatus: "damaged",
  },
];

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getParcelTrackingNumber(order?: DeliveryOrder | null): string {
  if (!order) return "PKG-PL7440";
  const clean = order.id.replace(/^ord_/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const suffix = clean.slice(-5) || "7440";
  return `PKG-PL${suffix}`;
}

function BarcodeGraphic() {
  return (
    <svg
      className="parcel-barcode-svg"
      viewBox="0 0 240 44"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x="0" y="0" width="240" height="44" fill="#0D0C0A" />
      <line x1="6" y1="4" x2="6" y2="40" stroke="#D6D1C4" strokeWidth="3" />
      <line x1="12" y1="4" x2="12" y2="40" stroke="#D6D1C4" strokeWidth="1.5" />
      <line x1="17" y1="4" x2="17" y2="40" stroke="#D6D1C4" strokeWidth="2.5" />
      <line x1="23" y1="4" x2="23" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="28" y1="4" x2="28" y2="40" stroke="#D6D1C4" strokeWidth="4" />
      <line x1="36" y1="4" x2="36" y2="40" stroke="#D6D1C4" strokeWidth="1.5" />
      <line x1="41" y1="4" x2="41" y2="40" stroke="#D6D1C4" strokeWidth="3" />
      <line x1="48" y1="4" x2="48" y2="40" stroke="#D6D1C4" strokeWidth="2" />
      <line x1="53" y1="4" x2="53" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="58" y1="4" x2="58" y2="40" stroke="#D6D1C4" strokeWidth="3.5" />
      <line x1="65" y1="4" x2="65" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="70" y1="4" x2="70" y2="40" stroke="#D6D1C4" strokeWidth="2" />
      <line x1="76" y1="4" x2="76" y2="40" stroke="#D6D1C4" strokeWidth="4" />
      <line x1="84" y1="4" x2="84" y2="40" stroke="#D6D1C4" strokeWidth="1.5" />
      <line x1="90" y1="4" x2="90" y2="40" stroke="#D6D1C4" strokeWidth="2.5" />
      <line x1="96" y1="4" x2="96" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="101" y1="4" x2="101" y2="40" stroke="#D6D1C4" strokeWidth="3" />
      <line x1="108" y1="4" x2="108" y2="40" stroke="#D6D1C4" strokeWidth="1.5" />
      <line x1="113" y1="4" x2="113" y2="40" stroke="#D6D1C4" strokeWidth="4" />
      <line x1="121" y1="4" x2="121" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="126" y1="4" x2="126" y2="40" stroke="#D6D1C4" strokeWidth="2.5" />
      <line x1="133" y1="4" x2="133" y2="40" stroke="#D6D1C4" strokeWidth="3" />
      <line x1="140" y1="4" x2="140" y2="40" stroke="#D6D1C4" strokeWidth="1.5" />
      <line x1="146" y1="4" x2="146" y2="40" stroke="#D6D1C4" strokeWidth="4" />
      <line x1="154" y1="4" x2="154" y2="40" stroke="#D6D1C4" strokeWidth="2" />
      <line x1="160" y1="4" x2="160" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="165" y1="4" x2="165" y2="40" stroke="#D6D1C4" strokeWidth="3.5" />
      <line x1="172" y1="4" x2="172" y2="40" stroke="#D6D1C4" strokeWidth="1.5" />
      <line x1="178" y1="4" x2="178" y2="40" stroke="#D6D1C4" strokeWidth="2.5" />
      <line x1="185" y1="4" x2="185" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="190" y1="4" x2="190" y2="40" stroke="#D6D1C4" strokeWidth="4" />
      <line x1="198" y1="4" x2="198" y2="40" stroke="#D6D1C4" strokeWidth="2" />
      <line x1="204" y1="4" x2="204" y2="40" stroke="#D6D1C4" strokeWidth="1.5" />
      <line x1="210" y1="4" x2="210" y2="40" stroke="#D6D1C4" strokeWidth="3" />
      <line x1="217" y1="4" x2="217" y2="40" stroke="#D6D1C4" strokeWidth="1" />
      <line x1="223" y1="4" x2="223" y2="40" stroke="#D6D1C4" strokeWidth="3" />
      <line x1="231" y1="4" x2="231" y2="40" stroke="#D6D1C4" strokeWidth="2" />
    </svg>
  );
}

export function DeliveryApp() {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [recipientPin, setRecipientPin] = useState("");

  const [selectedPreset, setSelectedPreset] = useState<PhotoPreset | null>(null);
  const [mediaMode, setMediaMode] = useState<"preset" | "camera" | "upload" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customPhotoName, setCustomPhotoName] = useState<string | null>(null);
  const [customPhotoBase64, setCustomPhotoBase64] = useState<string | null>(null);

  const [gpsData, setGpsData] = useState<{
    lat: number;
    lng: number;
    accuracyMeters?: number;
    distanceMeters: number;
    inZone: boolean;
    mode: "live" | "simulated";
    isLocating: boolean;
  }>({
    lat: 50.0556092,
    lng: 19.9203676,
    accuracyMeters: 4,
    distanceMeters: 0,
    inZone: true,
    mode: "simulated",
    isLocating: false,
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visionResult, setVisionResult] = useState<VisionVerifyResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "failure" | "info";
    title: string;
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const runVisionVerification = useCallback(
    async (params: { image?: string; presetId?: string; gpsCoords?: { lat: number; lng: number } }) => {
      setIsAnalyzing(true);
      try {
        const coords = params.gpsCoords ?? { lat: gpsData.lat, lng: gpsData.lng };
        const res = await fetch("/api/vision/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: params.image,
            presetId: params.presetId,
            targetDoorNumber: "15",
            targetAddress: "ul. Filarecka 2B, m. 15, 30-110 Kraków",
            gpsCoordinates: coords,
          }),
        });
        const data: VisionVerifyResponse = await res.json();
        if (data.ok) {
          setVisionResult(data);
        } else {
          throw new Error(data.error || "Vision analysis failed");
        }
      } catch (err) {
        console.error("Vision verify error:", err);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [gpsData.lat, gpsData.lng],
  );

  function handleGetLiveLocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setGpsData((prev) => ({ ...prev, isLocating: true }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const dist = calculateDistanceMeters(lat, lng, 50.0556092, 19.9203676);
        const inZone = dist <= 250;
        setGpsData({
          lat,
          lng,
          accuracyMeters: Math.round(pos.coords.accuracy),
          distanceMeters: dist,
          inZone,
          mode: "live",
          isLocating: false,
        });
        if (customPhotoBase64 || previewUrl || selectedPreset) {
          void runVisionVerification({
            presetId: mediaMode === "preset" && selectedPreset ? selectedPreset.id : "custom",
            image: customPhotoBase64 ? `data:image/jpeg;base64,${customPhotoBase64}` : undefined,
            gpsCoords: { lat, lng },
          });
        }
      },
      (err) => {
        setGpsData((prev) => ({ ...prev, isLocating: false }));
        alert(`Notice: ${err.message}. Using destination coordinates (ul. Filarecka 2B).`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  function handleToggleGpsSimulation() {
    const nextInZone = !gpsData.inZone;
    const lat = nextInZone ? 50.0556092 : 50.0647;
    const lng = nextInZone ? 19.9203676 : 19.945;
    const dist = nextInZone ? 0 : 2500;
    setGpsData({
      lat,
      lng,
      accuracyMeters: 5,
      distanceMeters: dist,
      inZone: nextInZone,
      mode: "simulated",
      isLocating: false,
    });
    if (customPhotoBase64 || previewUrl || selectedPreset) {
      void runVisionVerification({
        presetId: mediaMode === "preset" && selectedPreset ? selectedPreset.id : "custom",
        image: customPhotoBase64 ? `data:image/jpeg;base64,${customPhotoBase64}` : undefined,
        gpsCoords: { lat, lng },
      });
    }
  }

  async function fetchLatestOrder() {
    try {
      const res = await fetch("/api/orders?view=courier");
      const data = await res.json();
      const serverOrders: DeliveryOrder[] = data.orders || [];
      let cachedOrders: DeliveryOrder[] = [];
      try {
        const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
        if (cachedRaw) {
          cachedOrders = (JSON.parse(cachedRaw) as DeliveryOrder[]).map((o) => ({
            ...o,
            pickup_code: null,
          }));
        }
      } catch {
        // ignore
      }

      const combined: DeliveryOrder[] = mergeOrders(serverOrders, cachedOrders).map((o) => ({
        ...o,
        pickup_code: null,
      }));

      const held =
        combined.find((o) => o.status === "AUTHORIZED") ||
        combined.find((o) => o.status === "DELIVERY_CONFIRMED" || o.status === "DELIVERY_FAILED") ||
        combined[0] ||
        null;

      if (held) {
        setActiveOrder(held);
      }
    } catch {
      // Quiet fail
    }
  }

  async function fetchNextPendingDelivery() {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/orders?view=courier");
      const data = await res.json();
      const serverOrders: DeliveryOrder[] = data.orders || [];
      let cachedOrders: DeliveryOrder[] = [];
      try {
        const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
        if (cachedRaw) {
          cachedOrders = (JSON.parse(cachedRaw) as DeliveryOrder[]).map((o) => ({
            ...o,
            pickup_code: null,
          }));
        }
      } catch {
        // ignore
      }

      const combined: DeliveryOrder[] = mergeOrders(serverOrders, cachedOrders).map((o) => ({
        ...o,
        pickup_code: null,
      }));

      // Look strictly for another order that is AUTHORIZED (waiting for delivery)
      const nextPending =
        combined.find((o) => o.status === "AUTHORIZED" && o.id !== activeOrder?.id) ||
        combined.find((o) => o.status === "AUTHORIZED");

      if (nextPending) {
        setActiveOrder(nextPending);
        setCurrentStep(1);
        setRecipientPin("");
        setSelectedPreset(null);
        setMediaMode(null);
        setPreviewUrl(null);
        setCustomPhotoName(null);
        setCustomPhotoBase64(null);
        setVisionResult(null);
      } else {
        // No other active pending orders
        setActiveOrder(null);
        setCurrentStep(1);
        setSelectedPreset(null);
        setMediaMode(null);
        setPreviewUrl(null);
        setCustomPhotoName(null);
        setCustomPhotoBase64(null);
        setVisionResult(null);
      }
    } catch {
      setActiveOrder(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void fetchLatestOrder();
  }, []);

  function handleSelectPreset(preset: PhotoPreset) {
    if (isFinalized) return;
    setSelectedPreset(preset);
    setMediaMode("preset");
    setPreviewUrl(preset.imagePath);
    setCustomPhotoName(null);
    setCustomPhotoBase64(null);
    setVisionResult(null);
    void runVisionVerification({ presetId: preset.id });
  }

function resizeImageForVision(file: File, maxDimension = 1200): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDimension && height <= maxDimension) {
          resolve(dataUrl);
          return;
        }
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>, mode: "camera" | "upload") {
    if (isFinalized) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedPreset(null);
    setCustomPhotoName(file.name);
    setMediaMode(mode);
    setIsAnalyzing(true);
    setVisionResult(null);

    try {
      const dataUrl = await resizeImageForVision(file, 1200);
      if (!dataUrl) return;
      const base64 = dataUrl.split(",")[1];
      setPreviewUrl(dataUrl);
      setCustomPhotoBase64(base64);
      void runVisionVerification({ image: dataUrl, presetId: "custom" });
    } catch {
      setIsAnalyzing(false);
    }
  }

  async function handleConfirmHandover() {
    if (!activeOrder) return;
    if (isFinalized) {
      setFeedback({
        tone: "failure",
        title: "Package Status Locked",
        message: "This delivery has already been finalized. The status of this referenced package cannot be changed.",
      });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);

    const isVerified = visionResult?.handoverVerdict === "VERIFIED";
    const pinToVerify = recipientPin.trim().toUpperCase();

    if (isVerified && (!pinToVerify || pinToVerify.length < 6)) {
      setFeedback({
        tone: "failure",
        title: "Delivery PIN Required",
        message: "Please enter the 6-character PIN provided by the customer.",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      if (isVerified) {
        const res = await fetch("/api/device/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder.id,
            pickupCode: pinToVerify,
            note: `Doorstep #15 and intact parcel verified · Customer PIN (${pinToVerify}) confirmed`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
            presetId: customPhotoBase64 ? "custom" : selectedPreset?.id,
            quantitativeScore: visionResult?.overallHandoverScore ?? visionResult?.confidence ?? 98.4,
            gpsCoordinates: { lat: gpsData.lat, lng: gpsData.lng },
            orderSnapshot: activeOrder,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Confirmation failed");
        setActiveOrder({ ...payload.order, pickup_code: null });
        try {
          const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
          const list = cachedRaw ? (JSON.parse(cachedRaw) as DeliveryOrder[]) : [];
          const next = [payload.order, ...list.filter((o) => o.id !== payload.order.id)];
          window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(next.slice(0, 20)));
        } catch {
          // ignore
        }
      } else {
        const reason =
          visionResult?.handoverVerdict === "REJECTED_GEOFENCE"
            ? "geofence_violation"
            : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
            ? "wrong_address"
            : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
            ? "missing_product"
            : "item_damaged";

        const res = await fetch("/api/device/fail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder.id,
            pickupCode: pinToVerify || undefined,
            reason,
            note: `Delivery verification failed: ${visionResult?.visualEvidence || "Conditions not met"}`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
            orderSnapshot: activeOrder,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Delivery failure report failed");
        setActiveOrder({ ...payload.order, pickup_code: null });
        try {
          const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
          const list = cachedRaw ? (JSON.parse(cachedRaw) as DeliveryOrder[]) : [];
          const next = [payload.order, ...list.filter((o) => o.id !== payload.order.id)];
          window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(next.slice(0, 20)));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setFeedback({
        tone: "failure",
        title: "Delivery Error",
        message: err instanceof Error ? err.message : "Could not process delivery",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isVerified = visionResult?.handoverVerdict === "VERIFIED";
  const isDelivered = activeOrder?.status === "DELIVERY_CONFIRMED" || activeOrder?.status === "CAPTURED";
  const isFailed =
    activeOrder?.status === "DELIVERY_FAILED" ||
    activeOrder?.status === "VOIDED" ||
    activeOrder?.status === "REFUNDED" ||
    activeOrder?.status === "CANCELLED";
  const isFinalized = isDelivered || isFailed;
  const parcelTrackingCode = getParcelTrackingNumber(activeOrder);

  return (
    <div className="delivery-container">
      <div className="delivery-card">
        {/* Top Bar with GPS */}
        <div className="delivery-top-bar">
          <div className="courier-badge">
            <span className="courier-pulse" />
            <span className="courier-id">Courier · Route 4B</span>
          </div>
          <div className="delivery-gps-ctrls">
            <div className={`delivery-gps mono ${gpsData.inZone ? "gps-in-zone" : "gps-out-zone"}`}>
              <MapPin size={12} />
              <span>
                {gpsData.inZone
                  ? `Filarecka 2B (${gpsData.distanceMeters}m)`
                  : `Out of zone (+${gpsData.distanceMeters}m)`}
              </span>
            </div>
            <button
              type="button"
              className="gps-toggle-btn"
              onClick={handleToggleGpsSimulation}
            >
              {gpsData.inZone ? "Simulate Far" : "Reset Location"}
            </button>
            <button
              type="button"
              className="gps-locate-btn"
              onClick={handleGetLiveLocation}
              disabled={gpsData.isLocating}
            >
              {gpsData.isLocating ? "Locating…" : "Live GPS"}
            </button>
          </div>
        </div>

        {/* Clean 3-Step Stepper */}
        <nav className="delivery-stepper" aria-label="Delivery Steps">
          <button
            type="button"
            className={`stepper-item ${!isFinalized && currentStep === 1 ? "is-active" : currentStep > 1 || isFinalized ? "is-completed" : ""}`}
            onClick={() => {
              if (!isFinalized) setCurrentStep(1);
            }}
            disabled={isFinalized}
          >
            <span className="stepper-badge">{currentStep > 1 || isFinalized ? <Check size={11} /> : "1"}</span>
            <span className="stepper-label">Package</span>
          </button>
          <div className="stepper-divider" />
          <button
            type="button"
            className={`stepper-item ${!isFinalized && currentStep === 2 ? "is-active" : currentStep > 2 || isFinalized ? "is-completed" : ""}`}
            onClick={() => {
              if (!isFinalized) setCurrentStep(2);
            }}
            disabled={isFinalized}
          >
            <span className="stepper-badge">{currentStep > 2 || isFinalized ? <Check size={11} /> : "2"}</span>
            <span className="stepper-label">Door Photo</span>
          </button>
          <div className="stepper-divider" />
          <button
            type="button"
            className={`stepper-item ${!isFinalized && currentStep === 3 ? "is-active" : isFinalized ? "is-completed" : ""}`}
            onClick={() => {
              if (!isFinalized && isVerified) setCurrentStep(3);
            }}
            disabled={isFinalized || !isVerified}
          >
            <span className="stepper-badge">
              {isFinalized ? (isDelivered ? <Check size={11} /> : <XCircle size={11} />) : "3"}
            </span>
            <span className="stepper-label">
              {isFinalized ? (isDelivered ? "Delivered" : "Returned") : "Delivery PIN"}
            </span>
          </button>
        </nav>

        {/* Step Title */}
        <div className="delivery-header">
          <h2>
            {isFinalized
              ? isDelivered
                ? "Delivery Complete · Payment Captured"
                : "Delivery Finalized · Package Returned"
              : currentStep === 1
              ? "1. Confirm Package"
              : currentStep === 2
              ? "2. Doorstep Photo"
              : "3. Customer PIN"}
          </h2>
          <p className="delivery-subtitle">
            {isFinalized
              ? isDelivered
                ? "Physical handover verified and payment captured via PayPal. The status of this package is locked."
                : "Handover verification failed. Package returned and authorization released. The status of this package is locked."
              : currentStep === 1
              ? "Check the package tracking code and delivery address."
              : currentStep === 2
              ? "Take a photo of the package at the door to verify the apartment number and box condition."
              : "Enter the 6-character PIN from the customer to complete the delivery."}
          </p>
        </div>

        {/* ============================================================ */}
        {/* FINALIZED DELIVERY SCREEN (LOCKED - NO STATUS MUTATIONS)     */}
        {/* ============================================================ */}
        {isFinalized && activeOrder && (
          <section className="delivery-step-content" aria-label="Delivery Finalized">
            <div className={`delivery-finalized-view ${isDelivered ? "finalized-success" : "finalized-failed"}`}>
              <div className={`finalized-header-icon ${isDelivered ? "success-ring" : "failed-ring"}`}>
                {isDelivered ? <CheckCircle2 size={30} /> : <XCircle size={30} />}
              </div>

              <div className="finalized-title-group">
                <div className="finalized-badge-row">
                  <span className={`status-pill-finalized ${isDelivered ? "status-captured" : "status-failed"}`}>
                    ● {isDelivered ? "CAPTURED · LOCKED" : "DELIVERY_FAILED · LOCKED"}
                  </span>
                  <span className="tracking-pill mono">{parcelTrackingCode}</span>
                </div>
                <h3>{isDelivered ? "Delivery Confirmed & Captured" : "Delivery Cancelled & Package Returned"}</h3>
                <p className="finalized-subtitle">
                  {isDelivered
                    ? "Package verified at Door #15 and customer PIN confirmed. Funds charged via PayPal Payments v2."
                    : "Door verification could not be completed. Package marked for return. Customer hold has been released."}
                </p>
              </div>

              <div className="finalized-summary-box">
                <div className="finalized-row">
                  <span className="finalized-label">Referenced Order</span>
                  <span className="finalized-value mono">{activeOrder.id}</span>
                </div>
                <div className="finalized-row">
                  <span className="finalized-label">Delivery Destination</span>
                  <span className="finalized-value">ul. Filarecka 2B, Apt 15, Kraków</span>
                </div>
                <div className="finalized-row">
                  <span className="finalized-label">{isDelivered ? "Captured Total" : "Customer Charge"}</span>
                  <span
                    className="finalized-value mono"
                    style={{ color: isDelivered ? "#00D687" : "#FF7B72", fontWeight: 700 }}
                  >
                    {isDelivered ? `${activeOrder.formatted_total} (Captured)` : "$0.00 (Hold Released)"}
                  </span>
                </div>
                <div className="finalized-row">
                  <span className="finalized-label">{isDelivered ? "Fulfillment Gate" : "Rejection Reason"}</span>
                  <span className="finalized-value">
                    {isDelivered
                      ? "Door #15 Match + Intact Parcel + PIN"
                      : activeOrder.failure_reason === "wrong_address"
                      ? "Wrong Doorplate (#14 instead of #15)"
                      : activeOrder.failure_reason === "item_damaged"
                      ? "Damaged parcel condition"
                      : activeOrder.failure_reason === "geofence_violation"
                      ? "Geofence out of delivery zone"
                      : activeOrder.failure_reason || "Door mismatch or damaged package"}
                  </span>
                </div>
              </div>

              <div className={`status-locked-notice ${isFailed ? "warning-lock" : ""}`}>
                <div className="locked-icon">
                  {isDelivered ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                </div>
                <div className="locked-text">
                  <strong>Package Status Locked</strong>
                  <p>
                    This delivery execution is permanently sealed in the append-only audit ledger.
                    The status of this referenced package cannot be changed.
                  </p>
                </div>
              </div>

              <div className="finalized-actions-row">
                <Link href="/merchant" className="step-btn-secondary" style={{ flex: 1, textAlign: "center" }}>
                  <span>Merchant Desk</span>
                  <ExternalLink size={13} />
                </Link>
                <Link href="/backend" className="step-btn-secondary" style={{ flex: 1, textAlign: "center" }}>
                  <span>Backend Console</span>
                  <ExternalLink size={13} />
                </Link>
                <button
                  type="button"
                  className="step-btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => void fetchNextPendingDelivery()}
                  disabled={isSubmitting}
                >
                  <RotateCcw size={13} />
                  <span>Next Delivery</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* STEP 1: PACKAGE                                              */}
        {/* ============================================================ */}
        {!isFinalized && currentStep === 1 && (
          <section className="delivery-step-content" aria-label="Step 1: Confirm Package">
            {!activeOrder ? (
              <div className="delivery-no-order">
                <EmptyOrderState
                  title="No active delivery"
                  body="Orders appear here automatically once a customer approves a payment hold in Shop."
                  actionLabel="Open Shop Chat"
                />
              </div>
            ) : (
              <div className="manifest-card" style={{ padding: "18px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", paddingBottom: "16px", marginBottom: "14px", borderBottom: "1px solid #2E2B25" }}>
                  <BarcodeGraphic />
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="parcel-tracking-code mono">{parcelTrackingCode}</span>
                    <button
                      type="button"
                      className="parcel-refresh-mini"
                      onClick={() => void fetchLatestOrder()}
                      title="Refresh active order"
                    >
                      <RefreshCw size={12} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                <div className="manifest-row">
                  <span className="manifest-label">Deliver to</span>
                  <span className="manifest-value" style={{ color: "#F4F1EA", fontWeight: 600 }}>
                    ul. Filarecka 2B, Apt 15, Kraków
                  </span>
                </div>
                <div className="manifest-row">
                  <span className="manifest-label">Order Total</span>
                  <span className="manifest-value mono">
                    {activeOrder.formatted_total} <span className="hold-pill">Payment on hold</span>
                  </span>
                </div>
                <div className="manifest-items-list" style={{ marginTop: "8px" }}>
                  {activeOrder.items?.map((item, idx) => (
                    <div key={idx} className="manifest-item-line">
                      <Package size={13} />
                      <span>
                        {item.name} × {item.qty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="step-nav-bar">
              <button
                type="button"
                className="step-btn-primary"
                onClick={() => setCurrentStep(2)}
                disabled={!activeOrder}
              >
                <span>Continue to Door Photo</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* STEP 2: DOOR PHOTO                                           */}
        {/* ============================================================ */}
        {!isFinalized && currentStep === 2 && (
          <section className="delivery-step-content" aria-label="Step 2: Doorstep Photo">
            <div className="capture-modes-row">
              <label className="capture-option-btn btn-take-photo">
                <Camera size={15} />
                <span>Take photo</span>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden-file-input"
                  onChange={(e) => handlePhotoSelected(e, "camera")}
                />
              </label>

              <label className="capture-option-btn upload-btn">
                <Upload size={15} />
                <span>{customPhotoName ? customPhotoName : "Upload image"}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden-file-input"
                  onChange={(e) => handlePhotoSelected(e, "upload")}
                />
              </label>
            </div>

            {/* Demo Sample Selector */}
            <div className="scenario-switcher-bar">
              <span className="scenario-switcher-label">Sample photos:</span>
              <div className="scenario-pills-row" role="radiogroup" aria-label="Sample photos">
                {PHOTO_PRESETS.map((preset) => {
                  const active = mediaMode === "preset" && selectedPreset?.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`scenario-pill ${active ? "active" : ""} pill-${preset.expectedStatus}`}
                      onClick={() => handleSelectPreset(preset)}
                    >
                      <span className="pill-dot" />
                      <span className="pill-name">{preset.shortLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clean Photo Preview */}
            <div className={`vision-viewfinder-frame ${isAnalyzing ? "is-analyzing" : ""}`}>
              <div className="viewfinder-media-container">
                {previewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Doorstep preview"
                      className="viewfinder-media"
                    />

                    {isAnalyzing && (
                      <div className="vision-laser-sweep-overlay" aria-live="polite">
                        <div className="vision-scanning-pill mono">
                          <RefreshCw size={13} className="spin" />
                          <span>Checking door number and package…</span>
                        </div>
                      </div>
                    )}

                    {!isAnalyzing &&
                      visionResult?.boundingBoxes?.map((box, idx) => {
                        const isRightSide = box.x > 50;
                        return (
                          <div
                            key={idx}
                            className={`hud-bbox hud-bbox-${box.tone}`}
                            style={{
                              left: `${box.x}%`,
                              top: `${box.y}%`,
                              width: `${box.w}%`,
                              height: `${box.h}%`,
                            }}
                          >
                            <div
                              className="bbox-tag mono"
                              style={isRightSide ? { right: -2, left: "auto" } : { left: -2, right: "auto" }}
                            >
                              <span className="bbox-dot" />
                              <span className="bbox-name">{box.label}</span>
                            </div>
                          </div>
                        );
                      })}
                  </>
                ) : (
                  <div className="viewfinder-placeholder">
                    <div className="viewfinder-placeholder-icon">
                      <Camera size={28} />
                    </div>
                    <div className="viewfinder-placeholder-text">
                      <span className="placeholder-title">No Doorstep Photo Loaded</span>
                      <span className="placeholder-sub">
                        Upload or take a doorstep photo, or pick one of the sample scenarios above to run verification.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Simple Verdict Banner (Only rendered when analysis result exists) */}
            {visionResult && (
              <div className={`telemetry-verdict-banner ${isVerified ? "verdict-good" : "verdict-bad"}`}>
                <div className="verdict-banner-icon">
                  {isVerified ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                </div>
                <div className="verdict-banner-text">
                  <span className="verdict-banner-title">
                    {isVerified
                      ? "Door #15 & Intact Package Verified"
                      : !gpsData.inZone
                      ? "Out of Delivery Zone"
                      : visionResult.handoverVerdict === "REJECTED_MISMATCH"
                      ? "Wrong Door Number (#14 instead of #15)"
                      : "Damaged Package Detected"}
                  </span>
                  <span className="verdict-banner-sub">
                    {isVerified
                      ? "Location and package condition confirmed. Proceed to enter the customer's PIN."
                      : !gpsData.inZone
                      ? `You are ${gpsData.distanceMeters}m away from the destination address.`
                      : visionResult.handoverVerdict === "REJECTED_MISMATCH"
                      ? "This photo shows Door #14, but the order is for Door #15."
                      : "The box appears crushed or damaged. Delivery cannot be completed."}
                  </span>
                </div>
              </div>
            )}

            <div className="step-nav-bar">
              <button
                type="button"
                className="step-btn-secondary"
                onClick={() => setCurrentStep(1)}
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>

              {isVerified ? (
                <button
                  type="button"
                  className="step-btn-primary"
                  onClick={() => setCurrentStep(3)}
                >
                  <span>Continue to Delivery PIN</span>
                  <ArrowRight size={16} />
                </button>
              ) : visionResult ? (
                <button
                  type="button"
                  className="step-btn-danger"
                  onClick={handleConfirmHandover}
                  disabled={isSubmitting}
                >
                  <XCircle size={15} />
                  <span>Report Failed Delivery</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="step-btn-secondary"
                  disabled
                  style={{ opacity: 0.45, cursor: "not-allowed" }}
                >
                  <span>Select or upload photo to proceed</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* STEP 3: CUSTOMER PIN                                         */}
        {/* ============================================================ */}
        {!isFinalized && currentStep === 3 && (
          <section className="delivery-step-content" aria-label="Step 3: Customer PIN">
            <div className="recipient-pin-box">
              <div className="pin-box-top">
                <label htmlFor="customer-pin-field" className="pin-box-label">
                  Customer Delivery PIN
                </label>
                <span className="mono" style={{ fontSize: "11px", color: "var(--ink-3)" }}>
                  Required from customer checkout screen
                </span>
              </div>

              <input
                id="customer-pin-field"
                type="text"
                className="recipient-pin-input-large mono"
                placeholder="6-CHAR PIN"
                value={recipientPin}
                maxLength={6}
                onChange={(e) => setRecipientPin(e.target.value.toUpperCase().slice(0, 6))}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="step-nav-bar">
              <button
                type="button"
                className="step-btn-secondary"
                onClick={() => setCurrentStep(2)}
                disabled={isSubmitting}
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>

              <button
                type="button"
                className="step-btn-primary btn-confirm-delivery"
                disabled={isSubmitting || !activeOrder || recipientPin.length < 6}
                onClick={handleConfirmHandover}
              >
                {isSubmitting ? (
                  <RefreshCw size={16} className="spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>
                  {isSubmitting ? "Completing…" : "Complete Delivery"}
                </span>
              </button>
            </div>
          </section>
        )}

        {/* Feedback Alert Banner */}
        {feedback && (
          <div className={`delivery-feedback-banner tone-${feedback.tone}`} role="status">
            <div className="feedback-header">
              {feedback.tone === "success" && <CheckCircle2 size={18} />}
              {feedback.tone === "failure" && <ShieldAlert size={18} />}
              {feedback.tone === "info" && <ShieldCheck size={18} />}
              <h4>{feedback.title}</h4>
            </div>
            <p className="feedback-message">{feedback.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
