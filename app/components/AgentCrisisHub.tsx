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
    <section className="agent-crisis-hub" aria-label="Failure Handling & Recovery">
      {/* Header */}
      <div className="crisis-hub-header">
        <div className="crisis-header-badge-group">
          <span className={`crisis-radar-dot ${isFailed ? "alarm" : isCaptured ? "settled" : "active"}`} />
          <span className="crisis-hub-kicker">
            {isFailed
              ? "Delivery failed · Capture blocked"
              : isCaptured
                ? "Delivered · Payment captured"
                : isVoided
                  ? "Hold released · $0.00 charged"
                  : "Exception handling · Active hold"}
          </span>
        </div>
        <div className="crisis-telemetry-tag mono">
          {deliveryMode === "home" ? "Doorstep delivery" : "Locker · Bay 04"}
        </div>
      </div>

      <div className="crisis-intro-row">
        <div>
          <h3 className="crisis-title">
            Exception recovery without upfront charges
          </h3>
          <p className="crisis-subtext">
            When a locker jams or a parcel arrives damaged, funds remain held via{" "}
            <code>intent=AUTHORIZE</code> rather than debited upfront—allowing instant retry, substitution, or void.
          </p>
        </div>
      </div>

      {/* Simulation Bar */}
      <div className="chaos-sim-strip" role="region" aria-label="Simulate Handoff Scenarios">
        <span className="chaos-strip-label">Simulate:</span>
        <div className="chaos-buttons-row">
          <button
            type="button"
            className="chaos-btn chaos-btn-jam"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("jam")}
            title="Simulate locker latch failure at station"
          >
            <Zap size={14} />
            <span>Latch jam</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-damage"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("item_damaged")}
            title="Simulate crushed parcel or impact damage"
          >
            <PackageX size={14} />
            <span>Damaged box</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-gps"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("wrong_address")}
            title="Simulate delivery at wrong doorstep"
          >
            <MapPin size={14} />
            <span>Wrong address</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-timeout"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("pickup_timeout")}
            title="Simulate shopper no-show after 15m expiration"
          >
            <Clock size={14} />
            <span>15m timeout</span>
          </button>

          <button
            type="button"
            className="chaos-btn chaos-btn-success"
            disabled={Boolean(busyAction)}
            onClick={() => void handleTriggerChaos("success")}
            title="Execute clean physical handover and trigger PayPal capture"
          >
            <CheckCircle2 size={14} />
            <span>Complete handoff</span>
          </button>
        </div>
      </div>

      {hubMessage && (
        <div className="hub-feedback-banner mono" role="status">
          <span>{hubMessage}</span>
        </div>
      )}

      {/* When Physical Failure Happens: Show Log and Resolution Options */}
      {isFailed && (
        <div className="crisis-active-panel">
          <div className="safety-lockout-banner" role="alert">
            <div className="lockout-shield-icon">
              <ShieldAlert size={22} />
            </div>
            <div className="lockout-shield-content">
              <h4>Capture blocked · $0.00 charged</h4>
              <p>
                Reported issue: <strong>{order?.failure_reason || "Hardware fault"}</strong>.
                PayPal Payments v2 <code>/capture</code> is blocked while the issue is resolved.
              </p>
            </div>
            <div className="lockout-stat mono">
              <span className="stat-label">Charged</span>
              <span className="stat-value">$0.00</span>
            </div>
          </div>

          {/* Event Log */}
          <div className="agent-reasoning-terminal" aria-label="Exception Event Log">
            <div className="terminal-header mono">
              <span className="terminal-title">Exception log</span>
              <span className="terminal-speed">120 ms</span>
            </div>
            <div className="terminal-body mono">
              <div className="term-line">
                <span className="term-time">00.00s</span>
                <span className="term-tag term-warn">Fault</span>
                <span>{deliveryMode === "home" ? "Doorstep inspection reported damaged carton" : "Bay 04 latch failed to confirm release"}</span>
              </div>
              <div className="term-line">
                <span className="term-time">00.12s</span>
                <span className="term-tag term-guard">Hold</span>
                <span>Blocked PayPal /capture for {order?.id}. $0.00 debited.</span>
              </div>
              <div className="term-line">
                <span className="term-time">00.25s</span>
                <span className="term-tag term-info">Auth</span>
                <span>Authorization {order?.paypal_authorization_id || "AUTH-DEMO"} preserved.</span>
              </div>
              <div className="term-line">
                <span className="term-time">00.38s</span>
                <span className="term-tag term-success">Options</span>
                <span>Prepared bay retry, item substitution, or full hold release.</span>
              </div>
            </div>
          </div>

          {/* 3 Resolution Cards */}
          <div className="countermeasures-grid">
            <div className="countermeasure-card">
              <div className="cm-badge-row">
                <span className="cm-badge hardware-badge">Option 1 · Hardware</span>
                <span className="cm-eta mono">Same hold</span>
              </div>
              <h4>Reassign to Bay 08</h4>
              <p>
                Keeps the current PayPal authorization active, moves the pickup to Bay 08, and issues a new code.
              </p>
              <button
                type="button"
                className="cm-exec-btn cm-btn-secondary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCountermeasure("retry")}
              >
                <RefreshCw size={14} className={busyAction === "retry" ? "spin" : ""} />
                <span>{busyAction === "retry" ? "Reassigning…" : "Reassign bay"}</span>
              </button>
            </div>

            <div className="countermeasure-card">
              <div className="cm-badge-row">
                <span className="cm-badge catalog-badge">Option 2 · Catalog</span>
                <span className="cm-eta mono">-$4.00</span>
              </div>
              <h4>Substitute item</h4>
              <p>
                Releases the $12.00 hold and creates a new $8.00 order for the in-stock Venue Enamel Pin.
              </p>
              <button
                type="button"
                className="cm-exec-btn cm-btn-secondary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCountermeasure("substitute")}
              >
                <span>Substitute with Pin ($8.00)</span>
              </button>
            </div>

            <div className="countermeasure-card cm-card-recommended">
              <div className="cm-badge-row">
                <span className="cm-badge financial-badge">Recommended</span>
                <span className="cm-eta mono">$0.00 charged</span>
              </div>
              <h4>Release PayPal hold (/void)</h4>
              <p>
                Calls PayPal Payments v2 <code>/void</code> to cancel the authorization immediately without charging the buyer.
              </p>
              <button
                type="button"
                className="cm-exec-btn cm-btn-primary"
                disabled={Boolean(busyAction)}
                onClick={() => void handleCountermeasure("void")}
              >
                <ShieldCheck size={15} />
                <span>{busyAction === "void" ? "Releasing…" : "Release hold (/void)"}</span>
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
