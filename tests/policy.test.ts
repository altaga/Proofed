import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/catalog-seed";
import { closeDb, getDb } from "../lib/db";
import { availableStock, normalizeItems, quoteItems, searchCatalog } from "../lib/policy";

beforeEach(() => {
  process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), "proofed-policy-")), "test.sqlite");
  closeDb();
  seedCatalog();
});

afterEach(() => {
  closeDb();
});

describe("pricing and stock policy", () => {
  it("reads live catalog prices for a keychain search", () => {
    const items = searchCatalog("keychain");
    expect(items.map((item) => item.sku)).toContain("DC-KEY-01");
    expect(items.find((item) => item.sku === "DC-KEY-01")?.price_cents).toBe(1200);
  });

  it("ignores any price field supplied by the caller or model", () => {
    const quoted = quoteItems([{ sku: "DC-KEY-01", qty: 1, price_cents: 1, amount: "0.01" }]);
    expect(quoted.ok).toBe(true);
    if (quoted.ok) {
      expect(quoted.subtotal_cents).toBe(1200);
      expect(quoted.lines[0].unit_price_cents).toBe(1200);
    }
  });

  it("rejects a cart over budget", () => {
    const quoted = quoteItems([{ sku: "DC-KEY-01", qty: 1 }], 500);
    expect(quoted.ok).toBe(false);
    if (!quoted.ok) {
      expect(quoted.errors.join(" ")).toMatch(/exceeds the stated budget/);
    }
  });

  it("rejects the zero-stock water bottle", () => {
    const quoted = quoteItems([{ sku: "DC-BTL-01", qty: 1 }], 2000);
    expect(quoted.ok).toBe(false);
    if (!quoted.ok) {
      expect(quoted.errors.join(" ")).toMatch(/only 0 available/);
    }
  });

  it("subtracts active reservations from availability", () => {
    expect(availableStock("DC-KEY-01")).toBe(8);
    getDb()
      .prepare(
        `INSERT INTO stock_reservations (id, order_id, sku, qty, expires_at)
         VALUES ('res_test', 'ord_test', 'DC-KEY-01', 3, $expires)`,
      )
      .run({ expires: new Date(Date.now() + 60_000).toISOString() });
    expect(availableStock("DC-KEY-01")).toBe(5);
  });

  it("does not count expired reservations", () => {
    getDb()
      .prepare(
        `INSERT INTO stock_reservations (id, order_id, sku, qty, expires_at)
         VALUES ('res_old', 'ord_old', 'DC-KEY-01', 8, $expires)`,
      )
      .run({ expires: new Date(Date.now() - 60_000).toISOString() });
    expect(availableStock("DC-KEY-01")).toBe(8);
  });

  it("merges duplicate sku lines and rejects bad quantities", () => {
    const items = normalizeItems([
      { sku: "DC-PIN-01", qty: 1 },
      { sku: "DC-PIN-01", qty: 2 },
    ]);
    expect(items).toEqual([{ sku: "DC-PIN-01", qty: 3 }]);
    expect(() => normalizeItems([{ sku: "DC-PIN-01", qty: 0 }])).toThrow(/positive integer/);
  });
});
