"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RotateCcw, Send } from "lucide-react";
import { PayPalApprove } from "./PayPalApprove";
import { ProductCard, type CatalogProduct } from "./ProductCard";
import { ProductThumbnail } from "./ProductThumbnail";
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

export function ShopperApp({
  compact = false,
  showReceipt,
  onOrderChange,
}: {
  compact?: boolean;
  showReceipt?: boolean;
  onOrderChange?: (order: PublicOrder | null) => void;
}) {
  const receipt = showReceipt ?? true;
  const [config, setConfig] = useState<{ name: string; venueName: string; paypalClientId: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      content: "I'm your venue shopping agent. State what you'd like and your budget, and I'll look up catalog items with verified pricing.",
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
  const [authorizingHold, setAuthorizingHold] = useState(false);
  const transRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (onOrderChange) onOrderChange(order);
  }, [order, onOrderChange]);

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
            const next = payload.messages.map((item: ChatItem) => ({
              role: item.role,
              content: item.content,
              toolTrace: item.toolTrace,
            }));
            setMessages(next);
            setDraft("");
          }
        })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (sessionId) window.localStorage.setItem("shop.session", sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (quote || !catalog.length) return;
    const text = messages.flatMap((item) => item.toolTrace || []).map((step) => `${step.outcome || ""} ${step.summary || ""}`).join(" ");
    const found = catalog.find((item) => text.includes(item.name));
    if (!found) return;
    const cents = Math.round(Number(found.formatted_price.replace(/[^0-9.]/g, "")) * 100);
    setQuote({
      ok: true,
      formatted_total: found.formatted_price,
      lines: [{ sku: found.sku, name: found.name, qty: 1, unit_price_cents: cents, available: found.available }],
    });
  }, [messages, catalog, quote]);

  useEffect(() => {
    const node = transRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy, quote, order]);

  const needsPaypal = useMemo(
    () => Boolean(order && order.status === "CREATED" && order.paypal_order_id && config?.paypalClientId),
    [order, config],
  );

  const lastAssistant = [...messages].reverse().findIndex((item) => item.role === "assistant");
  const lastAssistantIndex = lastAssistant === -1 ? -1 : messages.length - 1 - lastAssistant;
  const quoted = quote?.lines?.[0];

  useEffect(() => {
    if (!quoted || order) return;
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ sku: quoted.sku, qty: 1 }],
        note: "Staged quote for buyer approval",
        actor: "shopper",
        autoAuthorize: false,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.order) setOrder(data.order);
      })
      .catch(() => undefined);
  }, [quoted, order]);

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
      {receipt ? <TransactionPanel order={order} quote={quote} venueName={config?.venueName} /> : null}

      <section className="chat">
        <div className="transcript" ref={transRef}>
          {messages.map((item, index) => (
            <div key={`${item.role}-${index}`}>
              <div className={`bubble ${item.role}`}>{item.role === "assistant" ? <SafeMarkdown text={item.content} /> : item.content}</div>
              {item.role === "assistant" && item.toolTrace ? <AgentLog steps={item.toolTrace} /> : null}
              {index === lastAssistantIndex && quoted ? (
                <div className="product-card quote-card">
                  <ProductThumbnail sku={quoted.sku} name={quoted.name} className="quote-card-thumb" />
                  <div>
                    <strong>{quoted.name}</strong>
                    <div className="price">${(quoted.unit_price_cents / 100).toFixed(2)}</div>
                    {needsPaypal && order && (
                      <div className="quote-paypal-area" style={{ marginTop: 12 }}>
                        {config?.paypalClientId && order.paypal_order_id ? (
                          <div className="paypal-smart-button-container" style={{ width: "100%", maxWidth: "340px", margin: "0 auto" }}>
                            <PayPalApprove
                              clientId={config.paypalClientId}
                              orderId={order.id}
                              paypalOrderId={order.paypal_order_id}
                              onAuthorized={(authOrder) => {
                                setOrder(authOrder as PublicOrder);
                                setToast("PayPal hold active — verified on PayPal Sandbox");
                                window.setTimeout(() => setToast(null), 3500);
                              }}
                              onError={(err) => {
                                console.error("PayPal Smart Button error:", err);
                              }}
                            />
                            <div className="hold-disclaimer" style={{ marginTop: 4 }}>
                              <span>intent=AUTHORIZE · Real PayPal Sandbox Hold · $0.00 charged until delivery</span>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="approve-paypal-hold-btn"
                            disabled={authorizingHold}
                            onClick={async () => {
                              if (authorizingHold) return;
                              setAuthorizingHold(true);
                              try {
                                const res = await fetch("/api/paypal/authorize", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ orderId: order.id, simulateApproval: true }),
                                });
                                const data = await res.json();
                                if (data.order) {
                                  setOrder(data.order as PublicOrder);
                                  setToast("PayPal placed a hold — pick up when you’re ready");
                                  window.setTimeout(() => setToast(null), 3500);
                                }
                              } catch (e) {
                                console.error(e);
                              } finally {
                                setAuthorizingHold(false);
                              }
                            }}
                          >
                            <div className="btn-paypal-left">
                              <svg
                                className="paypal-btn-monogram"
                                viewBox="0 0 24 24"
                                width="20"
                                height="20"
                                aria-hidden="true"
                              >
                                <path
                                  fill="#003087"
                                  d="M20.067 8.478c-.492.88-1.22 1.458-2.203 1.761-.986.306-2.222.306-3.708.306H12.5l-1.3 8.243h-2.94L10.3 3.5h5.8c1.378 0 2.45.244 3.218.732.767.489 1.05 1.346.749 2.571-.052.212-.128.438-.228.675z"
                                />
                                <path
                                  fill="#0079C1"
                                  d="M18.8 9.5c-.3 1.8-1.5 2.8-3.4 2.8h-1.8l-.8 5.2h-2.5l2-12.8h4.5c1.7 0 2.7.5 2.5 2.2-.1.9-.3 1.7-.5 2.6z"
                                />
                              </svg>
                              <span className="paypal-btn-brand-title">
                                <span className="paypal-logo-text"><span className="pay-blue">Pay</span><span className="pal-blue">Pal</span></span>
                                <span className="paypal-hold-label">
                                  {authorizingHold ? "Authorizing Hold…" : "Approve Hold"}
                                </span>
                              </span>
                            </div>
                            <span className="btn-paypal-amt mono">${(quoted.unit_price_cents / 100).toFixed(2)}</span>
                          </button>
                        )}

                        {config?.paypalClientId && order.paypal_order_id && (
                          <button
                            type="button"
                            className="instant-demo-auth-btn mono"
                            disabled={authorizingHold}
                            onClick={async () => {
                              if (authorizingHold) return;
                              setAuthorizingHold(true);
                              try {
                                const res = await fetch("/api/paypal/authorize", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ orderId: order.id, simulateApproval: true }),
                                });
                                const data = await res.json();
                                if (data.order) {
                                  setOrder(data.order as PublicOrder);
                                  setToast("PayPal placed a hold — pick up when you’re ready");
                                  window.setTimeout(() => setToast(null), 3500);
                                }
                              } catch (e) {
                                console.error(e);
                              } finally {
                                setAuthorizingHold(false);
                              }
                            }}
                            title="Bypasses PayPal popup login for quick offline demonstration"
                          >
                            ⚡ Fast Demo: 1-Click Hold (Skip PayPal login)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {busy && <AgentLog busy />}
        </div>
        <div className="prompt-row" aria-label="Quick scenario prompts">
          <button
            type="button"
            className="prompt-chip"
            disabled={busy}
            onClick={() => void sendMessage("I have a $20 budget. Do you have a keychain?")}
          >
            Keychain under $20
          </button>
          <button
            type="button"
            className="prompt-chip"
            disabled={busy}
            onClick={() => void sendMessage("I'd like the Venue Enamel Pin (DC-PIN-01) if it fits a $20 budget.")}
          >
            Enamel Pin ($8)
          </button>
          <button
            type="button"
            className="prompt-chip"
            disabled={busy}
            onClick={() => void sendMessage("Please propose the water bottle, SKU DC-BTL-01.")}
          >
            Water Bottle (Out of stock test)
          </button>
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
          <button className="primary lg" type="submit" disabled={busy} style={{ width: "auto" }}>
            {busy ? <LoaderCircle size={18} /> : <Send size={18} />}
            {busy ? "Working" : "Send"}
          </button>
        </form>
        {error && (
          <div className="err">
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
        {order?.pickup_code && (
          <div className="pickup-code-banner">
            <span className="pickup-code-pill">HOLD PLACED · $0 CHARGED YET</span>
            <div className="pickup-code-display">
              <span className="pickup-code-title">Recipient PIN:</span>
              <strong className="pickup-code-val mono">{order.pickup_code}</strong>
            </div>
            <p className="pickup-code-note">
              Give this one-time PIN to the courier upon delivery to verify handover and release payment.
            </p>
          </div>
        )}
      </section>

      <Toast message={toast} tone="hold" />

      {!compact && (
        <details className="browse">
          <summary>Browse items</summary>
          <div className="product-grid">
            {catalog.map((item) => (
              <ProductCard
                key={item.sku}
                item={item}
                onSelect={(picked) => setDraft(`I'd like the ${picked.name} (${picked.sku}) if it fits a $20 budget.`)}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
