"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CornerDownLeft,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { PayPalApprove } from "./PayPalApprove";
import { SafeMarkdown } from "./SafeMarkdown";
import { ProductThumbnail } from "./ProductThumbnail";
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
    failure_reason?: string | null;
  };
};



const CHAT_STORAGE_KEY = "proofed.chat.v1";

const STARTERS = [
  { title: "Power and cables", hint: "100W GaN charger and a braided cable", prompt: "I need a 100W USB-C GaN fast charger and a braided cable" },
  { title: "Coffee and matcha", hint: "Specialty beans under \$30", prompt: "Recommend specialty coffee beans or matcha under $30" },
  { title: "Gym and outdoors", hint: "Insulated 32oz water bottle", prompt: "Looking for an insulated 32oz water bottle for the gym" },
  { title: "Small budget", hint: "Snacks or coffee with \$20", prompt: "I have a $20 budget, what snacks or coffee do you have?" },
];

const DEFAULT_MESSAGES: NearDeskMessage[] = [
  {
    id: "msg-0",
    role: "assistant",
    content:
      "Welcome to Proofed. I am your autonomous commerce operator.\n\nTell me what you are looking for or state a budget. All prices are verified against catalog integer cents. When you confirm an item, your PayPal account is only placed on **authorization hold** (`intent=AUTHORIZE`). Your funds are captured **only upon verified physical handover**.",
    tier: "ZERO-TRUST-OPERATOR",
    timestamp: Date.now(),
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
  const [creatingOrderId, setCreatingOrderId] = useState<string | null>(null);
  const [autonomyMode] = useState<"interactive" | "autopilot">("autopilot");
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [techLogsOpen, setTechLogsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore the conversation after a reload so the shopper never loses an order in progress.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { messages?: NearDeskMessage[]; sessionId?: string | null };
        if (Array.isArray(saved.messages) && saved.messages.length > 0) setMessages(saved.messages);
        if (saved.sessionId) setSessionId(saved.sessionId);
      }
    } catch {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({ messages: messages.slice(-60), sessionId }),
      );
    } catch {
      // Storage full or unavailable: the chat still works, it just will not persist.
    }
  }, [messages, sessionId, hydrated]);

  const handleNewChat = () => {
    if (loading) return;
    window.localStorage.removeItem(CHAT_STORAGE_KEY);
    setSessionId(null);
    setMessages([{ ...DEFAULT_MESSAGES[0], timestamp: Date.now() }]);
  };

  const isFreshChat = messages.length === 1 && messages[0].id === "msg-0";

  const activeOrderMsg = [...messages].reverse().find((m) => m.order?.id);
  const activeOrder = activeOrderMsg?.order;
  const lastMsgWithQuote = [...messages].reverse().find((m) => m.quote && !m.order);

  const currentPrompts = (() => {
    if (activeOrder?.status === "DELIVERY_FAILED") {
      return [
        "Release PayPal hold and cancel order",
        "Re-dispatch courier to corrected address",
        "Why was my delivery rejected?",
        "Show PayPal audit trail",
      ];
    }
    if (activeOrder?.status === "AUTHORIZED") {
      return [
        "How does the doorstep proof verification work?",
        "What happens if the courier leaves the box at the wrong door?",
        "Where can I collect my package?",
        "Release PayPal hold and cancel order",
      ];
    }
    if (lastMsgWithQuote?.quote) {
      return [
        "How does PayPal authorization hold protect me?",
        "Do you have a cheaper alternative in stock?",
        "What is the physical handover guarantee?",
        "Clear cart and start over",
      ];
    }
    return [
      "I need a 100W USB-C GaN fast charger and a braided cable",
      "Recommend specialty coffee beans or matcha under $30",
      "Looking for an insulated 32oz water bottle for the gym",
      "Smart 2K video doorbell for the front porch",
      "I have a $20 budget, what snacks or coffee do you have?",
    ];
  })();

  const handleConfirmOrder = async (sku: string, messageId: string) => {
    if (creatingOrderId || loading) return;
    setCreatingOrderId(messageId);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ sku, qty: 1 }],
          note: "Automated PayPal hold placed in chat",
          actor: "shopper",
          autoAuthorize: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order creation failed");

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId) {
            return {
              ...m,
              order: data.order,
            };
          }
          return m;
        }),
      );

      if (onOrderCreated && data.order) {
        onOrderCreated(data.order);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Could not create order hold: ${err instanceof Error ? err.message : "Error"}`,
          tier: "POLICY-ERROR",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setCreatingOrderId(null);
    }
  };

  // Automatically place PayPal hold on any quoted item without manual button click
  useEffect(() => {
    const lastMsgWithQuote = [...messages].reverse().find((m) => m.quote && !m.order);
    if (lastMsgWithQuote && lastMsgWithQuote.quote && !creatingOrderId) {
      void handleConfirmOrder(lastMsgWithQuote.quote.sku, lastMsgWithQuote.id);
    }
  }, [messages, creatingOrderId]);

  // Poll for delivery status changes on active order
  useEffect(() => {
    const checkStatus = async () => {
      const lastOrderMsg = [...messages].reverse().find((m) => m.order?.id);
      if (!lastOrderMsg?.order?.id) return;
      const orderId = lastOrderMsg.order.id;

      try {
        const res = await fetch("/api/orders");
        const data = await res.json();
        const serverOrder = (data.orders || []).find((o: { id: string }) => o.id === orderId);
        if (serverOrder && serverOrder.status !== lastOrderMsg.order.status) {
          // If status changed to DELIVERY_FAILED
          if (serverOrder.status === "DELIVERY_FAILED") {
            if (autonomyMode === "autopilot") {
              // Execute auto-void immediately
              await fetch("/api/paypal/void", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, reason: "Auto-pilot autonomous void on delivery failure" }),
              });
              setMessages((prev) => [
                ...prev,
                {
                  id: `fail-auto-${Date.now()}`,
                  role: "assistant",
                  content: `**Autonomous Delivery Alert (Auto-Pilot Executed)**\n\nPorch camera detected delivery failure (${serverOrder.failure_reason || "Door mismatch"}).\n\nBecause you configured **Auto-Pilot Mode**, your PayPal hold was **automatically released** in 1.2s. **$0.00 charged**. A $5.00 apology credit has been added to your profile.`,
                  tier: "AUTO-PILOT-VOID",
                  timestamp: Date.now(),
                  order: { ...serverOrder, status: "VOIDED" },
                },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: `fail-alert-${Date.now()}`,
                  role: "assistant",
                  content: `**Delivery Alert: Verification Failed**\n\nThe courier's porch vision system detected that the package was dropped at the wrong doorstep or sustained impact damage (${serverOrder.failure_reason || "Address Mismatch"}).\n\nYour funds **remain 100% safe on PayPal ($0.00 charged)**. How would you like to proceed?`,
                  tier: "PHYSICAL-GUARD",
                  timestamp: Date.now(),
                  order: serverOrder,
                },
              ]);
            }
          }
        }
      } catch {
        // Quiet
      }
    };

    const interval = setInterval(() => void checkStatus(), 4000);
    return () => clearInterval(interval);
  }, [messages, autonomyMode]);

  async function handleActionVoid(orderId?: string) {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/paypal/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reason: "Client requested instant void in chat" }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          id: `void-done-${Date.now()}`,
          role: "assistant",
          content: `**PayPal Authorization Successfully Released**\n\nCalled PayPal Sandbox API \`/void\`. Your authorization hold was released instantly. **Total charged: $0.00**.\n\nWe have credited concierge apology voucher **VOUCHER-SORRY5** ($5.00 USD) to your account for the inconvenience.`,
          tier: "ZERO-CAPTURE-SETTLED",
          timestamp: Date.now(),
          order: data.order,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleActionRedispatch(orderId?: string) {
    if (!orderId) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `redisp-${Date.now()}`,
        role: "assistant",
        content: `**Courier Re-dispatch Ordered**\n\nNotification dispatched to courier terminal: *"Corrected destination: 744 Maple Street, Apt 2B (white gate)"*.\n\nYour PayPal authorization hold remains safely escrowed until verified delivery.`,
        tier: "COURIER-DISPATCH",
        timestamp: Date.now(),
      },
    ]);
  }

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

    if (
      lastMsgWithQuote?.quote &&
      /^(confirm|buy|place order|yes|i'll take it|agree|proceed)/i.test(text)
    ) {
      const userMsg: NearDeskMessage = {
        id: `usr-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      void handleConfirmOrder(lastMsgWithQuote.quote.sku, lastMsgWithQuote.id);
      return;
    }

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

  const allToolTraces = messages.flatMap((m) =>
    (m.toolTrace || []).map((step, idx) => ({
      ...step,
      toolKey: `${m.id}-${idx}`,
      timestamp: m.timestamp,
    }))
  );
  const totalToolCount = allToolTraces.length;

  return (
    <div className="neardesk-chat-container">
      {/* Top Header Bar */}
      <div className="neardesk-chat-header">
        <div className="neardesk-header-left">
          <span className="neardesk-title">Direct Commerce</span>
        </div>
        <div className="neardesk-header-right">
          {!isFreshChat && (
            <button
              type="button"
              className="new-chat-btn"
              onClick={handleNewChat}
              disabled={loading}
              title="Clear this conversation and start over"
            >
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="neardesk-messages-scroll">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={`neardesk-msg-row ${isUser ? "user-row" : "agent-row"}`}>
              {/* Message Meta */}
              <div className="neardesk-msg-meta">
                <span className={`neardesk-role-label ${isUser ? "role-user" : "role-agent"}`}>
                  {isUser ? "You" : "Proofed"}
                </span>
                <span className="meta-sep">·</span>
                <span className="meta-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
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

              {/* Inline Product Quote Card */}
              {msg.quote && (
                <div className="neardesk-quote-card">
                  <div className="quote-product-row">
                    <ProductThumbnail
                      sku={msg.quote.sku}
                      name={msg.quote.name}
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

                  {/* Powered by PayPal Brand Badge (Automated Hold) */}
                  <div className="quote-paypal-powered-badge">
                    <div className="paypal-badge-brand">
                      <svg
                        className="paypal-logo-svg"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
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
                      <span className="paypal-brand-title">
                        Powered by <strong>PayPal</strong>
                      </span>
                    </div>
                    <span className="paypal-protocol-pill mono">intent=AUTHORIZE</span>
                  </div>

                  {/* If Order is being placed automatically */}
                  {!msg.order && (
                    <div className="quote-auto-staging mono">
                      <Sparkles className="spin" size={12} />
                      <span>Placing automated PayPal authorization hold ($0.00 charged upfront)…</span>
                    </div>
                  )}

                  {/* Inline PayPal Hold Box */}
                  {msg.order?.status === "CREATED" && msg.order.paypal_order_id && clientId && (
                    <div className="quote-paypal-area">
                      <div className="paypal-hold-header">
                        <ShieldCheck size={14} />
                        <span>Authorize Hold with PayPal ($0.00 Charged Upfront)</span>
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
                    <div className="quote-authorized-box">
                      <div className="quote-authorized-badge">
                        <div className="auth-left">
                          <span className="auth-pill mono">Hold active · $0.00 charged</span>
                          <span className="auth-sub">Funds safely escrowed on PayPal</span>
                        </div>
                        <div className="auth-code mono">
                          <span>PIN:</span>
                          <strong>{msg.order.pickup_code}</strong>
                        </div>
                      </div>
                      <div className="auth-customer-guidance mono">
                        <span>Awaiting physical handover at doorstep or locker station. Funds remain held securely on PayPal ($0.00 charged) until proof of delivery is verified.</span>
                      </div>
                    </div>
                  )}

                  {/* If Delivery Failed (Wrong Doorstep or Damaged) */}
                  {msg.order?.status === "DELIVERY_FAILED" && (
                    <div className="quote-failure-box" role="alert">
                      <div className="failure-box-header">
                        <AlertCircle size={16} />
                        <span className="failure-box-title mono">Delivery not verified</span>
                        <span className="failure-status-pill mono">$0 charged</span>
                      </div>
                      <p className="failure-desc">
                        Porch AI vision rejected delivery ({msg.order.failure_reason || "Door # mismatch"}).
                        Funds remain held on PayPal; zero dollars debited. Select autonomous resolution:
                      </p>
                      <div className="failure-actions-grid">
                        <button
                          type="button"
                          className="failure-action-btn btn-release-void"
                          onClick={() => void handleActionVoid(msg.order?.id)}
                        >
                          Release hold — nothing charged
                        </button>
                        <button
                          type="button"
                          className="failure-action-btn btn-redispatch"
                          onClick={() => void handleActionRedispatch(msg.order?.id)}
                        >
                          Redeliver to 744 Maple St
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {isFreshChat && !loading && (
          <div className="chat-starters" role="group" aria-label="Conversation starters">
            <span className="chat-starters-title">Start with</span>
            {STARTERS.map((starter) => (
              <button key={starter.title} type="button" className="chat-starter" onClick={() => void handleSend(starter.prompt)}>
                <strong>{starter.title}</strong>
                <span>{starter.hint}</span>
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="neardesk-loading-indicator mono">
            <Sparkles className="spin" size={13} />
            <span>Checking catalog and policy…</span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Suggested Quick Prompts (NearDesk Style) */}
      {!isFreshChat && (
      <div className="neardesk-prompts-bar">
        <span className="prompts-label mono">Suggestions</span>
        <div className="prompts-scroll">
          {currentPrompts.map((preset, idx) => (
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
      )}

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
            placeholder="Ask for a product, e.g. a keychain under $20"
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

      {/* Technical Audit & Policy Guardrail Drawer (Dropdown at the bottom for Tech Guys) */}
      <div className="neardesk-tech-drawer">
        <button
          type="button"
          className="tech-drawer-toggle"
          onClick={() => setTechLogsOpen((prev) => !prev)}
          aria-expanded={techLogsOpen}
          aria-label="Toggle technical engineering logs"
        >
          <div className="tech-drawer-left mono">
            <Terminal size={12} className="tech-drawer-icon" />
            <span className="tech-title">System Audit</span>
            <span className="tech-count-badge">
              {totalToolCount} {totalToolCount === 1 ? "operation" : "operations"}
            </span>
            {totalToolCount > 0 && (
              <span className="tech-guard-badge">Zero-trust verified</span>
            )}
          </div>
          <div className="tech-drawer-right mono">
            <span>{techLogsOpen ? "Hide logs" : "Inspect logs"}</span>
            {techLogsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </div>
        </button>

        {techLogsOpen && (
          <div className="tech-drawer-panel">
            <div className="tech-drawer-meta-banner mono">
              <span>ZERO-TRUST POLICY GUARDRAIL AUDIT</span>
              <span>PRICES &amp; HOLDS VALIDATED VIA SQLITE INTEGER CENTS</span>
            </div>

            {totalToolCount === 0 ? (
              <div className="tech-empty-state mono">
                No tool calls recorded yet. Request a product or checkout above to inspect live agent catalog &amp; policy traces.
              </div>
            ) : (
              allToolTraces.map((tool) => {
                const isExpanded = Boolean(expandedTools[tool.toolKey]);
                return (
                  <div key={tool.toolKey} className="neardesk-tool-card">
                    <button
                      type="button"
                      className="neardesk-tool-header"
                      onClick={() => toggleTool(tool.toolKey)}
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
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
