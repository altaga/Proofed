"use client";

import { useEffect, useState } from "react";
import { RotateCcw, ShieldCheck, ShoppingBag, Terminal, ArrowRight, Home, Building2 } from "lucide-react";
import { ShopperApp } from "./ShopperApp";
import { DeviceKiosk } from "./DeviceKiosk";
import { PlainTimeline } from "./PlainTimeline";
import { AgentCrisisHub } from "./AgentCrisisHub";
import { Toast } from "./Toast";
import type { TxOrder } from "./tx-model";

export function DemoGuide({ venueName }: { name?: string; tagline?: string; venueName: string }) {
  const [latest, setLatest] = useState<TxOrder | null>(null);
  const [syncedCode, setSyncedCode] = useState<string>("");
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<"venue" | "home">("venue");

  const loadOrders = async () => {
    try {
      const response = await fetch("/api/orders");
      const payload = await response.json();
      if (!response.ok) return;
      const orders = (payload.orders || []) as TxOrder[];
      const next = [...orders].sort((a, b) => {
        const left = Date.parse(b.updated_at || b.created_at || "") || 0;
        const right = Date.parse(a.updated_at || a.created_at || "") || 0;
        return left - right;
      })[0] ?? null;
      setLatest(next);
      if (next?.pickup_code && !syncedCode) {
        setSyncedCode(next.pickup_code);
      }
    } catch {
      // Ignore network polling errors
    }
  };

  useEffect(() => {
    loadOrders().catch(() => undefined);
    const timer = setInterval(() => {
      loadOrders().catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  async function handleResetDemo() {
    setResetting(true);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      if (res.ok) {
        if (typeof window !== "undefined") {
          try {
            for (let i = window.localStorage.length - 1; i >= 0; i--) {
              const key = window.localStorage.key(i);
              if (key && (key.startsWith("proofed") || key.startsWith("shop."))) {
                window.localStorage.removeItem(key);
              }
            }
          } catch {}
        }
        setLatest(null);
        setSyncedCode("");
        setToast("Demo catalog & orders reset to pristine state");
        window.setTimeout(() => setToast(null), 3000);
        await loadOrders();
      }
    } catch {
      setToast("Failed to reset demo state");
    } finally {
      setResetting(false);
    }
  }

  // Financial status helper
  const isHeld = latest?.status === "AUTHORIZED" || latest?.status === "DELIVERY_CONFIRMED";
  const isCaptured = latest?.status === "CAPTURED";
  const isFailed = latest?.status === "DELIVERY_FAILED";
  const isVoided = latest?.status === "VOIDED";

  const activeVenueName =
    deliveryMode === "home"
      ? "ul. Filarecka 2B / 15, Kraków (Doorstep Delivery)"
      : venueName || "Proofed Autonomous Commerce Hub";

  return (
    <div className="demo-guide-container">
      <Toast message={toast} tone="ok" />

      {/* Hero Narrative & Value Proposition */}
      <header className="demo-hero-banner">
        <div className="demo-hero-main">
          <div className="demo-hero-badge">
            <h2 className="demo-hero-presenter">Presenter</h2>
            <span className="badge-sep">·</span>
            <span>Conditional settlement walkthrough</span>
          </div>
          <h1 className="demo-hero-title">
            Authorize first. Capture only after handoff.
          </h1>
          <p className="demo-hero-lede">
            {deliveryMode === "home"
              ? "For residential deliveries, Proofed places a PayPal authorization hold and captures funds only once the doorstep photo and address match."
              : "For locker pickups, Proofed places a PayPal authorization hold and captures funds only when the bay confirms collection."}
          </p>
        </div>

        <div className="demo-reset-container">
          <button
            type="button"
            className="demo-reset-btn"
            disabled={resetting}
            onClick={handleResetDemo}
            title="Reset catalog and clear test orders"
          >
            <RotateCcw size={15} className={resetting ? "spin" : ""} />
            <span>{resetting ? "Resetting…" : "Reset demo"}</span>
          </button>
        </div>
      </header>

      {/* Scenario Mode Switcher */}
      <div className="demo-mode-switcher-row">
        <span className="mode-switcher-label">Mode</span>
        <div className="mode-switcher-pills" role="tablist">
          <button
            type="button"
            className={`mode-pill ${deliveryMode === "venue" ? "active" : ""}`}
            onClick={() => setDeliveryMode("venue")}
          >
            <Building2 size={15} />
            <span>Venue locker</span>
          </button>
          <button
            type="button"
            className={`mode-pill ${deliveryMode === "home" ? "active" : ""}`}
            onClick={() => setDeliveryMode("home")}
          >
            <Home size={15} />
            <span>Home delivery</span>
          </button>
        </div>
      </div>

      {/* PayPal Buyer Wallet Card */}
      <section className="live-wallet-widget" aria-label="Buyer PayPal Wallet Balance">
        <div className="wallet-widget-header">
          <div className="wallet-badge-group">
            <span className="wallet-icon">P</span>
            <span className="wallet-title">Buyer PayPal wallet</span>
          </div>
          <span className="wallet-account mono">buyer-sandbox@proofed.dev</span>
        </div>
        <div className="wallet-grid">
          <div className="wallet-cell">
            <span className="wallet-cell-label">Balance</span>
            <span className="wallet-cell-val mono">$250.00</span>
            <span className="wallet-cell-sub">Total balance</span>
          </div>
          <div className={`wallet-cell ${isHeld ? "cell-hold-active" : ""}`}>
            <span className="wallet-cell-label">Active hold</span>
            <span className="wallet-cell-val mono">
              {isHeld ? `-${latest.formatted_total}` : "$0.00"}
            </span>
            <span className="wallet-cell-sub">
              {isHeld ? "Authorized · $0.00 charged" : "No active holds"}
            </span>
          </div>
          <div className="wallet-cell">
            <span className="wallet-cell-label">Available</span>
            <span className="wallet-cell-val mono">
              {isHeld ? `$${(250 - (parseFloat(latest.formatted_total.replace(/[^0-9.]/g, '')) || 0)).toFixed(2)}` : "$250.00"}
            </span>
            <span className="wallet-cell-sub">Unencumbered funds</span>
          </div>
          <div className={`wallet-cell ${isCaptured ? "cell-captured-active" : ""}`}>
            <span className="wallet-cell-label">Captured</span>
            <span className="wallet-cell-val mono">
              {isCaptured ? latest.formatted_total : "$0.00"}
            </span>
            <span className="wallet-cell-sub">
              {isCaptured ? "Settled after handoff" : "$0.00 debited"}
            </span>
          </div>
        </div>
      </section>

      {/* 3-Step Architecture Pillars */}
      <div className="architecture-strip" aria-label="How Proofed Works">
        <div className="arch-pillar">
          <div className="arch-pillar-icon">
            <ShoppingBag size={18} />
          </div>
          <div className="arch-pillar-content">
            <span className="arch-step-num">STEP 1 · SHOPPING</span>
            <h4>Zero-Trust AI Pricing</h4>
            <p>The LLM negotiates items within budget, but prices come strictly from SQLite in integer cents. LLM cannot hallucinate totals.</p>
          </div>
        </div>

        <div className="arch-pillar">
          <div className="arch-pillar-icon">
            <ShieldCheck size={18} />
          </div>
          <div className="arch-pillar-content">
            <span className="arch-step-num">STEP 2 · PAYPAL HOLD</span>
            <h4>Authorize First ($0 Moved)</h4>
            <p>Shopper approves PayPal hold (<code>intent=AUTHORIZE</code>). Funds remain held on the buyer’s account; zero funds debited.</p>
          </div>
        </div>

        <div className="arch-pillar">
          <div className="arch-pillar-icon">
            <Terminal size={18} />
          </div>
          <div className="arch-pillar-content">
            <span className="arch-step-num">STEP 3 · PHYSICAL PROOF</span>
            <h4>Conditional Settlement</h4>
            <p>
              {deliveryMode === "home"
                ? "Autonomous bot verifies doorstep photo hash + homeowner PIN. Capture fires ONLY upon drop. If damaged, hold auto-voids."
                : "Locker terminal checks pickup code + sensor. Capture fires ONLY upon physical delivery. If jammed, hold auto-voids."}
            </p>
          </div>
        </div>
      </div>

      {/* Live Financial Status Banner */}
      {latest && (
        <section className={`live-financial-banner ${isHeld ? "state-held" : isCaptured ? "state-captured" : isFailed ? "state-failed" : isVoided ? "state-voided" : "state-pending"}`} role="status">
          <div className="live-status-left">
            <span className="live-status-pill">
              {isHeld && "ACTIVE HOLD"}
              {isCaptured && "SETTLED"}
              {isFailed && (deliveryMode === "home" ? "DELIVERY FAILED" : "STATION JAMMED")}
              {isVoided && "HOLD RELEASED"}
              {!isHeld && !isCaptured && !isFailed && !isVoided && latest.status}
            </span>
            <div className="live-status-info">
              <strong>Order {latest.id} · {latest.formatted_total}</strong>
              <p>
                {isHeld && `Funds (${latest.formatted_total}) are safely held on PayPal. $0 debited from shopper so far.`}
                {isCaptured && `Payment captured successfully. Physical proof verified at ${deliveryMode === "home" ? "doorstep" : "station"}.`}
                {isFailed && `Delivery problem reported. Funds remain held safely; shopper was not charged.`}
                {isVoided && `Authorization released. $0 charged. Customer protected from hardware failure.`}
              </p>
            </div>
          </div>

          {latest.pickup_code && (
            <div className="live-status-right">
              <span className="pickup-code-badge-label">Active Handover PIN:</span>
              <button
                type="button"
                className="pickup-sync-btn"
                onClick={() => setSyncedCode(latest.pickup_code || "")}
                title="Inject code into Pickup Station terminal"
              >
                <strong className="mono">{latest.pickup_code}</strong>
                <span className="sync-pill">Sync to Handover <ArrowRight size={13} /></span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* Autonomous Agent Crisis & Recovery War Room */}
      <AgentCrisisHub
        order={latest}
        deliveryMode={deliveryMode}
        onOrderRefresh={loadOrders}
        onSyncCode={(code) => setSyncedCode(code)}
      />

      {/* Interactive 2-Pane Display */}
      <div className="presenter-grid">
        <section className="presenter-pane pane-shop">
          <div className="pane-header">
            <div className="pane-title-group">
              <span className="pane-badge shopper-badge">TOUCHPOINT 1</span>
              <h3>Shopper Experience & AI Assistant</h3>
            </div>
            <span className="pane-venue">{activeVenueName}</span>
          </div>
          <div className="pane-body">
            <ShopperApp
              compact
              onOrderChange={(ord) => {
                if (ord?.pickup_code) setSyncedCode(ord.pickup_code);
              }}
            />
          </div>
        </section>

        <section className="presenter-pane pane-kiosk">
          <div className="pane-header">
            <div className="pane-title-group">
              <span className="pane-badge kiosk-badge">TOUCHPOINT 2</span>
              <h3>
                {deliveryMode === "home" ? "Home Doorstep Delivery Terminal" : "Pickup Station Terminal (Locker Hardware)"}
              </h3>
            </div>
            <span className="pane-venue">
              {deliveryMode === "home" ? "Porch Camera Drop #1" : "Locker Bay #04"}
            </span>
          </div>
          <div className="pane-body">
            <DeviceKiosk
              compact
              deliveryMode={deliveryMode}
              initialCode={syncedCode || latest?.pickup_code || undefined}
            />
          </div>
        </section>
      </div>

      {/* Append-only event ledger */}
      <PlainTimeline order={latest} />
    </div>
  );
}
