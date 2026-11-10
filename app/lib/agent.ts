import { getProjectConfig, requireEnv } from "./config";
import { getDb, nowIso, rowToObject } from "./db";
import { newId } from "./ids";
import { agentToolDefinitions, executeAgentTool } from "./agent-tools";
import { visibleAssistantText } from "./text";
import { publicOrderView, publicQuote, type OrderDetails } from "./orders";
import { quoteItems } from "./policy";
import { correctToolArgs, parseBudgetCents, parseBudgetCentsFromMessages } from "./budget";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type AgentTurnResult = {
  sessionId: string;
  reply: string;
  toolTrace: Array<{
    name: string;
    ok: boolean;
    summary: string;
    input?: string;
    outcome?: string;
    guardrail?: string;
    decidedBy?: string;
    rejected?: boolean;
  }>;
  quote?: unknown;
  order?: ReturnType<typeof publicOrderView>;
  replacement?: ReturnType<typeof publicOrderView>;
};

type MiniMaxToolCall = {
  id: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

type MiniMaxMessage = {
  role?: string;
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: MiniMaxToolCall[];
};

function llmBaseUrl() {
  return process.env.MINIMAX_BASE_URL || getProjectConfig().llmBaseUrl;
}

function llmModel() {
  return process.env.MINIMAX_MODEL || getProjectConfig().llmModel;
}

function systemPrompt() {
  const cfg = getProjectConfig();
  return [
    `You are the in-store shopping assistant for ${cfg.venueName}, powered by ${cfg.name}.`,
    "Customers speak naturally and may name a budget. Help them pick items that are actually in stock.",
    "You MUST call tools to read prices, stock, and order state. Never invent a price, SKU, stock count, pickup code, or PayPal id.",
    "Never send a money amount to a tool except optional budget_cents or max_price_cents as integer cents ($20 is 2000, never 20 or 20000). The backend recomputes totals and will correct a mistaken budget.",
    "Write concise sentences. You may bold item names with markdown like **Pudgy Keychain**. Do not leave raw or unpaired asterisks.",
    "Typical flow: search or list the catalog → propose_checkout → after the customer agrees, create_checkout.",
    "After create_checkout, tell them to approve the PayPal button in this page. That places a hold (AUTHORIZE), not a capture.",
    "Capture happens only after the pickup station records handover evidence.",
    "If something fails (out of stock, station jam, pickup timeout, capture declined), call investigate_failure and then propose_recovery with retry, substitute, or cancel.",
    "If a tool returns an error, explain it honestly. Do not pretend a payment succeeded.",
    "Be concise and concrete. Amounts you mention must come from the latest tool result.",
  ].join(" ");
}

export function createSession(): string {
  const id = newId("ses");
  getDb()
    .prepare("INSERT INTO agent_sessions (id, created_at) VALUES ($id, $created)")
    .run({ id, created: nowIso() });
  return id;
}

export function ensureSession(sessionId?: string): string {
  if (!sessionId) return createSession();
  const row = getDb().prepare("SELECT id FROM agent_sessions WHERE id = $id").get({ id: sessionId });
  return row ? sessionId : createSession();
}

export function listSessionMessages(sessionId: string): ChatMessage[] {
  return getDb()
    .prepare(
      "SELECT role, content FROM agent_messages WHERE session_id = $sessionId AND role IN ('user','assistant') ORDER BY id ASC",
    )
    .all({ sessionId })
    .map((row) => rowToObject<ChatMessage>(row));
}

function saveMessage(sessionId: string, role: string, content: string, toolTrace?: unknown) {
  getDb()
    .prepare(
      `INSERT INTO agent_messages (session_id, role, content, tool_trace_json, created_at)
       VALUES ($sessionId, $role, $content, $trace, $created)`,
    )
    .run({
      sessionId,
      role,
      content,
      trace: toolTrace ? JSON.stringify(toolTrace) : null,
      created: nowIso(),
    });
}

async function minimaxChat(messages: unknown[], timeoutMs = 45_000): Promise<MiniMaxMessage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${llmBaseUrl()}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${requireEnv("MINIMAX_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llmModel(),
        messages,
        tools: agentToolDefinitions,
        max_tokens: 2048,
      }),
    });
    const payload = (await response.json()) as {
      choices?: Array<{ message?: MiniMaxMessage; finish_reason?: string }>;
      error?: { message?: string };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (!response.ok) {
      throw new Error(payload.error?.message || payload.base_resp?.status_msg || `MiniMax HTTP ${response.status}`);
    }
    const message = payload.choices?.[0]?.message;
    if (!message) {
      throw new Error("MiniMax returned no message");
    }
    return message;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The language model timed out. No PayPal payment was created or changed.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}


