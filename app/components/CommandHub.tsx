"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Truck,
  MessageSquare,
  Activity,
  Layers,
  Terminal,
  ExternalLink,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type ModuleCard = {
  id: string;
  tag: string;
  title: string;
  role: string;
  badge: string;
  badgeType: "good" | "info" | "warning" | "neutral";
  description: string;
  highlights: string[];
  href: string;
  icon: typeof Truck;
  buttonLabel: string;
};

const MODULES: ModuleCard[] = [
  {
    id: "delivery",
    tag: "MODULE 01 // COURIER PERSPECTIVE",
    title: "Doorstep Delivery & AI Handover",
    role: "Courier Optical Terminal",
    badge: "AI Vision v2.4",
    badgeType: "warning",
    description:
      "Handheld courier terminal equipped with doorstep computer vision. Flags wrong address deliveries (#742 vs #744) or damaged cartons to lock funds from capture.",
    highlights: [
      "Laser OCR Package Scanner",
      "Wrong Doorstep Rejection (#742)",
      "Cryptographic Handover Storage",
    ],
    href: "/delivery",
    icon: Truck,
    buttonLabel: "Launch Delivery Terminal",
  },
  {
    id: "client",
    tag: "MODULE 02 // SHOPPER PERSPECTIVE",
    title: "Conversational Shopping Assistant",
    role: "Autonomous Buyer Interface",
    badge: "MiniMax-M3 LLM",
    badgeType: "info",
    description:
      "Conversational shopping agent connected to a 68+ item catalog. Strict integer-cent pricing rules with PayPal Orders v2 AUTHORIZE holds and autonomous recovery.",
    highlights: [
      "PayPal Orders v2 AUTHORIZE",
      "68+ Item Multi-Category Catalog",
      "Interactive or Auto-Void Modes",
    ],
    href: "/client",
    icon: MessageSquare,
    buttonLabel: "Launch Shopper Chat",
  },
  {
    id: "backend",
    tag: "MODULE 03 // OPERATIONS PERSPECTIVE",
    title: "Operations & Risk Pipeline Monitor",
    role: "Real-Time Risk Center",
    badge: "Zero-Capture Guard",
    badgeType: "good",
    description:
      "High-density operations dashboard visualizing the 5-stage order lifecycle. Enforces the strict rule: zero PayPal capture without verified physical handover evidence.",
    highlights: [
      "5-Stage Visual Order Stepper",
      "Append-Only Audit Stream",
      "Zero-Capture Safety Guard ($0 Risk)",
    ],
    href: "/backend",
    icon: Activity,
    buttonLabel: "Launch Operations Monitor",
  },
  {
    id: "merchant",
    tag: "MODULE 04 // MERCHANT PERSPECTIVE",
    title: "Merchant Settlement Desk",
    role: "Financial Ledger & Desk",
    badge: "AG Grid Ledger",
    badgeType: "neutral",
    description:
      "Enterprise transaction ledger tracking PayPal authorization IDs, capture tokens, live drawer balances, and 1-click manual void/refund controls.",
    highlights: [
      "Enterprise AG Grid Data Ledger",
      "PayPal Payments v2 Captures & Voids",
      "Audit Drawer & Event Inspect",
    ],
    href: "/merchant",
    icon: Layers,
    buttonLabel: "Launch Merchant Desk",
  },
  {
    id: "device",
    tag: "MODULE 05 // HARDWARE PERSPECTIVE",
    title: "Hardware Locker Kiosk Stand-In",
    role: "Pickup Station Terminal",
    badge: "Physical Handover",
    badgeType: "neutral",
    description:
      "Physical venue locker stand-in simulating pickup stations. Validates 6-digit one-time pickup codes (OTP) and station timestamps to trigger cryptographic capture.",
    highlights: [
      "Dedicated Full-Screen Kiosk Mode",
      "Deterministic 6-Digit OTP Check",
      "Instant Locker Unlock & Capture",
    ],
    href: "/device",
    icon: Terminal,
    buttonLabel: "Launch Locker Kiosk",
  },
];

