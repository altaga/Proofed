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
import { RefreshCcw, X } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { TransactionPanel } from "./TransactionPanel";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#111216",
  headerBackgroundColor: "#f4f5f7",
  headerTextColor: "#111216",
  accentColor: "#0a5cff",
  borderColor: "#d8dce3",
  headerFontWeight: 600,
  fontSize: 13,
});

type PublicOrder = {
  id: string;
  status: string;
  formatted_total: string;
  subtotal_cents?: number;
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

type Stats = {
  order_count: number;
  held: { count: number; formatted: string };
  captured: { count: number; formatted: string };
  voided: { count: number; formatted: string };
  refunded: { count: number; formatted: string };
  failure_reasons: Record<string, number>;
};

function StatusCell(props: { value?: string }) {
  if (!props.value) return null;
  return <span className={`status ${props.value}`}>{props.value}</span>;
}

export function MerchantDesk() {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ path: string; extra: Record<string, unknown>; label: string; danger?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [venueName, setVenueName] = useState("Merchant");

  const refresh = useCallback(async () => {
    const [orderRes, eventRes, statsRes, configRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/events"),
      fetch("/api/stats"),
      fetch("/api/config"),
    ]);
    const orderPayload = await orderRes.json();
    const eventPayload = await eventRes.json();
    const statsPayload = await statsRes.json();
    if (!orderRes.ok) throw new Error(orderPayload.error || "Could not load orders");
    setOrders(orderPayload.orders || []);
    setEvents(eventPayload.events || []);
    if (statsRes.ok) setStats(statsPayload.stats);
    if (configRes.ok) {
      const configPayload = await configRes.json();
      if (configPayload.venueName) setVenueName(configPayload.venueName);
    }
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
      { field: "status", headerName: "Status", flex: 1, minWidth: 150, cellRenderer: StatusCell },
      { field: "formatted_total", headerName: "Amount", width: 110 },
      { field: "pickup_code", headerName: "Pickup", width: 120 },
      { field: "paypal_order_id", headerName: "PayPal order", flex: 1.2, minWidth: 160 },
      { field: "paypal_authorization_id", headerName: "Authorization", flex: 1.1, minWidth: 150 },
      { field: "paypal_capture_id", headerName: "Capture", flex: 1.1, minWidth: 140 },
      { field: "updated_at", headerName: "Updated", flex: 1, minWidth: 170 },
    ],
    [],
  );

  async function runAction(path: string, extra: Record<string, unknown>, label: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
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
      if (payload.order) setSelected(payload.order);
      await refresh();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const selectedEvents = events.filter((item) => !selected || item.order_id === selected.id);

  return (
    <div>
      <div className="kpi-row">
        <div className="card kpi held">
          <div className="label">Held</div>
          <div className="value">{stats?.held.formatted ?? "—"}</div>
          <div className="sub">{stats?.held.count ?? 0} authorized / in handover</div>
        </div>
        <div className="card kpi captured">
          <div className="label">Captured</div>
          <div className="value">{stats?.captured.formatted ?? "—"}</div>
          <div className="sub">{stats?.captured.count ?? 0} completed pickups</div>
        </div>
        <div className="card kpi voided">
          <div className="label">Voided</div>
          <div className="value">{stats?.voided.formatted ?? "—"}</div>
          <div className="sub">{stats?.voided.count ?? 0} released holds</div>
        </div>
        <div className="card kpi refunded">
          <div className="label">Refunded</div>
          <div className="value">{stats?.refunded.formatted ?? "—"}</div>
          <div className="sub">
            {stats?.refunded.count ?? 0} refunds
            {stats && Object.keys(stats.failure_reasons).length > 0
              ? ` · ${Object.entries(stats.failure_reasons).map(([reason, count]) => `${reason} ${count}`).join(", ")}`
              : ""}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Orders</h3>
          <div className="actions" style={{ margin: 0 }}>
            <button className="ghost" onClick={() => refresh()}><RefreshCcw size={16} /> Refresh</button>
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
        {orders.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 12 }}>
            <h3>No orders yet</h3>
            <p>Open Shop, ask for a keychain with a $20 budget, approve the PayPal hold, then this table fills with live sandbox orders.</p>
          </div>
        ) : (
          <div style={{ height: 360, width: "100%", marginTop: 12 }}>
            <AgGridReact<PublicOrder>
              theme={gridTheme}
              rowData={orders}
              columnDefs={columns}
              rowSelection="single"
              animateRows
              onRowClicked={(event: RowClickedEvent<PublicOrder>) => setSelected(event.data ?? null)}
            />
          </div>
        )}
      </div>

      {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="oknote" style={{ marginBottom: 12 }}>{notice}</div>}

      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside className="drawer" data-testid="order-drawer" onClick={(event) => event.stopPropagation()} aria-label="Order detail">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Order detail</h3>
              <button className="ghost" type="button" onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div style={{ marginTop: 14 }}>
              <TransactionPanel order={selected} events={selectedEvents} venueName={venueName} />
            </div>
            <div className="detail" style={{ marginTop: 16 }}>
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
                <button className="ok" onClick={() => setConfirm({ path: "/api/paypal/capture", extra: {}, label: "Capture" })}>Capture</button>
                <button className="danger" onClick={() => setConfirm({ path: "/api/paypal/void", extra: { reason: "merchant_void" }, label: "Void", danger: true })}>Void</button>
                <button className="ghost" onClick={() => setConfirm({ path: "/api/paypal/refund", extra: {}, label: "Refund" })}>Refund</button>
              </div>
            </div>
            <h3 style={{ marginTop: 28 }}>Event log</h3>
            <div className="transcript" style={{ maxHeight: 360 }}>
              {selectedEvents.map((item) => (
                <div key={item.id} className="agent-step">
                  <div className="agent-step-head">
                    <strong>{item.event}</strong>
                    <span className="who">{item.actor}</span>
                  </div>
                  <div className="agent-kv">
                    <span>State</span>
                    {item.from_status || "—"} → {item.to_status || "—"}
                  </div>
                  <div className="tx-meta">{item.created_at}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={`${confirm?.label} this order?`}
        body={`This calls the real PayPal sandbox API for ${selected?.id ?? "the selected order"}.`}
        confirmLabel={`Confirm ${confirm?.label ?? "action"}`}
        danger={confirm?.danger}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void runAction(confirm.path, confirm.extra, confirm.label);
        }}
      />
    </div>
  );
}
