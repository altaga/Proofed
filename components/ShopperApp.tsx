"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RotateCcw, Send } from "lucide-react";
import { PayPalApprove } from "./PayPalApprove";
import { ProductCard, type CatalogProduct } from "./ProductCard";
import { OrderTimeline } from "./OrderTimeline";
import { ToolSteps, type ToolStep } from "./ToolSteps";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolStep[];
};

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
  paypal_refund_id?: string | null;
  failure_reason: string | null;
  items: Array<{ sku: string; name: string; qty: number; unit_price_cents: number; line_total_cents: number }>;
};

type Quote = {
  ok: boolean;
  errors?: string[];
  formatted_total: string;
  lines: Array<{ sku: string; name: string; qty: number; unit_price_cents: number; available: number }>;
};

const PROMPTS = [
  "I have a $20 budget. Do you have a keychain?",
  "Is the water bottle in stock?",
  "Checkout the enamel pin if it fits a $20 budget.",
];

export function ShopperApp() {
  const [config, setConfig] = useState<{ name: string; venueName: string; paypalClientId: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content:
        "Welcome. Tell me what you would like from the shop and your budget. I look up live stock and prices — I never invent them.",
    },
  ]);
  const [draft, setDraft] = useState("I have a $20 budget. Do you have a keychain?");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then(setConfig)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load config"));
    fetch("/api/catalog")
      .then((response) => response.json())
      .then((payload) => setCatalog(payload.items || []))
      .catch(() => undefined);
    const saved = window.localStorage.getItem("shop.session");
    if (saved) setSessionId(saved);
  }, []);

  useEffect(() => {
    if (sessionId) window.localStorage.setItem("shop.session", sessionId);
  }, [sessionId]);

  const needsPaypal = useMemo(
    () => Boolean(order && order.status === "CREATED" && order.paypal_order_id && config?.paypalClientId),
    [order, config],
  );

  async function sendMessage(message: string) {
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setLastUserMessage(message);
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
      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.reply, toolTrace: payload.toolTrace || [] },
      ]);
      if (payload.quote) setQuote(payload.quote);
      if (payload.order) setOrder(payload.order);
      if (payload.replacement) setOrder(payload.replacement);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Assistant unavailable";
      setError(text);
      setMessages((current) => [...current, { role: "assistant", content: text }]);
    } finally {
      setBusy(false);
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    await sendMessage(draft.trim());
  }

  return (
    <div>
      <div className="grid-2">
        <section className="card chat">
          <div className="transcript">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`}>
                <div className={`bubble ${item.role}`}>{item.content}</div>
                {item.role === "assistant" && item.toolTrace ? <ToolSteps steps={item.toolTrace} /> : null}
              </div>
            ))}
            {busy && (
              <div className="tool-step">
                <div className="icon-wrap"><LoaderCircle size={18} className="spin" /></div>
                <div>
                  <strong className="loading-dots">Working against live catalog and PayPal</strong>
                  <span>The model can only pass SKUs. Amounts come from the database.</span>
                </div>
              </div>
            )}
          </div>
          <div className="prompt-row">
            {PROMPTS.map((prompt) => (
              <button key={prompt} type="button" className="prompt-chip" onClick={() => setDraft(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
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
            <button className="primary lg" type="submit" disabled={busy}>
              {busy ? <LoaderCircle size={18} /> : <Send size={18} />}
              {busy ? "Working" : "Send"}
            </button>
          </form>
          {error && (
            <div className="err" style={{ marginTop: 8 }}>
              {error}
              {lastUserMessage && (
                <div className="actions">
                  <button className="ghost" type="button" onClick={() => void sendMessage(lastUserMessage)}>
                    <RotateCcw size={16} /> Retry last message
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="card">
          <h3>Live checkout</h3>
          {quote && (
            <div className="list">
              {quote.lines.map((line) => (
                <div className="row" key={line.sku}>
                  <div>
                    <strong>{line.name}</strong>
                    <div className="mono">{line.sku} × {line.qty} · {line.available} available</div>
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
              <OrderTimeline status={order.status} />
              <div><span>Order</span> <span className="mono">{order.id}</span></div>
              <div>Status <span className={`status ${order.status}`}>{order.status}</span></div>
              <div>Total {order.formatted_total}</div>
              {order.items?.length > 0 && (
                <div>{order.items.map((item) => `${item.name} × ${item.qty}`).join(", ")}</div>
              )}
              {order.paypal_order_id && (
                <div>PayPal order <span className="mono">{order.paypal_order_id}</span></div>
              )}
              {order.paypal_authorization_id && (
                <div>Authorization <span className="mono">{order.paypal_authorization_id}</span></div>
              )}
              {order.paypal_capture_id && (
                <div>Capture <span className="mono">{order.paypal_capture_id}</span></div>
              )}
              {order.paypal_refund_id && (
                <div>Refund <span className="mono">{order.paypal_refund_id}</span></div>
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
            <div className="paypal-box">
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

      <section className="card" style={{ marginTop: 22 }}>
        <h3>Live shelf</h3>
        <p className="footer-note" style={{ marginTop: 0 }}>
          Artwork is local. Prices and stock are read from SQLite on every request.
        </p>
        <div className="product-grid">
          {catalog.map((item) => (
            <ProductCard
              key={item.sku}
              item={item}
              onSelect={(picked) => setDraft(`I'd like the ${picked.name} (${picked.sku}) if it fits a $20 budget.`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
