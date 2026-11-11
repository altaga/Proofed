"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Camera, Layers, CreditCard, RotateCcw, ShieldCheck, MapPin } from "lucide-react";

interface ModuleDef {
  no: string;
  name: string;
  role: string;
  href: string;
  badge: string;
  desc: string;
  actionText: string;
  icon: typeof Bot;
}

const MODULES: ModuleDef[] = [
  {
    no: "01",
    name: "Client Marketplace",
    role: "Autonomous Shopper",
    href: "/client",
    badge: "Chat · 65 SKUs · intent=AUTHORIZE",
    desc: "Natural language shopping assistant with real catalog integer cents. The buyer approves the hold with a 1-click PayPal button.",
    actionText: "Launch Shopper Chat",
    icon: Bot,
  },
  {
    no: "02",
    name: "Doorstep Delivery",
    role: "Courier Terminal",
    href: "/delivery",
    badge: "Vision LLM · GPS Zone · PIN Match",
    desc: "Courier terminal with live GPS tracking, Multimodal Vision AI verification of Door #15 and intact parcel, and recipient PIN input.",
    actionText: "Open Delivery Terminal",
    icon: Camera,
  },
  {
    no: "03",
    name: "Backend Monitor",
    role: "Audit Ledger",
    href: "/backend",
    badge: "Append-Only Event Stream",
    desc: "Real-time state machine inspector. Audits every tool call, policy guardrail, and transition between CREATED, AUTHORIZED, and CAPTURED.",
    actionText: "Inspect Audit Ledger",
    icon: Layers,
  },
  {
    no: "04",
    name: "Merchant Desk",
    role: "Settlement Operations",
    href: "/merchant",
    badge: "PayPal Payments v2",
    desc: "Full order ledger and manual settlement desk. Review evidence hashes, tamper-evident photo digests, and handle voids or refunds.",
    actionText: "Open Merchant Desk",
    icon: CreditCard,
  },
];

const GUARDRAILS = [
  { label: "PAYPAL INTENT", val: "AUTHORIZE ($0.00 upfront)", status: "verified" },
  { label: "ZERO-TRUST PRICING", val: "Catalog Integer Cents", status: "verified" },
  { label: "HANDOVER GATE", val: "Vision LLM + PIN (≥80 pts)", status: "verified" },
  { label: "TESTBENCH VENUE", val: "Filarecka 2B / 15, Kraków", status: "verified" },
];

export function CommandHub() {
  const [note, setNote] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const reset = async () => {
    if (!window.confirm("Reset demo orders to pristine catalog state? This clears all active orders, event logs, and local chat history.")) return;
    setIsResetting(true);
    try {
      await fetch("/api/demo/reset", { method: "POST" });
      if (typeof window !== "undefined") {
        try {
          for (let i = window.localStorage.length - 1; i >= 0; i--) {
            const key = window.localStorage.key(i);
            if (key && (key.startsWith("proofed") || key.startsWith("shop."))) {
              window.localStorage.removeItem(key);
            }
          }
        } catch {
          // ignore
        }
      }
      setNote("Database, orders, and client session reset to pristine state.");
    } catch {
      setNote("Reset failed.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="ix-hub-container">
      {/* Hero Header */}
      <header className="ix-hub-header">
        <div className="ix-pill-badge mono">
          <ShieldCheck size={13} className="ix-pill-icon" />
          <span>Two-Phase Physical Commerce Protocol · PayPal Authorize &amp; Capture</span>
        </div>

        <h1 className="ix-hub-title">
          Hold the money.
          <br />
          Capture only on proof.
        </h1>

        <p className="ix-hub-lede">
          An AI agent negotiates and quotes products in verified integer cents. PayPal authorizes and holds the funds.
          Zero dollars are captured until Multimodal Vision AI and the buyer&apos;s handover PIN confirm physical delivery at the door.
        </p>
      </header>

      {/* Protocol Guardrails Strip */}
      <div className="ix-guardrails-strip mono" aria-label="Protocol Security Guardrails">
        {GUARDRAILS.map((g, idx) => (
          <div key={idx} className="ix-guardrail-cell">
            <span className="ix-guardrail-label">{g.label}</span>
            <span className="ix-guardrail-val">
              <span className="ix-guardrail-dot" />
              {g.val}
            </span>
          </div>
        ))}
      </div>

      {/* 2x2 Interactive Module Cards */}
      <section className="ix-cards-grid" aria-label="Proofed Functional Modules">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link key={m.no} href={m.href} className="ix-card-surface">
              <div className="ix-card-top">
                <div className="ix-card-badge-row">
                  <span className="ix-card-no mono">{m.no}</span>
                  <span className="ix-card-role mono">{m.role}</span>
                </div>
                <div className="ix-card-icon-wrap">
                  <Icon size={18} className="ix-card-icon" />
                </div>
              </div>

              <div className="ix-card-body">
                <h2 className="ix-card-title">{m.name}</h2>
                <p className="ix-card-desc">{m.desc}</p>
              </div>

              <div className="ix-card-footer">
                <span className="ix-card-meta mono">{m.badge}</span>
                <span className="ix-card-action">
                  <span>{m.actionText}</span>
                  <ArrowRight size={14} className="ix-action-arrow" />
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      {/* Footer System Strip */}
      <footer className="ix-hub-footer">
        <div className="ix-foot-left mono">
          <MapPin size={13} />
          <span>Active Testbed: ul. Filarecka 2B, Kraków (Lat: 50.0556°, Lng: 19.9204°)</span>
        </div>

        <div className="ix-foot-right">
          <button
            type="button"
            className="ix-reset-btn mono"
            onClick={reset}
            disabled={isResetting}
          >
            <RotateCcw size={12} className={isResetting ? "spin" : ""} />
            <span>{isResetting ? "Resetting..." : "Reset demo state"}</span>
          </button>
          {note && (
            <span className="ix-hub-note mono" role="status">
              {note}
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