export type ToolTraceItem = {
  name: string;
  ok: boolean;
  summary: string;
  input?: string;
  outcome?: string;
  guardrail?: string;
  decidedBy?: string;
  rejected?: boolean;
};

export function listSessionTranscript(sessionId: string): Array<{
  role: string;
  content: string;
  toolTrace?: ToolTraceItem[];
}> {
  return getDb()
    .prepare(
      "SELECT role, content, tool_trace_json FROM agent_messages WHERE session_id = $sessionId AND role IN ('user','assistant') ORDER BY id ASC",
    )
    .all({ sessionId })
    .map((row) => {
      const rec = rowToObject<{ role: string; content: string; tool_trace_json?: string | null }>(row);
      let toolTrace: ToolTraceItem[] | undefined;
      if (rec.tool_trace_json) {
        try {
          const parsed = JSON.parse(rec.tool_trace_json);
          if (Array.isArray(parsed)) {
            toolTrace = parsed.map((item) => {
              if (item && typeof item === "object" && "result" in item && "name" in item) {
                return summarizeTool(item as { name: string; ok: boolean; result: unknown; args?: unknown });
              }
              return item as ToolTraceItem;
            });
          }
        } catch {
          toolTrace = undefined;
        }
      }
      return { role: rec.role, content: rec.content, toolTrace };
    });
}



function formatToolInput(args: unknown): string {
  if (!args || typeof args !== "object") return "No input";
  const rec = args as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof rec.query === "string") parts.push(`search “${rec.query}”`);
  if (typeof rec.sku === "string") parts.push(`SKU ${rec.sku}`);
  if (typeof rec.order_id === "string") parts.push(`order ${rec.order_id}`);
  if (typeof rec.action === "string") parts.push(`action ${rec.action}`);
  const budgetValue =
    typeof rec.budget_cents === "number"
      ? rec.budget_cents
      : typeof rec.max_price_cents === "number"
        ? rec.max_price_cents
        : undefined;
  if (typeof budgetValue === "number") parts.push(`budget $${(budgetValue / 100).toFixed(2)}`);
  if (Array.isArray(rec.items)) {
    parts.push(
      rec.items
        .map((item) => {
          const row = item as { sku?: string; qty?: number };
          return `${row.sku ?? "?"} × ${row.qty ?? "?"}`;
        })
        .join(", "),
    );
  }
  if (Array.isArray(rec.substitute_items)) {
    parts.push(
      rec.substitute_items
        .map((item) => {
          const row = item as { sku?: string; qty?: number };
          return `${row.sku ?? "?"} × ${row.qty ?? "?"}`;
        })
        .join(", "),
    );
  }
  return parts.join(" · ") || "No input";
}

