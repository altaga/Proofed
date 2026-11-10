"use client";

import { useEffect, useState } from "react";
import { RotateCcw, ShieldCheck, ShoppingBag, Terminal, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { ShopperApp } from "./ShopperApp";
import { DeviceKiosk } from "./DeviceKiosk";
import { PlainTimeline } from "./PlainTimeline";
import { Toast } from "./Toast";
import type { TxOrder } from "./tx-model";

export function DemoGuide({ venueName }: { name?: string; tagline?: string; venueName: string }) {
  const [latest, setLatest] = useState<TxOrder | null>(null);
  const [syncedCode, setSyncedCode] = useState<string>("");
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  return (
    <div className="demo-guide-container">
      <Toast message={toast} tone="ok" />

      {/* Hero Narrative & Value Proposition */}
      <header className="demo-hero-banner">
        <div className="demo-hero-main">
          <div className="demo-hero-badge">
            <span className="pulse-dot" />
            <span>PAYPAL AI HACKATHON 2026 · PHYSICAL AGENTIC COMMERCE</span>
          </div>
          <h1 className="demo-hero-title">
            Proofed: Authorize Now. Capture Only After Proof of Handover.
          </h1>
          <p className="demo-hero-lede">
            In stadiums and micro-kiosks, an AI agent must never charge a customer before physical collection.
            Proofed places a <strong>PayPal temporary hold</strong> and only captures funds when the locker terminal verifies handover evidence.
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
            <span>{resetting ? "Resetting..." : "Reset Demo State"}</span>
          </button>
        </div>
      </header>

      {/* 3-Step Architecture Pillars */}
      <div className="architecture-strip" aria-label="How Proofed Works">
        <div className="arch-pillar">
          <div className="arch-pillar-icon">
            <ShoppingBag size={18} />
          </div>
          <div className="arch-pillar-content">
            <span className="arch-step-num">STEP 1 · SHOPPING</span>
            <h4>Zero-Trust AI Pricing</h4>
            <p>The LLM negotiates within budget, but prices come strictly from SQLite in integer cents. LLM cannot hallucinate totals.</p>
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
            <p>Locker terminal checks pickup code + sensor. <strong>Capture fires only upon physical delivery</strong>. If jammed, hold auto-voids.</p>
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
              {isFailed && "STATION JAMMED"}
              {isVoided && "HOLD RELEASED"}
              {!isHeld && !isCaptured && !isFailed && !isVoided && latest.status}
            </span>
            <div className="live-status-info">
              <strong>Order {latest.id} · {latest.formatted_total}</strong>
              <p>
                {isHeld && `Funds (${latest.formatted_total}) are safely held on PayPal. $0 debited from shopper so far.`}
                {isCaptured && `Payment captured successfully. Physical proof verified at station.`}
                {isFailed && `Pickup problem reported. Funds remain held safely; shopper was not charged.`}
                {isVoided && `Authorization released. $0 charged. Customer protected from hardware failure.`}
              </p>
            </div>
          </div>

          {latest.pickup_code && (
            <div className="live-status-right">
              <span className="pickup-code-badge-label">Active Pickup Code:</span>
              <button
                type="button"
                className="pickup-sync-btn"
                onClick={() => setSyncedCode(latest.pickup_code || "")}
                title="Inject code into Pickup Station terminal"
              >
                <strong className="mono">{latest.pickup_code}</strong>
                <span className="sync-pill">Sync to Kiosk <ArrowRight size={13} /></span>
              </button>
            </div>
          )}
        </section>
      )}

      {/* Interactive 2-Pane Display */}
      <div className="presenter-grid">
        <section className="presenter-pane pane-shop">
          <div className="pane-header">
            <div className="pane-title-group">
              <span className="pane-badge shopper-badge">TOUCHPOINT 1</span>
              <h3>Shopper Experience & AI Assistant</h3>
            </div>
            <span className="pane-venue">{venueName || "Venue Micro-Store"}</span>
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
              <h3>Pickup Station Terminal (Locker Hardware)</h3>
            </div>
            <span className="pane-venue">Locker Bay #04</span>
          </div>
          <div className="pane-body">
            <DeviceKiosk
              compact
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
