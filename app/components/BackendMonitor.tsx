"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  KeyRound,
  Layers,
  Lock,
  Package,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XCircle,
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

      const orderList: OrderRecord[] = ordersData.orders || [];
      setOrders(orderList);
      setEvents(eventsData.events || []);

      if (orderList.length > 0 && !selectedOrder) {
        setSelectedOrder(orderList[0]);
      } else if (selectedOrder) {
        const updated = orderList.find((o) => o.id === selectedOrder.id);
        if (updated) setSelectedOrder(updated);
      }
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
    if (!confirm(`¿Confirmas la liberación (/void) del hold de PayPal para la orden ${orderId}?`)) return;
    setActionBusy(`void-${orderId}`);
    try {
      const res = await fetch("/api/paypal/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: "Manual Backend Void by Admin" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Orden ${orderId} cancelada exitosamente en PayPal (/void). Hold liberado.`);
        await loadData();
      } else {
        alert(data.error || "Void failed");
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCapture(orderId: string) {
    if (!confirm(`¿Ejecutar captura forzada en PayPal Payments v2 para la orden ${orderId}?`)) return;
    setActionBusy(`capture-${orderId}`);
    try {
      const res = await fetch("/api/device/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, pickupCode: selectedOrder?.pickup_code, note: "Admin Manual Override" }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg(`Orden ${orderId} CAPTURADA exitosamente en PayPal.`);
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
        setActionMsg(`Trabajo de reconciliación ejecutado. ${data.reconciled || 0} órdenes sincronizadas con PayPal.`);
        await loadData();
      } else {
        alert(data.error || "Reconciliation failed");
      }
    } catch {
      alert("Error al ejecutar reconciliación");
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
            <span>DEV CONSOLE · HACKATHON AUDIT TRAIL</span>
          </div>
          <h1>Developer &amp; Hackathon Backend</h1>
        </div>

        <div className="backend-quick-actions">
          <button
            type="button"
            className="admin-btn"
            disabled={Boolean(actionBusy)}
            onClick={() => void triggerReconcileJob()}
            title="Consultar la API de PayPal para reconciliar autorizaciones pendientes"
          >
            <RefreshCw size={13} className={actionBusy === "reconcile" ? "spin" : ""} />
            <span>Reconciliar PayPal API</span>
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-refresh"
            disabled={isLoading}
            onClick={() => void loadData()}
          >
            <RefreshCw size={13} className={isLoading ? "spin" : ""} />
            <span>Actualizar</span>
          </button>
        </div>
      </header>

      {/* Hackathon Judge Technical Explainer Card */}
      <section className="backend-judge-callout" aria-label="Información para Jueces">
        <div className="judge-callout-header">
          <Terminal size={16} className="judge-callout-icon" />
          <span className="judge-callout-title">
            Panel Técnico para Jueces del Hackathon PayPal 2026 y Desarrolladores
          </span>
        </div>
        <p className="judge-callout-body">
          Esta consola permite auditar en profundidad la integración de dos fases con PayPal. 
          El agente de IA <strong>nunca cobra de inmediato</strong>: utiliza <code>intent=AUTHORIZE</code> (creando un hold de $0.00 cobrado). 
          La captura condicional mediante <code>/v2/payments/authorizations/&#123;id&#125;/capture</code> ocurre <strong>únicamente</strong> tras comprobar la presencia del bulto frente a la puerta asignada (#15) mediante Visión Multimodal y verificar el PIN secreto de 6 caracteres del cliente.
        </p>
      </section>

      {/* KPI Metrics Summary Strip */}
      <section className="backend-kpi-grid" aria-label="Métricas de Liquidación PayPal">
        <div className="backend-kpi-card">
          <span className="backend-kpi-label mono">ÓRDENES REGISTRADAS</span>
          <span className="backend-kpi-val mono">{orders.length}</span>
          <span className="backend-kpi-sub">Ledger local + Cloud Turso</span>
        </div>
        <div className="backend-kpi-card kpi-held">
          <span className="backend-kpi-label mono">HOLDS ACTIVOS (AUTORIZADOS)</span>
          <span className="backend-kpi-val mono">{stats?.held?.formatted || "$0.00"}</span>
          <span className="backend-kpi-sub mono">{stats?.held?.count || 0} órdenes · $0.00 capturado</span>
        </div>
        <div className="backend-kpi-card kpi-captured">
          <span className="backend-kpi-label mono">FONDOS CAPTURADOS</span>
          <span className="backend-kpi-val mono">{stats?.captured?.formatted || "$0.00"}</span>
          <span className="backend-kpi-sub mono">{stats?.captured?.count || 0} entregas verificadas</span>
        </div>
        <div className="backend-kpi-card kpi-voided">
          <span className="backend-kpi-label mono">HOLDS LIBERADOS (/VOID)</span>
          <span className="backend-kpi-val mono">{stats?.voided?.formatted || "$0.00"}</span>
          <span className="backend-kpi-sub mono">{stats?.voided?.count || 0} canceladas sin cobro</span>
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

      {/* Tab Navigation for Techs */}
      <nav className="backend-nav-tabs" aria-label="Secciones del Backend">
        <button
          type="button"
          className={`backend-tab-btn ${activeTab === "orders" ? "is-active" : ""}`}
          onClick={() => setActiveTab("orders")}
        >
          <CreditCard size={14} />
          <span>Órdenes &amp; Identificadores PayPal</span>
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
          <span>Endpoints &amp; Contratos PayPal API</span>
        </button>
        <button
          type="button"
          className={`backend-tab-btn ${activeTab === "diagnostics" ? "is-active" : ""}`}
          onClick={() => setActiveTab("diagnostics")}
        >
          <Server size={14} />
          <span>Diagnóstico Sandbox &amp; Config</span>
        </button>
      </nav>

      {/* ================================================================ */}
      {/* TAB 1: ÓRDENES & IDENTIFICADORES PAYPAL                          */}
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
                  placeholder="Buscar por ID, PayPal Order/Auth/Capture ID o PIN…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar órdenes"
                />
              </div>
              <div className="status-filter-pills" role="tablist">
                {[
                  { key: "ALL", label: "Todas" },
                  { key: "AUTHORIZED", label: "Autorizadas" },
                  { key: "CAPTURED", label: "Capturadas" },
                  { key: "DELIVERY_FAILED", label: "Fallidas" },
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
                    <th>Orden ID</th>
                    <th>Estado</th>
                    <th>Monto</th>
                    <th>PayPal Auth ID</th>
                    <th>PayPal Capture ID</th>
                    <th>PIN</th>
                    <th>Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-cell">
                        No hay órdenes registradas con este filtro.
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
                    <span className="drawer-subtitle">Detalle de Orden</span>
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
                        ? "Entrega fallida — Captura bloqueada ($0.00 cobrado)"
                        : selectedOrder.status === "CAPTURED"
                        ? "Fondos capturados en PayPal tras verificación"
                        : "Hold activo en PayPal — Captura al entregar"}
                    </span>
                    <p>
                      {selectedOrder.status === "DELIVERY_FAILED"
                        ? `Motivo: ${selectedOrder.failure_reason}. La captura en PayPal permanece bloqueada.`
                        : selectedOrder.status === "CAPTURED"
                        ? "Custodia confirmada. Se ejecutó PayPal Payments v2 /capture."
                        : `${selectedOrder.formatted_total} retenidos en PayPal. Cero dólares cobrados hasta verificar puerta y PIN.`}
                    </p>
                  </div>
                </div>

                {/* PayPal References */}
                <div className="detail-section">
                  <span className="detail-section-title">Referencias API PayPal</span>
                  
                  <div className="metric-row">
                    <span className="metric-key">PayPal Order ID</span>
                    <div className="metric-val-with-copy">
                      <span className="metric-val mono">{selectedOrder.paypal_order_id || "Pendiente"}</span>
                      {selectedOrder.paypal_order_id && (
                        <button
                          type="button"
                          className="copy-btn-mini"
                          onClick={() => copyToClipboard(selectedOrder.paypal_order_id || "", "p_order")}
                          title="Copiar ID"
                        >
                          <Copy size={11} />
                          {copiedKey === "p_order" && <span className="copied-pill">Copiado</span>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">Authorization ID</span>
                    <div className="metric-val-with-copy">
                      <span className="metric-val mono">{selectedOrder.paypal_authorization_id || "Pendiente"}</span>
                      {selectedOrder.paypal_authorization_id && (
                        <button
                          type="button"
                          className="copy-btn-mini"
                          onClick={() => copyToClipboard(selectedOrder.paypal_authorization_id || "", "p_auth")}
                          title="Copiar ID"
                        >
                          <Copy size={11} />
                          {copiedKey === "p_auth" && <span className="copied-pill">Copiado</span>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">Capture ID</span>
                    <div className="metric-val-with-copy">
                      <span className="metric-val mono">{selectedOrder.paypal_capture_id || "No capturado"}</span>
                      {selectedOrder.paypal_capture_id && (
                        <button
                          type="button"
                          className="copy-btn-mini"
                          onClick={() => copyToClipboard(selectedOrder.paypal_capture_id || "", "p_cap")}
                          title="Copiar ID"
                        >
                          <Copy size={11} />
                          {copiedKey === "p_cap" && <span className="copied-pill">Copiado</span>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">PIN Destinatario</span>
                    <span className="metric-val mono" style={{ color: "#3FB27F", fontWeight: 700 }}>
                      {selectedOrder.pickup_code || "—"}
                    </span>
                  </div>

                  <div className="metric-row">
                    <span className="metric-key">Destino</span>
                    <span className="metric-val mono">ul. Filarecka 2B, m. 15, Kraków</span>
                  </div>
                </div>

                {/* Evidence Hashes */}
                {selectedOrder.evidence && selectedOrder.evidence.length > 0 && (
                  <div className="detail-section">
                    <span className="detail-section-title">Evidencia Criptográfica &amp; Visión</span>
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
                  <span className="detail-section-title">Artículos en la Orden</span>
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
                        Liberar Hold (/void)
                      </button>
                      <button
                        type="button"
                        className="drawer-action-btn btn-capture"
                        onClick={() => handleCapture(selectedOrder.id)}
                        disabled={Boolean(actionBusy)}
                      >
                        Forzar Captura (/capture)
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
                      Liberar Hold (/void)
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
                    <span>{showRawJson ? "Ocultar Payload JSON" : "Inspeccionar Payload JSON Raw"}</span>
                  </button>

                  {showRawJson && (
                    <pre className="raw-json-inspector mono">
                      {JSON.stringify(selectedOrder, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="drawer-empty">Selecciona una orden del ledger para inspeccionar.</div>
            )}
          </aside>
        </div>
      )}

      {/* ================================================================ */}
      {/* TAB 2: AUDIT TRAIL & EVENT STREAM (APPEND-ONLY)                  */}
      {/* ================================================================ */}
      {activeTab === "events" && (
        <section className="events-stream-panel" aria-label="Stream de Auditoría">
          <div className="ledger-toolbar">
            <div className="events-counter mono">
              <span>{filteredEvents.length} eventos inmutables registrados</span>
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
                  <th>Hora</th>
                  <th>Evento</th>
                  <th>Actor</th>
                  <th>Transición</th>
                  <th>Orden</th>
                  <th>Detalle JSON</th>
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
                              {isExpanded ? "Ocultar" : "Ver JSON"}
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
      {/* TAB 3: ENDPOINTS & CONTRATOS PAYPAL API                          */}
      {/* ================================================================ */}
      {activeTab === "paypal_api" && (
        <section className="paypal-api-catalog" aria-label="Catálogo de Endpoints de PayPal">
          <div className="api-catalog-intro">
            <h3>Arquitectura de Integración PayPal v2</h3>
            <p>
              Proofed implementa el ciclo de vida completo de <strong>PayPal Orders v2</strong> y <strong>PayPal Payments v2</strong> con cálculo de moneda en centavos enteros y clave de idempotencia <code>PayPal-Request-Id</code>.
            </p>
          </div>

          <div className="api-endpoints-grid">
            {/* Endpoint 1: OAuth */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/v1/oauth2/token</span>
              </div>
              <h4>1. Token de Acceso OAuth 2.0</h4>
              <p>Autenticación Client Credentials con caché en memoria e invalidación proactiva.</p>
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
              <h4>2. Creación de Orden con Hold (intent=AUTHORIZE)</h4>
              <p>Crea la orden comercial. El intent AUTHORIZE asegura que no se cargue dinero por adelantado.</p>
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
              <h4>3. Autorización de Hold</h4>
              <p>Bloquea los fondos en la cuenta de PayPal del comprador y genera el <code>authorization_id</code>.</p>
              <div className="api-code-snippet mono">
                <span>Response: purchase_units[0].payments.authorizations[0].id</span>
                <span>Status: CREATED (Hold activo, $0.00 capturado)</span>
              </div>
            </div>

            {/* Endpoint 4: Payments v2 capture */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/v2/payments/authorizations/&#123;auth_id&#125;/capture</span>
              </div>
              <h4>4. Captura Condicional Post-Verificación</h4>
              <p>Se ejecuta <strong>únicamente</strong> cuando se confirma la evidencia fotográfica de la puerta #15 y el PIN del comprador.</p>
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
              <h4>5. Cancelación y Liberación (/void)</h4>
              <p>Si la entrega falla (puerta incorrecta, caja rota, timeout), el hold se anula inmediatamente.</p>
              <div className="api-code-snippet mono">
                <span>Response: HTTP 204 No Content</span>
                <span>Efecto: El comprador no recibe ningún cargo.</span>
              </div>
            </div>

            {/* Endpoint 6: Webhooks */}
            <div className="api-card">
              <div className="api-card-top">
                <span className="method-pill method-post">POST</span>
                <span className="api-card-path mono">/api/paypal/webhooks</span>
              </div>
              <h4>6. Ingesta de Webhooks Asíncronos</h4>
              <p>Escucha eventos de PayPal (<code>PAYMENT.AUTHORIZATION.CREATED</code>, <code>PAYMENT.CAPTURE.COMPLETED</code>) para reconciliación en tiempo real.</p>
              <div className="api-code-snippet mono">
                <span>Signature verification: PAYPAL-AUTH-ALGO, PAYPAL-CERT-URL</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* TAB 4: DIAGNÓSTICO SANDBOX & CONFIG                              */}
      {/* ================================================================ */}
      {activeTab === "diagnostics" && (
        <section className="diagnostics-panel" aria-label="Diagnóstico del Sistema">
          <div className="diagnostics-grid">
            <div className="diag-card">
              <div className="diag-header">
                <Server size={16} />
                <h4>Entorno PayPal Sandbox</h4>
              </div>
              <div className="diag-row">
                <span className="diag-key">API Base</span>
                <span className="diag-val mono">https://api-m.sandbox.paypal.com</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Client ID</span>
                <span className="diag-val mono">
                  {health?.paypalConfigured ? "✔ Configurado (.env)" : "✖ Falta configurar"}
                </span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Client Secret</span>
                <span className="diag-val mono">
                  {health?.paypalConfigured ? "✔ Configurado (.env)" : "✖ Falta configurar"}
                </span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Webhooks Listener</span>
                <span className="diag-val mono">
                  {health?.webhookConfigured ? "✔ Activo" : "○ Local / Mock fallback"}
                </span>
              </div>
            </div>

            <div className="diag-card">
              <div className="diag-header">
                <Activity size={16} />
                <h4>Motor de Visión por IA &amp; Geocerca</h4>
              </div>
              <div className="diag-row">
                <span className="diag-key">Modelo Multimodal</span>
                <span className="diag-val mono">MiniMax M3.1 Flash</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">API Key Visión</span>
                <span className="diag-val mono">
                  {health?.minimaxConfigured ? "✔ Activa (.env)" : "○ Simulación calibrada"}
                </span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Sede Calibrada</span>
                <span className="diag-val mono">ul. Filarecka 2B, Kraków</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Coordenadas GPS</span>
                <span className="diag-val mono">50.0556092, 19.9203676</span>
              </div>
            </div>

            <div className="diag-card">
              <div className="diag-header">
                <Database size={16} />
                <h4>Almacenamiento &amp; Integridad</h4>
              </div>
              <div className="diag-row">
                <span className="diag-key">Motor SQLite</span>
                <span className="diag-val mono">Node 22 Built-in (node:sqlite)</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Sincronización Cloud</span>
                <span className="diag-val mono">Turso LibSQL Serverless</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Moneda</span>
                <span className="diag-val mono">Centavos Enteros (Zero Floats)</span>
              </div>
              <div className="diag-row">
                <span className="diag-key">Sello Criptográfico</span>
                <span className="diag-val mono">SHA-256 Chain + Server HMAC</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
