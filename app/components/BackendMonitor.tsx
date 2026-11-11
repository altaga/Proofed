"use client";

import { useEffect, useState } from "react";
import { mergeEvents, mergeOrders } from "@/lib/order-merge";
import {
  Activity,
  Code2,
  Copy,
  CreditCard,
  Database,
  Layers,
  Package,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from "lucide-react";

type OrderItem = {
  sku: string;
  name: string;
  qty: number;
  unit_price_cents?: number;
  line_total_cents?: number;
};

type EvidenceItem = {
  id: string;
  kind: string;
  note: string | null;
  photo_sha256: string | null;
  created_at: string;
};

type OrderRecord = {
  id: string;
  status: string;
  subtotal_cents?: number;
  formatted_total: string;
  pickup_code: string | null;
  failure_reason: string | null;
  items: OrderItem[];
  evidence?: EvidenceItem[];
  created_at: string;
  authorized_at?: string;
  delivered_at?: string;
  captured_at?: string;
  voided_at?: string;
  refunded_at?: string;
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
  detail_json: string | null;
  created_at: string;
};

type MerchantStats = {
  currency: string;
  order_count: number;
  held: { count: number; cents: number; formatted: string };
  captured: { count: number; cents: number; formatted: string };
  voided: { count: number; cents: number; formatted: string };
  refunded: { count: number; cents: number; formatted: string };
};

type HealthData = {
  ok: boolean;
  name?: string;
  venueName?: string;
  paypalConfigured?: boolean;
  minimaxConfigured?: boolean;
  webhookConfigured?: boolean;
};

export function BackendMonitor() {
  const [activeTab, setActiveTab] = useState<"orders" | "events" | "paypal_api" | "diagnostics">("orders");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);

  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [eventFilterActor, setEventFilterActor] = useState<string>("ALL");
  const [showRawJson, setShowRawJson] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const [ordersRes, eventsRes, statsRes, healthRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/events"),
        fetch("/api/stats").catch(() => null),
        fetch("/api/health").catch(() => null),
      ]);

      const ordersData = await ordersRes.json();
      const eventsData = await eventsRes.json();
      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats || null);
      }
      if (healthRes && healthRes.ok) {
        const healthData = await healthRes.json();
        setHealth(healthData);
      }

      let cachedList: OrderRecord[] = [];
      try {
        const cachedRaw = typeof window !== "undefined" ? window.localStorage.getItem("proofed:shared_orders_v1") : null;
        if (cachedRaw) {
          cachedList = JSON.parse(cachedRaw) as OrderRecord[];
        }
      } catch {
        // ignore
      }

      setOrders((prev) => {
        let merged = mergeOrders(ordersData.orders || [], prev);
        if (Array.isArray(cachedList) && cachedList.length > 0) {
          merged = mergeOrders(cachedList, merged);
        }
        if (merged.length > 0 && !selectedOrder) {
          setSelectedOrder(merged[0]);
        } else if (selectedOrder) {
          const updated = merged.find((o) => o.id === selectedOrder.id);
          if (updated) setSelectedOrder(updated);
        }
        return merged;
      });

      setEvents((prev) => mergeEvents(eventsData.events || [], prev));
    } catch (err) {
      console.warn("Failed to refresh backend data:", err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    const timer = setInterval(() => void loadData(), 5000);
    return () => clearInterval(timer);
  }, []);

  function copyToClipboard(text: string, keyId: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedKey(keyId);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }

  async function handleVoid(orderId: string) {
    if (!confirm(`Confirm releasing (/void) the PayPal authorization hold for order ${orderId}?`)) return;
    setActionBusy(`void-${orderId}`);
    try {
      const res = await fetch("/api/paypal/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: "Manual Backend Void by Admin" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Order ${orderId} voided on PayPal (/void). Hold released.`);
        await loadData();
      } else {
        alert(data.error || "Void failed");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCapture(orderId: string) {
    if (!confirm(`Force PayPal Payments v2 capture for order ${orderId}?`)) return;
    setActionBusy(`capture-${orderId}`);
    try {
      const res = await fetch("/api/device/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, pickupCode: selectedOrder?.pickup_code, note: "Admin Manual Override" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Order ${orderId} CAPTURED on PayPal.`);
        await loadData();
      } else {
        alert(data.error || "Capture failed");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function triggerReconcileJob() {
    setActionBusy("reconcile");
    try {
      const res = await fetch("/api/jobs/reconcile", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Reconciliation job completed. ${data.reconciled || 0} orders synced with PayPal API.`);
        await loadData();
      } else {
        alert(data.error || "Reconciliation failed");
      }
    } catch {
      alert("Error running reconciliation job");
    } finally {
      setActionBusy(null);
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.paypal_order_id && order.paypal_order_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.paypal_authorization_id && order.paypal_authorization_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.paypal_capture_id && order.paypal_capture_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.pickup_code && order.pickup_code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      order.items?.some((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (filterStatus === "ALL") return true;
    return order.status === filterStatus;
  });

  const filteredEvents = events.filter((ev) => {
    if (eventFilterActor === "ALL") return true;
    return ev.actor.toLowerCase() === eventFilterActor.toLowerCase();
  });

  return (
    <div className="backend-monitor-layout">
      {/* Top Banner & Control Bar */}
      <header className="backend-header">
        <div className="backend-brand-block">
          <div className="system-live-pill mono">
            <span className="live-pulse" />
            <span>DEV CONSOLE · HACKATHON JUDGE AUDIT TRAIL</span>
          </div>
          <h1>Developer &amp; Hackathon Backend</h1>
        </div>

        <div className="backend-quick-actions">
          <button
            type="button"
            className="admin-btn"
            disabled={Boolean(actionBusy)}
            onClick={() => void triggerReconcileJob()}
            title="Query PayPal API to reconcile pending authorizations"
          >
            <RefreshCw size={13} className={actionBusy === "reconcile" ? "spin" : ""} />
            <span>Reconcile PayPal API</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-refresh"
            disabled={isLoading}
            onClick={() => void loadData()}
          >
            <RefreshCw size={13} className={isLoading ? "spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Hackathon Judge Technical Explainer Card */}
      <section className="backend-judge-callout" aria-label="Technical Overview for Hackathon Judges">
        <div className="judge-callout-header">
          <Terminal size={16} className="judge-callout-icon" />
          <span className="judge-callout-title">
            Technical Audit Console for PayPal Hackathon Judges &amp; Engineers
          </span>
        </div>
        <p className="judge-callout-body">
          This developer view exposes the underlying two-phase payment lifecycle. 
          The AI agent <strong>never captures money upfront</strong>: it creates orders with <code>intent=AUTHORIZE</code> ($0.00 charged). 
          Conditional capture via <code>/v2/payments/authorizations/&#123;id&#125;/capture</code> is executed <strong>only</strong> after Multimodal Vision AI verifies Door #15 and the intact parcel, and the courier submits the buyer&apos;s 6-character PIN.
        </p>
      </section>

      {/* KPI Metrics Summary Strip */}
      <section className="backend-kpi-grid" aria-label="PayPal Settlement Metrics">
        <div className="backend-kpi-card">
          <span className="backend-kpi-label mono">TOTAL ORDERS</span>
          <span className="backend-kpi-val mono">{orders.length}</span>
          <span className="backend-kpi-sub">Local SQLite + Turso Cloud</span>
        </div>
        <div className="backend-kpi-card kpi-held">
          <span className="backend-kpi-label mono">ACTIVE HOLDS (AUTHORIZED)</span>
          <span className="backend-kpi-val mono">{stats?.held?.formatted || "$0.00"}</span>
          <span className="backend-kpi-sub mono">{stats?.held?.count || 0} orders · $0.00 captured</span>
        </div>
        <div className="backend-kpi-card kpi-captured">
          <span className="backend-kpi-label mono">CAPTURED FUNDS</span>
          <span className="backend-kpi-val mono">{stats?.captured?.formatted || "$0.00"}</span>
          <span className="backend-kpi-sub mono">{stats?.captured?.count || 0} verified handovers</span>
        </div>
        <div className="backend-kpi-card kpi-voided">
          <span className="backend-kpi-label mono">RELEASED HOLDS (/VOID)</span>
          <span className="backend-kpi-val mono">{stats?.voided?.formatted || "$0.00"}</span>
          <span className="backend-kpi-sub mono">{stats?.voided?.count || 0} voided without charge</span>
        </div>
      </section>

      {/* Action Toast Alert */}
      {actionMsg && (
        <div className="backend-action-toast mono" role="status">
          <span>{actionMsg}</span>
          <button type="button" onClick={() => setActionMsg(null)} className="toast-dismiss">
            ✕
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="backend-nav-tabs" aria-label="Backend Sections">
        <button
          type="button"
          className={`backend-tab-btn ${activeTab === "orders" ? "is-active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          <CreditCard size={14} />
          <span>Orders &amp; PayPal Identifiers</span>
        </button>
        <button
          type="button"
          className={`backend-tab-btn ${activeTab === "events" ? "is-active" : ""}`}
          onClick={() => setActiveTab("events")}
        >
          <Layers size={14} />
          <span>Audit Trail &amp; Event Stream ({events.length})</span>
        </button>
        <button
          type="button"
          className={`backend-tab-btn ${activeTab === "paypal_api" ? "is-active" : ""}`}
          onClick={() => setActiveTab("paypal_api")}
        >
          <Code2 size={14} />
          <span>PayPal API Endpoints &amp; Contracts</span>
        </button>
        <button
          type="button"
          className={`backend-tab-btn ${activeTab === "diagnostics" ? "is-active" : ""}`}
          onClick={() => setActiveTab("diagnostics")}
        >
          <Server size={14} />
          <span>Sandbox Diagnostics &amp; Config</span>
        </button>
      </nav>

      {/* ================================================================ */}
      {/* TAB 1: ORDERS & PAYPAL IDENTIFIERS                               */}
      {/* ================================================================ */}
      {activeTab === "orders" && (
        <div className="backend-grid">
          {/* Left Column: Orders Ledger */}
          <section className="orders-ledger-panel">
            <div className="ledger-toolbar">
              <div className="ledger-search-box">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  className="ledger-search-input"
                  placeholder="Search by Order ID, PayPal Order/Auth/Capture ID, or PIN…"
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
                    <th>Order ID</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>PayPal Auth ID</th>
                    <th>PayPal Capture ID</th>
                    <th>PIN</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-cell">
                        No orders match the current filter.
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
                            {order.status === "AUTHORIZED" && <span className="cell-hold-pill">HOLD ($0)</span>}
                          </td>
                          <td className="mono paypal-id-cell" title={order.paypal_authorization_id || ""}>
                            {order.paypal_authorization_id ? `${order.paypal_authorization_id.slice(0, 10)}…` : "—"}
                          </td>
                          <td className="mono paypal-id-cell" title={order.paypal_capture_id || ""}>
                            {order.paypal_capture_id ? `${order.paypal_capture_id.slice(0, 10)}…` : "—"}
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

          {/* Right Column: Selected Order Details & Raw JSON Inspector */}
          <aside className="order-details-drawer">
            {selectedOrder ? (
              <div className="drawer-content">
                <div className="drawer-header">
                  <div>
                    <span className="drawer-subtitle">Order Inspector</span>
                    <h3 className="mono">{selectedOrder.id}</h3>
                  </div>
                  <span className={`drawer-badge status-${selectedOrder.status.toLowerCase()} mono`}>
                    {selectedOrder.status}
                  </span>
                </div>

                {/* Settlement State Box */}
                <div
                  className={`safety-status-box ${selectedOrder.status === "DELIVERY_FAILED" ? "box-alarm" : "box-normal"}`}
                >
                  <div className="safety-box-icon">
                    {selectedOrder.status === "DELIVERY_FAILED" ? (
                      <ShieldAlert size={18} />
                    ) : selectedOrder.status === "CAPTURED" ? (
                      <ShieldCheck size={18} />
                    ) : (
                      <Shield size={18} />
                    )}
                  </div>
                  <div className="safety-box-text">
                    <span className="safety-title">
                      {selectedOrder.status === "DELIVERY_FAILED"
                        ? "Delivery failed — Capture blocked ($0.00 charged)"
                        : selectedOrder.status === "CAPTURED"
                        ? "Funds captured on PayPal after verification"
                        : "Active hold on PayPal — Captures on delivery"}
                    </span>
                    <p>
                      {selectedOrder.status === "DELIVERY_FAILED"
                        ? `Reason: ${selectedOrder.failure_reason}. PayPal capture remains blocked.`
                        : selectedOrder.status === "CAPTURED"
                        ? "Handover verified. PayPal Payments v2 /capture executed."
                        : `${selectedOrder.formatted_total} held on PayPal. Zero dollars charged until doorstep and PIN verification.`}
                    </p>
                  </div>
                </div>

                {/* PayPal References */}
                <div className="detail-section">
                  <span className="detail-section-title">PayPal API References</span>

                  <div className="metric-row">
                    <span className="metric-key">PayPal Order ID</span>
                    <div className="metric-val-with-copy">
                      <span className="metric-val mono">{selectedOrder.paypal_order_id || "Pending"}</span>
                      {selectedOrder.paypal_order_id && (
                        <button
                          type="button"
                          className="copy-btn-mini"
                          onClick={() => copyToClipboard(selectedOrder.paypal_order_id || "", "p_order")}
                          title="Copy ID"
                        >
                          <Copy size={11} />
                          {copiedKey === "p_order" && <span className="copied-pill">Copied</span>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">Authorization ID</span>
                    <div className="metric-val-with-copy">
                      <span className="metric-val mono">{selectedOrder.paypal_authorization_id || "Pending"}</span>
                      {selectedOrder.paypal_authorization_id && (
                        <button
                          type="button"
                          className="copy-btn-mini"
                          onClick={() => copyToClipboard(selectedOrder.paypal_authorization_id || "", "p_auth")}
                          title="Copy ID"
                        >
                          <Copy size={11} />
                          {copiedKey === "p_auth" && <span className="copied-pill">Copied</span>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">Capture ID</span>
                    <div className="metric-val-with-copy">
                      <span className="metric-val mono">{selectedOrder.paypal_capture_id || "Not captured"}</span>
                      {selectedOrder.paypal_capture_id && (
                        <button
                          type="button"
                          className="copy-btn-mini"
                          onClick={() => copyToClipboard(selectedOrder.paypal_capture_id || "", "p_cap")}
                          title="Copy ID"
                        >
                          <Copy size={11} />
                          {copiedKey === "p_cap" && <span className="copied-pill">Copied</span>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">Recipient PIN</span>
                    <span className="metric-val mono" style={{ color: "#3FB27F", fontWeight: 700 }}>
                      {selectedOrder.pickup_code || "—"}
                    </span>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">Destination</span>
                    <span className="metric-val mono">ul. Filarecka 2B, m. 15, Kraków</span>
                  </div>
                </div>

                {/* Evidence Hashes */}
                {selectedOrder.evidence && selectedOrder.evidence.length > 0 && (
                  <div className="detail-section">
                    <span className="detail-section-title">Cryptographic &amp; Vision Evidence</span>
                    {selectedOrder.evidence.map((ev, idx) => (
                      <div key={idx} className="evidence-summary-item">
                        <div className="evidence-meta-row mono">
                          <span className="ev-kind">{ev.kind}</span>
                          <span className="ev-time">{new Date(ev.created_at).toLocaleTimeString()}</span>
                        </div>
                        {ev.photo_sha256 && (
                          <div className="ev-hash-row mono">
                            <span>SHA-256: {ev.photo_sha256}</span>
                          </div>
                        )}
                        {ev.note && <div className="ev-note-text">{ev.note}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Items */}
                <div className="detail-section">
                  <span className="detail-section-title">Order Line Items</span>
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

                {/* Admin Actions */}
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
                        Force Capture (/capture)
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
                      Release Hold (/void)
                    </button>
                  )}
                </div>

                {/* Toggle Raw JSON Inspector */}
                <div className="detail-section" style={{ marginTop: "10px" }}>
                  <button
                    type="button"
                    className="json-toggle-btn mono"
                    onClick={() => setShowRawJson(!showRawJson)}
                  >
                    <Code2 size={13} />
                    <span>{showRawJson ? "Hide Raw JSON Payload" : "Inspect Raw JSON Payload"}</span>
                  </button>

                  {showRawJson && (
                    <pre className="raw-json-inspector mono">
                      {JSON.stringify(selectedOrder, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="drawer-empty">Select an order from the ledger to inspect details.</div>
            )}
          </aside>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: AUDIT TRAIL & EVENT STREAM (APPEND-ONLY)                  */}
      {/* ================================================================ */}
      {activeTab === "events" && (
        <section className="events-stream-panel" aria-label="Audit Event Stream">
          <div className="ledger-toolbar">
            <div className="events-counter mono">
              <span>{filteredEvents.length} immutable events recorded</span>
            </div>
            <div className="status-filter-pills">
              {["ALL", "shopper", "agent", "courier", "merchant", "system"].map((act) => (
                <button
                  key={act}
                  type="button"
                  className={`filter-pill ${eventFilterActor === act ? "active" : ""}`}
                  onClick={() => setEventFilterActor(act)}
                >
                  Actor: {act}
                </button>
              ))}
            </div>
          </div>

          <div className="events-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Actor</th>
                  <th>Transition</th>
                  <th>Order</th>
                  <th>JSON Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((ev) => {
                  const isExpanded = expandedEventId === ev.id;
                  return (
                    <tr key={ev.id} className="event-row">
                      <td className="mono">{ev.id}</td>
                      <td className="mono time-cell">{new Date(ev.created_at).toLocaleTimeString()}</td>
                      <td>
                        <span className="event-badge mono">{ev.event}</span>
                      </td>
                      <td className="mono event-actor-cell">{ev.actor}</td>
                      <td className="mono">
                        {ev.from_status ? (
                          <span>
                            {ev.from_status} → <strong>{ev.to_status}</strong>
                          </span>
                        ) : (
                          <strong>{ev.to_status}</strong>
                        )}
                      </td>
                      <td className="mono order-id-cell">{ev.order_id || "—"}</td>
                      <td>
                        {ev.detail_json ? (
                          <div>
                            <button
                              type="button"
                              className="json-expand-mini mono"
                              onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                            >
                              {isExpanded ? "Hide" : "View JSON"}
                            </button>
                            {isExpanded && (
                              <pre className="event-json-block mono">
                                {(() => {
                                  try {
                                    return JSON.stringify(JSON.parse(ev.detail_json), null, 2);
                                  } catch {
                                    return ev.detail_json;
                                  }
                                })()}
                              </pre>
                            )}
                          </div>
                        ) : (
                          <span className="mono" style={{ opacity: 0.4 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* TAB 3: PAYPAL API ENDPOINTS & CONTRACTS                          */}
      {/* ================================================================ */}
      {activeTab === "paypal_api" && (
        <section className="paypal-api-catalog" aria-label="PayPal API Endpoints Catalog">
          <div className="api-catalog-intro">
            <h3>PayPal v2 Integration Architecture</h3>
            <p>
              Proofed implements the complete <strong>PayPal Orders v2</strong> and <strong>PayPal Payments v2</strong> lifecycle with deterministic integer-cent arithmetic and idempotency keys via <code>PayPal-Request-Id</code>.
            </p>
          </div>

          <div className="api-endpoints-grid">
            {/* Endpoint 1: OAuth */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/v1/oauth2/token</span>
              </div>
              <h4>1. OAuth 2.0 Access Token</h4>
              <p>Client Credentials token exchange with in-memory caching and proactive expiry refresh.</p>
              <div className="api-code-snippet mono">
                <span>Headers: Authorization: Basic &#123;base64(clientId:secret)&#125;</span>
                <span>Body: grant_type=client_credentials</span>
              </div>
            </div>

            {/* Endpoint 2: Orders v2 create */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/v2/checkout/orders</span>
              </div>
              <h4>2. Create Order with Hold (intent=AUTHORIZE)</h4>
              <p>Stages the checkout order. The AUTHORIZE intent guarantees zero upfront capture.</p>
              <div className="api-code-snippet mono">
                <span>Headers: PayPal-Request-Id: &#123;idempotencyKey&#125;</span>
                <span>Body: &#123; &quot;intent&quot;: &quot;AUTHORIZE&quot;, &quot;purchase_units&quot;: [&#123; &quot;amount&quot;: &#123; &quot;currency_code&quot;: &quot;USD&quot;, &quot;value&quot;: &quot;18.50&quot; &#125;&#125;] &#125;</span>
              </div>
            </div>

            {/* Endpoint 3: Orders v2 authorize */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/v2/checkout/orders/&#123;id&#125;/authorize</span>
              </div>
              <h4>3. Authorize Payment Hold</h4>
              <p>Places a hold on the buyer&apos;s PayPal account and issues the <code>authorization_id</code>.</p>
              <div className="api-code-snippet mono">
                <span>Response: purchase_units[0].payments.authorizations[0].id</span>
                <span>Status: CREATED (Hold active, $0.00 captured)</span>
              </div>
            </div>

            {/* Endpoint 4: Payments v2 capture */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/v2/payments/authorizations/&#123;auth_id&#125;/capture</span>
              </div>
              <h4>4. Conditional Post-Handover Capture</h4>
              <p>Executed <strong>only</strong> after Door #15 photo evidence and the customer&apos;s PIN are verified.</p>
              <div className="api-code-snippet mono">
                <span>Headers: PayPal-Request-Id: &#123;evidenceSha256Digest&#125;</span>
                <span>Response: &#123; &quot;id&quot;: &quot;7GR...&quot;, &quot;status&quot;: &quot;COMPLETED&quot; &#125;</span>
              </div>
            </div>

            {/* Endpoint 5: Payments v2 void */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/v2/payments/authorizations/&#123;auth_id&#125;/void</span>
              </div>
              <h4>5. Void Authorization Hold (/void)</h4>
              <p>If delivery fails (wrong door, damaged box, cancellation), the authorization hold is immediately released.</p>
              <div className="api-code-snippet mono">
                <span>Response: HTTP 204 No Content</span>
                <span>Effect: Buyer is charged $0.00.</span>
              </div>
            </div>

            {/* Endpoint 6: Webhooks */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/api/paypal/webhooks</span>
              </div>
              <h4>6. Asynchronous Webhook Ingestion</h4>
              <p>Ingests PayPal events (<code>PAYMENT.AUTHORIZATION.CREATED</code>, <code>PAYMENT.CAPTURE.COMPLETED</code>) for real-time state sync.</p>
              <div className="api-code-snippet mono">
                <span>Signature verification: PAYPAL-AUTH-ALGO, PAYPAL-CERT-URL</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* TAB 4: SANDBOX DIAGNOSTICS & CONFIG                              */}
      {/* ================================================================ */}
      {activeTab === "diagnostics" && (
        <section className="diagnostics-panel" aria-label="System Diagnostics">
          <div className="diagnostics-grid">
            <div className="diag-card">
              <div className="diag-header">
                <Server size={16} />
                <h4>PayPal Sandbox Environment</h4>
              </div>
              <div className="diag-row">
                <span className="diag-key">API Base</span>
                <span className="diag-val mono">https://api-m.sandbox.paypal.com</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Client ID</span>
                <span className="diag-val mono">
                  {health?.paypalConfigured ? "✔ Configured (.env)" : "✖ Missing"}
                </span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Client Secret</span>
                <span className="diag-val mono">
                  {health?.paypalConfigured ? "✔ Configured (.env)" : "✖ Missing"}
                </span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Webhook Listener</span>
                <span className="diag-val mono">
                  {health?.webhookConfigured ? "✔ Active" : "○ Local / Mock fallback"}
                </span>
              </div>
            </div>

            <div className="diag-card">
              <div className="diag-header">
                <Activity size={16} />
                <h4>Vision Engine &amp; Geofence</h4>
              </div>
              <div className="diag-row">
                <span className="diag-key">Multimodal Model</span>
                <span className="diag-val mono">MiniMax M3.1 Flash</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Vision API Key</span>
                <span className="diag-val mono">
                  {health?.minimaxConfigured ? "✔ Active (.env)" : "○ Calibrated simulation"}
                </span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Target Venue</span>
                <span className="diag-val mono">ul. Filarecka 2B, Kraków</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">GPS Coordinates</span>
                <span className="diag-val mono">50.0556092, 19.9203676</span>
              </div>
            </div>

            <div className="diag-card">
              <div className="diag-header">
                <Database size={16} />
                <h4>Storage &amp; Integrity</h4>
              </div>
              <div className="diag-row">
                <span className="diag-key">SQLite Engine</span>
                <span className="diag-val mono">Node 22 Built-in (node:sqlite)</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Cloud Sync</span>
                <span className="diag-val mono">Turso LibSQL Serverless</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Currency Arithmetic</span>
                <span className="diag-val mono">Integer Cents (Zero Floats)</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Cryptographic Binding</span>
                <span className="diag-val mono">SHA-256 Chain + Server HMAC</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