function summarizeTool(execution: { name: string; ok: boolean; result: unknown; args?: unknown }): ToolTraceItem {
  const result = (execution.result ?? {}) as Record<string, unknown>;
  const input = formatToolInput(execution.args);
  const quoteRejected = execution.name === "propose_checkout" && result.ok === false;
  const rejected = !execution.ok || quoteRejected;

  if (!execution.ok) {
    const error = typeof result.error === "string" ? result.error : "Tool failed";
    return {
      name: execution.name,
      ok: false,
      rejected: true,
      input,
      summary: error,
      outcome: error,
      guardrail: "Backend rejected or overrode the agent request",
      decidedBy: "Backend",
    };
  }

  const items = Array.isArray(result.items) ? result.items : [];
  const itemNames = items
    .slice(0, 3)
    .map((item) => {
      const row = item as { name?: string; formatted_price?: string; sku?: string };
      return [row.name || row.sku, row.formatted_price].filter(Boolean).join(" · ");
    })
    .join(", ");

  switch (execution.name) {
    case "search_catalog":
    case "list_catalog":
      return {
        name: execution.name,
        ok: true,
        input,
        summary: `Found ${items.length} catalog item${items.length === 1 ? "" : "s"}`,
        outcome: itemNames || `${items.length} items from the shop database`,
        guardrail: "Price and stock from the catalog, not the model",
        decidedBy: "Catalog",
      };
    case "get_item":
      return {
        name: execution.name,
        ok: true,
        input,
        summary: typeof result.name === "string" ? result.name : "Item lookup",
        outcome: [result.name, result.formatted_price, result.available !== undefined ? `${result.available} available` : ""]
          .filter(Boolean)
          .join(" · "),
        guardrail: "Price and stock from the catalog, not the model",
        decidedBy: "Catalog",
      };
    case "propose_checkout": {
      const formatted = typeof result.formatted_total === "string" ? result.formatted_total : "";
      const errors = Array.isArray(result.errors) ? result.errors.join(" ") : "";
      return {
        name: execution.name,
        ok: true,
        rejected: quoteRejected,
        input,
        summary: quoteRejected ? errors || "Quote rejected" : `Quote ${formatted}`,
        outcome: quoteRejected ? errors : `${formatted} priced from catalog cents`,
        guardrail: quoteRejected
          ? "Backend rejected the quote (stock, price, or budget)"
          : "Backend priced the cart from catalog cents and checked the budget",
        decidedBy: "Policy engine",
      };
    }
    case "create_checkout": {
      const order = (result.order ?? {}) as Record<string, unknown>;
      return {
        name: execution.name,
        ok: true,
        input,
        summary: `Opened a PayPal hold for ${typeof order.formatted_total === "string" ? order.formatted_total : "the quote"}`,
        outcome: typeof order.paypal_order_id === "string" ? `PayPal order ${order.paypal_order_id}` : "PayPal AUTHORIZE order created",
        guardrail: "Amount sent to PayPal came from the catalog, not the model",
        decidedBy: "Backend + PayPal",
      };
    }
    case "get_order_status": {
      const status = typeof result.status === "string" ? result.status : "unknown";
      return {
        name: execution.name,
        ok: true,
        input,
        summary: `Order is ${status}`,
        outcome: status,
        guardrail: "Status read from the shop database",
        decidedBy: "Backend",
      };
    }
    case "investigate_failure": {
      const recommended = typeof result.recommended === "string" ? result.recommended : "review";
      return {
        name: execution.name,
        ok: true,
        input,
        summary: `Recommended recovery: ${recommended}`,
        outcome: `Policy recommended ${recommended}`,
        guardrail: "Alternatives and recommendation from policy plus PayPal GET",
        decidedBy: "Policy engine + PayPal",
      };
    }
    case "propose_recovery": {
      return {
        name: execution.name,
        ok: true,
        input,
        summary: typeof result.message === "string" ? result.message : "Recovery executed",
        outcome: typeof result.message === "string" ? result.message : "Recovery executed",
        guardrail: "Policy engine executed recovery; the model only chose the action",
        decidedBy: "Policy engine + PayPal",
      };
    }
    default:
      return {
        name: execution.name,
        ok: true,
        input,
        summary: "Tool completed",
        outcome: "Completed",
        decidedBy: "Backend",
      };
  }
}

