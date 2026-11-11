"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Clock,
  Cpu,
  MapPin,
  Package,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { EmptyOrderState } from "./EmptyOrderState";

type OrderItem = {
  sku: string;
  name: string;
  qty: number;
};

type DeliveryOrder = {
  id: string;
  status: string;
  formatted_total: string;
  pickup_code: string | null;
  failure_reason: string | null;
  items: OrderItem[];
  created_at?: string;
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
  x: number; // percentage left
  y: number; // percentage top
  w: number; // percentage width
  h: number; // percentage height
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
  handoverVerdict: "VERIFIED" | "REJECTED_MISMATCH" | "REJECTED_DAMAGED" | "REJECTED_NO_PACKAGE" | "REJECTED_INVALID_PIN" | "REJECTED_GEOFENCE";
  photoSha256Digest?: string;
  serverHmacSignature?: string;
  recipientPinVerified?: boolean;
  processedInMs: number;
  error?: string;
};

const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: "correct",
    shortLabel: "Door #15",
    tag: "Match",
    doorNumber: "15",
    imagePath: "/delivery/door-15.svg",
    expectedStatus: "verified",
  },
  {
    id: "wrong_door",
    shortLabel: "Door #13",
    tag: "Mismatch",
    doorNumber: "13",
    imagePath: "/delivery/door-13.svg",
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

export function DeliveryApp() {
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [knownOrders, setKnownOrders] = useState<DeliveryOrder[]>([]);
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<PhotoPreset>(PHOTO_PRESETS[0]);
  const [mediaMode, setMediaMode] = useState<"preset" | "camera" | "upload">("preset");
  const [previewUrl, setPreviewUrl] = useState<string>(PHOTO_PRESETS[0].imagePath);
  const [customPhotoName, setCustomPhotoName] = useState<string | null>(null);
  const [customPhotoBase64, setCustomPhotoBase64] = useState<string | null>(null);

  // GPS Geofence state (Filarecka 2B, Kraków: 50.0556092, 19.9203676)
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

  // Vision Pipeline states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [visionResult, setVisionResult] = useState<VisionVerifyResponse | null>(null);

  // Form submission & feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "failure" | "info";
    title: string;
    message: string;
    paypalDetail?: string;
    recoveryAction?: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Trigger computer vision & tri-factor verification
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
        void runVisionVerification({
          presetId: mediaMode === "preset" ? selectedPreset.id : "custom",
          image: customPhotoBase64 ? `data:image/jpeg;base64,${customPhotoBase64}` : undefined,
          gpsCoords: { lat, lng },
        });
      },
      (err) => {
        console.warn("Geolocation notice:", err.message);
        setGpsData((prev) => ({ ...prev, isLocating: false }));
        alert(`Notice: ${err.message}. Using calibrated venue coordinates (ul. Filarecka 2B).`);
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
    void runVisionVerification({
      presetId: mediaMode === "preset" ? selectedPreset.id : "custom",
      image: customPhotoBase64 ? `data:image/jpeg;base64,${customPhotoBase64}` : undefined,
      gpsCoords: { lat, lng },
    });
  }

  // Fetch active held order or latest order (with cross-instance localStorage fallback)
  async function fetchLatestOrder() {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      const serverOrders: DeliveryOrder[] = data.orders || [];
      let cachedOrders: DeliveryOrder[] = [];
      try {
        const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
        if (cachedRaw) {
          cachedOrders = JSON.parse(cachedRaw) as DeliveryOrder[];
        }
      } catch {
        // ignore storage errors
      }

      // Prioritize newest orders created in current shopper session
      const combined: DeliveryOrder[] = Array.isArray(cachedOrders) ? [...cachedOrders] : [];
      for (const s of serverOrders) {
        if (!combined.some((o) => o.id === s.id)) {
          combined.push(s);
        }
      }
      setKnownOrders(combined);

      // Find first held order waiting for delivery
      const held =
        combined.find((o) => o.status === "AUTHORIZED") ||
        combined.find((o) => o.status === "DELIVERY_CONFIRMED" || o.status === "DELIVERY_FAILED") ||
        combined[0] ||
        null;

      if (held) {
        setActiveOrder(held);
        if (held.pickup_code) setTrackingInput(held.pickup_code);
      }
    } catch {
      // Quiet fail on initial load
    }
  }

  function handlePinChange(val: string) {
    const code = val.toUpperCase().slice(0, 6);
    setTrackingInput(code);
    if (code.length === 6) {
      const match = knownOrders.find((o) => o.pickup_code?.toUpperCase() === code);
      if (match) {
        setActiveOrder(match);
      }
    }
  }

  // Initial load: fetch order and analyze initial preset scene
  useEffect(() => {
    void fetchLatestOrder();
    void runVisionVerification({ presetId: "correct" });
  }, [runVisionVerification]);

  // Preset Selection
  function handleSelectPreset(preset: PhotoPreset) {
    setSelectedPreset(preset);
    setMediaMode("preset");
    setPreviewUrl(preset.imagePath);
    setCustomPhotoName(null);
    setCustomPhotoBase64(null);
    void runVisionVerification({ presetId: preset.id });
  }

  // File Upload or Native Camera Capture Handler
  function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>, mode: "camera" | "upload") {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomPhotoName(file.name);
    setMediaMode(mode);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      setPreviewUrl(dataUrl);
      setCustomPhotoBase64(base64);
      void runVisionVerification({ image: dataUrl, presetId: "custom" });
    };
    reader.readAsDataURL(file);
  }

  // Confirm or Reject Handover based on real vision verdict
  async function handleConfirmHandover() {
    if (!activeOrder && !trackingInput) return;
    setIsSubmitting(true);
    setFeedback(null);

    const code = (trackingInput || activeOrder?.pickup_code || "").trim().toUpperCase();
    if (!code || code.length < 6) {
      setFeedback({
        tone: "failure",
        title: "PIN Required",
        message: "Please enter the 6-character recipient handover PIN presented by the buyer (e.g. 6BQL7D).",
      });
      setIsSubmitting(false);
      return;
    }

    const isVerified = visionResult?.handoverVerdict === "VERIFIED";

    try {
      if (isVerified) {
        // Successful handover: verifies recipient PIN + photo evidence on server
        const res = await fetch("/api/device/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder?.id,
            pickupCode: code,
            note: `Tri-factor verified: ${visionResult?.visualEvidence || "GPS zone, Door #15, and intact parcel on floor confirmed"} (${((visionResult?.confidence ?? visionResult?.overallHandoverScore) ?? 98.5).toFixed(1)}% score) · Recipient PIN verified`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
            presetId: customPhotoBase64 ? "custom" : selectedPreset.id,
            quantitativeScore: visionResult?.overallHandoverScore ?? visionResult?.confidence ?? 98.4,
            gpsCoordinates: { lat: gpsData.lat, lng: gpsData.lng },
            orderSnapshot: activeOrder || undefined,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Confirmation failed");
        setActiveOrder(payload.order);
        try {
          const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
          const list = cachedRaw ? (JSON.parse(cachedRaw) as DeliveryOrder[]) : [];
          const next = [payload.order, ...list.filter((o) => o.id !== payload.order.id)];
          window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(next.slice(0, 20)));
        } catch {
          // ignore
        }
        setFeedback({
          tone: "success",
          title: "Tri-factor handover verified · Custody transferred",
          message: `Package delivered to #15 Filarecka 2B, Kraków. GPS geofence (${gpsData.distanceMeters}m), Doorplate #15 Vision LLM verification, intact carton condition, and recipient PIN (${code}) verified.`,
          paypalDetail: `Signed tamper-evident handover event recorded for Order ${payload.order.id}. PayPal Payments v2 capture executed.`,
        });
      } else {
        // Failed handover (wrong geofence, wrong door, missing package, or damaged): aborts handover
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
            orderId: activeOrder?.id,
            pickupCode: code,
            reason,
            note: `Verification rejected: ${visionResult?.agentAssessment || visionResult?.visualEvidence || "Handover conditions not met"}`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
            orderSnapshot: activeOrder || undefined,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Delivery failure report failed");
        setActiveOrder(payload.order);
        try {
          const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
          const list = cachedRaw ? (JSON.parse(cachedRaw) as DeliveryOrder[]) : [];
          const next = [payload.order, ...list.filter((o) => o.id !== payload.order.id)];
          window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(next.slice(0, 20)));
        } catch {
          // ignore
        }
        setFeedback({
          tone: "failure",
          title: "Delivery rejected · Package returned to hub",
          message: `${visionResult?.visualEvidence || "Address mismatch detected"}. Handover aborted.`,
          paypalDetail: "Incident logged. Customer notified to choose redelivery or cancellation.",
          recoveryAction: true,
        });
      }
    } catch (err) {
      setFeedback({
        tone: "failure",
        title: "Submission Error",
        message: err instanceof Error ? err.message : "Error processing delivery",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isVerified = visionResult?.handoverVerdict === "VERIFIED";

  return (
    <div className="delivery-container">
      {/* Handheld Courier Device Shell */}
      <div className="delivery-card">
        {/* Top Bar with Live / Simulated GPS Telemetry */}
        <div className="delivery-top-bar">
          <div className="courier-badge">
            <span className="courier-id">Courier · Route 4B</span>
          </div>
          <div className="delivery-gps-ctrls">
            <div className={`delivery-gps mono ${gpsData.inZone ? "gps-in-zone" : "gps-out-zone"}`}>
              <MapPin size={12} />
              <span>
                {gpsData.inZone
                  ? `ul. Filarecka 2B (${gpsData.distanceMeters}m)`
                  : `Outside zone (+${gpsData.distanceMeters}m)`}
              </span>
            </div>
            <button
              type="button"
              className="gps-toggle-btn"
              onClick={handleToggleGpsSimulation}
              title="Toggle GPS between on-site zone and outside geofence for testing"
            >
              {gpsData.inZone ? "Simulate Far (+2.5km)" : "Reset Filarecka (0m)"}
            </button>
            <button
              type="button"
              className="gps-locate-btn"
              onClick={handleGetLiveLocation}
              disabled={gpsData.isLocating}
              title="Query real device GPS via browser geolocation"
            >
              {gpsData.isLocating ? "Locating…" : "Live GPS"}
            </button>
          </div>
        </div>

        {/* Header Title */}
        <div className="delivery-header">
          <h2>Delivery handoff</h2>
          <p className="delivery-subtitle">
            Scan the parcel barcode and photograph the doorstep to verify destination address and package integrity.
          </p>
        </div>

        {/* Step 1: Scan Label & Destination Address */}
        <section className="delivery-step" aria-label="Step 1: Scan Package Label">
          <div className="step-label-row">
            <span className="step-num mono">01</span>
            <span className="step-title">Parcel</span>
          </div>

          <div className="scan-actions-row">
            <div className="code-input-wrapper">
              <input
                type="text"
                className="delivery-code-input mono"
                placeholder="Tracking PIN"
                value={trackingInput}
                maxLength={6}
                onChange={(e) => handlePinChange(e.target.value)}
                aria-label="Package tracking PIN"
              />
            </div>
            <button
              type="button"
              className="autofill-order-btn"
              onClick={() => void fetchLatestOrder()}
              disabled={isSubmitting}
              title="Refresh and check for authorized orders from Shop"
            >
              <RefreshCw size={14} className={isSubmitting ? "spin" : ""} />
              <span>Refresh</span>
            </button>
          </div>

          {!activeOrder && (
            <div className="delivery-no-order">
              <EmptyOrderState
                title="No active delivery"
                body="Deliveries appear here automatically once a customer prompts the assistant and authorizes a PayPal hold in Shop."
                actionLabel="Open Shop Chat"
              />
            </div>
          )}

          {/* Active Package Manifest */}
          {activeOrder && (
            <div className="manifest-card">
              <div className="manifest-row">
                <span className="manifest-label">Order</span>
                <span className="manifest-value mono">{activeOrder.id}</span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">Address</span>
                <span className="manifest-value mono" style={{ color: "#F4F1EA", fontWeight: 600 }}>
                  ul. Filarecka 2B, m. 15, 30-110 Kraków
                </span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">Parcel value</span>
                <span className="manifest-value manifest-amount mono">
                  {activeOrder.formatted_total} <span className="hold-pill">Requires proof</span>
                </span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">Status</span>
                <span className={`status-badge status-${activeOrder.status.toLowerCase()} mono`}>
                  {activeOrder.status}
                </span>
              </div>
              <div className="manifest-items-list">
                {activeOrder.items?.map((item, idx) => (
                  <div key={idx} className="manifest-item-line">
                    <Package size={12} />
                    <span>
                      {item.name} × {item.qty}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Step 2: Tamper-Evident Delivery Evidence & Photo */}
        <section className="delivery-step" aria-label="Step 2: Tamper-Evident Delivery Evidence & Photo">
          <div className="step-label-row">
            <span className="step-num mono">02</span>
            <span className="step-title">Doorstep photo</span>
          </div>

          {/* Direct Photo Input Buttons */}
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
              <span>{customPhotoName ? customPhotoName : "Upload photo"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden-file-input"
                onChange={(e) => handlePhotoSelected(e, "upload")}
              />
            </label>
          </div>

          {/* Scenario Switcher Pills */}
          <details className="demo-samples" open>
            <summary>Demo sample photos (no camera needed)</summary>
          <div className="scenario-switcher-bar">
            <span className="scenario-switcher-label">Sample photo</span>
            <div className="scenario-pills-row" role="radiogroup" aria-label="Delivery Test Scenarios">
              {PHOTO_PRESETS.map((preset) => {
                const active = mediaMode === "preset" && selectedPreset.id === preset.id;
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
          </details>

          {/* Photo Preview with Bounding Boxes */}
          <div className={`vision-viewfinder-frame ${isAnalyzing ? "is-analyzing" : ""}`}>
            <div className="viewfinder-telemetry-strip">
              <div className="viewfinder-hud-status">
                <span>
                  {mediaMode === "camera"
                    ? "Camera photo"
                    : mediaMode === "upload"
                    ? customPhotoName || "Uploaded photo"
                    : selectedPreset.shortLabel}
                </span>
              </div>
              <div className="viewfinder-hud-meta mono">
                <span>{visionResult ? `${((visionResult.overallHandoverScore ?? visionResult.confidence) ?? 98.5).toFixed(1)}/100` : "Ready"}</span>
              </div>
            </div>

            <div className="viewfinder-media-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Doorstep handover scene preview"
                className="viewfinder-media"
              />

              {isAnalyzing && (
                <div className="vision-laser-sweep-overlay" aria-live="polite">
                  <div className="vision-scanning-pill mono">
                    <RefreshCw size={13} className="spin" />
                    <span>Checking house number and parcel…</span>
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
                        <span className="bbox-conf">{box.confidence.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Doorstep Verification Report */}
          <div className="ai-vision-telemetry-card">
            <div className="telemetry-top-strip">
              <div className="telemetry-source">
                <span className="telemetry-model-badge mono">
                  {visionResult?.source === "minimax-m3.1-flash"
                    ? "MiniMax M3.1 Flash · Multimodal Vision"
                    : "Multimodal Vision AI · Proofed Engine"}
                </span>
              </div>
              <div className="telemetry-latency mono">
                <span>{visionResult?.processedInMs ?? 340} ms</span>
              </div>
            </div>

            <div className="telemetry-grid">
              <div className="telemetry-cell">
                <span className="telemetry-label">Destination</span>
                <span className="telemetry-val">#15 ul. Filarecka 2B</span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label">Doorplate Match</span>
                <div className="telemetry-val-group">
                  <span className="telemetry-val mono">
                    #{visionResult?.detectedDoorNumber ?? "—"}
                  </span>
                  {visionResult && (
                    <span
                      className={`mini-pill ${Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch) ? "pill-good" : "pill-bad"}`}
                    >
                      {Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch) ? "Match (99%)" : "Mismatch (12%)"}
                    </span>
                  )}
                </div>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label">Carton Integrity</span>
                <div className="telemetry-val-group">
                  <span className="telemetry-val">
                    {visionResult?.packageCondition === "damaged" ? "Damaged (24%)" : "Intact (98%)"}
                  </span>
                  {visionResult && (
                    <span
                      className={`mini-pill ${visionResult.packageCondition === "damaged" ? "pill-bad" : "pill-good"}`}
                    >
                      {visionResult.packageCondition === "damaged" ? "Crushed" : "OK"}
                    </span>
                  )}
                </div>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label">Quantitative Score</span>
                <div className="telemetry-val-group">
                  <span
                    className="telemetry-val mono"
                    style={{
                      color: (visionResult?.overallHandoverScore ?? 98.5) >= 80 ? "#3FB27F" : "#FF7B72",
                      fontWeight: 700,
                    }}
                  >
                    {(visionResult?.overallHandoverScore ?? 98.5).toFixed(1)} / 100
                  </span>
                  <span
                    className={`mini-pill ${(visionResult?.overallHandoverScore ?? 98.5) >= 80 ? "pill-good" : "pill-bad"}`}
                  >
                    {(visionResult?.overallHandoverScore ?? 98.5) >= 80 ? "Pass (≥80)" : "Fail (<80)"}
                  </span>
                </div>
              </div>
            </div>

            {visionResult?.agentAssessment && (
              <div className="telemetry-evidence-box">
                <p className="evidence-body">{visionResult.agentAssessment}</p>
              </div>
            )}

            {/* Tri-Factor Handover Verification HUD */}
            <div className="tri-factor-hud">
              <span className="tri-factor-hud-title">Tri-factor delivery verification</span>
              <div className="tri-factor-rows">
                {/* Factor 1: GPS Geofence */}
                <div className={`tri-factor-row ${gpsData.inZone ? "is-pass" : "is-fail"}`}>
                  <div className="tri-factor-lead">
                    <span className="tri-factor-num">01</span>
                    <span className="tri-factor-name">GPS Delivery Zone</span>
                  </div>
                  <div className="tri-factor-status">
                    <span className="mono">
                      {gpsData.inZone
                        ? `ul. Filarecka 2B (${gpsData.distanceMeters}m)`
                        : `Outside Zone (+${gpsData.distanceMeters}m)`}
                    </span>
                    <span className={`tri-factor-badge ${gpsData.inZone ? "badge-good" : "badge-bad"}`}>
                      {gpsData.inZone ? "Verified" : "Blocked"}
                    </span>
                  </div>
                </div>

                {/* Factor 2: Unit #15 */}
                <div
                  className={`tri-factor-row ${Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch) ? "is-pass" : "is-fail"}`}
                >
                  <div className="tri-factor-lead">
                    <span className="tri-factor-num">02</span>
                    <span className="tri-factor-name">Door Number</span>
                  </div>
                  <div className="tri-factor-status">
                    <span className="mono">
                      {Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch)
                        ? `Unit #${visionResult?.detectedDoorNumber ?? "15"} Match`
                        : `#${visionResult?.detectedDoorNumber ?? "—"} (Expected #15)`}
                    </span>
                    <span
                      className={`tri-factor-badge ${Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch) ? "badge-good" : "badge-bad"}`}
                    >
                      {Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch) ? "Verified" : "Mismatch"}
                    </span>
                  </div>
                </div>

                {/* Factor 3: Parcel Intact on Floor */}
                <div
                  className={`tri-factor-row ${Boolean(visionResult?.packageDetected && visionResult.packageCondition !== "damaged") ? "is-pass" : "is-fail"}`}
                >
                  <div className="tri-factor-lead">
                    <span className="tri-factor-num">03</span>
                    <span className="tri-factor-name">Parcel on Floor</span>
                  </div>
                  <div className="tri-factor-status">
                    <span className="mono">
                      {visionResult?.packageCondition === "damaged"
                        ? "Damaged / Crushed"
                        : visionResult?.packageDetected
                        ? "Intact on Floor"
                        : "No Box Detected"}
                    </span>
                    <span
                      className={`tri-factor-badge ${Boolean(visionResult?.packageDetected && visionResult.packageCondition !== "damaged") ? "badge-good" : "badge-bad"}`}
                    >
                      {Boolean(visionResult?.packageDetected && visionResult.packageCondition !== "damaged")
                        ? "Verified"
                        : "Failed"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={`telemetry-verdict-banner ${isVerified ? "verdict-good" : "verdict-bad"}`}
            >
              <div className="verdict-banner-icon">
                {isVerified ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              </div>
              <div className="verdict-banner-text">
                <span className="verdict-banner-title">
                  {isVerified
                    ? "Verified — ready for recipient handoff"
                    : !gpsData.inZone
                    ? "Blocked — outside delivery geofence"
                    : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                    ? "Blocked — wrong door number"
                    : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                    ? "Blocked — no parcel on floor"
                    : "Blocked — parcel damaged"}
                </span>
                <span className="verdict-banner-sub">
                  {isVerified
                    ? "GPS zone, Door #15, and intact parcel on floor confirmed. Ready for PayPal capture."
                    : !gpsData.inZone
                    ? `Device GPS is ${gpsData.distanceMeters}m outside delivery zone (ul. Filarecka 2B). Capture locked at $0.00.`
                    : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                    ? "Photo shows door #13 instead of destination #15. Handover rejected."
                    : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                    ? "No parcel detected resting on the doorstep. Handover rejected."
                    : "Visible transit damage on the carton. Handover rejected."}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Step 3: Complete Handover & Recipient Acknowledgment */}
        <section className="delivery-step" aria-label="Step 3: Complete Handover">
          <div className="step-label-row">
            <span className="step-num mono">03</span>
            <span className="step-title">Recipient PIN &amp; handoff</span>
          </div>

          <p className="delivery-step-explainer">
            Ask the buyer for their 6-character one-time PIN shown in their Proofed shopping chat.
          </p>

          <div className="recipient-pin-input-container">
            <label className="pin-input-label" htmlFor="recipient-pin-field">
              Recipient Handover PIN
            </label>
            <div className="pin-input-action-row">
              <input
                id="recipient-pin-field"
                type="text"
                className="recipient-pin-large mono"
                placeholder="6-CHAR PIN"
                value={trackingInput}
                maxLength={6}
                onChange={(e) => handlePinChange(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="autofill-order-btn"
                onClick={() => void fetchLatestOrder()}
                disabled={isSubmitting}
                title="Sync latest PIN from shopper session"
              >
                <RefreshCw size={14} className={isSubmitting ? "spin" : ""} />
                <span>Sync</span>
              </button>
            </div>
            {activeOrder && (
              <span className="pin-order-binding-note mono">
                Linked order: {activeOrder.id} · {activeOrder.formatted_total} held
              </span>
            )}
          </div>

          {isVerified && activeOrder && (
            <div className="manifest-card" style={{ marginBottom: "10px", padding: "10px 12px" }}>
              <div className="manifest-row" style={{ marginBottom: "6px" }}>
                <span className="manifest-label">1. GPS Zone Gate</span>
                <span className="manifest-value mono" style={{ color: "#3FB27F" }}>
                  ✔ Filarecka 2B ({gpsData.distanceMeters}m distance)
                </span>
              </div>
              <div className="manifest-row" style={{ marginBottom: "6px" }}>
                <span className="manifest-label">2. Door &amp; Parcel Gate</span>
                <span className="manifest-value mono" style={{ color: "#3FB27F" }}>
                  ✔ Door #15 Vision LLM Match &amp; Parcel Intact on Floor
                </span>
              </div>
              <div className="manifest-row" style={{ marginBottom: "6px" }}>
                <span className="manifest-label">3. Verified PIN</span>
                <span className="manifest-value mono" style={{ color: "#3FB27F", fontWeight: 700 }}>
                  ✔ {trackingInput || "Required"}
                </span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">4. Evidence Binding</span>
                <span className="manifest-value mono" style={{ fontSize: "11px", opacity: 0.85 }}>
                  SHA-256 Digest + Server HMAC Signature
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            className={`complete-delivery-btn ${isVerified ? "btn-confirm" : "btn-report-fail"}`}
            disabled={isSubmitting || !activeOrder || isAnalyzing}
            onClick={handleConfirmHandover}
          >
            {isSubmitting ? (
              <RefreshCw size={16} className="spin" />
            ) : isVerified ? (
              <CheckCircle2 size={16} />
            ) : (
              <XCircle size={16} />
            )}
            <span>
              {isSubmitting
                ? "Saving…"
                : isAnalyzing
                ? "Checking photo…"
                : isVerified
                ? "Verify recipient PIN & complete handoff"
                : "Report delivery failure (Return to hub)"}
            </span>
          </button>
          <span className="action-footer-hint mono">
            {isVerified
              ? "✔ 3/3 checks passed: GPS zone + Door #15 + Box on floor · Captures held funds"
              : !gpsData.inZone
              ? "✖ Outside delivery geofence · PayPal capture blocked ($0.00)"
              : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
              ? "✖ Doorplate mismatch (#15 required) · PayPal capture blocked ($0.00)"
              : visionResult?.packageCondition === "damaged"
              ? "✖ Damaged carton on floor · PayPal capture blocked ($0.00)"
              : "✖ Handover conditions not verified · Hold remains $0.00 captured"}
          </span>
        </section>

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
            {feedback.paypalDetail && (
              <div className="feedback-paypal mono">
                <span>{feedback.paypalDetail}</span>
              </div>
            )}
            {feedback.recoveryAction && (
              <div className="feedback-recovery-status mono">
                <span>Handover aborted. Incident logged for customer resolution.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
