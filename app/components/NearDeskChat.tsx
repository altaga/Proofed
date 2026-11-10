"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { PayPalApprove } from "./PayPalApprove";
import { SafeMarkdown } from "./SafeMarkdown";
import type { AgentStep } from "./AgentLog";

export type NearDeskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tier?: string;
  timestamp: number;
  toolTrace?: AgentStep[];
  quote?: {
    sku: string;
    name: string;
    formatted_price: string;
    unit_price_cents: number;
    available: number;
  };
  order?: {
    id: string;
    status: string;
    formatted_total?: string;
    pickup_code?: string | null;
    paypal_order_id?: string | null;
    paypal_authorization_id?: string | null;
  };
};

const PROMPT_PRESETS = [
  "I have a $20 budget. Do you have a keychain?",
  "I'd like the Venue Enamel Pin (DC-PIN-01) within budget.",
  "Check stock for the water bottle (DC-BTL-01).",
  "Simulate Solenoid Jam on Bay #04 & recover",
  "Release PayPal hold and refund balance",
];

const DEFAULT_MESSAGES: NearDeskMessage[] = [
  {
    id: "msg-0",
    role: "assistant",
    content:
      "Proofed Agentic Commerce Operator initialized.\n\nFulfillment policy: zero-trust catalog pricing (integer cents calculated strictly by backend policy engine). Customer funds are authorized with PayPal `intent=AUTHORIZE`. Physical capture triggers only upon verified physical handover.",
    tier: "ZERO-TRUST-POLICY",
    timestamp: Date.now() - 1000 * 60 * 3,
  },
  {
    id: "msg-1",
    role: "user",
    content: "I have a $20 budget. Do you have a keychain?",
    timestamp: Date.now() - 1000 * 60 * 2,
  },
  {
    id: "msg-2",
    role: "assistant",
    content:
      "I located the **Pudgy Keychain** in the venue catalog. Verified price is **$12.00** (1200¢), leaving $8.00 remaining in your stated $20 budget. Stock level is verified with 8 units available at Station #04.",
    tier: "MINIMAX-M3",
    timestamp: Date.now() - 1000 * 60 * 1,
    toolTrace: [
      {
        name: "search_catalog",
        ok: true,
        summary: "Found SKU DC-KEY-01 (Pudgy Keychain) @ 1200 cents",
        input: 'query="keychain", budget_cents=2000',
        outcome: "1 item matched catalog inventory",
        guardrail: "Verified against SQLite catalog; model did not compute price",
      },
      {
        name: "propose_checkout",
        ok: true,
        summary: "Cart validated: subtotal $12.00 <= budget $20.00",
        input: "sku=DC-KEY-01, qty=1",
        outcome: "Intent set to AUTHORIZE; orders v2 payload prepared",
        guardrail: "Integer cents 1200 <= 2000 confirmed",
      },
    ],
    quote: {
      sku: "DC-KEY-01",
      name: "Pudgy Keychain",
      formatted_price: "$12.00",
      unit_price_cents: 1200,
      available: 8,
    },
    order: {
      id: "ord_demo_9821",
      status: "AUTHORIZED",
      formatted_total: "$12.00",
      pickup_code: "PK-9912",
      paypal_order_id: "8UV92014KL582910M",
      paypal_authorization_id: "7TH99120AP442109X",
    },
  },
];