function extractArtifacts(
  executions: Array<{ name: string; ok: boolean; result: unknown }>,
  budgetCents?: number,
) {
  let quote: unknown;
  let order: ReturnType<typeof publicOrderView> | undefined;
  let replacement: ReturnType<typeof publicOrderView> | undefined;
  const catalogItems: Array<Record<string, unknown>> = [];
  for (const execution of executions) {
    if (!execution.ok) continue;
    const result = execution.result as Record<string, unknown>;
    if (execution.name === "propose_checkout") quote = result;
    if (execution.name === "get_item" && typeof result.sku === "string") catalogItems.push(result);
    if ((execution.name === "search_catalog" || execution.name === "list_catalog") && Array.isArray(result.items)) {
      for (const item of result.items) {
        if (item && typeof item === "object") catalogItems.push(item as Record<string, unknown>);
      }
    }
    if (result && typeof result === "object") {
      if (result.order && typeof result.order === "object") {
        order = result.order as ReturnType<typeof publicOrderView>;
      }
      if (result.replacement && typeof result.replacement === "object") {
        replacement = result.replacement as ReturnType<typeof publicOrderView>;
      }
    }
  }
  if (!quote && catalogItems.length > 0) {
    const pick =
      catalogItems.find((item) => Number(item.available ?? item.stock_on_hand ?? 0) > 0) ?? catalogItems[0];
    if (typeof pick.sku === "string") {
      quote = {
        ...publicQuote(quoteItems([{ sku: pick.sku, qty: 1 }], budgetCents, getProjectConfig().currency)),
        pending: true,
      };
    }
  }
  return { quote, order, replacement };
}

export async function runAgentTurn(input: {
  sessionId?: string;
  message: string;
}): Promise<AgentTurnResult> {
  const text = input.message.trim();
  if (!text) {
    throw new Error("Message cannot be empty.");
  }
  const sessionId = ensureSession(input.sessionId);
  saveMessage(sessionId, "user", text);

  const history = listSessionMessages(sessionId);
  const messages: unknown[] = [{ role: "system", content: systemPrompt() }, ...history];

  const executions: Array<{ name: string; ok: boolean; result: unknown; args?: unknown }> = [];
  let finalText = "";

  try {
    for (let step = 0; step < 8; step += 1) {
      const message = await minimaxChat(messages);
      const assistantPayload: Record<string, unknown> = {
        role: "assistant",
        content: message.content ?? "",
      };
      if (message.reasoning_content) assistantPayload.reasoning_content = message.reasoning_content;
      if (message.tool_calls) assistantPayload.tool_calls = message.tool_calls;
      messages.push(assistantPayload);

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const call of message.tool_calls) {
          const name = call.function?.name || "unknown";
          let args: unknown = {};
          try {
            args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            args = {};
          }
          const shopperBudget =
            parseBudgetCents(text) ?? parseBudgetCentsFromMessages(history);
          const corrected = correctToolArgs(name, args, shopperBudget);
          const execution = await executeAgentTool(name, corrected);
          executions.push({ ...execution, args: corrected });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(execution.result),
          });
        }
        continue;
      }

      finalText = visibleAssistantText(message.content);
      break;
    }
  } catch (error) {
    const fallback =
      error instanceof Error
        ? error.message
        : "The assistant could not complete that turn. No payment was invented or changed.";
    saveMessage(sessionId, "assistant", fallback, executions);
    return { sessionId, reply: fallback, toolTrace: executions.map(summarizeTool), ...extractArtifacts(executions, parseBudgetCents(text) ?? parseBudgetCentsFromMessages(history)) };
  }

  if (!finalText) {
    finalText =
      executions.length > 0
        ? "I looked that up, but I did not get a final reply from the model. The tool results above are still authoritative."
        : "I could not produce a reply just then. Please try again.";
  }

  saveMessage(sessionId, "assistant", finalText, executions.map(summarizeTool));
  const shopperBudget = parseBudgetCents(text) ?? parseBudgetCentsFromMessages(history);
  const artifacts = extractArtifacts(executions, shopperBudget);
  return {
    sessionId,
    reply: finalText,
    toolTrace: executions.map(summarizeTool),
    ...artifacts,
  };
}

export function serializeOrder(order: OrderDetails) {
  return publicOrderView(order);
}
