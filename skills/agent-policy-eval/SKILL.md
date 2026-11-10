---
name: agent-policy-eval
description: Evaluation, safety validation, and testing procedures for the Proofed MiniMax agent and policy engine guardrails.
---

# Agent Policy Evaluation Skill

This skill explains how the Proofed assistant interacts with the MiniMax model, how tool calls are bounded by the policy engine, and how to verify guardrail invariants.

## The Agent Paradigm in Proofed

In Proofed, the conversational model is treated as **untrusted for financial decisions**.
The LLM serves as a conversational parser and recommender, but never computes prices or overrides inventory rules.

### Tool Call Architecture

The agent interacts via 3 structured tools:
1. `search_catalog({ query, max_price_usd? })`: Searches products by keyword or category.
2. `propose_quote({ sku, quantity })`: Requests a price quote for a SKU. The engine returns the exact catalog price in cents.
3. `substitute_item({ original_order_id, new_sku })`: Proposes a replacement product if handover failed.

### The Guardrail Rules Evaluated

1. **No LLM Amounts**: Any price passed by a model in prompts or tool responses is discarded. `lib/policy.ts` reads prices directly from SQLite in integer cents (`price_cents`).
2. **Budget Enforcement**: Shopper messages stating budgets (e.g. "I have a $20 budget") are parsed by `lib/budget.ts` into integer cents (`2000`). If a proposed cart exceeds this, the quote is rejected or warned.
3. **Out-of-Stock Rejection**: The catalog includes a seeded out-of-stock item (`DC-BTL-01`). If an agent attempts to quote it, the policy engine rejects the quote with a hard backend override.
4. **Append-Only Action Traces**: Every tool call, raw prompt response, and backend override is logged in the `AgentLog` component for transparent judge auditing.

## Running Agent Tests

```bash
# Run agent unit and flow tests
npm run test:agent

# Run budget and policy engine unit tests
npm test
```

## Adding New Tools or Guardrails

1. Define the tool schema in `app/lib/agent-tools.ts`.
2. Implement backend execution in `app/lib/agent.ts` with explicit type safety.
3. Ensure all financial checks resolve against `app/lib/policy.ts` and `app/lib/db.ts`.
4. Add unit test assertions in `app/tests/agent.e2e.test.ts`.
