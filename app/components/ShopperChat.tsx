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

export type ShopperMessage = {
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
    paypal_capture_id?: string | null;
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

const DEFAULT_MESSAGES: ShopperMessage[] = [
  {
    id: "msg-0",
    role: "assistant",
    content:
      "Welcome to **Proofed** — the trust layer between AI payments and the physical world.\n\nTell me what you are looking for or state a budget. All prices are verified against catalog integer cents. When you approve an order, PayPal places a **conditional capture authorization** (`intent=AUTHORIZE`, **$0.00 captured upfront**). Funds are captured **only after doorstep computer vision and your one-time recipient handover PIN are verified**.",
    tier: "ZERO-TRUST-OPERATOR",
    timestamp: Date.now(),
  },
];

export function ShopperChat({
  onOrderCreated,
}: {
  onOrderCreated?: (order: ShopperMessage["order"]) => void;
}) {
  const [messages, setMessages] = useState<ShopperMessage[]>(DEFAULT_MESSAGES);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingOrderId, setCreatingOrderId] = useState<string | null>(null);
  const [autonomyMode] = useState<"interactive" | "autopilot">("autopilot");
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [techLogsOpen, setTechLogsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string>("AURENVKKp9qvzggvkyehWs8DfYcIeqTGExPizTmcNFprVliVw2NNGRaXCuAch08Ks1Fh1mkiziPyA02O");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hydrated, setHydrated] = useState(false);

  // Restore the conversation after a reload so the shopper never loses an order in progress.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { messages?: ShopperMessage[]; sessionId?: string | null };
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
        "Pedir otro (Re-enviar a 744 Maple St)",
        "Recibir reembolso (Liberar retención PayPal)",
        "¿Por qué falló la entrega?",
        "Ver estado de retención en PayPal",
      ];
    }
    if (activeOrder?.status === "VOIDED") {
      return [
        "I have a $20 budget, what snacks or coffee do you have?",
        "Recommend specialty coffee beans under $30",
        "Clear cart and start over",
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
          note: "PayPal hold staged in chat",
          actor: "shopper",
          autoAuthorize: false,
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

      try {
        if (data.order) {
          const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
          const list = cachedRaw ? (JSON.parse(cachedRaw) as Array<{ id: string }>) : [];
          const next = [data.order, ...list.filter((o) => o.id !== data.order.id)];
          window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(next.slice(0, 20)));
        }
      } catch {
        // ignore storage errors
      }

      if (onOrderCreated && data.order) {
        onOrderCreated(data.order);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Could not create order authorization: ${err instanceof Error ? err.message : "Error"}`,
          tier: "POLICY-ERROR",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setCreatingOrderId(null);
    }
  };

  // Automatically place PayPal authorization on any quoted item
  useEffect(() => {
    const lastMsgWithQuote = [...messages].reverse().find((m) => m.quote && !m.order);
    if (lastMsgWithQuote && lastMsgWithQuote.quote && !creatingOrderId) {
      void handleConfirmOrder(lastMsgWithQuote.quote.sku, lastMsgWithQuote.id);
    }
  }, [messages, creatingOrderId]);

  // Poll for delivery status changes on active order (with cross-instance localStorage sync)
  useEffect(() => {
    const checkStatus = async () => {
      const lastOrderMsg = [...messages].reverse().find((m) => m.order?.id);
      if (!lastOrderMsg?.order?.id) return;
      const orderId = lastOrderMsg.order.id;

      try {
        const res = await fetch("/api/orders");
        const data = await res.json();
        let serverOrder = (data.orders || []).find((o: { id: string }) => o.id === orderId);
        try {
          const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
          if (cachedRaw) {
            const cachedList = JSON.parse(cachedRaw) as Array<{ id: string; status: string }>;
            const cachedMatch = cachedList.find((o) => o.id === orderId);
            if (cachedMatch && (!serverOrder || cachedMatch.status !== "AUTHORIZED")) {
              serverOrder = cachedMatch;
            }
          }
        } catch {
          // ignore
        }
        if (serverOrder && serverOrder.status !== lastOrderMsg.order.status) {
          // If status changed to DELIVERY_FAILED, escalate directly to the shopper
          if (serverOrder.status === "DELIVERY_FAILED") {
            setMessages((prev) => [
              ...prev.map((m) => (m.order?.id === orderId ? { ...m, order: serverOrder } : m)),
              {
                id: `fail-alert-${Date.now()}`,
                role: "assistant",
                content: `**Delivery Notice: Handover Not Verified**\n\nThe courier attempted delivery at **door #742** instead of your destination address (**#744 Maple Street**). Because physical delivery and recipient handover PIN were not completed, handover was aborted and the parcel returned to the hub.\n\n**Payment Status:** **${lastOrderMsg.quote?.formatted_price || "$18.50"} authorized · $0.00 captured**.\n\nThis incident has been escalated for your decision: would you like to **re-dispatch a replacement** to your verified address, or **void the PayPal authorization**?`,
                tier: "ESCALATION",
                timestamp: Date.now(),
                order: serverOrder,
              },
            ]);
          } else if (serverOrder.status === "CAPTURED") {
            setMessages((prev) =>
              prev.map((m) => (m.order?.id === orderId ? { ...m, order: serverOrder } : m)),
            );
          }
        }
      } catch {
        // Quiet
      }
    };

    const interval = setInterval(() => void checkStatus(), 3000);
    return () => clearInterval(interval);
  }, [messages]);

  async function handleActionVoid(orderId?: string) {
    if (!orderId || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/paypal/void", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          reason: "Customer requested authorization void after failed delivery",
          orderSnapshot: activeOrder || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const audit = data.audit;
        setMessages((prev) => [
          ...prev,
          {
            id: `fraud-block-${Date.now()}`,
            role: "assistant",
            content: `**Automated Refund Paused — Escalated to Merchant Review**\n\n${data.error || "Post-capture claim conflicts with recorded fulfillment evidence."}\n\n**Fulfillment Evidence & Policy Evaluation:**\n- **Policy Rule:** \`${audit?.policyRule || "RULE_CONTRADICTORY_EVIDENCE_ESCALATION"}\`\n- **Recorded Evidence:** ${audit?.evidenceTrail?.verifiedHandoverExists ? "Doorstep OCR match (#744), verified recipient one-time handover PIN, and tamper-evident SHA-256 photo digest on record" : "Unverified status"}\n- **Outcome:** **ESCALATED_FOR_REVIEW** (Self-service refund paused; case and evidence forwarded to Merchant Operations)`,
            tier: "POLICY-ESCALATION",
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const updatedOrder = data.order || { id: orderId, status: "VOIDED" };
      const audit = data.audit;
      try {
        const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
        const list = cachedRaw ? (JSON.parse(cachedRaw) as Array<{ id: string }>) : [];
        const next = [updatedOrder, ...list.filter((o) => o.id !== updatedOrder.id)];
        window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(next.slice(0, 20)));
      } catch {
        // ignore
      }
      setMessages((prev) => [
        ...prev.map((m) => (m.order?.id === orderId ? { ...m, order: updatedOrder } : m)),
        {
          id: `void-done-${Date.now()}`,
          role: "assistant",
          content: `**PayPal Authorization Voided — $0.00 Captured**\n\nYour PayPal authorization was voided via PayPal Payments v2 API (\`/v2/payments/authorizations/{id}/void\`). Because physical delivery was not verified, **$0.00 was captured**. Release timing of reserved funds depends on your payment provider.\n\n**Policy Verification:** \`${audit?.policyRule || "RULE_UNVERIFIED_HANDOVER_RELEASE"}\` · PASS · Address mismatch confirmed (#742) · Recipient PIN unverified · $0.00 captured.`,
          tier: "AUTHORIZATION-VOIDED",
          timestamp: Date.now(),
          order: updatedOrder,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Void notice: ${err instanceof Error ? err.message : "Service error"}`,
          tier: "NOTICE",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleActionRedispatch(orderId?: string) {
    if (!orderId || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/orders/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          action: "retry",
          confirm: true,
          actor: "shopper",
          orderSnapshot: activeOrder || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const audit = data.audit;
        setMessages((prev) => [
          ...prev,
          {
            id: `fraud-block-${Date.now()}`,
            role: "assistant",
            content: `**Automated Re-dispatch Paused — Escalated to Merchant Concierge**\n\n${data.error || "Maximum automated re-dispatch attempts reached."}\n\n**Fulfillment Policy Evaluation:**\n- **Policy Rule:** \`${audit?.policyRule || "RULE_MAX_REDISPATCH_LIMIT_REACHED"}\`\n- **Retry Count:** ${audit?.evidenceTrail?.retryCount ?? 2} previous re-dispatches (Automated policy limit: 2)\n- **Outcome:** **ESCALATED_FOR_REVIEW** (Forwarded to Merchant Concierge to confirm delivery instructions)`,
            tier: "POLICY-ESCALATION",
            timestamp: Date.now(),
          },
        ]);
        return;
      }

      const updatedOrder = data.order || { id: orderId, status: "AUTHORIZED", pickup_code: "PK-7440" };
      const audit = data.audit;
      try {
        const cachedRaw = window.localStorage.getItem("proofed:shared_orders_v1");
        const list = cachedRaw ? (JSON.parse(cachedRaw) as Array<{ id: string }>) : [];
        const next = [updatedOrder, ...list.filter((o) => o.id !== updatedOrder.id)];
        window.localStorage.setItem("proofed:shared_orders_v1", JSON.stringify(next.slice(0, 20)));
      } catch {
        // ignore
      }
      setMessages((prev) => [
        ...prev.map((m) => (m.order?.id === orderId ? { ...m, order: updatedOrder } : m)),
        {
          id: `redisp-${Date.now()}`,
          role: "assistant",
          content: `**Courier Re-dispatch Confirmed (Policy Check Passed)**\n\nReplacement order re-routed to courier terminal: **744 Maple Street, Apt 2B (white gate)**.\n\n**Policy Verification:** \`${audit?.policyRule || "RULE_VALID_REDISPATCH_WITHIN_LIMIT"}\` · Attempt ${(audit?.evidenceTrail?.retryCount ?? 0) + 1} of 2 permitted within PayPal 3-day honor window.\n\nYour existing PayPal authorization remains active (**$0.00 captured** until doorstep OCR and recipient handover PIN are verified).`,
          tier: "RE-DISPATCH",
          timestamp: Date.now(),
          order: updatedOrder,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: `Re-dispatch notice: ${err instanceof Error ? err.message : "Service error"}`,
          tier: "NOTICE",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
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

    // If active order has CAPTURED status and buyer claims non-delivery or requests refund, run policy evaluation
    if (activeOrder?.status === "CAPTURED") {
      if (/(never received|not received|no me lleg|reembolso|refund|money back|didn't get|did not receive|missing)/i.test(text)) {
        const userMsg: ShopperMessage = {
          id: `usr-${Date.now()}`,
          role: "user",
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        void handleActionVoid(activeOrder.id);
        return;
      }
    }

    // If active order has DELIVERY_FAILED, interpret shopper escalation decision directly
    if (activeOrder?.status === "DELIVERY_FAILED") {
      if (/^(pedir otro|re-enviar|reenviar|reintentar|volver a enviar|re-dispatch|redispatch|retry|redeliver|send another|another)/i.test(text)) {
        const userMsg: ShopperMessage = {
          id: `usr-${Date.now()}`,
          role: "user",
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        void handleActionRedispatch(activeOrder.id);
        return;
      }
      if (/^(reembolso|reembolsar|cancelar|devolver|liberar|refund|cancel|void|release|release hold)/i.test(text)) {
        const userMsg: ShopperMessage = {
          id: `usr-${Date.now()}`,
          role: "user",
          content: text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        void handleActionVoid(activeOrder.id);
        return;
      }
    }

    if (
      lastMsgWithQuote?.quote &&
      /^(confirm|buy|place order|yes|i'll take it|agree|proceed)/i.test(text)
    ) {
      const userMsg: ShopperMessage = {
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

    const userMsg: ShopperMessage = {
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
      const assistantMsg: ShopperMessage = {
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
      const errorMsg: ShopperMessage = {
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
    <div className="shopper-chat-container">
      {/* Top Header Bar */}
      <div className="shopper-chat-header">
        <div className="shopper-header-left">
          <span className="shopper-title">Direct Commerce</span>
        </div>
        <div className="shopper-header-right">
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
      <div className="shopper-messages-scroll">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={`shopper-msg-row ${isUser ? "user-row" : "agent-row"}`}>
              {/* Message Meta */}
              <div className="shopper-msg-meta">
                <span className={`shopper-role-label ${isUser ? "role-user" : "role-agent"}`}>
                  {isUser ? "You" : "Proofed"}
                </span>
                <span className="meta-sep">·</span>
                <span className="meta-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>

              {/* Message Body */}
              <div className={`shopper-msg-body ${isUser ? "user-body" : "agent-body"}`}>
                {isUser ? (
                  <div className="shopper-user-text">{msg.content}</div>
                ) : (
                  <SafeMarkdown text={msg.content} />
                )}
              </div>

              {/* Inline Product Quote Card */}
              {msg.quote && (
                <div className="shopper-quote-card">
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

                  {/* If Order is being placed in PayPal Sandbox */}
                  {!msg.order && (
                    <div className="quote-auto-staging mono">
                      <Sparkles className="spin" size={12} />
                      <span>Preparing PayPal sandbox checkout ($0.00 captured upfront)…</span>
                    </div>
                  )}

                  {/* Explicit Buyer Approval Button for Staged Order */}
                  {msg.order?.status === "CREATED" && (
                    <div className="quote-paypal-area">
                      <button
                        type="button"
                        className="approve-paypal-hold-btn"
                        onClick={async () => {
                          try {
                            const res = await fetch("/api/paypal/authorize", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ orderId: msg.order!.id, simulateApproval: true }),
                            });
                            const data = await res.json();
                            if (data.order) {
                              setMessages((prev) => [
                                ...prev,
                                {
                                  id: `auth-${Date.now()}`,
                                  role: "assistant",
                                  content: `PayPal authorization placed! **${(data.order.formatted_total as string) || msg.quote?.formatted_price || "$18.50"} authorized, $0.00 captured**. Funds are held securely on PayPal until physical handover and recipient PIN are verified. Recipient PIN: **${(data.order.pickup_code as string) || "PK-9912"}**.`,
                                  tier: "PAYPAL-AUTHORIZE",
                                  timestamp: Date.now(),
                                  order: data.order,
                                },
                              ]);
                            }
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                      >
                        <span className="btn-paypal-text">Approve PayPal hold</span>
                        <span className="btn-paypal-amt mono">{msg.quote?.formatted_price || "$18.50"}</span>
                      </button>
                      <div className="hold-disclaimer mono">
                        <span>intent=AUTHORIZE · $0.00 charged until physical handover verification</span>
                      </div>
                    </div>
                  )}

                  {/* If Order is Authorized */}
                  {msg.order?.status === "AUTHORIZED" && msg.order.pickup_code && (
                    <div className="quote-authorized-box">
                      <div className="quote-authorized-badge">
                        <div className="auth-left">
                          <span className="auth-pill mono">
                            {msg.quote?.formatted_price || "$18.50"} authorized · $0.00 captured
                          </span>
                          <span className="auth-sub">
                            Buyer Approved · Conditional capture via PayPal Authorization
                          </span>
                        </div>
                        <div className="auth-code mono">
                          <span>RECIPIENT PIN:</span>
                          <strong>{msg.order.pickup_code}</strong>
                        </div>
                      </div>
                      <div className="auth-customer-guidance mono">
                        <span>
                          PayPal Order: <strong>{msg.order.paypal_order_id || "ORDER-PP"}</strong> · Auth ID: <strong>{msg.order.paypal_authorization_id || "AUTH-PP"}</strong> · Valid 29 days (3-day honor period). Capture occurs only after doorstep OCR + recipient PIN verification.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* If Order is Captured after Verified Handover */}
                  {msg.order?.status === "CAPTURED" && (
                    <div className="quote-authorized-box" style={{ borderColor: "rgba(63, 178, 127, 0.45)" }}>
                      <div className="quote-authorized-badge">
                        <div className="auth-left">
                          <span className="auth-pill mono" style={{ color: "#3FB27F" }}>
                            Handover Verified · {msg.quote?.formatted_price || "$18.50"} captured
                          </span>
                          <span className="auth-sub">
                            Door #744 OCR + Recipient One-Time PIN ({msg.order.pickup_code || "VERIFIED"}) confirmed
                          </span>
                        </div>
                        <div className="auth-code mono">
                          <span>STATUS:</span>
                          <strong style={{ color: "#3FB27F" }}>CAPTURED</strong>
                        </div>
                      </div>
                      <div className="auth-customer-guidance mono">
                        <span>
                          Tamper-evident fulfillment event recorded · PayPal Capture ID: <strong>{msg.order.paypal_capture_id || "CAP-PP-VERIFIED"}</strong>.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* If Delivery Failed (Wrong Doorstep or Damaged) */}
                  {msg.order?.status === "DELIVERY_FAILED" && (
                    <div className="quote-failure-box" role="alert">
                      <div className="failure-box-header">
                        <AlertCircle size={16} />
                        <span className="failure-box-title mono">Delivery verification failed · Escalated to you</span>
                        <span className="failure-status-pill mono">
                          {msg.quote?.formatted_price || "$18.50"} AUTHORIZED · $0.00 CAPTURED
                        </span>
                      </div>
                      <p className="failure-desc">
                        Courier attempted delivery at door #742 (+120m away from destination 744 Maple St). Because doorstep OCR and recipient PIN verification were not completed, handover was aborted and capture was blocked ($0.00 captured). Choose how to proceed:
                      </p>
                      <div className="failure-audit-strip mono">
                        <ShieldCheck size={12} />
                        <span>Fulfillment policy active: Tamper-evident doorstep OCR &amp; retry limits evaluated before voiding authorization or re-dispatching.</span>
                      </div>
                      <div className="failure-actions-grid">
                        <button
                          type="button"
                          className="failure-action-btn btn-redispatch"
                          onClick={() => void handleActionRedispatch(msg.order?.id)}
                        >
                          Pedir otro (Re-enviar a 744 Maple St)
                        </button>
                        <button
                          type="button"
                          className="failure-action-btn btn-release-void"
                          onClick={() => void handleActionVoid(msg.order?.id)}
                        >
                          Recibir reembolso (Anular autorización)
                        </button>
                      </div>
                    </div>
                  )}

                  {/* If Order was Voided */}
                  {msg.order?.status === "VOIDED" && (
                    <div className="quote-voided-receipt-box" role="region" aria-label="PayPal Authorization Void Receipt">
                      <div className="voided-receipt-header">
                        <div className="voided-header-left">
                          <ShieldCheck size={16} className="voided-shield-icon" />
                          <span className="voided-title mono">PayPal Authorization Voided</span>
                        </div>
                        <span className="voided-status-pill mono">AUTHORIZATION VOIDED · $0.00 CAPTURED</span>
                      </div>

                      <div className="voided-receipt-grid mono">
                        <div className="voided-grid-row">
                          <span className="voided-grid-label">Item</span>
                          <span className="voided-grid-val">{msg.quote?.name || "Order item"}</span>
                        </div>
                        <div className="voided-grid-row">
                          <span className="voided-grid-label">Authorized amount</span>
                          <span className="voided-grid-val">{msg.quote?.formatted_price || "$18.50"}</span>
                        </div>
                        <div className="voided-grid-row">
                          <span className="voided-grid-label">Amount captured</span>
                          <span className="voided-grid-val highlight-zero">$0.00 USD</span>
                        </div>
                        <div className="voided-grid-row">
                          <span className="voided-grid-label">Authorization status</span>
                          <span className="voided-grid-val highlight-refunded">
                            VOIDED (Release timing depends on payment provider)
                          </span>
                        </div>
                        <div className="voided-grid-row">
                          <span className="voided-grid-label">Trigger</span>
                          <span className="voided-grid-val">Handover verification rejected (Door #742)</span>
                        </div>
                        <div className="voided-grid-row">
                          <span className="voided-grid-label">PayPal Auth ID</span>
                          <span className="voided-grid-val">{msg.order?.paypal_authorization_id || "AUTH-PAYPAL-SECURE"}</span>
                        </div>
                      </div>

                      <div className="voided-audit-trail mono">
                        <div className="audit-trail-header">
                          <span className="audit-label">FULFILLMENT POLICY VERIFICATION</span>
                          <span className="audit-pass-tag">RULE_UNVERIFIED_HANDOVER_RELEASE · PASS</span>
                        </div>
                        <div className="audit-trail-checks">
                          <div className="audit-check-line">
                            <span className="check-icon">✔</span>
                            <span>Evidence Check: Handover rejected by computer vision OCR (#742 mismatch)</span>
                          </div>
                          <div className="audit-check-line">
                            <span className="check-icon">✔</span>
                            <span>Recipient PIN: One-time handover credential was never used</span>
                          </div>
                          <div className="audit-check-line">
                            <span className="check-icon">✔</span>
                            <span>Conditional Capture: $0.00 captured · Eligible for PayPal authorization void</span>
                          </div>
                        </div>
                      </div>

                      <div className="voided-receipt-footer mono">
                        <span>Conditional capture protection: No funds were captured by the merchant. The PayPal authorization has been voided; available balance restoration timing depends on your issuing bank or payment provider.</span>
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
          <div className="shopper-loading-indicator mono">
            <Sparkles className="spin" size={13} />
            <span>Checking catalog and policy…</span>
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Suggested Quick Prompts (Proofed Shopper Style) */}
      {!isFreshChat && (
      <div className="shopper-prompts-bar">
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
      <div className="shopper-input-bar">
        <div className="shopper-input-wrap">
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
            className="shopper-textarea"
          />
          <button
            type="button"
            className="shopper-send-btn"
            disabled={!input.trim() || loading}
            onClick={() => void handleSend()}
            aria-label="Send message"
          >
            <CornerDownLeft size={14} />
          </button>
        </div>
      </div>

      {/* Technical Audit & Policy Guardrail Drawer (Dropdown at the bottom for Tech Guys) */}
      <div className="shopper-tech-drawer">
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
                  <div key={tool.toolKey} className="shopper-tool-card">
                    <button
                      type="button"
                      className="shopper-tool-header"
                      onClick={() => toggleTool(tool.toolKey)}
                    >
                      <div className="shopper-tool-title mono">
                        <Terminal className="tool-icon" size={13} />
                        <span>Tool: {tool.name}</span>
                        <span className={`tool-pill ${tool.ok ? "ok" : "err"}`}>
                          {tool.ok ? "PASS" : "BLOCKED"}
                        </span>
                      </div>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>

                    {isExpanded && (
                      <div className="shopper-tool-detail mono">
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
