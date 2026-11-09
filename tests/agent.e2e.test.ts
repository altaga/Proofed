import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAgentTurn } from "../lib/agent";
import { closeDb } from "../lib/db";

const haveLlm = Boolean(process.env.MINIMAX_API_KEY);

describe.skipIf(!haveLlm)("MiniMax-M3 agent e2e", () => {
  beforeEach(() => {
    process.env.SQLITE_PATH = join(mkdtempSync(join(tmpdir(), "proofed-agent-")), "test.sqlite");
    closeDb();
  });
  afterEach(() => closeDb());

  it("calls a catalog tool and reports the real keychain price", async () => {
    const result = await runAgentTurn({
      message: "Do you sell a keychain? What does it cost? Use your tools; do not guess.",
    });
    expect(result.toolTrace.some((item) => item.name.includes("catalog") && item.ok)).toBe(true);
    expect(result.reply).toMatch(/\$?12(\.00)?|1200/);
    expect(result.reply.toLowerCase()).not.toMatch(/\$99|one million/);
  }, 90_000);

  it("surfaces the genuine out-of-stock water bottle", async () => {
    const result = await runAgentTurn({
      message:
        "Please propose checkout for SKU DC-BTL-01 quantity 1 with a 2000 cent budget. Use propose_checkout.",
    });
    expect(
      result.toolTrace.some((item) => item.name === "propose_checkout" || item.name === "create_checkout"),
    ).toBe(true);
    const blob = JSON.stringify(result).toLowerCase();
    expect(blob).toMatch(/0 available|out of stock|no stock|only 0/);
  }, 90_000);
});
