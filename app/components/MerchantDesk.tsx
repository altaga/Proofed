"use client";

import { useCallback, useEffect, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { mergeEvents, mergeOrders } from "@/lib/order-merge";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyOrderState } from "./EmptyOrderState";
import { OrderLedgerGrid } from "./OrderLedgerGrid";
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
  const [opView, setOpView] = useState<"ALL" | "REJECTED_ACTIVE_AUTH" | "ACTIVE_AUTH" | "ESCALATED" | "CAPTURED">("ALL");
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

    let cachedList: PublicOrder[] = [];
    try {
      const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
      if (cachedRaw) {
        cachedList = JSON.parse(cachedRaw) as PublicOrder[];
      }
    } catch {
      // ignore
    }

    setOrders((prev) => {
      // Monotonically merge server orders, previous React state, and localStorage cache
      let merged = mergeOrders(orderPayload.orders || [], prev);
      if (Array.isArray(cachedList) && cachedList.length > 0) {
        merged = mergeOrders(cachedList, merged);
      }
      // Persist the consolidated authoritative orders back to localStorage
      try {
        window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(merged.slice(0, 20)));
      } catch {
        // ignore
      }

      // Background-sync with server so stale lambda instances learn about newer states
      void fetch("/api/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: merged }),
      }).catch(() => {});

      setSelected((current) => {
        if (!current) return merged[0] || null;
        const updated = merged.find((item: PublicOrder) => item.id === current.id);
        return updated ?? current;
      });

      return merged;
    });

    setEvents((prev) => {
      return mergeEvents(eventPayload.events || [], prev);
    });

    if (configRes.ok) {
      const configPayload = await configRes.json();
      if (configPayload.venueName) setVenueName(configPayload.venueName);
    }
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
  const escalatedOrderIds = new Set(
    events
      .filter((e) => e.event === "DISPUTE_ESCALATED_FOR_REVIEW" || e.event === "RETRY_LIMIT_ESCALATED")
      .map((e) => e.order_id),
  );

  const filteredOrders = orders.filter((o) => {
    if (opView === "REJECTED_ACTIVE_AUTH") return o.status === "DELIVERY_FAILED";
    if (opView === "ACTIVE_AUTH") return o.status === "AUTHORIZED";
    if (opView === "ESCALATED") return escalatedOrderIds.has(o.id) || o.status === "DELIVERY_FAILED";
    if (opView === "CAPTURED") return o.status === "CAPTURED";
    return true;
  });

  return (
    <div>
      {/* Operational Intelligence Views */}
      <div
        className="merchant-op-views"
        role="tablist"
        aria-label="Operational Order Views"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "16px",
          padding: "10px 12px",
          background: "#161512",
          border: "1px solid #2A2722",
          borderRadius: "4px",
          alignItems: "center",
        }}
      >
        <span className="mono" style={{ fontSize: "11px", color: "#9C968B", marginRight: "6px" }}>
          OPERATIONAL VIEW:
        </span>
        {[
          { id: "ALL", label: `All Orders (${orders.length})` },
          {
            id: "REJECTED_ACTIVE_AUTH",
            label: `Rejected Fulfillment · Active Auth (${orders.filter((o) => o.status === "DELIVERY_FAILED").length})`,
          },
          {
            id: "ACTIVE_AUTH",
            label: `Active Authorizations (${orders.filter((o) => o.status === "AUTHORIZED").length})`,
          },
          {
            id: "ESCALATED",
            label: `Escalated / Review Required (${orders.filter((o) => escalatedOrderIds.has(o.id) || o.status === "DELIVERY_FAILED").length})`,
          },
          {
            id: "CAPTURED",
            label: `Verified Handover · Captured (${orders.filter((o) => o.status === "CAPTURED").length})`,
          },
        ].map((tab) => {
          const active = opView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setOpView(tab.id as typeof opView)}
              className="mono"
              style={{
                padding: "5px 10px",
                fontSize: "11px",
                borderRadius: "3px",
                border: active ? "1px solid #D97706" : "1px solid #2E2B24",
                background: active ? "rgba(217, 119, 6, 0.14)" : "#1C1B18",
                color: active ? "#F4F1EA" : "#A6A095",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {filteredOrders.length === 0 ? (
        <EmptyOrderState
          title="No matching orders in this operational view"
          body="Orders appear here as soon as a customer approves a PayPal authorization in Shop or when fulfillment exceptions occur."
          actionLabel="Open Shop Chat"
        />
      ) : (
        <OrderLedgerGrid
          orders={filteredOrders}
          selectedId={selected?.id ?? null}
          onSelect={(row) => setSelected(orders.find((o) => o.id === row.id) ?? null)}
        />
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
