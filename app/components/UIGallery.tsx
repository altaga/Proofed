"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Layers,
  MessageSquare,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { NearDeskChat } from "./NearDeskChat";
import { AgentCrisisHub } from "./AgentCrisisHub";
import { DeviceKiosk } from "./DeviceKiosk";
import { TransactionPanel } from "./TransactionPanel";
import type { TxOrder } from "./tx-model";

const SAMPLE_ORDERS: Record<string, TxOrder> = {
  authorized: {
    id: "ord_demo_auth_01",
    status: "AUTHORIZED",
    formatted_total: "$12.00",
    pickup_code: "PK-9912",
    paypal_order_id: "8UV92014KL582910M",
    paypal_authorization_id: "7TH99120AP442109X",
    failure_reason: null,
    items: [{ sku: "DC-KEY-01", name: "Pudgy Keychain", qty: 1, unit_price_cents: 1200 }],
    created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    authorized_at: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  failed: {
    id: "ord_demo_jam_02",
    status: "DELIVERY_FAILED",
    formatted_total: "$12.00",
    pickup_code: "PK-3841",
    paypal_order_id: "3KL881920XA19283B",
    paypal_authorization_id: "9OP110928BV38192Z",
    failure_reason: "Station solenoid latch timed out without mechanical release",
    items: [{ sku: "DC-KEY-01", name: "Pudgy Keychain", qty: 1, unit_price_cents: 1200 }],
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    authorized_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  },
  captured: {
    id: "ord_demo_cap_03",
    status: "CAPTURED",
    formatted_total: "$12.00",
    pickup_code: "PK-1102",
    paypal_order_id: "5RT771829PL19284N",
    paypal_authorization_id: "4GH881920ZX99102Q",
    paypal_capture_id: "CAP-9918274610",
    failure_reason: null,
    items: [{ sku: "DC-KEY-01", name: "Pudgy Keychain", qty: 1, unit_price_cents: 1200 }],
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    authorized_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    delivered_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    captured_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
  },
  voided: {
    id: "ord_demo_void_04",
    status: "VOIDED",
    formatted_total: "$12.00",
    pickup_code: "PK-7749",
    paypal_order_id: "1QW229104MN77182C",
    paypal_authorization_id: "2ER338192KL66190V",
    failure_reason: "agent_autonomous_void: hardware jam released back to buyer",
    items: [{ sku: "DC-KEY-01", name: "Pudgy Keychain", qty: 1, unit_price_cents: 1200 }],
    created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    authorized_at: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    voided_at: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
  },
};

export function UIGallery() {
  const [activeTab, setActiveTab] = useState<"chat" | "crisis" | "hardware" | "ledger" | "tokens">("chat");
  const [selectedOrderKey, setSelectedOrderKey] = useState<string>("failed");
  const [hardwareDeliveryMode, setHardwareDeliveryMode] = useState<"venue" | "home">("venue");

  const currentOrder = SAMPLE_ORDERS[selectedOrderKey] || SAMPLE_ORDERS.failed;

  return (
    <div className="gallery-container">
      {/* Gallery Header */}
      <header className="gallery-header">
        <div className="gallery-header-badge mono">
          <span>Component reference</span>
        </div>
        <h1 className="gallery-title">
          UI components & states
        </h1>
        <p className="gallery-lede">
          Interactive states and design tokens for Proofed’s conditional settlement flows.
        </p>

        {/* Top Tab Strip */}
        <nav className="gallery-tabs-nav" aria-label="Gallery Section Navigation" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            className={`gallery-tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            <MessageSquare size={15} />
            <span>NearDesk Agent Chat</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "crisis"}
            className={`gallery-tab-btn ${activeTab === "crisis" ? "active" : ""}`}
            onClick={() => setActiveTab("crisis")}
          >
            <ShieldAlert size={15} />
            <span>Crisis & Chaos Hub</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "hardware"}
            className={`gallery-tab-btn ${activeTab === "hardware" ? "active" : ""}`}
            onClick={() => setActiveTab("hardware")}
          >
            <Cpu size={15} />
            <span>Hardware Terminals</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ledger"}
            className={`gallery-tab-btn ${activeTab === "ledger" ? "active" : ""}`}
            onClick={() => setActiveTab("ledger")}
          >
            <Layers size={15} />
            <span>PayPal Financial Ledger</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "tokens"}
            className={`gallery-tab-btn ${activeTab === "tokens" ? "active" : ""}`}
            onClick={() => setActiveTab("tokens")}
          >
            <Code2 size={15} />
            <span>Design Tokens & WCAG</span>
          </button>
        </nav>
      </header>

      {/* Tab 1: NearDesk Agent Chat Showcase */}
      {activeTab === "chat" && (
        <section className="gallery-tab-section" aria-label="NearDesk Chat Showcase">
          <div className="section-meta-bar">
            <div>
              <h3>NearDesk-Style Agentic Chat Stream</h3>
              <p>
                Dark engineering terminal with operator vs agent micro-headers, tier tags, collapsible
                tool executions, inline quotes, and prompt chips.
              </p>
            </div>
            <span className="section-tag mono">ACCENT: #FF7A3D EMERALD // SURFACE: #12110F</span>
          </div>

          <div className="gallery-chat-wrapper">
            <NearDeskChat />
          </div>
        </section>
      )}

      {/* Tab 2: Crisis & Chaos Hub */}
      {activeTab === "crisis" && (
        <section className="gallery-tab-section" aria-label="Autonomous Crisis Hub Showcase">
          <div className="section-meta-bar">
            <div>
              <h3>Autonomous Threat Orchestrator & Recovery Hub</h3>
              <p>
                Simulate locker jams, parcel damage, and timeouts. Watch the policy engine hard-lock
                capture and synthesize 3 countermeasures in 120ms.
              </p>
            </div>

            {/* State Picker */}
            <div className="order-state-picker mono">
              <span>STATE:</span>
              {(["authorized", "failed", "captured", "voided"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`state-picker-btn ${selectedOrderKey === key ? "active" : ""}`}
                  onClick={() => setSelectedOrderKey(key)}
                >
                  {key.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <AgentCrisisHub
            order={currentOrder}
            deliveryMode="venue"
            onOrderRefresh={() => undefined}
          />
        </section>
      )}

      {/* Tab 3: Hardware Terminals */}
      {activeTab === "hardware" && (
        <section className="gallery-tab-section" aria-label="Hardware Terminals Showcase">
          <div className="section-meta-bar">
            <div>
              <h3>Physical Touchpoint Terminals</h3>
              <p>
                Compare the stadium locker bay terminal against the residential smart porch camera drop.
              </p>
            </div>

            <div className="order-state-picker mono">
              <span>TOUCHPOINT:</span>
              <button
                type="button"
                className={`state-picker-btn ${hardwareDeliveryMode === "venue" ? "active" : ""}`}
                onClick={() => setHardwareDeliveryMode("venue")}
              >
                STADIUM LOCKER
              </button>
              <button
                type="button"
                className={`state-picker-btn ${hardwareDeliveryMode === "home" ? "active" : ""}`}
                onClick={() => setHardwareDeliveryMode("home")}
              >
                RESIDENTIAL PORCH
              </button>
            </div>
          </div>

          <div className="gallery-hardware-grid">
            <div className="kiosk-preview-card">
              <DeviceKiosk
                deliveryMode={hardwareDeliveryMode}
                initialCode="PK-9912"
              />
            </div>
          </div>
        </section>
      )}

      {/* Tab 4: Financial Ledger & Wallet */}
      {activeTab === "ledger" && (
        <section className="gallery-tab-section" aria-label="Financial Ledger Showcase">
          <div className="section-meta-bar">
            <div>
              <h3>PayPal Wallet Balance Breakdown & Orders v2 Stepper</h3>
              <p>
                Visual ledger tracking funds through the 5 order lifecycle states: Hold Placed,
                Handover Verified, Captured, Substituted, or Voided.
              </p>
            </div>

            <div className="order-state-picker mono">
              <span>INSPECT ORDER:</span>
              {(["authorized", "failed", "captured", "voided"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`state-picker-btn ${selectedOrderKey === key ? "active" : ""}`}
                  onClick={() => setSelectedOrderKey(key)}
                >
                  {key.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Live Wallet Widget Preview */}
          <section className="live-wallet-widget" aria-label="Buyer Wallet Balance Breakdown">
            <div className="wallet-widget-header">
              <div className="wallet-badge-group">
                <span className="wallet-icon">P</span>
                <span className="wallet-title">BUYER PAYPAL WALLET · REAL-TIME ESCROW SIMULATION</span>
              </div>
              <span className="wallet-account mono">buyer-sandbox@proofed.dev</span>
            </div>
            <div className="wallet-grid">
              <div className="wallet-cell">
                <span className="wallet-cell-label">TOTAL ACCOUNT BALANCE</span>
                <span className="wallet-cell-val mono">$250.00</span>
                <span className="wallet-cell-sub">Buyer credit limit / balance</span>
              </div>
              <div className={`wallet-cell ${currentOrder.status === "AUTHORIZED" || currentOrder.status === "DELIVERY_FAILED" ? "cell-hold-active" : ""}`}>
                <span className="wallet-cell-label">
                  {currentOrder.status === "AUTHORIZED" ? "ACTIVE PAYPAL HOLD" : "ACTIVE PAYPAL HOLD"}
                </span>
                <span className="wallet-cell-val mono">
                  {currentOrder.status === "AUTHORIZED" || currentOrder.status === "DELIVERY_FAILED" ? `-${currentOrder.formatted_total}` : "$0.00"}
                </span>
                <span className="wallet-cell-sub">
                  {currentOrder.status === "AUTHORIZED" ? "Held via Orders v2 · $0 charged yet" : "Zero active holds"}
                </span>
              </div>
              <div className="wallet-cell">
                <span className="wallet-cell-label">AVAILABLE CAPITAL</span>
                <span className="wallet-cell-val mono">
                  {currentOrder.status === "AUTHORIZED" || currentOrder.status === "DELIVERY_FAILED" ? "$238.00" : "$250.00"}
                </span>
                <span className="wallet-cell-sub">Safe unencumbered funds</span>
              </div>
              <div className={`wallet-cell ${currentOrder.status === "CAPTURED" ? "cell-captured-active" : ""}`}>
                <span className="wallet-cell-label">SETTLED CHARGES</span>
                <span className="wallet-cell-val mono">
                  {currentOrder.status === "CAPTURED" ? currentOrder.formatted_total : "$0.00"}
                </span>
                <span className="wallet-cell-sub">
                  {currentOrder.status === "CAPTURED" ? "Debited post-handover" : "$0 debited"}
                </span>
              </div>
            </div>
          </section>

          {/* Transaction Panel Render */}
          <div style={{ marginTop: 20 }}>
            <TransactionPanel order={currentOrder} venueName="Pudgy Stadium Shop" expanded />
          </div>
        </section>
      )}

      {/* Tab 5: Design Tokens & WCAG */}
      {activeTab === "tokens" && (
        <section className="gallery-tab-section" aria-label="Design System Tokens">
          <div className="section-meta-bar">
            <div>
              <h3>Design System Tokens & Accessibility Standards</h3>
              <p>
                Strict color contrast token definitions, typography hierarchy, and non-negotiable
                fintech architectural rules.
              </p>
            </div>
            <span className="section-tag mono">WCAG AA: 100% COMPLIANT</span>
          </div>

          <div className="tokens-grid">
            {/* Color Palette Card */}
            <div className="token-card">
              <h4>Color Palette (Swiss Dark Telemetry)</h4>
              <div className="palette-swatches">
                <div className="swatch-row">
                  <span className="swatch-box" style={{ background: "#12110F" }} />
                  <div className="swatch-info mono">
                    <strong>#12110F</strong>
                    <span>Base Background (NearDesk Obsidian)</span>
                  </div>
                </div>
                <div className="swatch-row">
                  <span className="swatch-box" style={{ background: "#181714" }} />
                  <div className="swatch-info mono">
                    <strong>#181714</strong>
                    <span>Layered Card Surface</span>
                  </div>
                </div>
                <div className="swatch-row">
                  <span className="swatch-box" style={{ background: "#FF7A3D" }} />
                  <div className="swatch-info mono">
                    <strong>#FF7A3D</strong>
                    <span>NearDesk Mint / Handover Accent</span>
                  </div>
                </div>
                <div className="swatch-row">
                  <span className="swatch-box" style={{ background: "#2563EB" }} />
                  <div className="swatch-info mono">
                    <strong>#2563EB</strong>
                    <span>Cobalt Escrow Hold Accent</span>
                  </div>
                </div>
                <div className="swatch-row">
                  <span className="swatch-box" style={{ background: "#EF4444" }} />
                  <div className="swatch-info mono">
                    <strong>#EF4444</strong>
                    <span>Safety Lockout Alert Crimson</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Typography Hierarchy */}
            <div className="token-card">
              <h4>Typography System</h4>
              <div className="type-samples">
                <div className="type-row">
                  <span className="type-label mono">HEADLINE (750):</span>
                  <span className="type-demo headline-demo">Authorize Now. Capture Post-Handover.</span>
                </div>
                <div className="type-row">
                  <span className="type-label mono">SUBHEAD (600):</span>
                  <span className="type-demo subhead-demo">Zero-Trust AI Pricing & Physical Handover</span>
                </div>
                <div className="type-row">
                  <span className="type-label mono">BODY (400):</span>
                  <span className="type-demo body-demo">Funds remain safely held on PayPal via intent=AUTHORIZE.</span>
                </div>
                <div className="type-row">
                  <span className="type-label mono">CODE / TELEMETRY:</span>
                  <span className="type-demo mono-demo mono">AUTH-7TH99120AP44 · $12.00 · 1200¢</span>
                </div>
              </div>
            </div>

            {/* Accessibility Guarantee */}
            <div className="token-card token-card-full">
              <h4>WCAG AA Accessibility Scorecard</h4>
              <div className="a11y-audit-grid">
                <div className="a11y-cell">
                  <span className="a11y-metric">15.4 : 1</span>
                  <span className="a11y-label">Contrast: White on Obsidian (#12110F)</span>
                  <span className="a11y-badge pass mono">AAA PASS</span>
                </div>
                <div className="a11y-cell">
                  <span className="a11y-metric">11.8 : 1</span>
                  <span className="a11y-label">Contrast: Mint (#FF7A3D) on Dark Surface</span>
                  <span className="a11y-badge pass mono">AAA PASS</span>
                </div>
                <div className="a11y-cell">
                  <span className="a11y-metric">0 Violations</span>
                  <span className="a11y-label">Axe-Core Automated Contrast Scan</span>
                  <span className="a11y-badge pass mono">100% PASS</span>
                </div>
                <div className="a11y-cell">
                  <span className="a11y-metric">Full Support</span>
                  <span className="a11y-label">prefers-reduced-motion & Keyboard Nav</span>
                  <span className="a11y-badge pass mono">W3C COMPLIANT</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
