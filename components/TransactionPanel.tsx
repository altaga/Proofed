"use client";

import { useEffect, useState } from "react";
import { Bot, CreditCard, Store, TabletSmartphone, User } from "lucide-react";
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

function actorKey(actor?: string) {
  const value = (actor || "").toLowerCase();
  if (value.includes("paypal")) return "paypal";
  if (value.includes("shopper")) return "shopper";
  if (value.includes("kiosk") || value.includes("device")) return "kiosk";
  if (value.includes("merchant")) return "merchant";
  if (value.includes("agent")) return "agent";
  return "backend";
}

function ActorBadge({ actor }: { actor?: string }) {
  if (!actor) return null;
  const key = actorKey(actor);
  const Icon = key === "paypal" ? CreditCard : key === "shopper" ? User : key === "kiosk" ? TabletSmartphone : key === "merchant" ? Store : key === "agent" ? Bot : Store;
  return (
    <span className="actor">
      <span className={`avatar ${key}`} aria-hidden="true"><Icon size={10} /></span>
      {actor}
    </span>
  );
}

function shortenId(value: string, compact?: boolean) {
  if (!compact || value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function Copyable({ value, href, compact }: { value: string; href?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const shown = shortenId(value, compact);
  return (
    <span className="copyable">
      {href ? (
        <a className="linkish mono" href={href} title={value} target="_blank" rel="noreferrer">{shown}</a>
      ) : (
        <span className="mono" title={value}>{shown}</span>
      )}
      <button
        type="button"
        className="copy-btn"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

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

  const quoteSteps = [
    { key: "quote", label: "Quote", state: "current", actor: "Agent" },
    { key: "hold", label: "Hold placed", state: "pending" },
    { key: "handover", label: "Handover verified", state: "pending" },
    { key: "captured", label: "Captured", state: "pending" },
  ];

  return (
    <section
      className={`tx-panel${compact ? " compact" : ""}`}
      data-testid="transaction-panel"
      data-money={kind}
      aria-label="Transaction"
    >
      <div className="tx-kicker">
        <span>Transaction</span>
        {order ? <span className={`status ${order.status}`}>{order.status}</span> : quote ? <span className="status CREATED">Quoted</span> : null}
      </div>
      <div className="tx-amount">{amount}</div>
      <div className="tx-item">{itemLine(order, quote)}</div>
      <div className="tx-merchant">{venueName || "Merchant"}</div>
      <p className="tx-money">{moneySentence(order, quote)}</p>

      {!order && !quote && (
        <div className="empty-receipt" style={{ boxShadow: "none", padding: "8px 0 0" }}>
          <div className="empty-visual" aria-hidden="true" />
        </div>
      )}

      {order && (
        <ol className="tx-stepper" aria-label="Payment steps">
          {steps.map((step) => (
            <li key={step.key} className={`tx-step ${step.state} ${step.key}`} data-key={step.key}>
              <span className="tx-dot" aria-hidden="true" />
              <div>
                <strong>{step.label}</strong>
                <div className="tx-meta">
                  {step.timestamp ? <time dateTime={step.timestamp}>{formatWhen(step.timestamp)}</time> : <span>Pending</span>}
                  <ActorBadge actor={step.actor} />
                </div>
                {step.paypalId && step.paypalHref ? <Copyable value={step.paypalId} href={step.paypalHref} compact={compact} /> : null}
                {step.note ? <div className="tx-note">{step.note}</div> : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {!order && quote && (
        <ol className="tx-stepper" aria-label="Payment steps">
          {quoteSteps.map((step) => (
            <li key={step.key} className={`tx-step ${step.state} ${step.key}`} data-key={step.key}>
              <span className="tx-dot" aria-hidden="true" />
              <div>
                <strong>{step.label}</strong>
                <div className="tx-meta">
                  <span>{step.state === "current" ? "Now" : "Pending"}</span>
                  {step.actor ? <ActorBadge actor={step.actor} /> : null}
                </div>
                {step.key === "quote" ? <div className="tx-note">Priced from the catalog, not the model</div> : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {order?.pickup_code && (
        <div className="tx-ids">
          Pickup code <Copyable value={order.pickup_code} compact={compact} />
        </div>
      )}
    </section>
  );
}
