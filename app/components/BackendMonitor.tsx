"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Lock,
  Package,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";

type OrderItem = {
  sku: string;
  name: string;
  qty: number;
};

type OrderRecord = {
  id: string;
  status: string;
  total_cents: number;
  formatted_total: string;
  pickup_code: string | null;
  failure_reason: string | null;
  items: OrderItem[];
  created_at: string;
  paypal_order_id?: string | null;
  paypal_authorization_id?: string | null;
  paypal_capture_id?: string | null;
  paypal_refund_id?: string | null;
};

type AuditEvent = {
  id: number;
  order_id: string;
  event: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  detail: string | null;
  created_at: string;
};

export function BackendMonitor() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const [ordersRes, eventsRes] = await Promise.all([fetch("/api/orders"), fetch("/api/events")]);
      const ordersData = await ordersRes.json();
      const eventsData = await eventsRes.json();

      const orderList: OrderRecord[] = ordersData.orders || [];
      setOrders(orderList);
      setEvents(eventsData.events || []);

      if (orderList.length > 0 && !selectedOrder) {
        setSelectedOrder(orderList[0]);
      } else if (selectedOrder) {
        const updated = orderList.find((o) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => void loadData(), 5000);
    return () => clearInterval(timer);
  }, []);

  async function handleVoid(orderId: string) {
    if (!confirm(`Are you sure you want to void the PayPal authorization hold for order ${orderId}?`)) return;
    setActionBusy(`void-${orderId}`);
    try {
      const res = await fetch("/api/paypal/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: "Manual Backend Void by Admin" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Order ${orderId} successfully VOIDED. Hold released.`);
        await loadData();
      } else {
        alert(data.error || "Void failed");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCapture(orderId: string) {
    if (!confirm(`Manual capture override for ${orderId}: execute PayPal capture?`)) return;
    setActionBusy(`capture-${orderId}`);
    try {
      const res = await fetch("/api/device/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, pickupCode: selectedOrder?.pickup_code, note: "Admin Manual Override" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Order ${orderId} CAPTURED successfully.`);
        await loadData();
      } else {
        alert(data.error || "Capture failed");
      }
    } finally {
      setActionBusy(null);
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.pickup_code && order.pickup_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      order.items?.some((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterStatus === "ALL") return true;
    return order.status === filterStatus;
  });

  return (
    <div className="backend-monitor-layout">
      {/* Top Banner & Control Bar */}
      <header className="backend-header">
        <div className="backend-brand-block">
          <h1>Orders & settlement</h1>
        </div>

        <div className="backend-quick-actions">
          <button
            type="button"
            className="admin-btn admin-btn-refresh"
            disabled={isLoading}
            onClick={() => void loadData()}
          >
            <RefreshCw size={14} className={isLoading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {actionMsg && (
        <div className="backend-action-toast mono" role="status">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="toast-dismiss">
            ✕
          </button>
        </div>
      )}

      {/* 2-Column Workspace */}
      <div className="backend-grid">
        {/* Left Column: Orders Ledger */}
        <section className="orders-ledger-panel">
          <div className="ledger-toolbar">
            <div className="ledger-search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="ledger-search-input"
                placeholder="Search orders, codes, or items…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search orders"
              />
            </div>
            <div className="status-filter-pills" role="tablist">
              {[
                { key: "ALL", label: "All" },
                { key: "AUTHORIZED", label: "Authorized" },
                { key: "CAPTURED", label: "Captured" },
                { key: "DELIVERY_FAILED", label: "Failed" },
                { key: "VOIDED", label: "Voided" },
              ].map((st) => (
                <button
                  key={st.key}
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === st.key}
                  className={`filter-pill ${filterStatus === st.key ? "active" : ""}`}
                  onClick={() => setFilterStatus(st.key)}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Code</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No orders match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => {
                    const isSelected = selectedOrder?.id === order.id;
                    return (
                      <tr
                        key={order.id}
                        className={`order-row ${isSelected ? "selected" : ""}`}
                        onClick={() => setSelectedOrder(order)}
                      >
                        <td className="mono order-id-cell">{order.id}</td>
                        <td>
                          <span className={`order-status-tag status-${order.status.toLowerCase()} mono`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="mono order-amount-cell">
                          {order.formatted_total}
                          {order.status === "AUTHORIZED" && <span className="cell-hold-pill">$0 charged</span>}
                        </td>
                        <td className="mono">{order.pickup_code || "—"}</td>
                        <td className="mono time-cell">{new Date(order.created_at).toLocaleTimeString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right Column: Selected Order Details */}
        <aside className="order-details-drawer">
          {selectedOrder ? (
            <div className="drawer-content">
              <div className="drawer-header">
                <div>
                  <span className="drawer-subtitle">Order</span>
                  <h3 className="mono">{selectedOrder.id}</h3>
                </div>
                <span className={`drawer-badge status-${selectedOrder.status.toLowerCase()} mono`}>
                  {selectedOrder.status}
                </span>
              </div>

              {/* Settlement Status Card */}
              <div
                className={`safety-status-box ${selectedOrder.status === "DELIVERY_FAILED" ? "box-alarm" : "box-normal"}`}
              >
                <div className="safety-box-icon">
                  {selectedOrder.status === "DELIVERY_FAILED" ? <ShieldAlert size={18} /> : <Shield size={18} />}
                </div>
                <div className="safety-box-text">
                  <span className="safety-title">
                    {selectedOrder.status === "DELIVERY_FAILED"
                      ? "Delivery failed — capture blocked ($0.00 charged)"
                      : selectedOrder.status === "CAPTURED"
                        ? "Settled after delivery"
                        : "Hold active — captures on delivery"}
                  </span>
                  <p>
                    {selectedOrder.status === "DELIVERY_FAILED"
                      ? `Reported issue: ${selectedOrder.failure_reason}. PayPal capture remains blocked.`
                      : selectedOrder.status === "CAPTURED"
                        ? "Payment was captured after handoff verification."
                        : `${selectedOrder.formatted_total} held on PayPal. No funds are captured until delivery is confirmed.`}
                  </p>
                </div>
              </div>

              {/* PayPal References */}
              <div className="detail-section">
                <span className="detail-section-title">PayPal references</span>
                <div className="metric-row">
                  <span className="metric-key">Authorization</span>
                  <span className="metric-val mono">{selectedOrder.paypal_authorization_id || "Pending"}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-key">Capture</span>
                  <span className="metric-val mono">{selectedOrder.paypal_capture_id || "Not captured"}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-key">Destination</span>
                  <span className="metric-val mono">744 Maple St, Apt 2B</span>
                </div>
              </div>

              {/* Order Items */}
              <div className="detail-section">
                <span className="detail-section-title">Items</span>
                <div className="drawer-items-list">
                  {selectedOrder.items?.map((item, idx) => (
                    <div key={idx} className="drawer-item-row">
                      <Package size={14} />
                      <span className="drawer-item-name">{item.name}</span>
                      <span className="drawer-item-qty mono">× {item.qty}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="drawer-actions-row">
                {selectedOrder.status === "AUTHORIZED" && (
                  <>
                    <button
                      type="button"
                      className="drawer-action-btn btn-void"
                      onClick={() => handleVoid(selectedOrder.id)}
                      disabled={Boolean(actionBusy)}
                    >
                      Release hold (/void)
                    </button>
                    <button
                      type="button"
                      className="drawer-action-btn btn-capture"
                      onClick={() => handleCapture(selectedOrder.id)}
                      disabled={Boolean(actionBusy)}
                    >
                      Capture now
                    </button>
                  </>
                )}
                {selectedOrder.status === "DELIVERY_FAILED" && (
                  <button
                    type="button"
                    className="drawer-action-btn btn-void"
                    onClick={() => handleVoid(selectedOrder.id)}
                    disabled={Boolean(actionBusy)}
                  >
                    Release hold (/void)
                  </button>
                )}
              </div>

              {/* Event Log */}
              <div className="detail-section">
                <span className="detail-section-title">Events</span>
                <div className="events-stream-list">
                  {events
                    .filter((ev) => ev.order_id === selectedOrder.id)
                    .map((ev) => (
                      <div key={ev.id} className="event-stream-row">
                        <div className="event-time mono">{new Date(ev.created_at).toLocaleTimeString()}</div>
                        <div className="event-badge mono">{ev.event}</div>
                        <div className="event-actor mono">{ev.actor}</div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="drawer-empty">Select an order from the ledger to inspect details.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
