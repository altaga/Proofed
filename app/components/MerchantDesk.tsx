"use client";

import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";
import { TransactionPanel } from "./TransactionPanel";
import { formatWhen, statusWord, storyEvents } from "./tx-model";

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
  const [confirm, setConfirm] = useState<{ path: string; extra: Record<string, unknown>; label: string; danger?: boolean } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [venueName, setVenueName] = useState("Merchant");

  const refresh = useCallback(async () => {
    const [orderRes, eventRes, configRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/events"),
      fetch("/api/config"),
    ]);
    const orderPayload = await orderRes.json();
    const eventPayload = await eventRes.json();
    if (!orderRes.ok) throw new Error(orderPayload.error || "Could not load orders");
    setOrders(orderPayload.orders || []);
    setEvents(eventPayload.events || []);
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
      setMenuOpen(false);
    }
  }

  const selectedEvents = events.filter((item) => !selected || item.order_id === selected.id);

  return (
    <div>
      {orders.length === 0 ? (
        <div className="empty-state">
          <h3>No orders yet</h3>
          <p>When someone pays in the shop, their order shows up here.</p>
        </div>
      ) : (
        <div className="order-list">
          {orders.map((order) => (
            <button key={order.id} type="button" className="order-row" onClick={() => setSelected(order)}>
              <span className="amount">{order.formatted_total}</span>
              <span className="word">{statusWord(order.status)}</span>
              <span className="when">{formatWhen(order.updated_at || order.created_at)}</span>
              <span className="oid">{order.id}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="err" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <div className="oknote" style={{ marginTop: 12 }}>{notice}</div>}

      {selected && (
        <div className="drawer-backdrop" onClick={() => { setSelected(null); setMenuOpen(false); }}>
          <aside className="drawer" data-testid="order-drawer" onClick={(event) => event.stopPropagation()} aria-label="Order detail">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{selected.formatted_total} {statusWord(selected.status)}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <div className="menu">
                  <button className="ghost" type="button" aria-label="More actions" onClick={() => setMenuOpen((value) => !value)}>
                    <MoreHorizontal size={18} />
                  </button>
                  {menuOpen && (
                    <div className="menu-pop">
                      <button type="button" onClick={() => setConfirm({ path: "/api/paypal/capture", extra: {}, label: "Charge" })}>Charge now</button>
                      <button type="button" onClick={() => setConfirm({ path: "/api/paypal/void", extra: { reason: "merchant_void" }, label: "Release", danger: true })}>Release hold</button>
                      <button type="button" onClick={() => setConfirm({ path: "/api/paypal/refund", extra: {}, label: "Refund" })}>Refund</button>
                    </div>
                  )}
                </div>
                <button className="ghost" type="button" onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <TransactionPanel order={selected} events={selectedEvents} venueName={venueName} />
            </div>
            <h3 style={{ marginTop: 20 }}>What happened</h3>
            <div className="plain-timeline">
              {selectedEvents.length === 0 && <p className="lede">No events yet.</p>}
              <ol>
                {storyEvents(selectedEvents, selected.formatted_total).map((item) => (
                  <li key={item.id} className="agent-step">
                    {item.text}
                    <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
                  </li>
                ))}
              </ol>
            </div>
            {(selected.paypal_order_id || selected.paypal_authorization_id || selected.paypal_capture_id) && (
              <p className="tx-note" style={{ marginTop: 16 }}>
                PayPal {selected.paypal_order_id || selected.paypal_capture_id || selected.paypal_authorization_id}
              </p>
            )}
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={`${confirm?.label} this order?`}
        body={`This sends the request to PayPal for ${selected?.id ?? "the selected order"}.`}
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
