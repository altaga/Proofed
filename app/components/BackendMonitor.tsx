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

  async function handleSeedDemo() {
    setActionBusy("seed");
    try {
      const res = await fetch("/api/demo/seed-held", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: "ELEC-GAN-100",
          note: "Backend Simulated Client Order",
        }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setActionMsg(`Seeded new order ${data.order.id} in AUTHORIZED state.`);
        await loadData();
        setSelectedOrder(data.order);
      }
    } finally {
      setActionBusy(null);
    }
  }

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
          <div className="system-live-pill">
            <span className="live-pulse" />
            <span className="mono">SETTLEMENT ENGINE · LIVE</span>
          </div>
          <h1>Client Flow & Settlement Monitor</h1>
        </div>

        <div className="backend-quick-actions">
          <button
            type="button"
            className="admin-btn admin-btn-seed"
            disabled={Boolean(actionBusy)}
            onClick={handleSeedDemo}
          >
            <Sparkles size={14} />
            <span>Seed Client Order</span>
          </button>
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

      {/* Global Pipeline Visualizer */}
      <section className="pipeline-stepper-card" aria-label="Order Lifecycle Pipeline">
        <div className="pipeline-step-item">
          <div className="step-circle step-circle-active">1</div>
          <div className="step-meta">
            <span className="step-title">Client Chat & Quote</span>
            <span className="step-sub">Natural language negotiation</span>
          </div>
        </div>
        <div className="pipeline-arrow">
          <ArrowRight size={16} />
        </div>

        <div className="pipeline-step-item">
          <div className="step-circle step-circle-active">2</div>
          <div className="step-meta">
            <span className="step-title">PayPal Hold Placed</span>
            <span className="step-sub mono">intent=AUTHORIZE ($0 charged)</span>
          </div>
        </div>
        <div className="pipeline-arrow">
          <ArrowRight size={16} />
        </div>

        <div className="pipeline-step-item">
          <div className="step-circle step-circle-active">3</div>
          <div className="step-meta">
            <span className="step-title">Courier Handover</span>
            <span className="step-sub">Doorstep drop & photo upload</span>
          </div>
        </div>
        <div className="pipeline-arrow">
          <ArrowRight size={16} />
        </div>

        <div className="pipeline-step-item">
          <div className="step-circle step-circle-active">4</div>
          <div className="step-meta">
            <span className="step-title">AI Vision Proof Check</span>
            <span className="step-sub">Door # verification OCR</span>
          </div>
        </div>
        <div className="pipeline-arrow">
          <ArrowRight size={16} />
        </div>

        <div className="pipeline-step-item">
          <div className="step-circle step-circle-active">5</div>
          <div className="step-meta">
            <span className="step-title">Capture or Void</span>
            <span className="step-sub">Conditional on physical proof</span>
          </div>
        </div>
      </section>

      {actionMsg && (
        <div className="backend-action-toast mono" role="status">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="toast-dismiss">
            ✕
          </button>
        </div>
      )}

      {/* 2-Column High-Density Workspace */}
      <div className="backend-grid">
        {/* Left Column: Orders Ledger */}
        <section className="orders-ledger-panel">
          <div className="ledger-toolbar">
            <div className="ledger-search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="ledger-search-input"
                placeholder="Search orders, codes, or items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search orders"
              />
            </div>
            <div className="status-filter-pills" role="tablist">
              {["ALL", "AUTHORIZED", "CAPTURED", "DELIVERY_FAILED", "VOIDED"].map((st) => (
                <button
                  key={st}
                  type="button"
                  role="tab"
                  aria-selected={filterStatus === st}
                  className={`filter-pill ${filterStatus === st ? "active" : ""}`}
                  onClick={() => setFilterStatus(st)}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Status</th>
                  <th>Hold Amount</th>
                  <th>Tracking / Code</th>
                  <th>Created</th>
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
                          {order.status === "AUTHORIZED" && <span className="cell-hold-pill">$0 Debited</span>}
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

        {/* Right Column: Selected Order Deep-Dive & Event Stream */}
        <aside className="order-details-drawer">
          {selectedOrder ? (
            <div className="drawer-content">
              <div className="drawer-header">
                <div>
                  <span className="drawer-subtitle mono">INSPECTING TRANSACTION</span>
                  <h3 className="mono">{selectedOrder.id}</h3>
                </div>
                <span className={`drawer-badge status-${selectedOrder.status.toLowerCase()} mono`}>
                  {selectedOrder.status}
                </span>
              </div>

              {/* Zero-Capture Safety Card */}
              <div
                className={`safety-status-box ${selectedOrder.status === "DELIVERY_FAILED" ? "box-alarm" : "box-normal"}`}
              >
                <div className="safety-box-icon">
                  {selectedOrder.status === "DELIVERY_FAILED" ? <ShieldAlert size={20} /> : <Shield size={20} />}
                </div>
                <div className="safety-box-text">
                  <span className="safety-title mono">
                    {selectedOrder.status === "DELIVERY_FAILED"
                      ? "ZERO-CAPTURE SAFETY LOCK: ACTIVE"
                      : "AUTHORIZE-BEFORE-CAPTURE GUARD: ARMED"}
                  </span>
                  <p>
                    {selectedOrder.status === "DELIVERY_FAILED"
                      ? `Handover reported problem: ${selectedOrder.failure_reason}. PayPal capture permanently blocked. Buyer balance was debited $0.00.`
                      : selectedOrder.status === "CAPTURED"
                        ? "Payment captured only after proof of handover was recorded."
                        : `Funds held on PayPal (${selectedOrder.formatted_total}). Zero funds captured until verified delivery.`}
                  </p>
                </div>
              </div>

              {/* PayPal Transaction IDs */}
              <div className="detail-section">
                <span className="detail-section-title mono">PAYPAL TRANSACTION METRICS</span>
                <div className="metric-row">
                  <span className="metric-key">Authorization ID:</span>
                  <span className="metric-val mono">{selectedOrder.paypal_authorization_id || "Pending Hold"}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-key">Capture ID:</span>
                  <span className="metric-val mono">{selectedOrder.paypal_capture_id || "None (Not Captured)"}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-key">Destination:</span>
                  <span className="metric-val mono">744 Maple Street, Apt 2B</span>
                </div>
              </div>

              {/* Order Items */}
              <div className="detail-section">
                <span className="detail-section-title mono">PACKAGE CONTENTS</span>
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
                      Release Hold (/void)
                    </button>
                    <button
                      type="button"
                      className="drawer-action-btn btn-capture"
                      onClick={() => handleCapture(selectedOrder.id)}
                      disabled={Boolean(actionBusy)}
                    >
                      Override Capture
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
                    Release Failed Hold (/void)
                  </button>
                )}
              </div>

              {/* Immutable Audit Log for this order */}
              <div className="detail-section">
                <span className="detail-section-title mono">IMMUTABLE EVENT AUDIT STREAM</span>
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
