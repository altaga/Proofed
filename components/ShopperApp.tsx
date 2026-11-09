"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PayPalApprove } from "./PayPalApprove";

type ChatItem = { role: "user" | "assistant"; content: string };
type PublicOrder = {
  id: string;
  status: string;
  formatted_total: string;
  pickup_code: string | null;
  pickup_deadline_at: string | null;
  fulfillment_station: string;
  paypal_order_id: string | null;
  paypal_authorization_id: string | null;
  paypal_capture_id: string | null;
  failure_reason: string | null;
  items: Array<{ sku: string; name: string; qty: number; unit_price_cents: number; line_total_cents: number }>;
};

type Quote = {
  ok: boolean;
  errors?: string[];
  formatted_total: string;
  lines: Array<{ sku: string; name: string; qty: number; unit_price_cents: number; available: number }>;
};

export function ShopperApp() {
  const [config, setConfig] = useState<{ name: string; venueName: string; paypalClientId: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content:
        "Welcome. Tell me what you would like from the shop and your budget. I will look up live stock — I do not invent prices.",
    },
  ]);
  const [draft, setDraft] = useState("I have a $20 budget. Do you have a keychain?");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolTrace, setToolTrace] = useState<Array<{ name: string; ok: boolean }>>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load config"));
    const saved = window.localStorage.getItem("proofed.session");
    if (saved) setSessionId(saved);
  }, []);

  useEffect(() => {
    if (sessionId) window.localStorage.setItem("proofed.session", sessionId);
  }, [sessionId]);

  const needsPaypal = useMemo(
    () => Boolean(order && order.status === "CREATED" && order.paypal_order_id && config?.paypalClientId),
    [order, config],
  );

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setMessages((current) => [...current, { role: "user", content: message }]);
    setDraft("");
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Assistant request failed");
      }
      setSessionId(payload.sessionId);
      setMessages((current) => [...current, { role: "assistant", content: payload.reply }]);
      setToolTrace(payload.toolTrace || []);
      if (payload.quote) setQuote(payload.quote);
      if (payload.order) setOrder(payload.order);
      if (payload.replacement) setOrder(payload.replacement);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Assistant unavailable";
      setError(text);
      setMessages((current) => [
        ...current,
        { role: "assistant", content: text },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-2">
      <section className="card chat">
        <div className="transcript">
          {messages.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`bubble ${item.role}`}>
              {item.content}
            </div>
          ))}
        </div>
        {toolTrace.length > 0 && (
          <div className="pills">
            {toolTrace.map((item, index) => (
              <span key={`${item.name}-${index}`} className={`pill ${item.ok ? "ok" : "bad"}`}>
                {item.name}
              </span>
            ))}
          </div>
        )}
        <form className="composer" onSubmit={send}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="A keychain and a postcard, budget $25"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Working…" : "Send"}
          </button>
        </form>
      </section>

      <aside className="card">
        <h3>Live checkout</h3>
        {error && <div className="err">{error}</div>}
        {quote && (
          <div className="list">
            {quote.lines.map((line) => (
              <div className="row" key={line.sku}>
                <div>
                  <strong>{line.name}</strong>
                  <div className="mono">
                    {line.sku} × {line.qty} · {line.available} available
                  </div>
                </div>
                <div>${(line.unit_price_cents / 100).toFixed(2)}</div>
              </div>
            ))}
            <div className="row">
              <strong>Quote total</strong>
              <strong>{quote.formatted_total}</strong>
            </div>
            {!quote.ok && quote.errors?.map((item) => (
              <div key={item} className="err">{item}</div>
            ))}
          </div>
        )}
        {order && (
          <div className="detail" style={{ marginTop: 16 }}>
            <div>
              <span>Order</span> <span className="mono">{order.id}</span>
            </div>
            <div>
              Status <span className={`status ${order.status}`}>{order.status}</span>
            </div>
            <div>Total {order.formatted_total}</div>
            {order.paypal_order_id && (
              <div>
                PayPal order <span className="mono">{order.paypal_order_id}</span>
              </div>
            )}
            {order.paypal_authorization_id && (
              <div>
                Authorization <span className="mono">{order.paypal_authorization_id}</span>
              </div>
            )}
            {order.paypal_capture_id && (
              <div>
                Capture <span className="mono">{order.paypal_capture_id}</span>
              </div>
            )}
            {order.pickup_code && (
              <div className="oknote">
                Pickup code <div className="code">{order.pickup_code}</div>
                Show this at the pickup station. Capture happens only after handover evidence.
              </div>
            )}
            {order.failure_reason && <div className="err">{order.failure_reason}</div>}
          </div>
        )}
        {needsPaypal && order?.paypal_order_id && config && (
          <div style={{ marginTop: 16 }}>
            <p>Approve a PayPal authorization. Funds are held, not captured.</p>
            <PayPalApprove
              clientId={config.paypalClientId}
              orderId={order.id}
              paypalOrderId={order.paypal_order_id}
              onAuthorized={(next) => setOrder(next as PublicOrder)}
              onError={setError}
            />
          </div>
        )}
        {!quote && !order && (
          <p className="footer-note">
            Quotes and totals always come from the shop database. The assistant cannot set a price.
          </p>
        )}
      </aside>
    </div>
  );
}
