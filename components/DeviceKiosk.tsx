"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, CircleAlert, RefreshCcw } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ProductCard, type CatalogProduct } from "./ProductCard";

type PublicOrder = {
  id: string;
  status: string;
  formatted_total: string;
  pickup_code: string | null;
  failure_reason: string | null;
  paypal_authorization_id?: string | null;
  paypal_capture_id?: string | null;
  items: Array<{ name: string; qty: number; sku: string }>;
};

type Alternative = CatalogProduct & { price_cents?: number };

const REASONS = [
  { value: "jam", label: "Station jam", hint: "Keep the hold; retry or substitute." },
  { value: "out_of_stock", label: "Out of stock", hint: "Recommend a substitute within budget." },
  { value: "item_damaged", label: "Item damaged", hint: "Recommend a substitute within budget." },
  { value: "customer_absent", label: "Customer absent", hint: "Hold remains until timeout or void." },
];

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function DeviceKiosk() {
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("jam");
  const [photo, setPhoto] = useState<File | null>(null);
  const [queue, setQueue] = useState<PublicOrder[]>([]);
  const [result, setResult] = useState<PublicOrder | null>(null);
  const [replacement, setReplacement] = useState<PublicOrder | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [recommended, setRecommended] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ action: "substitute" | "retry" | "cancel"; items?: Alternative } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/device/queue");
    const payload = await response.json();
    if (response.ok) setQueue(payload.orders || []);
  }, []);

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
      const body: Record<string, unknown> = {
        pickupCode: code.trim().toUpperCase(),
        note,
        ...extra,
      };
      if (photo) {
        body.photoBase64 = await fileToBase64(photo);
        body.photoMime = photo.type || "image/jpeg";
      }
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed");
      setResult(payload.order);
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
    setNote("");
  }

  function useOrder(order: PublicOrder) {
    setCode(order.pickup_code || "");
    setResult(order);
    if (order.status === "DELIVERY_FAILED") void loadRecovery(order.id);
  }

  const screen = result?.status === "CAPTURED" ? "success"
    : result?.status === "VOIDED" || result?.status === "CANCELLED" || result?.status === "REFUNDED" ? "closed"
    : result?.status === "DELIVERY_FAILED" ? "failed"
    : "form";

  return (
    <div className="kiosk-frame">
      {screen === "success" && result && (
        <div className="kiosk-result success">
          <CheckCircle2 size={64} />
          <h2>Handover proven</h2>
          <p className="oknote">{result.id} is now <span className={`status ${result.status}`}>{result.status}</span>. Total {result.formatted_total}.</p>
          {result.paypal_capture_id && <p className="mono">Capture {result.paypal_capture_id}</p>}
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="primary lg" onClick={reset}>Next customer</button>
          </div>
        </div>
      )}

      {screen === "closed" && result && (
        <div className="kiosk-result failure">
          <Ban size={64} />
          <h2>Hold released</h2>
          <p className="oknote">{result.id} is now <span className={`status ${result.status}`}>{result.status}</span>.</p>
          {message && <p>{message}</p>}
          {replacement && (
            <div className="oknote">
              Replacement order <span className="mono">{replacement.id}</span> ({replacement.formatted_total}) is ready.
              Approve the new PayPal authorization in Shop.
            </div>
          )}
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="primary lg" onClick={reset}>Next customer</button>
          </div>
        </div>
      )}

      {screen === "failed" && result && (
        <div className="kiosk-result failure">
          <CircleAlert size={64} />
          <h2>Handover failed</h2>
          <p className="oknote">
            {result.id} is now <span className={`status ${result.status}`}>{result.status}</span>
            {result.failure_reason ? ` (${result.failure_reason})` : ""}. Total {result.formatted_total}.
          </p>
          <p>The PayPal authorization is still held. Choose retry, a substitute within budget, or void the hold.</p>
          {recommended && <p className="warnnote">Recommended: {recommended}</p>}
          {message && <p className="oknote">{message}</p>}
          {error && <div className="err">{error}</div>}
          <div className="actions" style={{ justifyContent: "center" }}>
            <button className="ok" disabled={busy} onClick={() => setPending({ action: "retry" })}>
              <RefreshCcw size={16} /> Retry same item
            </button>
            <button className="danger" disabled={busy} onClick={() => setPending({ action: "cancel" })}>
              Void the hold
            </button>
          </div>
          {alternatives.length > 0 && (
            <div style={{ marginTop: 24, textAlign: "left" }}>
              <h3>Substitutes within the original budget</h3>
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
        <div className="grid-2">
          <section className="card">
            <h3>Scan or type pickup code</h3>
            <form onSubmit={(event: FormEvent) => event.preventDefault()}>
              <input
                className="kiosk-code"
                value={code}
                maxLength={8}
                placeholder="A2K9QX"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
              />
              <textarea
                className="field"
                style={{ width: "100%", marginTop: 12, minHeight: 80, borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.06)", color: "inherit", border: "1px solid rgba(255,255,255,0.12)" }}
                placeholder="Optional handover note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <input type="file" accept="image/*" style={{ marginTop: 12 }} onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} />
              <div className="actions">
                <button className="ok lg" disabled={busy || !code} onClick={() => post("/api/device/confirm", {})}>
                  Confirm handover and capture
                </button>
              </div>
              <h3 style={{ marginTop: 28 }}>If handover failed</h3>
              <select value={reason} onChange={(event) => setReason(event.target.value)} style={{ marginBottom: 12 }}>
                {REASONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <div className="reason-grid">
                {REASONS.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    className={`reason-btn${reason === item.value ? " selected" : ""}`}
                    onClick={() => setReason(item.value)}
                  >
                    <strong>{item.label}</strong>
                    <div>{item.hint}</div>
                  </button>
                ))}
              </div>
              <div className="actions">
                <button className="danger" disabled={busy || !code} onClick={() => post("/api/device/fail", { reason })}>
                  Report delivery failure
                </button>
              </div>
            </form>
            {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
            {result && result.status !== "DELIVERY_FAILED" && result.status !== "CAPTURED" && (
              <div className="oknote" style={{ marginTop: 12 }}>
                {result.id} is now <span className={`status ${result.status}`}>{result.status}</span>
                {result.failure_reason ? ` (${result.failure_reason})` : ""}. Total {result.formatted_total}.
              </div>
            )}
          </section>
          <aside className="card">
            <h3>Station queue</h3>
            <div className="list">
              {queue.length === 0 && <p>No authorized pickups waiting.</p>}
              {queue.map((order) => (
                <button key={order.id} className="ghost" style={{ textAlign: "left" }} onClick={() => useOrder(order)}>
                  <strong>{order.pickup_code}</strong> · {order.formatted_total}
                  <div className={`status ${order.status}`}>{order.status}</div>
                  <div>{order.items.map((item) => `${item.name} × ${item.qty}`).join(", ")}</div>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === "substitute" ? "Confirm substitution" : pending?.action === "cancel" ? "Void this hold?" : "Retry handover?"}
        body={
          pending?.action === "substitute"
            ? `This VOIDs the current PayPal authorization and creates a new AUTHORIZE order for ${pending.items?.name ?? "the substitute"}.`
            : pending?.action === "cancel"
              ? "This calls PayPal Payments v2 to void the authorization. The customer will not be charged."
              : "The same authorization stays active so the station can try again."
        }
        confirmLabel={pending?.action === "substitute" ? "Confirm substitution" : pending?.action === "cancel" ? "Void the hold" : "Retry"}
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
