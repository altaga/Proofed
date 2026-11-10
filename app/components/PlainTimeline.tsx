"use client";

import { useEffect, useState } from "react";
import { formatWhen, storyEvents, type TxEvent, type TxOrder } from "./tx-model";

export function PlainTimeline({ order }: { order: TxOrder | null }) {
  const [events, setEvents] = useState<TxEvent[]>([]);

  useEffect(() => {
    if (!order?.id) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/orders/${order.id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && Array.isArray(payload.events)) setEvents(payload.events);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [order?.id, order?.status, order?.updated_at]);

  if (!order) {
    return (
      <section className="plain-timeline">
        <p className="lede">Shop on the left, pick up on the right. The story of the payment appears here.</p>
      </section>
    );
  }

  return (
    <section className="plain-timeline" aria-label="What happened">
      <h3>What happened</h3>
      {events.length === 0 ? (
        <p className="lede">{order.formatted_total} · waiting for the next step.</p>
      ) : (
        <ol>
          {storyEvents(events, order.formatted_total).map((item) => (
            <li key={item.id ?? `${item.event}-${item.created_at}`} className="agent-step">
              {item.text}
              <time dateTime={item.created_at}>{formatWhen(item.created_at)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
