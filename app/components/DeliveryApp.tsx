"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  MapPin,
  Package,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";

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
    shortLabel: "#744 Correct",
    tag: "VERIFIED",
    doorNumber: "744",
    imagePath: "/delivery/door-744.svg",
    expectedStatus: "verified",
  },
  {
    id: "wrong_door",
    shortLabel: "#742 Wrong House",
    tag: "MISMATCH",
    doorNumber: "742",
    imagePath: "/delivery/door-742.svg",
    expectedStatus: "mismatch",
  },
  {
    id: "damaged",
    shortLabel: "Transit Damage",
    tag: "DAMAGED",
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

  // Fetch active held order or latest order
  async function fetchLatestOrder() {
    try {
      const res = await fetch("/api/orders");
      const data = await res.json();
      const orders: DeliveryOrder[] = data.orders || [];
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

  // Seed new held order for testing
  async function handleSeedOrder() {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/demo/seed-held", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: "ELEC-GAN-100",
          note: "Residential Doorstep Courier Delivery",
        }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setActiveOrder(data.order);
        if (data.order.pickup_code) setTrackingInput(data.order.pickup_code);
        setFeedback({
          tone: "info",
          title: "Order Ready for Dispatch",
          message: `Package ${data.order.id} seeded in AUTHORIZED (hold) state. PayPal hold placed. Funds not yet captured ($0.00 charged).`,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
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
        // Successful handover: triggers PayPal Payments v2 /capture
        const res = await fetch("/api/device/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder?.id,
            pickupCode: code,
            note: `Agent Certified: ${visionResult?.visualEvidence || "Doorstep and parcel verified"} (${visionResult?.confidence.toFixed(1)}% confidence)`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Confirmation failed");
        setActiveOrder(payload.order);
        setFeedback({
          tone: "success",
          title: "Handover Certified · Payment Captured",
          message: `Package successfully delivered to #744 Maple Street. The AI agent verified the house number plate and intact parcel condition (${visionResult?.confidence.toFixed(1)}% confidence).`,
          paypalDetail: `PayPal Payments v2 /capture executed. Captured ${payload.order.formatted_total}.`,
        });
      } else {
        // Failed handover (wrong door, missing package, or damaged): locks capture, leaves hold intact
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
            note: `AI Agent Rejection: ${visionResult?.agentAssessment || visionResult?.visualEvidence || "Handover conditions not met"}`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Delivery failure report failed");
        setActiveOrder(payload.order);
        setFeedback({
          tone: "failure",
          title: "Handover Rejected · Zero-Capture Safety Lock Engaged",
          message: `Delivery blocked by AI agent: ${visionResult?.visualEvidence || "Address mismatch detected"}. Capture permanently locked. Customer was charged $0.00.`,
          paypalDetail: `PayPal hold remains active. Autonomous agent notified to offer customer replacement or refund.`,
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
        {/* Top Hardware Telemetry Bar */}
        <div className="delivery-top-bar">
          <div className="courier-badge">
            <span className="courier-pulse" />
            <span className="courier-id mono">COURIER UNIT #09 · ROUTE 4B</span>
          </div>
          <div className="delivery-gps mono">
            <MapPin size={12} />
            <span>37.7749° N, 122.4194° W</span>
          </div>
        </div>

        {/* Header Title */}
        <div className="delivery-header">
          <h2>Doorstep Delivery Terminal</h2>
          <p className="delivery-subtitle">
            Snap delivery photo. The autonomous agent identifies the door number and confirms the correct destination before PayPal funds are captured.
          </p>
        </div>

        {/* Step 1: Scan Label & Destination Address */}
        <section className="delivery-step" aria-label="Step 1: Scan Package Label">
          <div className="step-label-row">
            <span className="step-num mono">01</span>
            <span className="step-title">SCAN PARCEL MANIFEST</span>
          </div>

          <div className="scanner-viewfinder">
            <div className="viewfinder-laser" />
            <div className="viewfinder-content">
              <QrCode size={34} className="scanner-icon" />
              <div className="scanner-text-group">
                <span className="scanner-target-addr mono">TARGET DESTINATION: 744 MAPLE ST (APT 2B)</span>
                <span className="scanner-inst">Package must be delivered to door #744</span>
              </div>
            </div>
          </div>

          <div className="scan-actions-row">
            <div className="code-input-wrapper">
              <input
                type="text"
                className="delivery-code-input mono"
                placeholder="PARCEL CODE (e.g. K9Z2X7)"
                value={trackingInput}
                maxLength={6}
                onChange={(e) => setTrackingInput(e.target.value.toUpperCase().slice(0, 6))}
                aria-label="Package tracking code"
              />
            </div>
            <button
              type="button"
              className="autofill-order-btn"
              onClick={handleSeedOrder}
              disabled={isSubmitting}
              title="Generate a new active order ready for delivery"
            >
              <RefreshCw size={14} className={isSubmitting ? "spin" : ""} />
              <span>New Package</span>
            </button>
          </div>

          {/* Active Package Manifest */}
          {activeOrder && (
            <div className="manifest-card">
              <div className="manifest-row">
                <span className="manifest-label">ORDER ID</span>
                <span className="manifest-value mono">{activeOrder.id}</span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">DESTINATION</span>
                <span className="manifest-value mono" style={{ color: "#FF7A3D", fontWeight: 700 }}>
                  #744 MAPLE STREET, APT 2B
                </span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">HOLD AMOUNT</span>
                <span className="manifest-value manifest-amount mono">
                  {activeOrder.formatted_total} <span className="hold-pill">HELD · $0.00 CHARGED</span>
                </span>
              </div>
              <div className="manifest-row">
                <span className="manifest-label">STATUS</span>
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

        {/* Step 2: Proof of Delivery Photo & Agent Verification */}
        <section className="delivery-step" aria-label="Step 2: Proof of Delivery Photo">
          <div className="step-label-row">
            <span className="step-num mono">02</span>
            <span className="step-title">DOORSTEP PROOF PHOTO</span>
          </div>

          {/* Direct Photo Input Buttons */}
          <div className="capture-modes-row">
            <label className="capture-option-btn btn-take-photo">
              <Camera size={15} />
              <span>Take Photo</span>
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
              <span>{customPhotoName ? `Photo: ${customPhotoName}` : "Upload Photo"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden-file-input"
                onChange={(e) => handlePhotoSelected(e, "upload")}
              />
            </label>
          </div>

          {/* Sleek, Compact Scenario Switcher Pills */}
          <div className="scenario-switcher-bar">
            <span className="scenario-switcher-label mono">TEST SCENARIO:</span>
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

          {/* High-Fidelity Photo Preview with Pixel-Accurate Computer Vision HUD */}
          <div className={`vision-viewfinder-frame ${isAnalyzing ? "is-analyzing" : ""}`}>
            {/* Top Viewfinder Metadata Header */}
            <div className="viewfinder-telemetry-strip">
              <div className="viewfinder-hud-status">
                <span className="hud-dot dot-archive" />
                <span className="mono">
                  {mediaMode === "camera"
                    ? "DEVICE CAMERA SNAPSHOT"
                    : mediaMode === "upload"
                    ? `IMAGE: ${customPhotoName || "CUSTOM"}`
                    : `SCENARIO: ${selectedPreset.shortLabel.toUpperCase()}`}
                </span>
              </div>
              <div className="viewfinder-hud-meta mono">
                <span>{visionResult ? `${visionResult.confidence.toFixed(1)}% CONFIDENCE` : "READY"}</span>
              </div>
            </div>

            {/* Media Layer (Exact 16:10 Aspect Ratio Container) */}
            <div className="viewfinder-media-container">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Doorstep handover scene preview"
                className="viewfinder-media"
              />

              {/* Optical Corner Reticles */}
              <div className="reticle-corner reticle-tl" />
              <div className="reticle-corner reticle-tr" />
              <div className="reticle-corner reticle-bl" />
              <div className="reticle-corner reticle-br" />

              {/* Scanning Laser Bar (Visible while AI Agent is inspecting) */}
              {isAnalyzing && (
                <div className="vision-laser-sweep-overlay" aria-live="polite">
                  <div className="vision-laser-sweep" />
                  <div className="vision-scanning-pill mono">
                    <Cpu size={14} className="spin" />
                    <span>AGENT INSPECTING HOUSE NUMBER & PARCEL...</span>
                  </div>
                </div>
              )}

              {/* Computer Vision Bounding Boxes with Auto-Aligning Tags (Never Cut Off) */}
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
                      <span className="bbox-corner tl" />
                      <span className="bbox-corner tr" />
                      <span className="bbox-corner bl" />
                      <span className="bbox-corner br" />
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

          {/* Autonomous Agent Doorstep Verification Report */}
          <div className="ai-vision-telemetry-card">
            <div className="telemetry-top-strip">
              <div className="telemetry-source">
                <Bot size={14} />
                <span className="mono">AGENT VERIFICATION AUDIT</span>
              </div>
              <div className="telemetry-latency mono">
                <Clock size={12} />
                <span>{visionResult?.processedInMs ?? 340}ms</span>
              </div>
            </div>

            {/* Target vs Detected Metrics */}
            <div className="telemetry-grid">
              <div className="telemetry-cell">
                <span className="telemetry-label mono">ORDER DESTINATION</span>
                <span className="telemetry-val">#744 Maple St</span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label mono">OCR DOOR NUMBER</span>
                <div className="telemetry-val-group">
                  <span className="telemetry-val mono">
                    #{visionResult?.detectedDoorNumber ?? "---"}
                  </span>
                  {visionResult && (
                    <span
                      className={`mini-pill ${visionResult.isDoorMatch ? "pill-good" : "pill-bad"}`}
                    >
                      {visionResult.isDoorMatch ? "MATCH #744" : "MISMATCH"}
                    </span>
                  )}
                </div>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label mono">LOCATION AUDIT</span>
                <span className="telemetry-val mono">
                  {visionResult ? (
                    visionResult.isDoorMatch ? (
                      <span style={{ color: "#00D687" }}>CORRECT LOCATION</span>
                    ) : (
                      <span style={{ color: "#FF7B72" }}>WRONG HOUSE (+120m)</span>
                    )
                  ) : (
                    "Auditing..."
                  )}
                </span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label mono">PARCEL INTEGRITY</span>
                <div className="telemetry-val-group">
                  <span className="telemetry-val mono">
                    {visionResult?.packageCondition.toUpperCase() ?? "INSPECTING"}
                  </span>
                  {visionResult && (
                    <span
                      className={`mini-pill ${visionResult.packageCondition === "damaged" ? "pill-bad" : "pill-good"}`}
                    >
                      {visionResult.packageCondition === "damaged" ? "BREACH >4.5G" : "INTACT"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Autonomous Agent Direct Assessment Statement */}
            {visionResult?.agentAssessment && (
              <div className="telemetry-evidence-box">
                <div className="agent-statement-header">
                  <Bot size={13} style={{ color: "#FF7A3D" }} />
                  <span className="evidence-title mono">AGENT VERIFICATION STATEMENT:</span>
                </div>
                <p className="evidence-body">{visionResult.agentAssessment}</p>
              </div>
            )}

            {/* Real-time Handover Verdict Banner */}
            <div
              className={`telemetry-verdict-banner ${isVerified ? "verdict-good" : "verdict-bad"}`}
            >
              <div className="verdict-banner-icon">
                {isVerified ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <div className="verdict-banner-text">
                <span className="verdict-banner-title mono">
                  {isVerified
                    ? "HANDOVER CERTIFIED · SAFE TO CAPTURE PAYPAL HOLD"
                    : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                    ? "HANDOVER BLOCKED · WRONG DOOR NUMBER DETECTED"
                    : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                    ? "HANDOVER BLOCKED · NO PARCEL DETECTED ON PORCH"
                    : "HANDOVER BLOCKED · TRANSIT DAMAGE DETECTED"}
                </span>
                <span className="verdict-banner-sub">
                  {isVerified
                    ? "Doorplate OCR matches manifest destination (#744). Parcel is intact. PayPal Payments v2 /capture authorized."
                    : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                    ? "Camera detected door #742 (+120m away from 744 Maple St). PayPal capture locked at $0.00 to protect buyer."
                    : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                    ? "No delivery parcel identified in photo. PayPal capture locked at $0.00."
                    : "Package compromised on porch. PayPal capture locked at $0.00. Hold preserved."}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Step 3: Complete Handover & Settle */}
        <section className="delivery-step" aria-label="Step 3: Complete Handover">
          <div className="step-label-row">
            <span className="step-num mono">03</span>
            <span className="step-title">EXECUTE SETTLEMENT</span>
          </div>

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
                ? "Recording Handover..."
                : isAnalyzing
                ? "Agent Inspecting Photo..."
                : isVerified
                ? `Confirm Drop & Capture PayPal Hold (${activeOrder?.formatted_total ?? "$24.00"})`
                : "Lock Capture ($0.00 Charged) & Report Failure"}
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
              <div style={{ marginTop: "10px" }}>
                <a
                  href="/client"
                  className="footer-link"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "#2E2B25",
                    padding: "6px 12px",
                    borderRadius: "4px",
                    color: "#F4F1EA",
                    fontWeight: 600,
                  }}
                >
                  <span>Open Customer Chat to Resolve</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Footer Navigation */}
        <div className="delivery-footer-nav">
          <a href="/client" className="footer-link">
            <span>Open Client Chat</span>
            <ExternalLink size={12} />
          </a>
          <span className="sep">·</span>
          <a href="/backend" className="footer-link">
            <span>Open Backend Monitor</span>
            <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}
