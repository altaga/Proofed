export function parseBudgetCents(text: string): number | undefined {
  if (!text) return undefined;
  const patterns = [
    /\$\s*(\d+(?:\.\d{1,2})?)/,
    /(\d+(?:\.\d{1,2})?)\s*(?:usd|dollars?)\b/i,
    /\bbudget(?:\s+of|\s+is)?\s*\$?\s*(\d+(?:\.\d{1,2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const dollars = Number(match[1]);
    if (Number.isFinite(dollars) && dollars > 0 && dollars < 100_000) {
      return Math.round(dollars * 100);
    }
  }
  return undefined;
}

export function parseBudgetCentsFromMessages(messages: Array<{ role?: string; content?: string }>): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (item.role !== "user" || !item.content) continue;
    const parsed = parseBudgetCents(item.content);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

export function normalizeMoneyCents(value: number, shopperBudgetCents?: number): number {
  if (!Number.isFinite(value) || value <= 0) return value;
  if (shopperBudgetCents !== undefined) {
    if (value === shopperBudgetCents) return shopperBudgetCents;
    if (value === Math.round(shopperBudgetCents / 100)) return shopperBudgetCents;
    if (value === shopperBudgetCents * 10) return shopperBudgetCents;
    if (value === shopperBudgetCents * 100) return shopperBudgetCents;
    return shopperBudgetCents;
  }
  if (Number.isInteger(value) && value < 500) return value * 100;
  return value;
}

export function correctToolArgs(
  name: string,
  args: unknown,
  shopperBudgetCents?: number,
): Record<string, unknown> {
  const rec = args && typeof args === "object" ? { ...(args as Record<string, unknown>) } : {};
  if (typeof rec.max_price_cents === "number") {
    rec.max_price_cents = normalizeMoneyCents(rec.max_price_cents, shopperBudgetCents);
  }
  if (typeof rec.budget_cents === "number") {
    rec.budget_cents = normalizeMoneyCents(rec.budget_cents, shopperBudgetCents);
  }
  if (shopperBudgetCents !== undefined) {
    if (name === "search_catalog" || name === "list_catalog") {
      rec.max_price_cents = shopperBudgetCents;
    }
    if (name === "propose_checkout" || name === "create_checkout") {
      rec.budget_cents = shopperBudgetCents;
    }
  }
  return rec;
}
