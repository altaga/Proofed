"use client";

import { useEffect, useState } from "react";
import {
  buildTxSteps,
  formatWhen,
  itemLine,
  moneyKind,
  moneySentence,
  type TxEvent,
  type TxOrder,
  type TxQuote,
} from "./tx-model";

export function TransactionPanel({
  order,
  quote,
  events: providedEvents,
  venueName,
  compact = false,
}: {
  order?: TxOrder | null;
  quote?: TxQuote | null;
  events?: TxEvent[];
  venueName?: string;
  compact?: boolean;
}) {
  const [fetchedEvents, setFetchedEvents] = useState<TxEvent[]>([]);

  useEffect(() => {
    if (providedEvents || !order?.id) {
      setFetchedEvents([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/orders/${order.id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && Array.isArray(payload.events)) setFetchedEvents(payload.events);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [order?.id, order?.status, order?.updated_at, providedEvents]);

  const events = providedEvents ?? fetchedEvents;

  const kind = moneyKind(order?.status) === "none" && quote ? "quoted" : moneyKind(order?.status);
  const steps = order ? buildTxSteps(order, events) : [];
  const amount = order?.formatted_total || quote?.formatted_total || "—";

  return (
    <section
      className={`tx-panel${compact ? " compact" : ""}`}
      data-testid="transaction-panel"
      data-money={kind}
      aria-label="Transaction"
    >
      <div className="tx-kicker">
        <span>Transaction</span>
        {order ? <span className={`status ${order.status}`}>{order.status}</span> : quote ? <span className="status CREATED">QUOTE</span> : null}
      </div>
      <div className="tx-amount">{amount}</div>
      <div className="tx-item">{itemLine(order, quote)}</div>
      <div className="tx-merchant">{venueName || "Merchant"}</div>
      <p className={`tx-money${order || quote ? "" : " tx-empty"}`}>{moneySentence(order, quote)}</p>

      {order && (
        <ol className="tx-stepper" aria-label="Payment steps">
          {steps.map((step) => (
            <li key={step.key} className={`tx-step ${step.state} ${step.key}`} data-key={step.key}>
              <span className="tx-dot" aria-hidden="true" />
              <div>
                <strong>{step.label}</strong>
                <div className="tx-meta">
                  {step.timestamp ? <time dateTime={step.timestamp}>{formatWhen(step.timestamp)}</time> : <span>Pending</span>}
                  {step.actor ? <span>{step.actor}</span> : null}
                </div>
                {step.paypalId && step.paypalHref ? (
                  <a className="linkish mono" href={step.paypalHref} target="_blank" rel="noreferrer">
                    {step.paypalId}
                  </a>
                ) : null}
                {step.note ? <div className="tx-note">{step.note}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {order?.pickup_code && (
        <div className="tx-ids">
          Pickup code <span className="mono">{order.pickup_code}</span>
        </div>
      )}
    </section>
  );
}
