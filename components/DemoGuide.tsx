"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Store, TabletSmartphone, LayoutDashboard } from "lucide-react";

type PublicOrder = {
  id: string;
  status: string;
  formatted_total: string;
  failure_reason: string | null;
  items: Array<{ name: string; sku: string }>;
};

const SUCCESS = [
  { id: "ask", label: "In Shop, ask for a keychain with a $20 budget." },
  { id: "quote", label: "The assistant looks up live stock and quotes $12.00 — not a guessed price." },
  { id: "approve", label: "Approve the PayPal Smart Button (intent AUTHORIZE)." },
  { id: "authorized", label: "Shop shows AUTHORIZED and a pickup code." },
  { id: "capture", label: "On Pickup, enter the code and confirm handover." },
  { id: "captured", label: "Status becomes CAPTURED. Merchant shows the capture id and evidence." },
];

const FAILURE = [
  { id: "oos", label: "Ask for SKU DC-BTL-01. The water bottle is seeded with zero stock." },
  { id: "pin", label: "Checkout an enamel pin instead and approve PayPal." },
  { id: "jam", label: "On Pickup, choose Station jam and report delivery failure." },
  { id: "failed", label: "Status is DELIVERY_FAILED; the authorization is still held." },
  { id: "sub", label: "Choose a substitute within budget, or ask the assistant to recover." },
  { id: "voided", label: "The original hold is VOIDED and a new AUTHORIZE order is created." },
];

export function DemoGuide({ name, venueName }: { name: string; tagline?: string; venueName: string }) {
  const [orders, setOrders] = useState<PublicOrder[]>([]);

  useEffect(() => {
    const load = async () => {
      const response = await fetch("/api/orders");
      const payload = await response.json();
      if (response.ok) setOrders(payload.orders || []);
    };
    load().catch(() => undefined);
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const has = (status: string) => orders.some((order) => order.status === status);
  const hasSku = (sku: string) => orders.some((order) => order.items?.some((item) => item.sku === sku));
  const hasFailure = (reason: string) => orders.some((order) => order.failure_reason === reason);

  const successDone = {
    ask: orders.length > 0 || hasSku("DC-KEY-01"),
    quote: hasSku("DC-KEY-01") || has("CREATED") || has("AUTHORIZED") || has("CAPTURED"),
    approve: has("APPROVED") || has("AUTHORIZED") || has("CAPTURED") || has("VOIDED") || has("REFUNDED"),
    authorized: has("AUTHORIZED") || has("CAPTURED") || has("DELIVERY_FAILED") || has("VOIDED") || has("REFUNDED"),
    capture: has("DELIVERY_CONFIRMED") || has("CAPTURED") || has("REFUNDED"),
    captured: has("CAPTURED") || has("REFUNDED"),
  };

  const failureDone = {
    oos: false,
    pin: hasSku("DC-PIN-01"),
    jam: hasFailure("jam") || hasFailure("out_of_stock") || hasFailure("item_damaged"),
    failed: has("DELIVERY_FAILED") || has("VOIDED"),
    sub: has("VOIDED") && orders.some((order) => order.status === "CREATED" || order.status === "AUTHORIZED"),
    voided: has("VOIDED"),
  };

  return (
    <div>
      <section className="hero">
        <p className="kicker">PayPal AI Hackathon · live sandbox</p>
        <h2>
          Authorize now. Capture only after <span className="em">proof of handover</span>.
        </h2>
        <p>
          {name} is the accountability loop for agentic commerce at {venueName}. An assistant can pick a souvenir;
          PayPal holds the money; the pickup station decides whether that hold becomes a capture, a void, or a substitute.
        </p>
        <div className="actions">
          <Link href="/" className="primary lg" style={{ textDecoration: "none" }}>Open the shop <ArrowRight size={16} /></Link>
          <Link href="/device" className="ghost lg" style={{ textDecoration: "none" }}>Pickup station</Link>
          <Link href="/merchant" className="ghost lg" style={{ textDecoration: "none" }}>Merchant desk</Link>
        </div>
      </section>

      <div className="step-row">
        <article className="card step-card">
          <div className="step-num">1</div>
          <Store size={22} />
          <h3>Shop holds, does not capture</h3>
          <p>The assistant searches the live catalog and creates a PayPal Orders v2 payment with intent AUTHORIZE.</p>
        </article>
        <article className="card step-card">
          <div className="step-num">2</div>
          <TabletSmartphone size={22} />
          <h3>Pickup records proof</h3>
          <p>A kiosk page captures only after a valid pickup code and handover note. A jam leaves the hold in place.</p>
        </article>
        <article className="card step-card">
          <div className="step-num">3</div>
          <LayoutDashboard size={22} />
          <h3>Merchant sees the truth</h3>
          <p>AG Grid, KPIs, and an append-only event log track every PayPal id. Reconcile syncs with GET, not guesses.</p>
        </article>
      </div>

      <section className="card" style={{ marginBottom: 22 }}>
        <h3>Demo guide</h3>
        <p>Present success and failure side by side. Checks flip as live orders change — nothing here is scripted theater.</p>
        <div className="guide-cols" style={{ marginTop: 16 }}>
          <div>
            <h3>Success path</h3>
            <div className="checklist">
              {SUCCESS.map((step) => (
                <div key={step.id} className={`check-item${successDone[step.id as keyof typeof successDone] ? " done" : ""}`}>
                  <span className="check" />
                  <div>{step.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>Failure and substitute</h3>
            <div className="checklist">
              {FAILURE.map((step) => (
                <div key={step.id} className={`check-item${failureDone[step.id as keyof typeof failureDone] ? " done" : ""}`}>
                  <span className="check" />
                  <div>{step.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {orders[0] && (
          <p className="footer-note">
            Latest live order <span className="mono">{orders[0].id}</span> is{" "}
            <span className={`status ${orders[0].status}`}>{orders[0].status}</span> · {orders[0].formatted_total}
          </p>
        )}
      </section>
    </div>
  );
}
