# Fintech & Payment Guardrails

These non-negotiable rules govern all monetary operations, state transitions, and payment integrations in Proofed.

---

## 1. Zero-Trust AI Pricing

> [!CRITICAL]
> The Language Model (LLM) must NEVER determine, calculate, or alter monetary values.

- The model only supplies `sku` and `quantity`.
- All prices, discounts, taxes, and totals MUST be calculated by `app/lib/policy.ts` using catalog values stored as integer cents in SQLite.
- Any attempt by an LLM prompt or output to specify an `amount` must be ignored or explicitly overridden by the policy engine.

---

## 2. Authorize Before Capture

> [!IMPORTANT]
> Funds must never be captured at checkout. Every checkout begins with `intent=AUTHORIZE`.

- Orders v2 creates an authorization hold.
- Capture via Payments v2 is strictly gated behind verified handover evidence (pickup code, station identity, optional photo hash).
- If handover does not occur within the policy window, the hold must be released via Payments v2 `/void`.

---

## 3. Mandatory Idempotency

- Every mutation request sent to PayPal must include a deterministic `PayPal-Request-Id` header.
- The key format is: `{orderId}-{operation}-{timestamp}`.
- Re-transmissions of identical actions must produce identical results without duplicate authorizations or captures.

---

## 4. Append-Only Audit Trail

- All order mutations, state transitions, tool invocations, and payment webhook payloads must be written to the append-only `order_events` table in SQLite.
- Events cannot be updated or deleted.
- The UI surfaces these raw events directly to the Merchant Desk for verifiable auditability.

---

## 5. Integer Cents Only

- No floating point arithmetic for currency.
- All internal representations use integers representing cents (`$12.00` = `1200`).
- Formatting to human-readable dollar strings (`$12.00`) occurs solely at the presentation boundary via `app/lib/money.ts`.
