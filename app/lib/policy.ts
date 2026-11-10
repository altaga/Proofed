import { getDb, rowToObject } from "./db";
import { seedCatalogIfEmpty } from "./catalog-seed";

export type CatalogItem = {
  sku: string;
  name: string;
  description: string;
  price_cents: number;
  category: string;
  stock: number;
  active: number;
};

export type RequestedItem = {
  sku: string;
  qty: number;
};

export type QuotedLine = {
  sku: string;
  name: string;
  unit_price_cents: number;
  qty: number;
  line_total_cents: number;
  available: number;
};

export type QuoteResult =
  | {
      ok: true;
      lines: QuotedLine[];
      subtotal_cents: number;
      currency: string;
      budget_cents?: number;
    }
  | {
      ok: false;
      errors: string[];
      lines: QuotedLine[];
      subtotal_cents: number;
      currency: string;
      budget_cents?: number;
    };

export class PolicyError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
    this.details = details;
  }
}

export function normalizeItems(input: unknown): RequestedItem[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new PolicyError("INVALID_ITEMS", "Choose at least one catalog item.");
  }
  const merged = new Map<string, number>();
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      throw new PolicyError("INVALID_ITEMS", "Each item must be an object with sku and qty.");
    }
    const rec = raw as Record<string, unknown>;
    const sku = typeof rec.sku === "string" ? rec.sku.trim() : "";
    const qty = typeof rec.qty === "number" ? rec.qty : Number(rec.qty);
    if (!sku) throw new PolicyError("INVALID_ITEMS", "Every item needs a sku from the catalog.");
    if (!Number.isInteger(qty) || qty < 1) {
      throw new PolicyError("INVALID_ITEMS", `Quantity for ${sku} must be a positive integer.`);
    }
    if ("price" in rec || "price_cents" in rec || "amount" in rec || "unit_price_cents" in rec) {
      // Prices supplied by a model or client are ignored on purpose.
    }
    merged.set(sku, (merged.get(sku) ?? 0) + qty);
  }
  return [...merged.entries()].map(([sku, qty]) => ({ sku, qty }));
}

function ensureCatalog() {
  seedCatalogIfEmpty();
}

export function getCatalogItem(sku: string): CatalogItem | null {
  ensureCatalog();
  const row = getDb().prepare("SELECT * FROM catalog_items WHERE sku = $sku").get({ sku });
  return row ? rowToObject<CatalogItem>(row) : null;
}

export function listCatalog(activeOnly = true): CatalogItem[] {
  ensureCatalog();
  const sql = activeOnly
    ? "SELECT * FROM catalog_items WHERE active = 1 ORDER BY name"
    : "SELECT * FROM catalog_items ORDER BY name";
  return getDb().prepare(sql).all().map((row) => rowToObject<CatalogItem>(row));
}

export function searchCatalog(query: string, maxPriceCents?: number): CatalogItem[] {
  ensureCatalog();
  const q = `%${query.trim().toLowerCase()}%`;
  const rows = getDb()
    .prepare(
      `SELECT * FROM catalog_items
       WHERE active = 1
         AND (lower(name) LIKE $q OR lower(description) LIKE $q OR lower(category) LIKE $q OR lower(sku) LIKE $q)
         AND ($max IS NULL OR price_cents <= $max)
       ORDER BY name`,
    )
    .all({ q, max: maxPriceCents ?? null });
  return rows.map((row) => rowToObject<CatalogItem>(row));
}

export function reservedQty(sku: string): number {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(qty), 0) AS qty
       FROM stock_reservations
       WHERE sku = $sku
         AND released_at IS NULL
         AND consumed_at IS NULL
         AND expires_at > $now`,
    )
    .get({ sku, now: new Date().toISOString() }) as { qty: number | bigint };
  return Number(row.qty ?? 0);
}

export function availableStock(sku: string): number {
  const item = getCatalogItem(sku);
  if (!item || !item.active) return 0;
  return Math.max(0, item.stock - reservedQty(sku));
}

export function quoteItems(input: unknown, budgetCents?: number, currency = "USD"): QuoteResult {
  const requested = normalizeItems(input);
  const errors: string[] = [];
  const lines: QuotedLine[] = [];
  let subtotal = 0;

  for (const item of requested) {
    const catalog = getCatalogItem(item.sku);
    if (!catalog || !catalog.active) {
      errors.push(`Unknown or inactive SKU: ${item.sku}`);
      continue;
    }
    const available = availableStock(item.sku);
    const line: QuotedLine = {
      sku: catalog.sku,
      name: catalog.name,
      unit_price_cents: catalog.price_cents,
      qty: item.qty,
      line_total_cents: catalog.price_cents * item.qty,
      available,
    };
    lines.push(line);
    subtotal += line.line_total_cents;
    if (item.qty > available) {
      errors.push(
        `${catalog.name} (${catalog.sku}) has only ${available} available, but ${item.qty} were requested.`,
      );
    }
  }

  if (budgetCents !== undefined) {
    if (!Number.isInteger(budgetCents) || budgetCents < 0) {
      errors.push("Budget must be a non-negative integer number of cents.");
    } else if (subtotal > budgetCents) {
      errors.push(
        `Quote ${subtotal} cents exceeds the stated budget of ${budgetCents} cents.`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, lines, subtotal_cents: subtotal, currency, budget_cents: budgetCents };
  }
  return { ok: true, lines, subtotal_cents: subtotal, currency, budget_cents: budgetCents };
}

export function alternativesWithinBudget(
  budgetCents: number,
  excludeSkus: string[] = [],
): CatalogItem[] {
  return listCatalog(true).filter(
    (item) =>
      item.price_cents <= budgetCents &&
      !excludeSkus.includes(item.sku) &&
      availableStock(item.sku) > 0,
  );
}
