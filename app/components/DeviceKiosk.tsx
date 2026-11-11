"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, RefreshCcw, X } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyOrderState } from "./EmptyOrderState";
import { ProductCard, type CatalogProduct } from "./ProductCard";
import { Toast } from "./Toast";

type PublicOrder = {
  id: string;
  status: string;
  formatted_total: string;
  pickup_code: string | null;
  failure_reason: string | null;
  paypal_order_id?: string | null;
  paypal_authorization_id?: string | null;
  paypal_capture_id?: string | null;
  paypal_refund_id?: string | null;
  items: Array<{ name: string; qty: number; sku: string }>;
  created_at?: string;
  updated_at?: string;
  authorized_at?: string | null;
  delivered_at?: string | null;
  captured_at?: string | null;
  voided_at?: string | null;
  refunded_at?: string | null;
};

type Alternative = CatalogProduct & { price_cents?: number };

const VENUE_REASONS = [
  { value: "jam", label: "Station jammed" },
  { value: "out_of_stock", label: "Item unavailable" },
  { value: "item_damaged", label: "Item damaged" },
];

const HOME_REASONS = [
  { value: "item_damaged", label: "Package damaged / crushed box" },
  { value: "wrong_address", label: "Wrong doorstep / address mismatch" },
  { value: "porch_theft_risk", label: "Unsafe doorstep / porch theft risk" },
];

function playHandoverChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch {
    // Audio context not available or user gesture required
  }
}

