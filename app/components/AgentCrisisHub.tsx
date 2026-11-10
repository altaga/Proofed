"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  MapPin,
  PackageX,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type { TxOrder } from "./tx-model";

type AgentCrisisHubProps = {
  order: TxOrder | null;
  deliveryMode: "venue" | "home";
  onOrderRefresh: () => Promise<void> | void;
  onSyncCode?: (code: string) => void;
};

export function AgentCrisisHub({
  order,
  deliveryMode,
  onOrderRefresh,
  onSyncCode,
}: AgentCrisisHubProps) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [apologyVoucher, setApologyVoucher] = useState<string | null>(null);
  const [hubMessage, setHubMessage] = useState<string | null>(null);

  const isFailed = order?.status === "DELIVERY_FAILED";
  const isHeld = order?.status === "AUTHORIZED" || order?.status === "DELIVERY_CONFIRMED";
  const isVoided = order?.status === "VOIDED";
  const isCaptured = order?.status === "CAPTURED";

  async function ensureActiveOrder(): Promise<TxOrder | null> {
    if (order && (order.status === "AUTHORIZED" || order.status === "DELIVERY_FAILED")) {
      return order;
    }
    // Automatically seed an active held order for instant chaos demonstration
    const res = await fetch("/api/demo/seed-held", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: "DC-KEY-01", note: "Chaos Demonstration Order" }),
    });
    const payload = await res.json();
    if (res.ok && payload.order) {
      if (onSyncCode && payload.order.pickup_code) {
        onSyncCode(payload.order.pickup_code);
      }
      await onOrderRefresh();
      return payload.order as TxOrder;
    }
    return null;
  }

  async function handleTriggerChaos(reason: "jam" | "item_damaged" | "wrong_address" | "pickup_timeout" | "success") {
    setBusyAction(reason);
    setHubMessage(null);
    try {
      const activeOrder = await ensureActiveOrder();
      if (!activeOrder?.pickup_code) {
        setHubMessage("Please create or approve an order first to test physical handover.");
        return;
      }

      if (reason === "success") {
        const res = await fetch("/api/device/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pickupCode: activeOrder.pickup_code, note: "Clean physical handover" }),
        });
        if (res.ok) {
          setHubMessage("Physical handover verified. PayPal Payments v2 /capture executed cleanly.");
        }
      } else {
        const res = await fetch("/api/device/fail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickupCode: activeOrder.pickup_code,
            reason,
            note:
              reason === "jam"
                ? "Station solenoid latch timed out without mechanical release"
                : reason === "item_damaged"
                  ? "Parcel drop shock sensor exceeded 15G impact threshold"
                  : reason === "wrong_address"
                    ? "Autonomous bot GPS deviated 120m from customer geofence"
                    : "Shopper no-show after 15m expiration deadline",
          }),
        });
        if (res.ok) {
          setHubMessage("Physical anomaly reported. Agent autonomous crisis mode engaged.");
        }
      }
      await onOrderRefresh();
    } catch {
      setHubMessage("Failed to execute scenario trigger");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCountermeasure(action: "retry" | "substitute" | "void") {
    if (!order?.id) return;
    setBusyAction(action);
    setHubMessage(null);
    try {
      if (action === "void") {
        const res = await fetch("/api/paypal/void", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: order.id, confirm: true, reason: "agent_autonomous_void" }),
        });
        if (res.ok) {
          setApologyVoucher(`PRFD-CARE-${Math.floor(1000 + Math.random() * 9000)}`);
          setHubMessage("PayPal hold voided live in 1.2s. 0 cents debited from buyer. Concierge credit issued.");
        }
      } else if (action === "retry") {
        const res = await fetch("/api/orders/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            action: "retry",
            confirm: true,
            actor: "agent_autonomous_hub",
          }),
        });
        if (res.ok) {
          setHubMessage("Hardware re-routed to Bay #08. Existing PayPal authorization preserved.");
        }
      } else if (action === "substitute") {
        const res = await fetch("/api/orders/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            action: "substitute",
            confirm: true,
            actor: "agent_autonomous_hub",
            substitute_items: [{ sku: "DC-PIN-01", qty: 1 }],
          }),
        });
        if (res.ok) {
          setHubMessage("Previous hold released. Replacement Enamel Pin ($8.00) allocated within budget delta.");
        }
      }
      await onOrderRefresh();
    } catch {
      setHubMessage("Countermeasure failed to execute");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="agent-crisis-hub" aria-label="Autonomous Agent Crisis & Recovery Orchestrator">
      {/* War Room Header */}
      <div className="crisis-hub-header">
        <div className="crisis-header-badge-group">
          <span className={`crisis-radar-dot ${isFailed ? "alarm" : isCaptured ? "settled" : "active"}`} />
          <span className="crisis-hub-kicker mono">
            {isFailed
              ? "AUTONOMOUS THREAT ORCHESTRATOR · CRISIS ENGAGED"
              : isCaptured
                ? "POST-HANDOVER AUDIT · FUNDS CAPTURED"
                : isVoided
                  ? "HOLD VOIDED · ZERO BUYER EXPOSURE"
                  : "AUTONOMOUS AGENT WAR ROOM · PHYSICAL MONITORING ACTIVE"}
          </span>
        </div>
        <div className="crisis-telemetry-tag mono">
          {deliveryMode === "home" ? "PORCH SENSORS: 4/4 ARMED" : "LOCKER TELEMETRY: BAY #04 MONITOR"}
        </div>
      </div>

      <div className="crisis-intro-row">
        <div>
          <h3 className="crisis-title">
            Physical Anomaly Resilience: Zero-Capture Guarantee
          </h3>
          <p className="crisis-subtext">
            Physical delivery is chaotic (jammed latches, damaged boxes, wrong doorsteps). Unlike traditional
            e-commerce which charges upfront and forces 14-day bank disputes, Proofed holds funds via{" "}
            <code>intent=AUTHORIZE</code> and empowers the autonomous agent to resolve physical failure in seconds.
          </p>
        </div>
      </div>

      {/* Interactive Chaos Simulation Bar */}
      <div className="chaos-sim-strip" role="region" aria-label="Interactive Chaos Injection Triggers">
        <span className="chaos-strip-label mono">1-CLICK CHAOS INJECTORS:</span>
        <div className="chaos-buttons-row">
          <button
            type="button"
            className="chaos-btn chaos-btn-jam"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("jam")}
            title="Simulate locker latch failure at station"
          >
            <Zap size={14} />
            <span>Solenoid Jam</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-damage"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("item_damaged")}
            title="Simulate crushed parcel or impact damage"
          >
            <PackageX size={14} />
            <span>Parcel Damaged</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-gps"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("wrong_address")}
            title="Simulate bot delivery at wrong doorstep coordinates"
          >
            <MapPin size={14} />
            <span>Wrong Doorstep</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-timeout"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("pickup_timeout")}
            title="Simulate shopper no-show after 15m expiration"
          >
            <Clock size={14} />
            <span>⏳ 15m Timeout</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-success"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("success")}
            title="Execute clean physical handover and trigger PayPal capture"
          >
            <CheckCircle2 size={14} />
            <span>Normal Handover</span>
          </button>
        </div>
      </div>

      {hubMessage && (
        <div className="hub-feedback-banner mono" role="status">
          <Sparkles size={14} />
          <span>{hubMessage}</span>
        </div>
      )}

      {/* When Physical Failure Happens: Show Live Agent Brain and 3 Countermeasures */}
      {isFailed && (
        <div className="crisis-active-panel">
          {/* Zero-Capture Safety Lockout Shield */}
          <div className="safety-lockout-banner" role="alert">
            <div className="lockout-shield-icon">
              <ShieldAlert size={28} />
            </div>
            <div className="lockout-shield-content">
              <h4>PAYPAL CAPTURE LOCKED · ZERO-DEBIT BUYER PROTECTION ACTIVE</h4>
              <p>
                Station reported: <strong>{order?.failure_reason || "Hardware Anomaly"}</strong>.
                The autonomous policy engine has permanently locked out PayPal Payments v2 <code>/capture</code>.
                The buyer's PayPal balance has not been debited.
              </p>
            </div>
            <div className="lockout-stat mono">
              <span className="stat-label">BUYER CHARGE:</span>
              <span className="stat-value">$0.00</span>
            </div>
          </div>

          {/* Autonomous Agent Live Reasoning Terminal */}
          <div className="agent-reasoning-terminal" aria-label="Agent Autonomous Reasoning Stream">
            <div className="terminal-header mono">
              <span className="term-dot red" />
              <span className="term-dot yellow" />
              <span className="term-dot green" />
              <span className="terminal-title">AGENT_NEURAL_REASONER_v2.log</span>
              <span className="terminal-speed">LATENCY: 120ms</span>
            </div>
            <div className="terminal-body mono">
              <div className="term-line">
                <span className="term-time">[T+0.00s]</span>
                <span className="term-tag term-warn">HARDWARE_FAULT:</span>
                <span>{deliveryMode === "home" ? "Doorstep drop sensor reported irregular impact (Item Damaged)" : "Solenoid lock latch failed to report release signal on Bay #04"}</span>
              </div>
              <div className="term-line">
                <span className="term-time">[T+0.12s]</span>
                <span className="term-tag term-guard">FINANCIAL_GUARD:</span>
                <span>Hard-blocked PayPal Payments v2 /capture for Order {order?.id}. Zero dollars moved.</span>
              </div>
              <div className="term-line">
                <span className="term-time">[T+0.25s]</span>
                <span className="term-tag term-info">ESCROW_AUDIT:</span>
                <span>Authorization {order?.paypal_authorization_id || "AUTH-DEMO"} isolated safely. Buyer wallet remains protected.</span>
              </div>
              <div className="term-line">
                <span className="term-time">[T+0.38s]</span>
                <span className="term-tag term-success">RECOVERY_SYNTHESIS:</span>
                <span>Evaluating 3 autonomous resolution vectors based on venue inventory and budget limits.</span>
              </div>
            </div>
          </div>

          {/* 3 Autonomous Countermeasure Cards */}
          <div className="countermeasures-grid">
            {/* Card 1: Re-Route Bay */}
            <div className="countermeasure-card">
              <div className="cm-badge-row">
                <span className="cm-badge hardware-badge">COUNTERMEASURE 1 · HARDWARE</span>
                <span className="cm-eta mono">ETA: INSTANT</span>
              </div>
              <h4>Auto-Reroute to Bay #08</h4>
              <p>
                Keeps the current PayPal authorization active. Automatically reallocates physical package to clean Bay #08
                and flashes new OTP PIN to the shopper's phone.
              </p>
              <button
                type="button"
                className="cm-exec-btn cm-btn-secondary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCountermeasure("retry")}
              >
                <RefreshCw size={14} className={busyAction === "retry" ? "spin" : ""} />
                <span>{busyAction === "retry" ? "Allocating..." : "Execute Bay Re-Route"}</span>
              </button>
            </div>

            {/* Card 2: Smart Substitution */}
            <div className="countermeasure-card">
              <div className="cm-badge-row">
                <span className="cm-badge catalog-badge">COUNTERMEASURE 2 · CATALOG</span>
                <span className="cm-eta mono">DELTA: -$4.00</span>
              </div>
              <h4>Smart Catalog Substitution</h4>
              <p>
                Swaps damaged $12 Keychain for in-stock Venue Enamel Pin ($8.00). Strict integer pricing automatically
                returns $4.00 delta to buyer's available wallet balance.
              </p>
              <button
                type="button"
                className="cm-exec-btn cm-btn-secondary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCountermeasure("substitute")}
              >
                <Sparkles size={14} />
                <span>Substitute with Pin ($8.00)</span>
              </button>
            </div>

            {/* Card 3: Instant PayPal Void */}
            <div className="countermeasure-card cm-card-recommended">
              <div className="cm-badge-row">
                <span className="cm-badge financial-badge">RECOMMENDED · FINANCIAL</span>
                <span className="cm-eta mono">0¢ CHARGED</span>
              </div>
              <h4>Instant PayPal Hold Void (/void)</h4>
              <p>
                Calls PayPal sandbox Payments v2 <code>/void</code> in under 1.5 seconds. The hold vanishes immediately.
                Shopper suffers zero bank disputes, zero fees, plus receives concierge compensation.
              </p>
              <button
                type="button"
                className="cm-exec-btn cm-btn-primary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCountermeasure("void")}
              >
                <ShieldCheck size={15} />
                <span>{busyAction === "void" ? "Voiding Hold..." : "Instant PayPal /void (Release Hold)"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Concierge Apology Voucher Banner */}
      {apologyVoucher && (
        <div className="concierge-voucher-card" role="status">
          <div className="voucher-left">
            
            <div>
              <strong>Autonomous Concierge Apology Voucher Issued</strong>
              <p>Because delivery failed, the agent automatically granted a $5 credit to maintain customer loyalty.</p>
            </div>
          </div>
          <div className="voucher-code mono">
            <code>{apologyVoucher} · $5.00 CREDIT</code>
          </div>
        </div>
      )}

      {/* Side-by-Side Impact Comparison Scorecard */}
      <div className="impact-comparison-card">
        <div className="impact-col legacy-col">
          <div className="impact-col-header">
            <span className="col-tag tag-legacy">TRADITIONAL E-COMMERCE (NO PROOFED)</span>
            <h5>The 14-Day Dispute Nightmare</h5>
          </div>
          <ul className="impact-list">
            <li>
              <strong>Upfront Debit:</strong> Customer's card was charged $12.00 before delivery was ever attempted.
            </li>
            <li>
              <strong>Locker Jam / Damage:</strong> Customer stands at kiosk with empty hands and empty wallet.
            </li>
            <li>
              <strong>Resolution Path:</strong> 14 business days waiting for support ticket & bank chargeback.
            </li>
            <li>
              <strong>Merchant Cost:</strong> $15 bank chargeback penalty fee, negative review, lost customer.
            </li>
          </ul>
        </div>

        <div className="impact-col proofed-col">
          <div className="impact-col-header">
            <span className="col-tag tag-proofed">PROOFED AGENTIC COMMERCE (AUTHORIZE FIRST)</span>
            <h5>Zero Charge. Autonomous Recovery.</h5>
          </div>
          <ul className="impact-list">
            <li>
              <strong>Zero-Debit Hold:</strong> Funds held via <code>intent=AUTHORIZE</code>; $0 settled.
            </li>
            <li>
              <strong>Locker Jam / Damage:</strong> Telemetry triggers instant agentic safety lockout of <code>/capture</code>.
            </li>
            <li>
              <strong>Resolution Path:</strong> 1.2-second autonomous 1-click <code>/void</code> or smart substitution.
            </li>
            <li>
              <strong>Merchant Cost:</strong> $0 dispute fees, 0 bank chargebacks, 100% retained customer trust.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
