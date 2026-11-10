"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Send } from "lucide-react";
import { PayPalApprove } from "./PayPalApprove";
import { ProductCard, type CatalogProduct } from "./ProductCard";
import { AgentLog, type AgentStep } from "./AgentLog";
import { TransactionPanel } from "./TransactionPanel";
import { SafeMarkdown } from "./SafeMarkdown";
import { Toast } from "./Toast";

type ChatItem = {
  role: "user" | "assistant";
  content: string;
  toolTrace?: AgentStep[];
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
  created_at?: string;
  updated_at?: string;
  authorized_at?: string | null;
  delivered_at?: string | null;
  captured_at?: string | null;
  voided_at?: string | null;
  refunded_at?: string | null;
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

export function ShopperApp({ compact = false, showReceipt }: { compact?: boolean; showReceipt?: boolean }) {
  const receipt = showReceipt ?? !compact;
  const [config, setConfig] = useState<{ name: string; venueName: string; paypalClientId: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "What do you want from the shop, and what’s your budget?",
    },
  ]);
  const [draft, setDraft] = useState("I have a $20 budget. Do you have a keychain?");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const transRef = useRef<HTMLDivElement>(null);

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
    if (saved) {
      setSessionId(saved);
      fetch(`/api/agent/session?sessionId=${encodeURIComponent(saved)}`)
        .then((response) => response.json())
        .then((payload) => {
          if (Array.isArray(payload.messages) && payload.messages.length > 0) {
            setMessages(payload.messages.map((item: ChatItem) => ({
              role: item.role,
              content: item.content,
              toolTrace: item.toolTrace,
            })));
          }
        })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (sessionId) window.localStorage.setItem("shop.session", sessionId);
  }, [sessionId]);

  useEffect(() => {
    const node = transRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

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
    <div className={compact ? "compact" : undefined}>
      <div className={receipt ? "shop-layout" : undefined}>
        <section className="card chat">
          <div className="transcript" ref={transRef}>
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`}>
                <div className={`bubble ${item.role}`}>{item.role === "assistant" ? <SafeMarkdown text={item.content} /> : item.content}</div>
                {item.role === "assistant" && item.toolTrace ? <AgentLog steps={item.toolTrace} /> : null}
              </div>
            ))}
            {busy && <AgentLog busy />}
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

        {receipt && (
          <aside>
            <TransactionPanel order={order} quote={quote} venueName={config?.venueName} />
            {quote && (
              <div className="card" style={{ marginTop: 10 }}>
                <h3>Quote lines</h3>
                <div className="list">
                  {quote.lines.map((line) => (
                    <div className="row" key={line.sku}>
                      <div>
                        <strong>{line.name}</strong>
                        <div className="mono">{line.sku} × {line.qty} · {line.available} available</div>
                      </div>
                      <div className="mono">${(line.unit_price_cents / 100).toFixed(2)}</div>
                    </div>
                  ))}
                  <div className="row">
                    <strong>Total</strong>
                    <strong className="mono">{quote.formatted_total}</strong>
                  </div>
                  {!quote.ok && quote.errors?.map((item) => (
                    <div key={item} className="err">{item}</div>
                  ))}
                </div>
              </div>
            )}
            {order?.pickup_code && (
              <div className="oknote" style={{ marginTop: 10 }}>
                Pickup code <div className="code">{order.pickup_code}</div>
                Show this at Pickup after the hold is placed.
              </div>
            )}
            {needsPaypal && order?.paypal_order_id && config && (
              <div className="paypal-box">
                <p>Approve the PayPal authorization. Funds are held, not captured.</p>
                <PayPalApprove
                  clientId={config.paypalClientId}
                  orderId={order.id}
                  paypalOrderId={order.paypal_order_id}
                  onAuthorized={(next) => {
                    setOrder(next as PublicOrder);
                    setToast("Hold placed on the shopper’s PayPal");
                    window.setTimeout(() => setToast(null), 3500);
                  }}
                  onError={setError}
                />
              </div>
            )}
          </aside>
        )}
      </div>

      <Toast message={toast} tone="hold" />

      {!compact && (
        <section className="card" style={{ marginTop: 14 }}>
          <h3>Shelf</h3>
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
      )}
    </div>
  );
}
