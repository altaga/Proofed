"use client";

import { useEffect, useState } from "react";
import { ShopperApp } from "./ShopperApp";
import { DeviceKiosk } from "./DeviceKiosk";
import { PlainTimeline } from "./PlainTimeline";
import type { TxOrder } from "./tx-model";

export function DemoGuide({ venueName }: { name?: string; tagline?: string; venueName: string }) {
  const [latest, setLatest] = useState<TxOrder | null>(null);

  useEffect(() => {
    const load = async () => {
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
    };
    load().catch(() => undefined);
    const timer = setInterval(() => {
      load().catch(() => undefined);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <section className="page-head">
        <h2>Presenter</h2>
        <p className="lede">
          Shop on the left. Pickup on the right. {venueName ? `${venueName}.` : ""}
        </p>
      </section>
      <div className="presenter-grid">
        <section className="presenter-pane">
          <h3>Shop</h3>
          <ShopperApp compact />
        </section>
        <section className="presenter-pane">
          <h3>Pickup</h3>
          <DeviceKiosk compact />
        </section>
      </div>
      <PlainTimeline order={latest} />
    </div>
  );
}
