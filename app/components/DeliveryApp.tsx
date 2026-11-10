"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  MapPin,
  Package,
  QrCode,
  RefreshCw,
  Scan,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Video,
  VideoOff,
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
  label: string;
  subtitle: string;
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
  isDoorMatch: boolean;
  packageDetected: boolean;
  packageCondition: string;
  confidence: number;
  visualEvidence: string;
  boundingBoxes: BoundingBox[];
  handoverVerdict: "VERIFIED" | "REJECTED_MISMATCH" | "REJECTED_DAMAGED" | "REJECTED_NO_PACKAGE";
  processedInMs: number;
  error?: string;
};

const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: "correct",
    label: "Door #744 (Correct Doorstep)",
    subtitle: "744 Maple St · Brass Numerals · Parcel Intact",
    doorNumber: "744",
    imagePath: "/delivery/door-744.svg",
    expectedStatus: "verified",
  },
  {
    id: "wrong_door",
    label: "Door #742 (Wrong Door Mismatch)",
    subtitle: "742 Evergreen Terr · Mismatch (+120m GPS Delta)",
    doorNumber: "742",
    imagePath: "/delivery/door-742.svg",
    expectedStatus: "mismatch",
  },
  {
    id: "damaged",
    label: "Crushed Carton (Transit Impact)",
    subtitle: "744 Maple St · Impact Sensor >4.5G · Ruptured Flap",
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

  // Live Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  } | null>(null);

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

  // Clean up WebRTC tracks on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Preset Selection
  function handleSelectPreset(preset: PhotoPreset) {
    stopCamera();
    setSelectedPreset(preset);
    setMediaMode("preset");
    setPreviewUrl(preset.imagePath);
    setCustomPhotoName(null);
    setCustomPhotoBase64(null);
    void runVisionVerification({ presetId: preset.id });
  }

  // WebRTC Camera Controls
  async function startCamera() {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("WebRTC camera capture is not supported by your browser environment.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
      setMediaMode("camera");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unable to access device camera";
      setCameraError(msg);
      setIsCameraActive(false);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }

  function captureSnapshot() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }
    const width = video.videoWidth || 800;
    const height = video.videoHeight || 500;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    const base64 = dataUrl.split(",")[1];

    stopCamera();
    setPreviewUrl(dataUrl);
    setCustomPhotoBase64(base64);
    setCustomPhotoName("camera-live-frame.jpg");
    setMediaMode("camera");

    // Run real neural vision on the snapped frame
    void runVisionVerification({ image: dataUrl, presetId: "custom" });
  }

  // File Upload Handler
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setCustomPhotoName(file.name);
    setMediaMode("upload");

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
            note: `Neural Vision Certified: ${visionResult?.visualEvidence || "Doorstep and parcel verified"} (${visionResult?.confidence.toFixed(1)}% confidence)`,
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
          message: `Package successfully delivered to #744 Maple Street. Computer vision confirmed house plate and intact parcel (${visionResult?.confidence.toFixed(1)}% match).`,
          paypalDetail: `PayPal Payments v2 /capture executed. Captured ${payload.order.formatted_total}.`,
        });
      } else {
        // Failed handover (wrong door or damaged): locks capture, leaves hold intact
        const reason =
          visionResult?.handoverVerdict === "REJECTED_MISMATCH" ? "wrong_address" : "item_damaged";
        const res = await fetch("/api/device/fail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder?.id,
            pickupCode: code,
            reason,
            note: `AI Vision Rejection: ${visionResult?.visualEvidence || "Handover conditions not met"}`,
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
          message: `Delivery blocked: ${visionResult?.visualEvidence || "Verification failed"}. Capture locked. Buyer was charged $0.00.`,
          paypalDetail: `PayPal hold remains active. Autonomous agent notified to offer client replacement or release hold.`,
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
      {/* Hidden canvas for video frame extraction */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

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
            <span>37.7749° N, 122.4194° W · RESIDENTIAL</span>
          </div>
        </div>

        {/* Header Title */}
        <div className="delivery-header">
          <h2>Doorstep Delivery Terminal</h2>
          <p className="delivery-subtitle">
            Autonomous computer vision verifies house numbers and package condition before PayPal capture.
          </p>
        </div>

        {/* Step 1: Scan Label */}
        <section className="delivery-step" aria-label="Step 1: Scan Package Label">
          <div className="step-label-row">
            <span className="step-num mono">01</span>
            <span className="step-title">SCAN PARCEL MANIFEST</span>
          </div>

          <div className="scanner-viewfinder">
            <div className="viewfinder-laser" />
            <div className="viewfinder-content">
              <QrCode size={36} className="scanner-icon" />
              <div className="scanner-text-group">
                <span className="scanner-target-addr mono">DESTINATION: 744 MAPLE ST (APT 2B)</span>
                <span className="scanner-inst">Align parcel barcode with laser scanline</span>
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

        {/* Step 2: Proof of Handover Photo & Computer Vision HUD */}
        <section className="delivery-step" aria-label="Step 2: Proof of Delivery Photo and Computer Vision">
          <div className="step-label-row">
            <span className="step-num mono">02</span>
            <span className="step-title">DOORSTEP PROOF & NEURAL VISION</span>
          </div>

          <p className="photo-instructions">
            Select a verified delivery scenario, capture a live camera frame, or upload an image:
          </p>

          {/* Preset Buttons Grid */}
          <div className="preset-grid" role="radiogroup" aria-label="Delivery Scenario Presets">
            {PHOTO_PRESETS.map((preset) => {
              const active = mediaMode === "preset" && selectedPreset.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`preset-btn ${active ? "active" : ""} preset-${preset.expectedStatus}`}
                  onClick={() => handleSelectPreset(preset)}
                >
                  <div className="preset-header">
                    <span className="preset-door mono">#{preset.doorNumber}</span>
                    <span className="preset-tag mono">{preset.expectedStatus.toUpperCase()}</span>
                  </div>
                  <span className="preset-label">{preset.label}</span>
                </button>
              );
            })}
          </div>

          {/* High-Fidelity Optical Viewfinder with Computer Vision HUD */}
          <div className={`vision-viewfinder-frame ${isAnalyzing ? "is-analyzing" : ""}`}>
            {/* Top Viewfinder Telemetry Header */}
            <div className="viewfinder-telemetry-strip">
              <div className="viewfinder-hud-status">
                <span className={`hud-dot ${isCameraActive ? "dot-live" : "dot-archive"}`} />
                <span className="mono">
                  {isCameraActive
                    ? "WEBRTC LIVE SENSOR · 1080P 30FPS"
                    : mediaMode === "upload"
                    ? `IMAGE UPLOAD · ${customPhotoName || "CUSTOM"}`
                    : `DOORSTEP SCENE · #${selectedPreset.doorNumber} ARCHIVE`}
                </span>
              </div>
              <div className="viewfinder-hud-meta mono">
                <span>ISO 200</span>
                <span>1/250s</span>
                <span>f/1.8</span>
              </div>
            </div>

            {/* Media Layer (Live Video OR SVG / Photo Image) */}
            <div className="viewfinder-media-container">
              {isCameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="viewfinder-media viewfinder-video"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt="Doorstep handover scene preview"
                  className="viewfinder-media"
                />
              )}

              {/* Optical Corner Reticles */}
              <div className="reticle-corner reticle-tl" />
              <div className="reticle-corner reticle-tr" />
              <div className="reticle-corner reticle-bl" />
              <div className="reticle-corner reticle-br" />

              {/* Center Target Lock */}
              <div className="reticle-center-crosshair">
                <div className="crosshair-ring" />
                <div className="crosshair-h" />
                <div className="crosshair-v" />
              </div>

              {/* Laser Sweep Scanline (Visible while analyzing) */}
              {isAnalyzing && (
                <div className="vision-laser-sweep-overlay" aria-live="polite">
                  <div className="vision-laser-sweep" />
                  <div className="vision-scanning-pill mono">
                    <Cpu size={14} className="spin" />
                    <span>NEURAL OCR & DAMAGE SCANNING...</span>
                  </div>
                </div>
              )}

              {/* Computer Vision Bounding Boxes Overlay */}
              {!isAnalyzing &&
                !isCameraActive &&
                visionResult?.boundingBoxes?.map((box, idx) => (
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
                    <div className="bbox-tag mono">
                      <span className="bbox-dot" />
                      <span className="bbox-name">{box.label}</span>
                      <span className="bbox-conf">{box.confidence.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
            </div>

            {/* Live Camera Snapshot Controls */}
            {isCameraActive && (
              <div className="camera-live-overlay-bar">
                <button
                  type="button"
                  className="camera-snap-action-btn"
                  onClick={captureSnapshot}
                >
                  <Camera size={16} />
                  <span>SNAP PROOF PHOTO</span>
                </button>
                <button
                  type="button"
                  className="camera-cancel-action-btn"
                  onClick={stopCamera}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Camera Error Alert if permissions fail */}
          {cameraError && (
            <div className="camera-error-banner" role="alert">
              <AlertTriangle size={14} />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Camera & File Upload Action Bar */}
          <div className="capture-modes-row">
            {!isCameraActive ? (
              <button
                type="button"
                className="capture-option-btn"
                onClick={startCamera}
              >
                <Video size={14} />
                <span>Use Live Camera</span>
              </button>
            ) : (
              <button
                type="button"
                className="capture-option-btn active-cam"
                onClick={stopCamera}
              >
                <VideoOff size={14} />
                <span>Stop Camera</span>
              </button>
            )}

            <label className="capture-option-btn upload-btn">
              <Upload size={14} />
              <span>{customPhotoName ? `Photo: ${customPhotoName}` : "Upload Photo"}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden-file-input"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {/* AI Neural Telemetry & Diagnostics Card */}
          <div className="ai-vision-telemetry-card">
            <div className="telemetry-top-strip">
              <div className="telemetry-source">
                <Cpu size={13} />
                <span className="mono">
                  MODEL: {visionResult?.source === "minimax-m3.1-flash" ? "MINIMAX M3.1 FLASH (LIVE MULTIMODAL)" : "PROOFED NEURAL EDGE VISION"}
                </span>
              </div>
              <div className="telemetry-latency mono">
                <Clock size={12} />
                <span>{visionResult?.processedInMs ?? 340}ms</span>
              </div>
            </div>

            <div className="telemetry-grid">
              <div className="telemetry-cell">
                <span className="telemetry-label mono">TARGET DESTINATION</span>
                <span className="telemetry-val">#744 Maple Street (Apt 2B)</span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label mono">OCR DOOR NUMBER</span>
                <span className="telemetry-val mono">
                  {visionResult ? (
                    <>
                      #{visionResult.detectedDoorNumber ?? "NOT FOUND"}
                      <span
                        className={`mini-pill ${visionResult.isDoorMatch ? "pill-good" : "pill-bad"}`}
                      >
                        {visionResult.isDoorMatch ? "MATCH #744" : "MISMATCH"}
                      </span>
                    </>
                  ) : (
                    "Analyzing..."
                  )}
                </span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label mono">PARCEL INTEGRITY</span>
                <span className="telemetry-val mono">
                  {visionResult ? (
                    <>
                      {visionResult.packageCondition.toUpperCase()}
                      <span
                        className={`mini-pill ${visionResult.packageCondition === "damaged" ? "pill-bad" : "pill-good"}`}
                      >
                        {visionResult.packageCondition === "damaged" ? "BREACH >4.5G" : "INTACT"}
                      </span>
                    </>
                  ) : (
                    "Inspecting..."
                  )}
                </span>
              </div>

              <div className="telemetry-cell">
                <span className="telemetry-label mono">AI CONFIDENCE</span>
                <span className="telemetry-val mono">
                  {visionResult ? `${visionResult.confidence.toFixed(1)}%` : "--.-%"}
                </span>
              </div>
            </div>

            {/* Neural Scene Evidence Rationale */}
            {visionResult?.visualEvidence && (
              <div className="telemetry-evidence-box">
                <span className="evidence-title mono">VISUAL PROOF LOG:</span>
                <p className="evidence-body">{visionResult.visualEvidence}</p>
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
                    ? "HANDOVER REJECTED · ADDRESS MISMATCH DETECTED"
                    : "HANDOVER REJECTED · TRANSIT DAMAGE BREACH"}
                </span>
                <span className="verdict-banner-sub">
                  {isVerified
                    ? "House number OCR matches label #744. Parcel intact. PayPal Payments v2 /capture authorized."
                    : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                    ? "Camera detected house #742 (+120m away). PayPal capture locked at $0.00 to protect buyer."
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
                ? "Processing Evidence..."
                : isAnalyzing
                ? "Analyzing Doorstep Scene..."
                : isVerified
                ? `Confirm Drop & Capture PayPal Hold (${activeOrder?.formatted_total ?? "$24.00"})`
                : "Engage Zero-Capture Lock & Alert Agent"}
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
