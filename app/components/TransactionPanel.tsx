"use client";

import { useEffect, useState } from "react";
import { sandboxOrderUrl, sandboxPaymentUrl } from "@/lib/sandbox-links";
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

  const lineItems =
    order?.items && order.items.length > 0
      ? order.items
      : quote?.lines && quote.lines.length > 0
        ? quote.lines
        : null;

  const hubName =
    venueName && !venueName.toLowerCase().includes("dome")
      ? venueName
      : "Proofed Autonomous Commerce Hub";

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
          <div className="tx-receipt-card">
            <div className="tx-hub-meta">
              <div>
                <span className="tx-hub-name">{hubName}</span>
                <span className="tx-hub-station"> · Silicon Valley Station #744</span>
              </div>
              {order ? <span className={`status ${order.status}`}>{order.status}</span> : null}
            </div>

            {lineItems && lineItems.length > 0 ? (
              <table className="tx-line-items" aria-label="Order line items">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th style={{ textAlign: "center", width: "40px" }}>Qty</th>
                    <th style={{ textAlign: "right", width: "70px" }}>Price</th>
                    <th style={{ textAlign: "right", width: "75px" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((it, idx) => {
                    const unitCents = it.unit_price_cents ?? 0;
                    const totalCents = unitCents * it.qty;
                    return (
                      <tr key={it.sku || idx}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{it.name}</div>
                          {it.sku ? <span className="tx-item-sku">SKU: {it.sku}</span> : null}
                        </td>
                        <td style={{ textAlign: "center", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                          {it.qty}
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                          {unitCents > 0 ? `$${(unitCents / 100).toFixed(2)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700, fontFamily: "var(--font-mono), ui-monospace, monospace" }}>
                          {totalCents > 0 ? `$${(totalCents / 100).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p>{itemLine(order, quote)}</p>
            )}

            <div className="tx-financial-summary">
              <div className="tx-summary-row">
                <span>Items Subtotal</span>
                <span className="mono">{amount || "—"}</span>
              </div>
              <div className="tx-summary-row">
                <span>Doorstep Courier Delivery</span>
                <span className="mono">$0.00 (Free Escrow)</span>
              </div>
              <div className="tx-summary-row">
                <span>Estimated Tax (Inclusive)</span>
                <span className="mono">$0.00</span>
              </div>
              <div className="tx-summary-row total">
                <span>Total Authorization</span>
                <span className="mono">{amount || "—"}</span>
              </div>
            </div>

            <div className="tx-escrow-badge">
              <strong>PayPal Authorization Protocol:</strong> Funds ({amount || "$0.00"}) are held in escrow under <code>intent=AUTHORIZE</code>. No money is transferred until the courier confirms physical doorstep handover with PIN verification.
            </div>
          </div>

          <p className="tx-money-sentence">{moneySentence(order, quote)}</p>

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

          <div className="tx-ids">
            <div>
              <strong>Delivery Destination:</strong> 744 North Capitol Ave (Doorstep Courier)
            </div>
            {order?.pickup_code ? (
              <div>
                <strong>Recipient PIN:</strong> <Copyable value={order.pickup_code} />
              </div>
            ) : null}
            {order?.paypal_order_id ? (
              <div>
                <strong>PayPal Order ID:</strong>{" "}
                <Copyable value={order.paypal_order_id} href={sandboxOrderUrl(order.paypal_order_id)} />
              </div>
            ) : null}
            {order?.paypal_authorization_id ? (
              <div>
                <strong>PayPal Authorization ID:</strong>{" "}
                <Copyable value={order.paypal_authorization_id} href={sandboxPaymentUrl(order.paypal_authorization_id)} />
              </div>
            ) : null}
            {order?.paypal_capture_id ? (
              <div>
                <strong>PayPal Capture ID:</strong>{" "}
                <Copyable value={order.paypal_capture_id} href={sandboxPaymentUrl(order.paypal_capture_id)} />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
