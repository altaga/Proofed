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
  detectedDoorNumber: string | null;
  targetDoorNumber?: string;
  targetAddress?: string;
  isDoorMatch: boolean;
  packageDetected: boolean;
  packageCondition: string;
  confidence: number;
  visualEvidence: string;
  agentAssessment?: string;
  boundingBoxes: BoundingBox[];
  handoverVerdict: "VERIFIED" | "REJECTED_MISMATCH" | "REJECTED_DAMAGED" | "REJECTED_NO_PACKAGE";
  processedInMs: number;
  error?: string;
};

const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: "correct",
    shortLabel: "Door #744",
    tag: "Match",
    doorNumber: "744",
    imagePath: "/delivery/door-744.svg",
    expectedStatus: "verified",
  },
  {
    id: "wrong_door",
    shortLabel: "Door #742",
    tag: "Mismatch",
    doorNumber: "742",
    imagePath: "/delivery/door-742.svg",
    expectedStatus: "mismatch",
  },
  {
    id: "damaged",
    shortLabel: "Damaged box",
    tag: "Damaged",
    doorNumber: "744",
    imagePath: "/delivery/crushed-box.svg",
    expectedStatus: "damaged",
  },
];

export function DeliveryApp() {
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<PhotoPreset>(PHOTO_PRESETS[0]);
  const [mediaMode, setMediaMode] = useState<"preset" | "camera" | "upload">("preset");
  const [previewUrl, setPreviewUrl] = useState<string>(PHOTO_PRESETS[0].imagePath);
  const [customPhotoName, setCustomPhotoName] = useState<string | null>(null);
  const [customPhotoBase64, setCustomPhotoBase64] = useState<string | null>(null);

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

  // Fetch active held order or latest order (with cross-instance localStorage fallback)
  async function fetchLatestOrder() {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      let orders: DeliveryOrder[] = data.orders || [];
      try {
        const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
        if (cachedRaw) {
          const cachedOrders = JSON.parse(cachedRaw) as DeliveryOrder[];
          if (Array.isArray(cachedOrders)) {
            for (const c of cachedOrders) {
              if (!orders.some((o) => o.id === c.id)) {
                orders = [c, ...orders];
              }
            }
          }
        }
      } catch {
        // ignore storage errors
      }
      const held = orders.find(
        (o) => o.status === "AUTHORIZED" || o.status === "DELIVERY_CONFIRMED" || o.status === "DELIVERY_FAILED",
      );
      if (held) {
        setActiveOrder(held);
        if (held.pickup_code) setTrackingInput(held.pickup_code);
      } else if (orders.length > 0) {
        setActiveOrder(orders[0]);
        if (orders[0].pickup_code) setTrackingInput(orders[0].pickup_code);
      }
    } catch {
      // Quiet fail on initial load
    }
  }

  // Trigger computer vision verification
  const runVisionVerification = useCallback(
    async (params: { image?: string; presetId?: string }) => {
      setIsAnalyzing(true);
      try {
        const res = await fetch("/api/vision/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: params.image,
            presetId: params.presetId,
            targetDoorNumber: "744",
            targetAddress: "744 Maple Street",
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
    [],
  );

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

    const code = trackingInput || activeOrder?.pickup_code;
    if (!code) {
      setFeedback({
        tone: "failure",
        title: "Scan Required",
        message: "Please scan or enter the 6-character package label code.",
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
            note: `Handover verified: ${visionResult?.visualEvidence || "Doorstep OCR and parcel condition confirmed"} (${visionResult?.confidence.toFixed(1)}% confidence) · Recipient handover PIN verified`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
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
          title: "Handover verified · Custody transferred",
          message: `Package delivered to #744 Maple Street. Doorplate OCR, parcel condition (${visionResult?.confidence.toFixed(1)}%), and recipient handover PIN (${code}) verified.`,
          paypalDetail: `Signed tamper-evident handover event recorded for Order ${payload.order.id}.`,
        });
      } else {
        // Failed handover (wrong door, missing package, or damaged): aborts handover
        const reason =
          visionResult?.handoverVerdict === "REJECTED_MISMATCH"
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
        {/* Top Bar */}
        <div className="delivery-top-bar">
          <div className="courier-badge">
            <span className="courier-id">Courier · Route 4B</span>
          </div>
          <div className="delivery-gps mono">
            <MapPin size={12} />
            <span>744 Maple St</span>
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
                placeholder="Parcel code"
                value={trackingInput}
                maxLength={6}
                onChange={(e) => setTrackingInput(e.target.value.toUpperCase().slice(0, 6))}
                aria-label="Package tracking code"
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
                  744 Maple St, Apt 2B
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

        {/* Step 2: Proof of Delivery Photo & Verification */}
        <section className="delivery-step" aria-label="Step 2: Proof of Delivery Photo">
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
                <span>{visionResult ? `${visionResult.confidence.toFixed(1)}%` : "Ready"}</span>
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
                <span>Verification</span>
              </div>
              <div className="telemetry-latency mono">
                <span>{visionResult?.processedInMs ?? 340} ms</span>
              </div>
            </div>

            <div className="telemetry-grid">
              <div className="telemetry-cell">
                <span className="telemetry-label">Destination</span>
                <span className="telemetry-val">#744 Maple St</span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label">Door number</span>
                <div className="telemetry-val-group">
                  <span className="telemetry-val mono">
                    #{visionResult?.detectedDoorNumber ?? "—"}
                  </span>
                  {visionResult && (
                    <span
                      className={`mini-pill ${visionResult.isDoorMatch ? "pill-good" : "pill-bad"}`}
                    >
                      {visionResult.isDoorMatch ? "Match" : "Mismatch"}
                    </span>
                  )}
                </div>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label">Location</span>
                <span className="telemetry-val">
                  {visionResult ? (
                    visionResult.isDoorMatch ? (
                      <span style={{ color: "#3FB27F" }}>744 Maple St</span>
                    ) : (
                      <span style={{ color: "#FF7B72" }}>Wrong address (+120m)</span>
                    )
                  ) : (
                    "Checking…"
                  )}
                </span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label">Condition</span>
                <div className="telemetry-val-group">
                  <span className="telemetry-val">
                    {visionResult?.packageCondition === "damaged" ? "Damaged" : "Intact"}
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
            </div>

            {visionResult?.agentAssessment && (
              <div className="telemetry-evidence-box">
                <p className="evidence-body">{visionResult.agentAssessment}</p>
              </div>
            )}

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
                    : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                    ? "Blocked — wrong house number"
                    : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                    ? "Blocked — no parcel in photo"
                    : "Blocked — parcel damaged"}
                </span>
                <span className="verdict-banner-sub">
                  {isVerified
                    ? "Door #744 matches the order address and the parcel is intact."
                    : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                    ? "Photo shows #742 instead of destination #744 Maple St. Handover rejected."
                    : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                    ? "No parcel detected on the doorstep. Handover rejected."
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
            <span className="step-title">Recipient acknowledgment &amp; handoff</span>
          </div>

          {isVerified && activeOrder && (
            <div className="manifest-card" style={{ marginBottom: "10px", padding: "10px 12px" }}>
              <div className="manifest-row" style={{ marginBottom: "6px" }}>
                <span className="manifest-label">1. Computer Vision</span>
                <span className="manifest-value mono" style={{ color: "#3FB27F" }}>
                  ✔ Door #744 OCR &amp; Parcel Intact
                </span>
              </div>
              <div className="manifest-row" style={{ marginBottom: "6px" }}>
                <span className="manifest-label">2. Recipient One-Time PIN</span>
                <span className="manifest-value mono" style={{ color: "#F4F1EA" }}>
                  {trackingInput || "Enter 6-char code"}
                </span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">3. Evidence Binding</span>
                <span className="manifest-value mono" style={{ fontSize: "11px", opacity: 0.85 }}>
                  SHA-256 Digest + Server HMAC
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
