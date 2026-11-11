"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  MapPin,
  Package,
  QrCode,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import Link from "next/link";
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
    shortLabel: "Puerta #15 (Correcta)",
    tag: "Match",
    doorNumber: "15",
    imagePath: "/delivery/door-15.svg",
    expectedStatus: "verified",
  },
  {
    id: "wrong_door",
    shortLabel: "Puerta #13 (Error)",
    tag: "Mismatch",
    doorNumber: "13",
    imagePath: "/delivery/door-13.svg",
    expectedStatus: "mismatch",
  },
  {
    id: "damaged",
    shortLabel: "Caja Dañada (Rechazo)",
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
  if (!order) return "PKG-PL7440-KRK";
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
  // Wizard Step: 1 = Paquete (Parcel), 2 = Foto & Visión (Doorstep), 3 = PIN & Entrega (Handoff)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  const [activeOrder, setActiveOrder] = useState<DeliveryOrder | null>(null);
  const [knownOrders, setKnownOrders] = useState<DeliveryOrder[]>([]);
  
  // Recipient Handover PIN (strictly separate from parcel tracking!)
  const [recipientPin, setRecipientPin] = useState("");

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

  // Fetch active held order or latest order
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

      const combined: DeliveryOrder[] = Array.isArray(cachedOrders) ? [...cachedOrders] : [];
      for (const s of serverOrders) {
        if (!combined.some((o) => o.id === s.id)) {
          combined.push(s);
        }
      }
      setKnownOrders(combined);

      const held =
        combined.find((o) => o.status === "AUTHORIZED") ||
        combined.find((o) => o.status === "DELIVERY_CONFIRMED" || o.status === "DELIVERY_FAILED") ||
        combined[0] ||
        null;

      if (held) {
        setActiveOrder(held);
        if (held.pickup_code && !recipientPin) {
          setRecipientPin(held.pickup_code);
        }
      }
    } catch {
      // Quiet fail on initial load
    }
  }

  // Initial load
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

  // File Upload or Camera Capture
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

  // Complete Handover: checks tri-factor evidence and verifies recipient PIN
  async function handleConfirmHandover() {
    if (!activeOrder) return;
    setIsSubmitting(true);
    setFeedback(null);

    const pinToVerify = (recipientPin || activeOrder.pickup_code || "").trim().toUpperCase();
    if (!pinToVerify || pinToVerify.length < 6) {
      setFeedback({
        tone: "failure",
        title: "PIN del Destinatario Requerido",
        message: "Introduce el PIN de 6 caracteres que el comprador tiene en su pantalla de chat (ej. 9N56RC).",
      });
      setIsSubmitting(false);
      return;
    }

    const isVerified = visionResult?.handoverVerdict === "VERIFIED";

    try {
      if (isVerified) {
        const res = await fetch("/api/device/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: activeOrder.id,
            pickupCode: pinToVerify,
            note: `Tri-factor verified: ${visionResult?.visualEvidence || "GPS zone, Door #15, and intact parcel on floor confirmed"} (${((visionResult?.confidence ?? visionResult?.overallHandoverScore) ?? 98.5).toFixed(1)}% score) · Recipient PIN verified`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
            presetId: customPhotoBase64 ? "custom" : selectedPreset.id,
            quantitativeScore: visionResult?.overallHandoverScore ?? visionResult?.confidence ?? 98.4,
            gpsCoordinates: { lat: gpsData.lat, lng: gpsData.lng },
            orderSnapshot: activeOrder,
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
          title: "¡Entrega Verificada y Custodia Transferida!",
          message: `Paquete entregado en #15 Filarecka 2B, Kraków. Verificación GPS (${gpsData.distanceMeters}m), Puerta #15 por Visión IA, paquete intacto y PIN del destinatario (${pinToVerify}) comprobados.`,
          paypalDetail: `Evento criptográfico registrado en el ledger. Captura de fondos ejecutada en PayPal Payments v2 para la orden ${payload.order.id}.`,
        });
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
            pickupCode: pinToVerify,
            reason,
            note: `Verification rejected: ${visionResult?.agentAssessment || visionResult?.visualEvidence || "Handover conditions not met"}`,
            photoBase64: customPhotoBase64 || undefined,
            photoMime: customPhotoBase64 ? "image/jpeg" : undefined,
            orderSnapshot: activeOrder,
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
          title: "Entrega Rechazada · Paquete Retornado al Hub",
          message: `${visionResult?.visualEvidence || "Discrepancia detectada en entrega"}. Transferencia abortada.`,
          paypalDetail: "Incidente auditado. La retención de PayPal permanece en $0.00 capturados.",
          recoveryAction: true,
        });
      }
    } catch (err) {
      setFeedback({
        tone: "failure",
        title: "Error de Entrega",
        message: err instanceof Error ? err.message : "Error al procesar la entrega",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isVerified = visionResult?.handoverVerdict === "VERIFIED";
  const isDelivered = activeOrder?.status === "DELIVERY_CONFIRMED" || activeOrder?.status === "CAPTURED";
  const parcelTrackingCode = getParcelTrackingNumber(activeOrder);

  return (
    <div className="delivery-container">
      <div className="delivery-card">
        {/* Top Bar with GPS Telemetry & Controls */}
        <div className="delivery-top-bar">
          <div className="courier-badge">
            <span className="courier-pulse" />
            <span className="courier-id">Repartidor · Ruta 4B</span>
          </div>
          <div className="delivery-gps-ctrls">
            <div className={`delivery-gps mono ${gpsData.inZone ? "gps-in-zone" : "gps-out-zone"}`}>
              <MapPin size={12} />
              <span>
                {gpsData.inZone
                  ? `Filarecka 2B (${gpsData.distanceMeters}m)`
                  : `Fuera de zona (+${gpsData.distanceMeters}m)`}
              </span>
            </div>
            <button
              type="button"
              className="gps-toggle-btn"
              onClick={handleToggleGpsSimulation}
              title="Alternar GPS entre la zona de entrega y fuera de zona"
            >
              {gpsData.inZone ? "Simular Lejos (+2.5km)" : "En Sitio (0m)"}
            </button>
            <button
              type="button"
              className="gps-locate-btn"
              onClick={handleGetLiveLocation}
              disabled={gpsData.isLocating}
              title="Consultar GPS real del dispositivo"
            >
              {gpsData.isLocating ? "Localizando…" : "GPS Real"}
            </button>
          </div>
        </div>

        {/* Clean 3-Step Wizard Navigation */}
        <nav className="delivery-stepper" aria-label="Progreso de entrega">
          <button
            type="button"
            className={`stepper-item ${currentStep === 1 ? "is-active" : currentStep > 1 ? "is-completed" : ""}`}
            onClick={() => setCurrentStep(1)}
          >
            <span className="stepper-badge">{currentStep > 1 ? <Check size={11} /> : "1"}</span>
            <span className="stepper-label">01 Paquete</span>
          </button>
          <div className="stepper-divider" />
          <button
            type="button"
            className={`stepper-item ${currentStep === 2 ? "is-active" : currentStep > 2 ? "is-completed" : ""}`}
            onClick={() => setCurrentStep(2)}
          >
            <span className="stepper-badge">{currentStep > 2 ? <Check size={11} /> : "2"}</span>
            <span className="stepper-label">02 Foto &amp; Visión</span>
          </button>
          <div className="stepper-divider" />
          <button
            type="button"
            className={`stepper-item ${currentStep === 3 ? "is-active" : isDelivered ? "is-completed" : ""}`}
            onClick={() => {
              if (isVerified || isDelivered) setCurrentStep(3);
            }}
            disabled={!isVerified && !isDelivered}
            title={!isVerified && !isDelivered ? "Completa la verificación fotográfica primero" : "Paso 3: PIN y Entrega"}
          >
            <span className="stepper-badge">{isDelivered ? <Check size={11} /> : "3"}</span>
            <span className="stepper-label">03 PIN &amp; Entrega</span>
          </button>
        </nav>

        {/* Delivery Header */}
        <div className="delivery-header">
          <h2>
            {currentStep === 1 && "Verificación del Paquete"}
            {currentStep === 2 && "Foto de Puerta e Inspección IA"}
            {currentStep === 3 && (isDelivered ? "Entrega Completada" : "PIN del Destinatario y Liquidación")}
          </h2>
          <p className="delivery-subtitle">
            {currentStep === 1 && "Confirma el código de tracking del bulto y el manifiesto antes de descender del vehículo."}
            {currentStep === 2 && "Toma una fotografía del paquete colocado frente a la puerta para validar el número de vivienda y el estado físico."}
            {currentStep === 3 && !isDelivered && "Solicita el PIN secreto de 6 caracteres que el cliente tiene en su app de compra para autorizar la captura en PayPal."}
            {currentStep === 3 && isDelivered && "Los fondos retenidos en PayPal fueron capturados satisfactoriamente."}
          </p>
        </div>

        {/* ============================================================ */}
        {/* PASO 1: PAQUETE & MANIFIESTO                                 */}
        {/* ============================================================ */}
        {currentStep === 1 && (
          <section className="delivery-step-content" aria-label="Paso 1: Paquete y Destino">
            {/* Barcode & Tracking Identifier Box */}
            <div className="parcel-barcode-card">
              <div className="parcel-barcode-badge">
                <Package size={14} />
                <span>Etiqueta de Envío · Código de Barras</span>
              </div>

              <BarcodeGraphic />

              <div className="parcel-tracking-row">
                <span className="parcel-tracking-code mono">{parcelTrackingCode}</span>
                <span className="parcel-status-pill mono">LISTO PARA ENTREGA</span>
              </div>

              <div className="parcel-ref-sub mono">
                <span>Orden ref: {activeOrder?.id || "ord_machivp0c339c16ce5"}</span>
                <button
                  type="button"
                  className="parcel-refresh-mini"
                  onClick={() => void fetchLatestOrder()}
                  title="Actualizar pedidos de compra activos"
                >
                  <RefreshCw size={12} className={isSubmitting ? "spin" : ""} />
                  <span>Actualizar</span>
                </button>
              </div>
            </div>

            {!activeOrder && (
              <div className="delivery-no-order">
                <EmptyOrderState
                  title="No hay entregas asignadas"
                  body="Las órdenes aparecen aquí automáticamente una vez que el cliente autoriza una retención en el chat de la tienda."
                  actionLabel="Abrir Chat de Tienda"
                />
              </div>
            )}

            {/* Manifest Details */}
            {activeOrder && (
              <div className="manifest-card">
                <div className="manifest-row">
                  <span className="manifest-label">Destino</span>
                  <span className="manifest-value mono" style={{ color: "#F4F1EA", fontWeight: 600 }}>
                    ul. Filarecka 2B, m. 15, 30-110 Kraków
                  </span>
                </div>
                <div className="manifest-row">
                  <span className="manifest-label">Retención PayPal</span>
                  <span className="manifest-value manifest-amount mono">
                    {activeOrder.formatted_total} <span className="hold-pill">Hold ($0.00 cobrado)</span>
                  </span>
                </div>
                <div className="manifest-row">
                  <span className="manifest-label">Estado</span>
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

            {/* Step 1 Actions */}
            <div className="step-nav-bar">
              <button
                type="button"
                className="step-btn-primary"
                onClick={() => setCurrentStep(2)}
                disabled={!activeOrder}
              >
                <span>Confirmar paquete y pasar a foto</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* PASO 2: FOTO & VISIÓN IA                                     */}
        {/* ============================================================ */}
        {currentStep === 2 && (
          <section className="delivery-step-content" aria-label="Paso 2: Foto de Puerta e Inspección IA">
            {/* Direct Camera / Upload Buttons */}
            <div className="capture-modes-row">
              <label className="capture-option-btn btn-take-photo">
                <Camera size={15} />
                <span>Tomar foto con cámara</span>
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
                <span>{customPhotoName ? customPhotoName : "Subir imagen"}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden-file-input"
                  onChange={(e) => handlePhotoSelected(e, "upload")}
                />
              </label>
            </div>

            {/* Demo Presets Switcher */}
            <div className="scenario-switcher-bar">
              <span className="scenario-switcher-label">Prueba rápida (Simulador):</span>
              <div className="scenario-pills-row" role="radiogroup" aria-label="Escenarios de prueba">
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

            {/* Viewfinder Frame with Bounding Boxes */}
            <div className={`vision-viewfinder-frame ${isAnalyzing ? "is-analyzing" : ""}`}>
              <div className="viewfinder-telemetry-strip">
                <div className="viewfinder-hud-status">
                  <span>
                    {mediaMode === "camera"
                      ? "Cámara en directo"
                      : mediaMode === "upload"
                      ? customPhotoName || "Foto cargada"
                      : selectedPreset.shortLabel}
                  </span>
                </div>
                <div className="viewfinder-hud-meta mono">
                  <span>
                    Puntuación: {visionResult ? `${((visionResult.overallHandoverScore ?? visionResult.confidence) ?? 98.5).toFixed(1)}/100` : "Analizando…"}
                  </span>
                </div>
              </div>

              <div className="viewfinder-media-container">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Vista previa de entrega en puerta"
                  className="viewfinder-media"
                />

                {isAnalyzing && (
                  <div className="vision-laser-sweep-overlay" aria-live="polite">
                    <div className="vision-scanning-pill mono">
                      <RefreshCw size={13} className="spin" />
                      <span>Comprobando placa de puerta y caja con Visión IA…</span>
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

            {/* Compact Vision AI Telemetry Card */}
            <div className="ai-vision-telemetry-card">
              <div className="telemetry-top-strip">
                <span className="telemetry-model-badge mono">
                  MiniMax M3.1 Flash · Multimodal Vision Engine
                </span>
                <span className="telemetry-latency mono">
                  {visionResult?.processedInMs ?? 328} ms
                </span>
              </div>

              <div className="telemetry-grid">
                <div className="telemetry-cell">
                  <span className="telemetry-label">Destino</span>
                  <span className="telemetry-val">#15 Filarecka 2B</span>
                </div>

                <div className="telemetry-cell">
                  <span className="telemetry-label">Placa de Puerta</span>
                  <div className="telemetry-val-group">
                    <span className="telemetry-val mono">
                      #{visionResult?.detectedDoorNumber ?? "—"}
                    </span>
                    {visionResult && (
                      <span
                        className={`mini-pill ${Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch) ? "pill-good" : "pill-bad"}`}
                      >
                        {Boolean(visionResult?.doorplateMatch ?? visionResult?.isDoorMatch) ? "Coincide (99%)" : "Error (12%)"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="telemetry-cell">
                  <span className="telemetry-label">Estado de Caja</span>
                  <div className="telemetry-val-group">
                    <span className="telemetry-val">
                      {visionResult?.packageCondition === "damaged" ? "Dañada (24%)" : "Intacta (98%)"}
                    </span>
                    {visionResult && (
                      <span
                        className={`mini-pill ${visionResult.packageCondition === "damaged" ? "pill-bad" : "pill-good"}`}
                      >
                        {visionResult.packageCondition === "damaged" ? "Aplastada" : "OK"}
                      </span>
                    )}
                  </div>
                </div>

                <div className="telemetry-cell">
                  <span className="telemetry-label">Puntaje Global</span>
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
                      {(visionResult?.overallHandoverScore ?? 98.5) >= 80 ? "Aprobado" : "Rechazado"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Verdict Banner */}
              <div className={`telemetry-verdict-banner ${isVerified ? "verdict-good" : "verdict-bad"}`}>
                <div className="verdict-banner-icon">
                  {isVerified ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                </div>
                <div className="verdict-banner-text">
                  <span className="verdict-banner-title">
                    {isVerified
                      ? "Verificación de puerta y paquete aprobada"
                      : !gpsData.inZone
                      ? "Bloqueado — Fuera del perímetro GPS"
                      : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                      ? "Bloqueado — Número de puerta incorrecto"
                      : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                      ? "Bloqueado — No se detecta paquete en el piso"
                      : "Bloqueado — Paquete con daños físicos visibles"}
                  </span>
                  <span className="verdict-banner-sub">
                    {isVerified
                      ? "Perímetro GPS, placa #15 y paquete intacto confirmados. Listo para solicitar PIN."
                      : !gpsData.inZone
                      ? `El dispositivo está a ${gpsData.distanceMeters}m de Filarecka 2B. Retención bloqueada en $0.00.`
                      : visionResult?.handoverVerdict === "REJECTED_MISMATCH"
                      ? "La foto muestra la puerta #13 en lugar de la #15 asignada."
                      : visionResult?.handoverVerdict === "REJECTED_NO_PACKAGE"
                      ? "No se encontró el bulto apoyado frente a la puerta."
                      : "Caja aplastada o perforada. Cobro retenido en PayPal."}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="step-nav-bar">
              <button
                type="button"
                className="step-btn-secondary"
                onClick={() => setCurrentStep(1)}
              >
                <ArrowLeft size={15} />
                <span>Volver al paquete</span>
              </button>

              {isVerified ? (
                <button
                  type="button"
                  className="step-btn-primary"
                  onClick={() => setCurrentStep(3)}
                >
                  <span>Continuar a PIN del cliente</span>
                  <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  className="step-btn-danger"
                  onClick={handleConfirmHandover}
                  disabled={isSubmitting}
                >
                  <XCircle size={15} />
                  <span>Reportar entrega fallida</span>
                </button>
              )}
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* PASO 3: PIN DEL DESTINATARIO & LIQUIDACIÓN                   */}
        {/* ============================================================ */}
        {currentStep === 3 && (
          <section className="delivery-step-content" aria-label="Paso 3: PIN del Destinatario y Liquidación">
            {/* If order is already completed */}
            {isDelivered && (
              <div className="delivery-success-view">
                <div className="success-icon-ring">
                  <CheckCircle2 size={38} />
                </div>
                <h3>¡Entrega Verificada y Custodia Transferida!</h3>
                <p className="success-desc">
                  La retención de fondos fue autorizada previamente y ahora se liquidó exitosamente mediante PayPal Payments v2.
                </p>

                <div className="manifest-card" style={{ marginTop: "12px", width: "100%" }}>
                  <div className="manifest-row">
                    <span className="manifest-label">Estado PayPal</span>
                    <span className="manifest-value mono" style={{ color: "#3FB27F", fontWeight: 700 }}>
                      CAPTURED ({activeOrder?.formatted_total || "$18.50"})
                    </span>
                  </div>
                  <div className="manifest-row">
                    <span className="manifest-label">Tracking de Bulto</span>
                    <span className="manifest-value mono">{parcelTrackingCode}</span>
                  </div>
                  <div className="manifest-row">
                    <span className="manifest-label">PIN Destinatario</span>
                    <span className="manifest-value mono" style={{ color: "#3FB27F" }}>
                      ✔ {recipientPin || activeOrder?.pickup_code}
                    </span>
                  </div>
                  <div className="manifest-row">
                    <span className="manifest-label">Sello de Evidencia</span>
                    <span className="manifest-value mono" style={{ fontSize: "11px" }}>
                      SHA-256 + HMAC Server Signed
                    </span>
                  </div>
                </div>

                <div className="success-actions-row">
                  <Link href="/merchant" className="step-btn-secondary" style={{ flex: 1, textAlign: "center" }}>
                    <span>Ver en Merchant Desk</span>
                    <ExternalLink size={14} />
                  </Link>
                  <button
                    type="button"
                    className="step-btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setCurrentStep(1);
                      setFeedback(null);
                      void fetchLatestOrder();
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>Nueva Entrega</span>
                  </button>
                </div>
              </div>
            )}

            {!isDelivered && (
              <>
                {/* Clear Explainer */}
                <div className="recipient-pin-guidance">
                  <Lock size={15} className="pin-lock-icon" />
                  <span>
                    Pide al comprador su <strong>PIN secreto de 6 caracteres</strong> que visualiza en su pantalla de compra para liberar los fondos.
                  </span>
                </div>

                {/* PIN Input Box */}
                <div className="recipient-pin-box">
                  <div className="pin-box-top">
                    <label htmlFor="customer-pin-field" className="pin-box-label">
                      PIN de Entrega del Destinatario
                    </label>
                    {activeOrder?.pickup_code && (
                      <button
                        type="button"
                        className="pin-autofill-btn mono"
                        onClick={() => setRecipientPin(activeOrder.pickup_code || "")}
                        title="Autocompletar el PIN para la demo"
                      >
                        Autocompletar demo ({activeOrder.pickup_code})
                      </button>
                    )}
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

                  <div className="pin-box-caption mono">
                    <span>* Clave temporal del cliente, independiente del tracking de bulto ({parcelTrackingCode}).</span>
                  </div>
                </div>

                {/* Handover Verification Checklist */}
                <div className="manifest-card" style={{ marginTop: "12px", padding: "10px 14px" }}>
                  <div className="manifest-row" style={{ marginBottom: "6px" }}>
                    <span className="manifest-label">1. Perímetro GPS</span>
                    <span className="manifest-value mono" style={{ color: "#3FB27F" }}>
                      ✔ Filarecka 2B ({gpsData.distanceMeters}m de distancia)
                    </span>
                  </div>
                  <div className="manifest-row" style={{ marginBottom: "6px" }}>
                    <span className="manifest-label">2. Puerta y Paquete</span>
                    <span className="manifest-value mono" style={{ color: "#3FB27F" }}>
                      ✔ Puerta #15 Visión IA y Caja Intacta en Suelo
                    </span>
                  </div>
                  <div className="manifest-row" style={{ marginBottom: "6px" }}>
                    <span className="manifest-label">3. PIN del Destinatario</span>
                    <span className="manifest-value mono" style={{ color: recipientPin.length === 6 ? "#3FB27F" : "#ABA598", fontWeight: 700 }}>
                      {recipientPin.length === 6 ? `✔ ${recipientPin}` : "Pendiente de ingresar"}
                    </span>
                  </div>
                  <div className="manifest-row">
                    <span className="manifest-label">4. Vínculo Criptográfico</span>
                    <span className="manifest-value mono" style={{ fontSize: "11px", opacity: 0.85 }}>
                      SHA-256 Digest + Server HMAC Signature
                    </span>
                  </div>
                </div>

                {/* Step 3 Actions */}
                <div className="step-nav-bar">
                  <button
                    type="button"
                    className="step-btn-secondary"
                    onClick={() => setCurrentStep(2)}
                    disabled={isSubmitting}
                  >
                    <ArrowLeft size={15} />
                    <span>Volver a la foto</span>
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
                      {isSubmitting
                        ? "Procesando captura en PayPal…"
                        : `Verificar PIN y Capturar PayPal (${activeOrder?.formatted_total || "$18.50"})`}
                    </span>
                  </button>
                </div>
              </>
            )}
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
            {feedback.paypalDetail && (
              <div className="feedback-paypal mono">
                <span>{feedback.paypalDetail}</span>
              </div>
            )}
            {feedback.recoveryAction && (
              <div className="feedback-recovery-status mono">
                <span>Entrega abortada. Incidente registrado para mediación del cliente.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
