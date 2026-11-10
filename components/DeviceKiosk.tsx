"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, RefreshCcw, X } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
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

const REASONS = [
  { value: "jam", label: "Station jammed" },
  { value: "out_of_stock", label: "Item unavailable" },
  { value: "item_damaged", label: "Item damaged" },
];

export function DeviceKiosk({ compact = false }: { compact?: boolean; showReceipt?: boolean }) {
  const [code, setCode] = useState("");
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
        setToast("Charged with PayPal");
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
          <h3 style={{ textAlign: "center", fontSize: "1.25rem", margin: "0 0 8px" }}>Enter pickup code</h3>
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
          <button className="primary lg" disabled={busy || !code} onClick={() => post("/api/device/confirm", {})}>
            Hand over & charge
          </button>
          <button
            type="button"
            className="link-btn problem-link"
            onClick={() => setShowProblems((value) => !value)}
          >
            Problem with pickup?
          </button>
          {showProblems && (
            <div className="reason-list">
              {REASONS.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  className="reason-btn"
                  disabled={busy || !code}
                  onClick={() => {
                    void post("/api/device/fail", { reason: item.value });
                  }}
                >
                  {item.label}
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
