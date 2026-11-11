"use client";

import { useState } from "react";
import Link from "next/link";

const MODULES = [
  {
    no: "01",
    name: "Client",
    href: "/client",
    line: "Ask for anything. The agent quotes it, you place a hold.",
    meta: "Chat · 65 SKUs · AUTHORIZE",
  },
  {
    no: "02",
    name: "Delivery",
    href: "/delivery",
    line: "Scan the label, photograph the doorstep. Wrong door, no capture.",
    meta: "Courier · Vision check",
  },
  {
    no: "03",
    name: "Backend",
    href: "/backend",
    line: "Every order, every state change, in the order it happened.",
    meta: "Ledger · Append-only",
  },
  {
    no: "04",
    name: "Merchant",
    href: "/merchant",
    line: "Settlement desk. Capture, void or refund with a reason on file.",
    meta: "Payments v2",
  },
];

export function CommandHub() {
  const [note, setNote] = useState<string | null>(null);

  const reset = async () => {
    if (!window.confirm("Reset all orders to the initial catalog?")) return;
    try {
      await fetch("/api/demo/reset", { method: "POST" });
      setNote("Database reset.");
    } catch {
      setNote("Reset failed.");
    }
  };

  return (
    <div className="ix">
      <header className="ix-head">
        <p className="ix-kicker">Proofed — 2026</p>
        <h1 className="ix-title">
          Hold the money.
          <br />
          Release it on proof.
        </h1>
        <p className="ix-lede">
          An agent buys. PayPal holds the funds. Nothing is captured until the parcel is
          confirmed at the right door.
        </p>
      </header>

      <nav className="ix-list" aria-label="Application sections">
        {MODULES.map((m) => (
          <Link key={m.no} href={m.href} className="ix-row">
            <span className="ix-no">{m.no}</span>
            <span className="ix-name">{m.name}</span>
            <span className="ix-line">{m.line}</span>
            <span className="ix-meta">{m.meta}</span>
            <span className="ix-go" aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>

      <footer className="ix-foot">
        <button type="button" className="ix-link" onClick={reset}>
          Reset data
        </button>
        {note && (
          <p className="ix-note" role="status">
            {note}
          </p>
        )}
      </footer>
    </div>
  );
}