export function DeviceKiosk({
  compact = false,
  initialCode,
  deliveryMode = "venue",
}: {
  compact?: boolean;
  showReceipt?: boolean;
  initialCode?: string;
  deliveryMode?: "venue" | "home";
}) {
  const [code, setCode] = useState(initialCode || "");
  const [showProblems, setShowProblems] = useState(false);
  const [result, setResult] = useState<PublicOrder | null>(null);
  const [replacement, setReplacement] = useState<PublicOrder | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [recommended, setRecommended] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ action: "substitute" | "retry" | "cancel"; items?: Alternative } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [activeHeldOrder, setActiveHeldOrder] = useState<PublicOrder | null>(null);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => {
        const orders: PublicOrder[] = data.orders || [];
        const held = orders.find(
          (o) => (o.status === "AUTHORIZED" || o.status === "DELIVERY_CONFIRMED") && o.pickup_code,
        );
        if (held) {
          setActiveHeldOrder(held);
        }
      })
      .catch(() => undefined)
      .finally(() => setOrdersLoaded(true));
  }, []);

  useEffect(() => {
    if (initialCode && !code) {
      setCode(initialCode);
    }
  }, [initialCode]);

  const refresh = useCallback(async () => {
    if (!compact) return;
    const ordersRes = await fetch("/api/orders");
    const ordersPayload = await ordersRes.json();
    const latest = (ordersPayload.orders || [])[0] as PublicOrder | undefined;
    if (latest && ["CAPTURED", "VOIDED", "REFUNDED", "DELIVERY_FAILED", "AUTHORIZED"].includes(latest.status)) {
      setResult((current) => {
        if (current && current.id === latest.id && current.status === latest.status) return current;
        return latest;
      });
    }
  }, [compact]);

  useEffect(() => {
    refresh().catch(() => undefined);
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function loadRecovery(orderId: string) {
    const response = await fetch(`/api/orders/${orderId}/recovery`);
    const payload = await response.json();
    if (response.ok) {
      setAlternatives(payload.alternatives || []);
      setRecommended(payload.recommended || null);
    }
  }

  async function post(path: string, extra: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupCode: code.trim().toUpperCase(),
          note: "",
          ...extra,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed");
      setResult(payload.order);
      if (payload.order?.status === "CAPTURED") {
        playHandoverChime();
        setToast("Charged with PayPal — Handover Verified");
        window.setTimeout(() => setToast(null), 3500);
      }
      if (payload.order?.status === "DELIVERY_FAILED") {
        await loadRecovery(payload.order.id);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function recover(action: "substitute" | "retry" | "cancel", item?: Alternative) {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/orders/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: result.id,
          action,
          confirm: true,
          actor: "device",
          substitute_items: item ? [{ sku: item.sku, qty: 1 }] : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Recovery failed");
      setResult(payload.order);
      setReplacement(payload.replacement || null);
      setMessage(payload.message || "Recovery completed.");
      setPending(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recovery failed");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setReplacement(null);
    setAlternatives([]);
    setRecommended(null);
    setMessage(null);
    setError(null);
    setCode("");
    setShowProblems(false);
  }

  const screen = result?.status === "CAPTURED" ? "success"
    : result?.status === "VOIDED" || result?.status === "CANCELLED" || result?.status === "REFUNDED" ? "closed"
    : result?.status === "DELIVERY_FAILED" ? "failed"
    : "form";

  return (
    <div className={`kiosk-frame${compact ? " compact" : ""}`}>
      <Toast message={toast} tone="ok" />
      <div className="terminal-header-bar">
        <div className="terminal-status-indicator">
          <span>
            {deliveryMode === "home" ? "Doorstep · Filarecka 2B / 15, Kraków" : "Locker · Bay 04"}
          </span>
        </div>
        <div className="terminal-sensor-pill">
          {deliveryMode === "home" ? "Camera ready" : "Latch secure"}
        </div>
      </div>
      {screen === "success" && result && (
        <div className="kiosk-result success" data-testid={compact ? undefined : "transaction-panel"}>
          <div className="kiosk-mark ok" aria-hidden="true"><Check size={36} strokeWidth={3} /></div>
          <h2>Charged {result.formatted_total}</h2>
          <p className="oknote">This payment is now <span className={`status ${result.status}`}>{result.status}</span>. Total {result.formatted_total}.</p>
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="primary" onClick={reset}>Next customer</button>
          </div>
        </div>
      )}
      {screen === "closed" && result && (
        <div className="kiosk-result failure">
          <div className="kiosk-mark bad" aria-hidden="true"><X size={36} strokeWidth={3} /></div>
          <h2>Hold released</h2>
          <p className="lede">Released {result.formatted_total}.</p>
          <p className="oknote">This payment is now <span className={`status ${result.status}`}>{result.status}</span>.</p>
          {message && <p>{message}</p>}
          {replacement && (
            <div className="oknote">
              Replacement order <span className="mono">{replacement.id}</span> ({replacement.formatted_total}) is ready.
              Approve the new PayPal payment in Shop.
            </div>
          )}
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="primary lg" onClick={reset}>Next customer</button>
          </div>
        </div>
      )}

      {screen === "failed" && result && (
        <div className="kiosk-result failure">
          <div className="kiosk-mark bad" aria-hidden="true"><X size={36} strokeWidth={3} /></div>
          <h2>Pickup problem</h2>
          <p className="oknote">
            {result.id} is now <span className={`status ${result.status}`}>{result.status}</span>
            {result.failure_reason ? ` (${result.failure_reason})` : ""}. Total {result.formatted_total}.
          </p>
          <p>Nothing was charged. You can try again, swap the item, or release the hold.</p>
          {recommended && <p className="warnnote">Suggested: {recommended}</p>}
          {message && <p className="oknote">{message}</p>}
          {error && <div className="err">{error}</div>}
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="ok" disabled={busy} onClick={() => setPending({ action: "retry" })}>
              <RefreshCcw size={16} /> Try again
            </button>
            <button className="danger" disabled={busy} onClick={() => setPending({ action: "cancel" })}>
              Release hold
            </button>
          </div>
          {alternatives.length > 0 && (
            <div style={{ marginTop: 24, textAlign: "left" }}>
              <h3>Swap for something else</h3>
              <div className="product-grid">
                {alternatives.map((item) => (
                  <div key={item.sku}>
                    <ProductCard item={item} />
                    <button
                      className="primary"
                      style={{ width: "100%", marginTop: 8 }}
                      disabled={busy}
                      onClick={() => setPending({ action: "substitute", items: item })}
                    >
                      Substitute with {item.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {screen === "form" && (
        <form onSubmit={(event: FormEvent) => event.preventDefault()}>
          {deliveryMode === "home" ? (
            <div className="porch-feed-card">
              <div className="porch-feed-screen">
                <div className="porch-cam-header">
                  <span className="cam-live-indicator">Front porch</span>
                  <span className="cam-coords mono">Filarecka 2B / 15, Kraków</span>
                </div>
                <div className="porch-visual-area">
                  <div className="porch-door-graphic">
                    <span className="porch-house-num">15</span>
                    <div className="porch-door-panel" />
                  </div>
                  <div className="porch-mat-area">
                    <div className="porch-package-box">
                      <span className="package-ribbon">Parcel at doorstep</span>
                      <span className="package-dest mono">Welcome mat</span>
                    </div>
                  </div>
                </div>
                <div className="porch-telemetry-footer mono">
                  <span>Courier · Route 4B</span>
                  <span>Photo recorded</span>
                </div>
              </div>
              <p className="kiosk-instruction-text">
                Package is at your doorstep. Enter your 6-digit pickup code to confirm receipt and capture the PayPal hold.
              </p>
            </div>
          ) : (
            <div className="kiosk-instructions">
              <h3 style={{ textAlign: "center", fontSize: "1.2rem", margin: "0 0 6px", fontWeight: 700 }}>
                Locker pickup
              </h3>
              <p style={{ textAlign: "center", margin: "0 0 16px", color: "var(--muted)", fontSize: "0.88rem" }}>
                Enter the 6-character pickup code to open the bay and capture the PayPal hold.
              </p>
            </div>
          )}

          {!compact && ordersLoaded && !initialCode && !activeHeldOrder && (
            <EmptyOrderState
              title="No held order to collect"
              body="Place an order in Shop and approve the PayPal hold first. Once authorized, its pickup PIN will appear here automatically."
              actionLabel="Open Shop Chat"
            />
          )}

          {((initialCode && code !== initialCode) || (activeHeldOrder?.pickup_code && code !== activeHeldOrder.pickup_code)) && (
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <button
                type="button"
                className="autofill-btn"
                onClick={() => setCode(initialCode || activeHeldOrder?.pickup_code || "")}
              >
                Auto-fill active order code: <strong>{initialCode || activeHeldOrder?.pickup_code}</strong>
              </button>
            </div>
          )}

          <div className="code-entry">
            <div className="code-boxes" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className={`code-box${code[index] ? " filled" : ""}${code.length === index ? " caret" : ""}`}
                >
                  {code[index] || ""}
                </span>
              ))}
            </div>
            <input
              className="kiosk-code"
              value={code}
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              aria-label="Pickup code"
              placeholder="Enter 6-character code"
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            />
          </div>

          <button
            className="primary lg kiosk-capture-btn"
            disabled={busy || !code || code.length < 6}
            onClick={() => post("/api/device/confirm", {})}
          >
            {busy
              ? "Verifying..."
              : deliveryMode === "home"
                ? "Confirm Doorstep Handover & Capture Payment"
                : "Confirm Handover & Capture Funds"}
          </button>
          {code.length < 6 && <p className="kiosk-hint">Enter all 6 characters to enable handover.</p>}

          <div className="kiosk-footer-actions">
            <button
              type="button"
              className="link-btn problem-link"
              onClick={() => setShowProblems((value) => !value)}
            >
              {showProblems
                ? "Hide problem options"
                : deliveryMode === "home"
                  ? "Simulate delivery issue (Damaged box / Wrong door)"
                  : "Simulate pickup problem / hardware jam"}
            </button>
          </div>

          {showProblems && (
            <div className="reason-list">
              <p className="reason-heading">
                {deliveryMode === "home" ? "Simulate Doorstep Delivery Failures:" : "Simulate Physical Handover Failures:"}
              </p>
              {(deliveryMode === "home" ? HOME_REASONS : VENUE_REASONS).map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className="reason-btn"
                  disabled={busy || !code}
                  onClick={() => {
                    void post("/api/device/fail", { reason: item.value });
                  }}
                >
                  <span className="reason-icon"><AlertTriangle size={14} aria-hidden="true" /></span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
          {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
        </form>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === "substitute" ? "Confirm substitution" : pending?.action === "cancel" ? "Release this hold?" : "Try again?"}
        body={
          pending?.action === "substitute"
            ? `This releases the current hold and starts a new PayPal payment for ${pending.items?.name ?? "the substitute"}.`
            : pending?.action === "cancel"
              ? "This releases the hold. The customer will not be charged."
              : "The same hold stays in place so you can try again."
        }
        confirmLabel={pending?.action === "substitute" ? "Confirm substitution" : pending?.action === "cancel" ? "Release hold" : "Retry"}
        danger={pending?.action === "cancel"}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) void recover(pending.action, pending.items);
        }}
      />
    </div>
  );
}
