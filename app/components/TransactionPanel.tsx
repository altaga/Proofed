"use client";

import { useEffect, useState } from "react";
import {
  buildTxSteps,
  compactStatus,
  formatWhen,
  friendlyStepLabel,
  itemLine,
  moneyKind,
  moneySentence,
  type TxEvent,
  type TxOrder,
  type TxQuote,
} from "./tx-model";

function Copyable({ value, href }: { value: string; href?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copyable">
      {href ? (
        <a className="mono" href={href} title={value} target="_blank" rel="noreferrer">{value}</a>
      ) : (
        <span className="mono" title={value}>{value}</span>
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
  expanded = false,
}: {
  order?: TxOrder | null;
  quote?: TxQuote | null;
  events?: TxEvent[];
  venueName?: string;
  compact?: boolean;
  expanded?: boolean;
}) {
  const [fetchedEvents, setFetchedEvents] = useState<TxEvent[]>([]);
  const [open, setOpen] = useState(expanded);

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
  const amount = order?.formatted_total || quote?.formatted_total || "";
  const summary = compactStatus(order, quote);
  const tail = amount && summary.startsWith(amount) ? summary.slice(amount.length).replace(/^\s*·\s*/, "") : summary;

  return (
    <section
      className={`tx-panel${compact ? " compact" : ""}`}
      data-testid="transaction-panel"
      data-money={kind}
      aria-label="Transaction"
    >
      <div className="tx-pill">
        {amount ? <span className="tx-amount">{amount}</span> : null}
        <span className="tx-pill-copy">{tail || summary}</span>
        {(order || quote) && (
          <button type="button" className="link-btn" onClick={() => setOpen((value) => !value)}>
            {open ? "Hide receipt" : "View receipt"}
          </button>
        )}
      </div>

      {order?.status === "AUTHORIZED" && (
        <div className="financial-alert alert-hold" role="status">
          <div className="financial-alert-badge">Hold active · $0.00 charged</div>
          <div className="financial-alert-text">
            PayPal authorized a hold of <strong>{amount}</strong>. No funds are captured until doorstep delivery is verified.
          </div>
        </div>
      )}

      {order?.status === "CAPTURED" && (
        <div className="financial-alert alert-captured" role="status">
          <div className="financial-alert-badge">Captured after handoff</div>
          <div className="financial-alert-text">
            <strong>{amount}</strong> was captured after physical handoff was recorded.
          </div>
        </div>
      )}

      {order?.status === "DELIVERY_FAILED" && (
        <div className="financial-alert alert-failed" role="status">
          <div className="financial-alert-badge">Handoff failed · $0.00 charged</div>
          <div className="financial-alert-text">
            Delivery issue ({order.failure_reason || "address mismatch"}). <strong>{amount}</strong> remains held without charge. You can re-dispatch or release the hold.
          </div>
        </div>
      )}

      {order?.status === "VOIDED" && (
        <div className="financial-alert alert-voided" role="status">
          <div className="financial-alert-badge">Hold released · $0.00 charged</div>
          <div className="financial-alert-text">
            The PayPal authorization was voided and the buyer was not charged.
          </div>
        </div>
      )}

      {open && (
        <div className="tx-details">
          <p>{itemLine(order, quote)}</p>
          {venueName ? <p className="tx-note">{venueName}</p> : null}
          <p>{moneySentence(order, quote)}</p>
          {order ? <p><span className={`status ${order.status}`}>{order.status}</span></p> : null}
          {steps.length > 0 && (
            <ol className="tx-stepper" aria-label="Payment steps">
              {steps.map((step) => (
                <li key={step.key} className={`tx-step ${step.state}`} data-key={step.key}>
                  <strong>{friendlyStepLabel(step, amount)}</strong>
                  <div className="tx-meta">
                    {step.timestamp ? <time dateTime={step.timestamp}>{formatWhen(step.timestamp)}</time> : <span>Waiting</span>}
                    {step.actor ? <span> · {step.actor}</span> : null}
                  </div>
                  {step.paypalId && step.paypalHref ? <Copyable value={step.paypalId} href={step.paypalHref} /> : null}
                </li>
              ))}
            </ol>
          )}
          {order?.pickup_code && (
            <div className="tx-ids">
              Recipient PIN <Copyable value={order.pickup_code} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
