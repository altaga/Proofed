import { describe, expect, it } from "vitest";
import { correctToolArgs, normalizeMoneyCents, parseBudgetCents } from "../lib/budget";

describe("shopper budget parsing", () => {
  it("reads a $20 spoken budget as 2000 cents", () => {
    expect(parseBudgetCents("I have a $20 budget. Do you have a keychain?")).toBe(2000);
    expect(parseBudgetCents("budget of 20 dollars")).toBe(2000);
    expect(parseBudgetCents("My budget is $20.00")).toBe(2000);
  });

  it("corrects model cents mistakes against the shopper budget", () => {
    expect(normalizeMoneyCents(20000, 2000)).toBe(2000);
    expect(normalizeMoneyCents(20, 2000)).toBe(2000);
    expect(normalizeMoneyCents(2000, 2000)).toBe(2000);
  });

  it("overrides search max_price_cents so the card shows $20 not $200", () => {
    const corrected = correctToolArgs(
      "search_catalog",
      { query: "keychain", max_price_cents: 20000 },
      2000,
    );
    expect(corrected.max_price_cents).toBe(2000);
    const injected = correctToolArgs("search_catalog", { query: "keychain" }, 2000);
    expect(injected.max_price_cents).toBe(2000);
  });

  it("forces propose_checkout to use the shopper budget", () => {
    const corrected = correctToolArgs(
      "propose_checkout",
      { items: [{ sku: "DC-KEY-01", qty: 1 }], budget_cents: 20 },
      2000,
    );
    expect(corrected.budget_cents).toBe(2000);
  });
});
