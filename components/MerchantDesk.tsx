"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  type ColDef,
  ModuleRegistry,
  themeQuartz,
  type RowClickedEvent,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: "#fffaf1",
  foregroundColor: "#1b1712",
  headerBackgroundColor: "#1c2a3a",
  headerTextColor: "#f4ebd8",
  accentColor: "#9b2c1c",
  borderColor: "rgba(27,23,18,0.12)",
});

type PublicOrder = {
  id: string;
  status: string;
  formatted_total: string;
  pickup_code: string | null;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  paypal_refund_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  items: Array<{ sku: string; name: string; qty: number }>;
  evidence: Array<{ id: string; kind: string; note: string | null; photo_sha256: string | null; created_at: string }>;
};

type EventRow = {
  id: number;
  order_id: string | null;
  event: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  detail_json: string;
  created_at: string;
};

export function MerchantDesk() {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [orderRes, eventRes] = await Promise.all([fetch("/api/orders"), fetch("/api/events")]);
    const orderPayload = await orderRes.json();
    const eventPayload = await eventRes.json();
    if (!orderRes.ok) throw new Error(orderPayload.error || "Could not load orders");
    setOrders(orderPayload.orders || []);
    setEvents(eventPayload.events || []);
    setSelected((current) => {
      if (!current) return current;
      return (orderPayload.orders || []).find((item: PublicOrder) => item.id === current.id) ?? current;
    });
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Load failed"));
    const timer = setInterval(() => {
      refresh().catch(() => undefined);
    }, 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  const columns = useMemo<ColDef<PublicOrder>[]>(
    () => [
      { field: "id", headerName: "Order", flex: 1.4, minWidth: 160 },
      { field: "status", headerName: "Status", flex: 1, minWidth: 140 },
      { field: "formatted_total", headerName: "Amount", width: 110 },
      { field: "pickup_code", headerName: "Pickup", width: 120 },
      { field: "paypal_order_id", headerName: "PayPal order", flex: 1.2, minWidth: 160 },
      { field: "paypal_authorization_id", headerName: "Authorization", flex: 1.1, minWidth: 150 },
      { field: "paypal_capture_id", headerName: "Capture", flex: 1.1, minWidth: 140 },
      { field: "updated_at", headerName: "Updated", flex: 1, minWidth: 170 },
    ],
    [],
  );

  async function act(path: string, extra: Record<string, unknown>, label: string) {
    if (!selected) return;
    if (!window.confirm(`${label} order ${selected.id}? This calls the real PayPal sandbox API.`)) return;
    setError(null);
    setNotice(null);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: selected.id, confirm: true, ...extra }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || `${label} failed`);
      return;
    }
    setNotice(`${label} succeeded.`);
    setSelected(payload.order);
    await refresh();
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Orders</h3>
          <div className="actions" style={{ margin: 0 }}>
            <button className="ghost" onClick={() => refresh()}>Refresh</button>
            <button
              className="ghost"
              onClick={async () => {
                const response = await fetch("/api/jobs/reconcile", { method: "POST" });
                const payload = await response.json();
                setNotice(response.ok ? `Reconciled ${payload.checked} orders` : payload.error);
                await refresh();
              }}
            >
              Reconcile now
            </button>
          </div>
        </div>
        <div style={{ height: 380, width: "100%", marginTop: 12 }}>
          <AgGridReact<PublicOrder>
            theme={gridTheme}
            rowData={orders}
            columnDefs={columns}
            rowSelection="single"
            animateRows
            onRowClicked={(event: RowClickedEvent<PublicOrder>) => setSelected(event.data ?? null)}
          />
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h3>Selected order</h3>
          {error && <div className="err">{error}</div>}
          {notice && <div className="oknote">{notice}</div>}
          {!selected && <p>Select a row to inspect PayPal ids, evidence, and take action.</p>}
          {selected && (
            <div className="detail">
              <div><span>ID</span> <span className="mono">{selected.id}</span></div>
              <div>Status <span className={`status ${selected.status}`}>{selected.status}</span> · {selected.formatted_total}</div>
              <div>Items {selected.items.map((item) => `${item.name} × ${item.qty}`).join(", ")}</div>
              <div>Pickup <span className="mono">{selected.pickup_code || "—"}</span></div>
              <div>PayPal order <span className="mono">{selected.paypal_order_id || "—"}</span></div>
              <div>Authorization <span className="mono">{selected.paypal_authorization_id || "—"}</span></div>
              <div>Capture <span className="mono">{selected.paypal_capture_id || "—"}</span></div>
              <div>Refund <span className="mono">{selected.paypal_refund_id || "—"}</span></div>
              {selected.failure_reason && <div className="err">{selected.failure_reason}</div>}
              <div>
                Evidence
                {selected.evidence.length === 0 && " — none yet"}
                {selected.evidence.map((item) => (
                  <div key={item.id} className="mono">
                    {item.kind} · {item.photo_sha256 || "no photo"} · {item.note || ""}
                  </div>
                ))}
              </div>
              <div className="actions">
                <button className="ok" onClick={() => act("/api/paypal/capture", {}, "Capture")}>Capture</button>
                <button className="danger" onClick={() => act("/api/paypal/void", { reason: "merchant_void" }, "Void")}>Void</button>
                <button className="ghost" onClick={() => act("/api/paypal/refund", {}, "Refund")}>Refund</button>
              </div>
            </div>
          )}
        </section>
        <section className="card">
          <h3>Event log</h3>
          <div className="transcript" style={{ maxHeight: 360 }}>
            {events
              .filter((item) => !selected || item.order_id === selected.id)
              .map((item) => (
                <div key={item.id} className="bubble assistant">
                  <strong>{item.event}</strong> · {item.actor}
                  <div className="mono">
                    {item.from_status || "—"} → {item.to_status || "—"} · {item.created_at}
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
