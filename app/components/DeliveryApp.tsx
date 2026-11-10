"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  Package,
  QrCode,
  RefreshCw,
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
  label: string;
  title: string;
  doorNumber: string;
  status: "verified" | "mismatch" | "damaged";
  note: string;
  visionConfidence: number;
  previewColor: string;
};

const PHOTO_PRESETS: PhotoPreset[] = [
  {
    id: "correct",
    label: "Door #744 (Correct Doorstep)",
    title: "744 Maple St · Welcome Mat",
    doorNumber: "744",
    status: "verified",
    note: "Door number OCR 744 matches label destination. Package placed securely on porch mat.",
    visionConfidence: 99.8,
    previewColor: "#059669",
  },
  {
    id: "wrong_door",
    label: "Door #742 (Wrong Doorstep Mismatch)",
    title: "742 Evergreen Terr · Mismatch",
    doorNumber: "742",
    status: "mismatch",
    note: "AI Vision Alert: Door reads 742, target destination is 744 Maple St. GPS delta: 120m.",
    visionConfidence: 98.4,
    previewColor: "#dc2626",
  },
  {
    id: "damaged",
    label: "Crushed Carton (Transit Damage)",
    title: "Damaged Package on Porch Steps",
    doorNumber: "744",
    status: "damaged",
    note: "Package integrity breach: Impact sensor tripped >4.5G. Carton torn and crushed on concrete.",
    visionConfidence: 96.2,
    previewColor: "#d97706",
  },
];