export function NearDeskChat({
  onOrderCreated,
}: {
  onOrderCreated?: (order: NearDeskMessage["order"]) => void;
}) {
  const [messages, setMessages] = useState<NearDeskMessage[]>(DEFAULT_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({ "msg-2-0": true });
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg?.paypalClientId) setClientId(cfg.paypalClientId);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const toggleTool = (key: string) => {
    setExpandedTools((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || input).trim();
    if (!text || loading) return;

    const userMsg: NearDeskMessage = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Assistant unavailable");

      if (payload.sessionId) setSessionId(payload.sessionId);

      const quotedLine = payload.quote?.lines?.[0];
      const assistantMsg: NearDeskMessage = {
        id: `ast-${Date.now()}`,
        role: "assistant",
        content: payload.reply || "Done.",
        tier: "MINIMAX-M3",
        timestamp: Date.now(),
        toolTrace: payload.toolTrace || [],
        quote: quotedLine
          ? {
              sku: quotedLine.sku,
              name: quotedLine.name,
              formatted_price: `$${(quotedLine.unit_price_cents / 100).toFixed(2)}`,
              unit_price_cents: quotedLine.unit_price_cents,
              available: quotedLine.available ?? 5,
            }
          : undefined,
        order: payload.order,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (payload.order && onOrderCreated) {
        onOrderCreated(payload.order);
      }
    } catch (err) {
      const errorMsg: NearDeskMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Policy execution notice: ${err instanceof Error ? err.message : "Service unavailable"}`,
        tier: "FALLBACK-GUARD",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="neardesk-chat-container">
      {/* Top Header Bar */}
      <div className="neardesk-chat-header">
        <div className="neardesk-header-left">
          <span className="neardesk-status-dot" />
          <span className="neardesk-title mono">PROOFED_AGENTIC_OPERATOR // LIVE STREAM</span>
        </div>
        <div className="neardesk-header-right mono">
          <span className="neardesk-badge-pill">INTENT=AUTHORIZE</span>
          <span className="neardesk-badge-pill">ZERO_TRUST_PRICING</span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="neardesk-messages-scroll">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={`neardesk-msg-row ${isUser ? "user-row" : "agent-row"}`}>
              {/* Micro Meta Header */}
              <div className="neardesk-msg-meta mono">
                <span className={`neardesk-role-label ${isUser ? "role-user" : "role-agent"}`}>
                  {isUser ? "Operator (Shopper)" : "Proofed AI Agent"}
                </span>
                {msg.tier && <span className="neardesk-tier-tag">{msg.tier}</span>}
                <span className="meta-sep">·</span>
                <span className="meta-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>

              {/* Message Body */}
              <div className={`neardesk-msg-body ${isUser ? "user-body" : "agent-body"}`}>
                {isUser ? (
                  <div className="neardesk-user-text">{msg.content}</div>
                ) : (
                  <SafeMarkdown text={msg.content} />
                )}
              </div>

              {/* Collapsible Tool Traces (NearDesk Style) */}
              {msg.toolTrace && msg.toolTrace.length > 0 && (
                <div className="neardesk-tool-list">
                  {msg.toolTrace.map((tool, idx) => {
                    const toolKey = `${msg.id}-${idx}`;
                    const isExpanded = Boolean(expandedTools[toolKey]);
                    return (
                      <div key={toolKey} className="neardesk-tool-card">
                        <button
                          type="button"
                          className="neardesk-tool-header"
                          onClick={() => toggleTool(toolKey)}
                        >
                          <div className="neardesk-tool-title mono">
                            <Terminal className="tool-icon" size={13} />
                            <span>Tool: {tool.name}</span>
                            <span className={`tool-pill ${tool.ok ? "ok" : "err"}`}>
                              {tool.ok ? "PASS" : "BLOCKED"}
                            </span>
                          </div>
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>

                        {isExpanded && (
                          <div className="neardesk-tool-detail mono">
                            {tool.summary && (
                              <div className="tool-line">
                                <span className="tool-key">SUMMARY:</span>
                                <span className="tool-val">{tool.summary}</span>
                              </div>
                            )}
                            {tool.input && (
                              <div className="tool-line">
                                <span className="tool-key">INPUT:</span>
                                <span className="tool-val">{tool.input}</span>
                              </div>
                            )}
                            {tool.outcome && (
                              <div className="tool-line">
                                <span className="tool-key">OUTCOME:</span>
                                <span className="tool-val">{tool.outcome}</span>
                              </div>
                            )}
                            {tool.guardrail && (
                              <div className="tool-line guardrail-line">
                                <span className="tool-key">GUARDRAIL:</span>
                                <span className="tool-val">{tool.guardrail}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inline Product Quote Card */}
              {msg.quote && (
                <div className="neardesk-quote-card">
                  <div className="quote-product-row">
                    <img
                      src={`/products/${msg.quote.sku}.svg`}
                      alt={msg.quote.name}
                      className="quote-img"
                    />
                    <div className="quote-info">
                      <div className="quote-header-line">
                        <strong className="quote-name">{msg.quote.name}</strong>
                        <span className="quote-sku mono">{msg.quote.sku}</span>
                      </div>
                      <div className="quote-price-line mono">
                        <span className="quote-price">{msg.quote.formatted_price}</span>
                        <span className="quote-units">({msg.quote.available} units available)</span>
                      </div>
                    </div>
                  </div>

                  {/* Inline PayPal Hold Box */}
                  {msg.order?.status === "CREATED" && msg.order.paypal_order_id && clientId && (
                    <div className="quote-paypal-area">
                      <div className="paypal-hold-header">
                        <ShieldCheck size={14} />
                        <span>Authorize Hold with PayPal (0¢ Charged Upfront)</span>
                      </div>
                      <PayPalApprove
                        clientId={clientId}
                        orderId={msg.order.id}
                        paypalOrderId={msg.order.paypal_order_id}
                        onError={(err) => {
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: `err-${Date.now()}`,
                              role: "assistant",
                              content: `PayPal authorization notice: ${err}`,
                              tier: "PAYPAL-NOTICE",
                              timestamp: Date.now(),
                            },
                          ]);
                        }}
                        onAuthorized={(next) => {
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: `auth-${Date.now()}`,
                              role: "assistant",
                              content: `PayPal Hold Authorized! Funds (${(next.formatted_total as string) || "$12.00"}) are held safely on your PayPal account. Zero dollars debited until physical handover. Pickup code: **${(next.pickup_code as string) || "PK-9912"}**.`,
                              tier: "PAYPAL-ESCROW",
                              timestamp: Date.now(),
                              order: next as NearDeskMessage["order"],
                            },
                          ]);
                        }}
                      />
                    </div>
                  )}

                  {/* If Order is already Authorized */}
                  {msg.order?.status === "AUTHORIZED" && msg.order.pickup_code && (
                    <div className="quote-authorized-badge">
                      <div className="auth-left">
                        <span className="auth-pill mono">🔒 HOLD ACTIVE · $0 DEBITED</span>
                        <span className="auth-sub">Funds safely escrowed on PayPal</span>
                      </div>
                      <div className="auth-code mono">
                        <span>PIN:</span>
                        <strong>{msg.order.pickup_code}</strong>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="neardesk-loading-indicator mono">
            <Sparkles className="spin" size={13} />
            <span>Processing reasoning routine & policy guardrails...</span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Suggested Quick Prompts (NearDesk Style) */}
      <div className="neardesk-prompts-bar">
        <span className="prompts-label mono">PROMPTS:</span>
        <div className="prompts-scroll">
          {PROMPT_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              className="prompt-preset-btn"
              disabled={loading}
              onClick={() => void handleSend(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Input Box with CornerDownLeft Button */}
      <div className="neardesk-input-bar">
        <div className="neardesk-input-wrap">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Instruct Proofed agent (e.g. 'I have a $20 budget. Propose a keychain')..."
            rows={1}
            className="neardesk-textarea"
          />
          <button
            type="button"
            className="neardesk-send-btn"
            disabled={!input.trim() || loading}
            onClick={() => void handleSend()}
            aria-label="Send message"
          >
            <CornerDownLeft size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