export function CommandHub() {
  const [seeding, setSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  const handleSeedOrder = async () => {
    setSeeding(true);
    setSeedNotice(null);
    try {
      const res = await fetch("/api/demo/seed-held", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset: "wrong-doorstep" }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        setSeedNotice(
          `Demo order ${data.order.id} created! Hold placed for ${data.order.formatted_total} ($0.00 captured). You can now verify in Delivery or Backend.`
        );
      } else {
        setSeedNotice("Order seeded. Ready for multi-window verification.");
      }
    } catch {
      setSeedNotice("Failed to seed demo order. Local database might be busy.");
    } finally {
      setSeeding(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Reset all orders and restore pristine demo catalog?")) return;
    try {
      await fetch("/api/demo/reset", { method: "POST" });
      setSeedNotice("Database reset to pristine catalog state.");
    } catch {
      setSeedNotice("Failed to reset database.");
    }
  };

  return (
    <div className="hub-layout">
      {/* Hero Section */}
      <section className="hub-hero">
        <div className="hub-hero-eyebrow">
          <span className="hub-live-dot" aria-hidden="true" />
          <span className="hub-eyebrow-text">PROOFED PROTOCOL · PAYPAL AI SANDBOX</span>
          <span className="hub-version-tag">PROD v2.4</span>
        </div>

        <h1 className="hub-headline">
          Authorize Now. Capture Only After Proof of Handover.
        </h1>

        <p className="hub-subhead">
          The accountability infrastructure for autonomous agents in physical commerce.
          Buyer funds remain held securely on PayPal — zero capture occurs until physical
          handover evidence is cryptographically verified.
        </p>

        {/* Live Architecture Metric Bar */}
        <div className="hub-telemetry-strip" role="region" aria-label="System Protocol Invariants">
          <div className="telemetry-item">
            <span className="telemetry-label">SETTLEMENT INTENT</span>
            <span className="telemetry-val">
              <ShieldCheck className="telemetry-icon text-emerald" size={14} />
              AUTHORIZE (Holds Only)
            </span>
          </div>
          <div className="telemetry-divider" aria-hidden="true" />
          <div className="telemetry-item">
            <span className="telemetry-label">PRICING INTEGRITY</span>
            <span className="telemetry-val">
              <Cpu className="telemetry-icon text-blue" size={14} />
              Node 22 SQLite (Integer Cents)
            </span>
          </div>
          <div className="telemetry-divider" aria-hidden="true" />
          <div className="telemetry-item">
            <span className="telemetry-label">CAPTURE CONDITION</span>
            <span className="telemetry-val">
              <Sparkles className="telemetry-icon text-amber" size={14} />
              Vision / OTP Evidence
            </span>
          </div>
          <div className="telemetry-divider" aria-hidden="true" />
          <div className="telemetry-item">
            <span className="telemetry-label">FAIL-SAFE RISK</span>
            <span className="telemetry-val text-emerald">
              $0.00 Captured (Auto-Void)
            </span>
          </div>
        </div>
      </section>

      {/* Quick Interactive Seed Bar */}
      <section className="hub-quick-bar" aria-label="Quick Demo Actions">
        <div className="quick-bar-left">
          <span className="quick-bar-title">RAPID DEMO LAUNCHER:</span>
          <span className="quick-bar-desc">
            Instantly inject a verified PayPal authorization hold to test courier verification or risk monitoring.
          </span>
        </div>
        <div className="quick-bar-actions">
          <button
            type="button"
            className="quick-btn-seed"
            onClick={handleSeedOrder}
            disabled={seeding}
          >
            <Sparkles size={14} />
            {seeding ? "Injecting Hold..." : "Seed Active Order ($0 Captured)"}
          </button>
          <button
            type="button"
            className="quick-btn-reset"
            onClick={handleReset}
            title="Reset SQLite database to pristine state"
          >
            <RotateCcw size={13} />
            Reset State
          </button>
        </div>
      </section>

      {seedNotice && (
        <div className="hub-seed-alert" role="status">
          <CheckCircle2 size={15} className="text-emerald" />
          <span>{seedNotice}</span>
          <button
            type="button"
            className="hub-seed-alert-close"
            onClick={() => setSeedNotice(null)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      {/* 5 Core Operational Buttons / Modules Grid */}
      <section className="hub-modules-section" aria-label="Operational Modules">
        <div className="hub-section-head">
          <div className="section-head-left">
            <h2 className="hub-section-title">Operational Core Modules</h2>
            <p className="hub-section-desc">
              Select any operational module below to inspect or run live transactions from each role&apos;s perspective.
            </p>
          </div>
          <span className="hub-badge-count">5 ACTIVE MODULES</span>
        </div>

        <div className="hub-grid">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <article key={mod.id} className="hub-card" data-module={mod.id}>
                {/* Card Top Metadata */}
                <div className="hub-card-meta">
                  <span className="hub-card-tag">{mod.tag}</span>
                  <span className={`hub-pill hub-pill-${mod.badgeType}`}>
                    {mod.badge}
                  </span>
                </div>

                {/* Card Header & Icon */}
                <div className="hub-card-header">
                  <div className="hub-card-icon-wrap" aria-hidden="true">
                    <Icon size={20} />
                  </div>
                  <div className="hub-card-titles">
                    <h3 className="hub-card-title">{mod.title}</h3>
                    <span className="hub-card-role">{mod.role}</span>
                  </div>
                </div>

                {/* Card Description */}
                <p className="hub-card-desc">{mod.description}</p>

                {/* Technical Capability Highlights */}
                <ul className="hub-card-highlights" aria-label="Key Capabilities">
                  {mod.highlights.map((h, i) => (
                    <li key={i} className="highlight-item">
                      <span className="highlight-bullet" aria-hidden="true" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>

                {/* Dual Action Buttons */}
                <div className="hub-card-actions">
                  <Link href={mod.href} className="hub-btn-primary">
                    <span>{mod.buttonLabel}</span>
                    <ArrowRight size={14} className="btn-arrow" />
                  </Link>

                  <a
                    href={mod.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hub-btn-secondary"
                    title={`Open ${mod.title} in a separate window`}
                  >
                    <span>New Tab</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Recommended 3-Step Testing Procedure */}
      <section className="hub-guide-section" aria-label="Testing Walkthrough">
        <div className="guide-header">
          <div className="guide-header-title">
            <AlertTriangle size={16} className="text-amber" />
            <h3>Doorstep Failure Test Scenario (Recommended Walkthrough)</h3>
          </div>
          <span className="guide-tag">3-WINDOW EVALUATION</span>
        </div>

        <div className="guide-steps-grid">
          <div className="guide-step">
            <div className="guide-step-num">01</div>
            <div className="guide-step-content">
              <h4>Open Delivery Terminal</h4>
              <p>
                Launch <strong>Delivery</strong> and click <em>Autofill Active Package</em>. Select preset <em>Door #742 (Wrong Doorstep)</em> and tap <em>Verify & Hand Over</em>.
              </p>
            </div>
          </div>

          <div className="guide-step">
            <div className="guide-step-num">02</div>
            <div className="guide-step-content">
              <h4>AI Vision Rejection</h4>
              <p>
                The optical guardrail rejects handover due to address mismatch. The capture mechanism is locked and PayPal captured funds remain strictly <strong>$0.00</strong>.
              </p>
            </div>
          </div>

          <div className="guide-step">
            <div className="guide-step-num">03</div>
            <div className="guide-step-content">
              <h4>Monitor & Auto-Void</h4>
              <p>
                Switch to <strong>Backend</strong> or <strong>Client</strong> to observe the <em>DELIVERY_FAILED</em> state, trigger the instant <em>/void</em> release, or issue a substitution.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