export function DeliveryApp() {
  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [trackingInput, setTrackingInput] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<PhotoPreset>(PHOTO_PRESETS[0]);
  const [customPhotoName, setCustomPhotoName] = useState<string | null>(null);
  const [customPhotoBase64, setCustomPhotoBase64] = useState<string | null>(null);
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

  useEffect(() => {
    void fetchLatestOrder();
  }, []);

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

    try {
      if (selectedPreset.status === "verified") {
        // Successful handover: triggers PayPal Payments v2 /capture
        const res = await fetch("/api/device/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder?.id,
            pickupCode: code,
            note: `Doorstep Photo Verified: ${selectedPreset.note}`,
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
          message: `Package delivered to 744 Maple Street. Photo proof verified (${selectedPreset.visionConfidence}% match).`,
          paypalDetail: `PayPal Payments v2 /capture executed. Captured ${payload.order.formatted_total}.`,
        });
      } else {
        // Failed handover (wrong door or damaged): blocks capture, leaves hold intact
        const reason = selectedPreset.status === "mismatch" ? "wrong_address" : "item_damaged";
        const res = await fetch("/api/device/fail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder?.id,
            pickupCode: code,
            reason,
            note: `AI Vision Rejection: ${selectedPreset.note}`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
          }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Delivery failure report failed");
        setActiveOrder(payload.order);
        setFeedback({
          tone: "failure",
          title: "Handover Rejected · Zero-Capture Safety Lock Active",
          message: `Delivery failed: ${selectedPreset.note}. Capture hard-locked. Buyer was charged $0.00.`,
          paypalDetail: `PayPal hold remains active. Autonomous agent notified to offer client refund or re-dispatch.`,
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

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomPhotoName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setCustomPhotoBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="delivery-container">
      {/* Handheld Device Frame */}
      <div className="delivery-card">
        {/* Device Top Bar */}
        <div className="delivery-top-bar">
          <div className="courier-badge">
            <span className="courier-pulse" />
            <span className="courier-id mono">COURIER BOT #09 · ROUTE 4B</span>
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
            Scan package label, record proof-of-drop photo, and verify handover before funds capture.
          </p>
        </div>

        {/* Step 1: Scan Label */}
        <section className="delivery-step" aria-label="Step 1: Scan Package Label">
          <div className="step-label-row">
            <span className="step-num mono">01</span>
            <span className="step-title">SCAN PACKAGE LABEL</span>
          </div>

          <div className="scanner-viewfinder">
            <div className="viewfinder-laser" />
            <div className="viewfinder-content">
              <QrCode size={40} className="scanner-icon" />
              <div className="scanner-text-group">
                <span className="scanner-target-addr mono">DESTINATION: 744 MAPLE ST, APT 2B</span>
                <span className="scanner-inst">Align barcode with viewfinder or tap active order</span>
              </div>
            </div>
          </div>

          <div className="scan-actions-row">
            <div className="code-input-wrapper">
              <input
                type="text"
                className="delivery-code-input mono"
                placeholder="LABEL CODE (e.g. K9Z2X7)"
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

        {/* Step 2: Proof of Handover Photo */}
        <section className="delivery-step" aria-label="Step 2: Proof of Delivery Photo">
          <div className="step-label-row">
            <span className="step-num mono">02</span>
            <span className="step-title">DOORSTEP PROOF PHOTO & AI VISION</span>
          </div>

          <p className="photo-instructions">
            Select a delivery scenario to simulate camera capture, or upload a real photo:
          </p>

          <div className="preset-grid" role="radiogroup" aria-label="Delivery Scenario Presets">
            {PHOTO_PRESETS.map((preset) => {
              const active = selectedPreset.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`preset-btn ${active ? "active" : ""} preset-${preset.status}`}
                  onClick={() => setSelectedPreset(preset)}
                >
                  <div className="preset-header">
                    <span className="preset-door mono">#{preset.doorNumber}</span>
                    <span className="preset-tag mono">{preset.status.toUpperCase()}</span>
                  </div>
                  <span className="preset-label">{preset.label}</span>
                </button>
              );
            })}
          </div>

          {/* Simulated Photo Viewfinder Feed */}
          <div className={`camera-feed-card feed-${selectedPreset.status}`}>
            <div className="feed-header">
              <div className="feed-live-tag">
                <span className="cam-pulse" />
                <span className="mono">PORCH CAM FEED · SIMULATED</span>
              </div>
              <span className="feed-timestamp mono">2026-11-10 16:50 UTC</span>
            </div>

            <div className="feed-view-area">
              <div className="porch-door-sim">
                <span className="door-plate mono">{selectedPreset.doorNumber}</span>
                <div className="door-knob" />
              </div>
              <div className="package-drop-sim">
                <div className={`parcel-box ${selectedPreset.status === "damaged" ? "box-crushed" : ""}`}>
                  <Package size={20} />
                  <span className="box-label mono">PROOFED PARCEL</span>
                </div>
              </div>
            </div>

            <div className="ai-vision-telemetry">
              <div className="vision-row">
                <span className="vision-key mono">AI OCR DETECTION:</span>
                <span className="vision-val mono">
                  DOOR #{selectedPreset.doorNumber}{" "}
                  {selectedPreset.status === "verified" ? "== TARGET #744 (MATCH)" : "!= TARGET #744 (MISMATCH)"}
                </span>
              </div>
              <div className="vision-row">
                <span className="vision-key mono">VISION CONFIDENCE:</span>
                <span className="vision-val mono">{selectedPreset.visionConfidence}%</span>
              </div>
              <div className="vision-row">
                <span className="vision-key mono">VERDICT:</span>
                <span
                  className={`vision-verdict mono ${selectedPreset.status === "verified" ? "verdict-ok" : "verdict-bad"}`}
                >
                  {selectedPreset.status === "verified" ? "HANDOVER VERIFIED" : "HANDOVER REJECTED"}
                </span>
              </div>
            </div>
          </div>

          {/* Optional File Upload */}
          <div className="upload-row">
            <label className="upload-photo-btn">
              <Camera size={14} />
              <span>{customPhotoName ? `Uploaded: ${customPhotoName}` : "Or Take / Upload Photo"}</span>
              <input type="file" accept="image/*" className="hidden-file-input" onChange={handleFileUpload} />
            </label>
          </div>
        </section>

        {/* Step 3: Complete Handover */}
        <section className="delivery-step" aria-label="Step 3: Complete Handover">
          <div className="step-label-row">
            <span className="step-num mono">03</span>
            <span className="step-title">RECORD HANDOVER & SETTLE</span>
          </div>

          <button
            type="button"
            className={`complete-delivery-btn ${selectedPreset.status === "verified" ? "btn-confirm" : "btn-report-fail"}`}
            disabled={isSubmitting || !activeOrder}
            onClick={handleConfirmHandover}
          >
            {isSubmitting ? (
              <RefreshCw size={16} className="spin" />
            ) : selectedPreset.status === "verified" ? (
              <CheckCircle2 size={16} />
            ) : (
              <XCircle size={16} />
            )}
            <span>
              {isSubmitting
                ? "Processing Evidence..."
                : selectedPreset.status === "verified"
                  ? "Confirm Drop & Capture PayPal Hold"
                  : "Report Handover Failure & Lock Capture"}
            </span>
          </button>
        </section>

        {/* Feedback Banner */}
        {feedback && (
          <div className={`delivery-feedback-banner tone-${feedback.tone}`} role="status">
            <div className="feedback-header">
              {feedback.tone === "success" && <CheckCircle2 size={18} />}
              {feedback.tone === "failure" && <AlertTriangle size={18} />}
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

        {/* Footer Navigation Hints */}
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
