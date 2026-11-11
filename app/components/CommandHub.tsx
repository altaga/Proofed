"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bot, Camera, Layers, CreditCard, RotateCcw } from "lucide-react";

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
    role: "Shopper Experience",
    href: "/client",
    badge: "Shopping Chat · PayPal Hold",
    desc: "Ask for products or share your budget. Approve a temporary payment hold with PayPal — you only pay once your order arrives.",
    actionText: "Open Shopper Chat",
    icon: Bot,
  },
  {
    no: "02",
    name: "Doorstep Delivery",
    role: "Courier App",
    href: "/delivery",
    badge: "3-Step Handoff · Photo & PIN",
    desc: "Step-by-step courier workflow: confirm the package, photograph the doorstep for AI verification, and enter the customer's PIN.",
    actionText: "Open Courier App",
    icon: Camera,
  },
  {
    no: "03",
    name: "Merchant Desk",
    role: "Store Operations",
    href: "/merchant",
    badge: "Order Management · Settlements",
    desc: "Manage active orders, review delivery photos and status, and handle payment captures, cancellations, or refunds.",
    actionText: "Open Merchant Desk",
    icon: CreditCard,
  },
  {
    no: "04",
    name: "Developer & Judge Console",
    role: "Technical Audit Trail",
    href: "/backend",
    badge: "For Devs & Hackathon Judges · PayPal API Logs",
    desc: "Dedicated technical console for Hackathon Judges and developers. Inspect raw PayPal Orders v2 & Payments v2 API calls, event streams, and audit logs.",
    actionText: "Inspect Developer Console",
    icon: Layers,
  },
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
        <h1 className="ix-hub-title">
          Hold the money.
          <br />
          Capture only on proof.
        </h1>

        <p className="ix-hub-lede">
          An AI shopping assistant finds what you need. PayPal places a temporary hold on the payment.
          Nothing is charged until doorstep photo verification and the customer&apos;s delivery PIN confirm the package arrived safely.
        </p>
      </header>

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
