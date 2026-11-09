"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type PublicOrder = {
  id: string;
  status: string;
  formatted_total: string;
  pickup_code: string | null;
  failure_reason: string | null;
  items: Array<{ name: string; qty: number; sku: string }>;
};

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function post(path: string, extra: Record<string, unknown>) {
    setBusy(true);
    setError(null);
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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function useOrder(order: PublicOrder) {
    setCode(order.pickup_code || "");
    setResult(order);
  }

  return (
    <div className="grid-2">
      <section className="card">
        <h3>Scan or type pickup code</h3>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
          }}
        >
          <input
            className="kiosk-code"
            value={code}
            maxLength={8}
            placeholder="A2K9QX"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          <textarea
            style={{ width: "100%", marginTop: 12, minHeight: 80, borderRadius: 12, padding: 10 }}
            placeholder="Optional handover note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <input
            type="file"
            accept="image/*"
            style={{ marginTop: 12 }}
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
          <div className="actions">
            <button className="ok" disabled={busy || !code} onClick={() => post("/api/device/confirm", {})}>
              Confirm handover and capture
            </button>
          </div>
          <div className="actions">
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="jam">Station jam</option>
              <option value="item_damaged">Item damaged</option>
              <option value="customer_absent">Customer absent</option>
              <option value="other">Other</option>
            </select>
            <button className="danger" disabled={busy || !code} onClick={() => post("/api/device/fail", { reason })}>
              Report delivery failure
            </button>
          </div>
        </form>
        {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
        {result && (
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
  );
}
