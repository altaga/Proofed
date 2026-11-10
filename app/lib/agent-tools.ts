import { z } from "zod";
import { getProjectConfig } from "./config";
import { formatMoney } from "./money";
import {
  availableStock,
  getCatalogItem,
  listCatalog,
  quoteItems,
  searchCatalog,
} from "./policy";
import {
  createCheckout,
  getOrderDetails,
  investigateFailure,
  publicOrderView,
  publicQuote,
  recoverOrder,
} from "./orders";

const itemList = z
  .array(
    z.object({
      sku: z.string().min(1),
      qty: z.number().int().positive(),
    }),
  )
  .min(1);

export const agentToolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "search_catalog",
      description:
        "Search the live venue catalog. Returns real SKUs, names, prices in cents, and available stock from the shop database.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text such as keychain, pin, or mug" },
          max_price_cents: {
            type: "integer",
            description: "Optional maximum unit price in cents",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_catalog",
      description: "List every active catalog item with live prices and available stock.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_item",
      description: "Get one catalog item by SKU.",
      parameters: {
        type: "object",
        properties: { sku: { type: "string" } },
        required: ["sku"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_checkout",
      description:
        "Validate a cart against live prices, stock, and an optional budget. Does not charge the customer. Do not pass prices; the backend looks them up.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { sku: { type: "string" }, qty: { type: "integer" } },
              required: ["sku", "qty"],
            },
          },
          budget_cents: { type: "integer" },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_checkout",
      description:
        "Create a real PayPal AUTHORIZE order after the customer agrees to the quote. The backend sets the amount from the catalog. Returns a PayPal order id the shopper must approve.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { sku: { type: "string" }, qty: { type: "integer" } },
              required: ["sku", "qty"],
            },
          },
          budget_cents: { type: "integer" },
          note: { type: "string" },
        },
        required: ["items"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_order_status",
      description: "Look up a shop order, its state, pickup code (after authorization), and PayPal ids.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "investigate_failure",
      description:
        "Inspect a failed or stuck order using the shop database and live PayPal GET calls. Suggests substitute SKUs within the original budget.",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "propose_recovery",
      description:
        "Execute a recovery action. retry: send the same authorized order back to the pickup station. cancel: VOID an authorization or REFUND a capture. substitute: release the previous payment and create a new AUTHORIZE order for replacement SKUs.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          action: { type: "string", enum: ["substitute", "retry", "cancel"] },
          substitute_items: {
            type: "array",
            items: {
              type: "object",
              properties: { sku: { type: "string" }, qty: { type: "integer" } },
              required: ["sku", "qty"],
            },
          },
        },
        required: ["order_id", "action"],
      },
    },
  },
];

export type ToolExecution = {
  name: string;
  ok: boolean;
  result: unknown;
};

function presentItem(sku: string) {
  const item = getCatalogItem(sku);
  if (!item) return null;
  const cfg = getProjectConfig();
  return {
    sku: item.sku,
    name: item.name,
    description: item.description,
    category: item.category,
    price_cents: item.price_cents,
    formatted_price: formatMoney(item.price_cents, cfg.currency),
    stock_on_hand: item.stock,
    available: availableStock(item.sku),
    source: "catalog_db",
  };
}

export async function executeAgentTool(name: string, rawArgs: unknown): Promise<ToolExecution> {
  try {
    switch (name) {
      case "search_catalog": {
        const args = z.object({ query: z.string(), max_price_cents: z.number().int().optional() }).parse(rawArgs);
        const items = searchCatalog(args.query, args.max_price_cents).map((item) => presentItem(item.sku));
        return { name, ok: true, result: { items, source: "catalog_db" } };
      }
      case "list_catalog": {
        return {
          name,
          ok: true,
          result: { items: listCatalog(true).map((item) => presentItem(item.sku)), source: "catalog_db" },
        };
      }
      case "get_item": {
        const args = z.object({ sku: z.string() }).parse(rawArgs);
        const item = presentItem(args.sku);
        if (!item) return { name, ok: false, result: { error: `Unknown SKU ${args.sku}` } };
        return { name, ok: true, result: item };
      }
      case "propose_checkout": {
        const args = z
          .object({ items: itemList, budget_cents: z.number().int().optional() })
          .parse(rawArgs);
        return {
          name,
          ok: true,
          result: publicQuote(quoteItems(args.items, args.budget_cents, getProjectConfig().currency)),
        };
      }
      case "create_checkout": {
        const args = z
          .object({
            items: itemList,
            budget_cents: z.number().int().optional(),
            note: z.string().optional(),
          })
          .parse(rawArgs);
        const order = await createCheckout({
          items: args.items,
          budgetCents: args.budget_cents,
          note: args.note,
          actor: "agent",
        });
        return {
          name,
          ok: true,
          result: {
            order: publicOrderView(order),
            next_step:
              "Ask the shopper to approve the PayPal AUTHORIZE button shown in the UI. Do not invent a pickup code until the order is AUTHORIZED.",
          },
        };
      }
      case "get_order_status": {
        const args = z.object({ order_id: z.string() }).parse(rawArgs);
        return { name, ok: true, result: publicOrderView(getOrderDetails(args.order_id)) };
      }
      case "investigate_failure": {
        const args = z.object({ order_id: z.string() }).parse(rawArgs);
        return { name, ok: true, result: await investigateFailure(args.order_id) };
      }
      case "propose_recovery": {
        const args = z
          .object({
            order_id: z.string(),
            action: z.enum(["substitute", "retry", "cancel"]),
            substitute_items: itemList.optional(),
          })
          .parse(rawArgs);
        if (args.action === "substitute" && !args.substitute_items) {
          return {
            name,
            ok: false,
            result: { error: "substitute_items are required when action is substitute" },
          };
        }
        const recovered = await recoverOrder({
          orderId: args.order_id,
          action: args.action,
          substituteItems: args.substitute_items,
          actor: "agent",
        });
        return {
          name,
          ok: true,
          result: {
            message: recovered.message,
            order: publicOrderView(recovered.order),
            replacement: recovered.replacement ? publicOrderView(recovered.replacement) : undefined,
          },
        };
      }
      default:
        return { name, ok: false, result: { error: `Unknown tool ${name}` } };
    }
  } catch (error) {
    return {
      name,
      ok: false,
      result: { error: error instanceof Error ? error.message : "tool_failed" },
    };
  }
}
