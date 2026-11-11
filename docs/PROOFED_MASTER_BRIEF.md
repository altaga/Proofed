# Proofed — The Trust Layer Between AI Payments and the Physical World
> **Mission**: Authorize now. Capture only after verified proof of physical handover.  
> **Positioning**: AI agents can initiate purchases, but they cannot assume that physical delivery succeeds. Proofed connects buyer-approved PayPal authorizations, two-factor physical fulfillment verification, conditional capture, and autonomous exception recovery into one transaction workflow.  
> **Production Deployment**: [https://proofed-ai.vercel.app](https://proofed-ai.vercel.app)  
> **Core PayPal Integration**: PayPal Orders v2 (`intent=AUTHORIZE`) & PayPal Payments v2 (`/capture`, `/void`, `/refund`) with deterministic `PayPal-Request-Id` idempotency.

---

## 1. Executive Summary & Target Market

**Proofed** doesn't just help AI agents buy physical goods. It helps them establish what happened after the purchase—and make the appropriate payment decision.

While digital transactions settle atomically, physical fulfillment is uncertain: couriers arrive at the wrong house number, smart locker solenoids jam, or packages suffer transit damage. If an autonomous shopping agent blindly captures payment upfront, any physical exception forces the buyer and merchant into manual customer support, refund delays, or payment disputes.

### Primary Initial Market: Short-Window Local & Automated Retail
Proofed is purpose-built for **local merchants, micro-fulfillment hubs, stadium/venue commerce, and unattended smart lockers** handling short-duration transactions. Short fulfillment windows align directly with PayPal's authorization lifecycle (29-day authorization validity and **3-day recommended honor period**), avoiding multi-week carrier expiration and reauthorization overhead.

### Complementary Division of Labor: AI vs. Deterministic Code
- **AI Handles Ambiguity & Exceptions**: Interpreting unstructured budget requests, identifying valid inventory, executing multimodal vision inspection via the `verify_handover_evidence` agent tool (measuring address confidence %, parcel integrity %, and placement security %), explaining recovery options to the buyer, and routing contested claims.
- **Deterministic Code Enforces Financial Safety**: Integer-cent catalog pricing (`app/lib/policy.ts`), state-machine transitions (`app/lib/state-machine.ts`), one-time recipient PIN verification, quantitative handover score gating ($\ge 80.0 / 100$), idempotency keys (`PayPal-Request-Id`), and PayPal API execution.

---

## 2. What Proofed Does vs. What It Does NOT Do

| Dimension | What Proofed DOES | What Proofed DOES NOT Do |
|---|---|---|
| **Pricing & Currency** | Computes all quotes, subtotals, and limits strictly in **integer cents** (`$18.50` = `1850`) via deterministic TypeScript against catalog records (`app/lib/policy.ts`). | **NEVER** allows the LLM to invent, discount, calculate, or modify prices. Floating-point currency math is banned. |
| **PayPal Authorization Semantics** | Uses **conditional capture via PayPal Orders v2 (`intent=AUTHORIZE`)**. Displays exact financial state: **`$18.50 authorized · $0.00 captured`**. | Does not mischaracterize PayPal authorizations as legal escrow, nor claim that authorizations leave available bank balances unaffected prior to void settlement. |
| **Two-Factor Quantitative Handover Verification** | Combines **1) MiniMax M3.1 Flash Multimodal Vision Tool (`verify_handover_evidence`)** computing a weighted composite handover score ($\text{Score} = 0.40 \times \text{Address} + 0.40 \times \text{Parcel} + 0.20 \times \text{Placement}$, requiring $\ge 80.0 / 100$) with **2) Server-verified one-time Recipient Handover PIN** (`pickup_code`). | Does not rely on fragile OCR-only text matching or treat a standalone photograph/SHA-256 digest as indisputable proof of customer receipt without recipient acknowledgment. |
| **Tamper-Evident Audit Log** | Records state transitions and evidence digests in an append-only log chained with **server-side HMAC-SHA256 signatures** (`_sig`, `_prev_sig`), plus cross-instance Turso/LibSQL cloud synchronization (`app/lib/db.ts`) for serverless environments. | Does not claim an unsigned local SQLite file is inherently immutable or durable across ephemeral serverless instances. |
| **Authorization Void & Timing** | Voids uncaptured authorizations via PayPal Payments v2 `/void` when delivery fails (`$0.00 captured`), noting that **balance release timing depends on the buyer's payment provider**. | Does not promise instantaneous bank-level balance restoration across all issuing banks. |
| **Exception & Dispute Handling** | Uses **explainable policy rules** (`RULE_CONTRADICTORY_EVIDENCE_ESCALATION`, `RULE_MAX_REDISPATCH_LIMIT_REACHED`) to flag conflicting post-capture claims and escalate them to Merchant Operations with tamper-evident handover evidence attached. | Does not use arbitrary uncalibrated decimal fraud scores, accuse customers of dishonesty automatically, or claim to eliminate PayPal's 180-day dispute rights. |

---

## 3. Four-Step Handover Verification Protocol

To move beyond fragile OCR-only checks or simple image classification into a credible transaction-assurance workflow, Proofed enforces a 4-step handover sequence before capturing funds:

1. **Multimodal Vision Tool (`verify_handover_evidence`)**: Rather than brittle OCR alone, the courier photograph is inspected by **MiniMax M3.1 Flash Multimodal Vision** (`app/lib/vision-audit.ts`), which evaluates three quantitative dimensions and computes a weighted composite score:
   $$\text{overallHandoverScore} = 0.40 \times \text{addressConfidencePct} + 0.40 \times \text{parcelIntegrityPct} + 0.20 \times \text{placementSecurityPct}$$
   - **Valid Delivery (`#744` Intact)**: $0.40(99.4) + 0.40(98.6) + 0.20(96.0) = \mathbf{98.4 / 100} \ge 80.0 \rightarrow \text{Pass}$
   - **Wrong Door (`#742` Mismatch)**: $0.40(12.0) + 0.40(95.0) + 0.20(88.0) = \mathbf{60.4 / 100} < 80.0 \rightarrow \text{Blocked}$
   - **Damaged Carton (`#744` Crushed)**: $0.40(99.0) + 0.40(24.0) + 0.20(80.0) = \mathbf{65.2 / 100} < 80.0 \rightarrow \text{Blocked}$
2. **Customer Handover Code (Recipient Acknowledgment)**: A server-generated, 6-character one-time credential (`pickup_code`) supplied by the recipient (or signed hardware dispense signal at `/device`) and verified server-side. Invalid PINs are rejected (`PICKUP_CODE_MISMATCH`).
3. **Server-Side Gate & Signed Handover Event**: `confirmDelivery()` in `app/lib/orders.ts` enforces both `assertPickupCode()` AND `overallHandoverScore >= 80.0` (`INSUFFICIENT_HANDOVER_SCORE`). Evidence ID, SHA-256 photo digest, quantitative vision metrics, and verified recipient PIN are bound to the `order_id` and `paypal_authorization_id` in an HMAC-SHA256 signed event record.
4. **Conditional PayPal Capture**: Only after steps 1–3 succeed on the server does the backend execute `POST /v2/payments/authorizations/{authorization_id}/capture` with a deterministic `PayPal-Request-Id`.

---

## 4. Explainable Policy Rules (Replacing Arbitrary Risk Scores)

Rather than opaque numerical scores, `app/lib/fraud-audit.ts` evaluates deterministic, explainable policy rules:

| Policy Rule | Trigger Condition | System Action |
|---|---|---|
| `RULE_UNVERIFIED_HANDOVER_RELEASE` | Delivery failed (e.g., Door `#742` OCR mismatch), recipient PIN never used, `$0.00` captured. | **APPROVED**: Executes PayPal `/void` to cancel the authorization. |
| `RULE_PRE_DELIVERY_BUYER_RELEASE` | Buyer cancels order while in `AUTHORIZED` status prior to handover. | **APPROVED**: Executes PayPal `/void`. |
| `RULE_VALID_REDISPATCH_WITHIN_LIMIT` | Delivery failed, buyer requests re-dispatch (`Pedir otro`), previous retry count $< 2$. | **APPROVED**: Re-queues courier dispatch while keeping existing PayPal authorization active within the 3-day honor period. |
| `RULE_CONTRADICTORY_EVIDENCE_ESCALATION` | Buyer requests refund claiming non-delivery *after* Door `#744` OCR, recipient one-time PIN, and SHA-256 photo digest were verified. | **ESCALATED FOR REVIEW**: Pauses automated self-service refund; logs `DISPUTE_ESCALATED_FOR_REVIEW` and attaches tamper-evident handover evidence for Merchant Operations. |
| `RULE_MAX_REDISPATCH_LIMIT_REACHED` | Buyer or bot requests a 3rd consecutive automated re-dispatch ($\ge 2$ retries). | **ESCALATED FOR REVIEW**: Pauses automated re-dispatch (`RETRY_LIMIT_ESCALATED`) and routes to Merchant Concierge. |

---

## 5. The 3-Minute Video & Live Demo Script

### Recommended Presentation Structure (3 Minutes)

| Time | Segment | Key Narrative & Visuals |
|---|---|---|
| **0:00–0:15** | **The Problem** | An AI agent can buy an item in milliseconds, but physical delivery can fail (wrong door, damaged box, jammed locker). |
| **0:15–0:35** | **Proofed & PayPal Authorizations** | Introduce Proofed as the trust layer between AI payments and the physical world using conditional capture (`intent=AUTHORIZE`). |
| **0:35–1:15** | **Full Demo 1: Successful Transaction** | Buyer budget request $\rightarrow$ Buyer approval $\rightarrow$ `$18.50 authorized · $0.00 captured` $\rightarrow$ Courier Door `#744` OCR + Recipient One-Time PIN $\rightarrow$ PayPal `/capture`. |
| **1:15–1:55** | **Full Demo 2: Failed Delivery & Void** | Courier at Door `#742` (Mismatch) $\rightarrow$ Handover blocked $\rightarrow$ AI escalates to buyer chat $\rightarrow$ Buyer selects release $\rightarrow$ PayPal `/void`. |
| **1:55–2:15** | **Policy Escalations (Demos 3 & 4)** | Show `RULE_CONTRADICTORY_EVIDENCE_ESCALATION` (post-capture dispute paused & escalated with evidence) and `RULE_MAX_REDISPATCH_LIMIT_REACHED`. |
| **2:15–2:35** | **Merchant Operational Views & Close** | Show `/merchant` filtered by **"Rejected Fulfillment · Active Auth"** and **"Escalated / Review Required"**, plus HMAC-signed event timeline. |

---

### Detailed Actor-by-Actor Walkthrough

#### Demo 1: Buyer Approval, Two-Factor Handover & Conditional Capture
1. **Shopper (`/client`)**:
   - Enters: *"I have a $20 budget, what snacks or coffee do you have?"*
   - **Agent**: Calls `search_catalog` and `propose_checkout`. Quotes *Ethiopian Yirgacheffe Whole Beans* (`$18.50` = `1850` cents).
   - **Authorization**: Creates PayPal Order (`intent=AUTHORIZE`). Card displays:
     - **`$18.50 authorized · $0.00 captured`**
     - **`RECIPIENT PIN: [6-char one-time code]`**
     - PayPal Order ID & Authorization ID (`Valid 29 days · 3-day honor period`).
   - **System Audit Drawer**: Expand bottom **`System Audit · Inspect logs`** to show real tool calls and policy checks.
2. **Courier (`/delivery`)**:
   - Views manifest for `#744 Maple St, Apt 2B`.
   - Selects **Door #744 (Match)**. Vision verifies `#744` and intact box.
   - In **Step 03 (Recipient Acknowledgment & Handoff)**: verifies 1) Computer Vision OCR, 2) Recipient One-Time PIN, and 3) SHA-256 + Server HMAC binding.
   - Clicks **`Verify recipient PIN & complete handoff`**.
3. **Settlement**:
   - Backend verifies the recipient PIN and photo digest, records the HMAC-signed `DELIVERY_CONFIRMED` event, and calls PayPal `/capture`.

#### Demo 2: Failed Delivery at Door #742, Escalation & Authorization Void
1. **Courier (`/delivery`)**:
   - Selects **Door #742 (Mismatch)**.
   - Computer vision detects doorplate `#742` (+120m from `#744`) and blocks handover: `Blocked — wrong house number`.
   - Courier clicks **`Report delivery failure (Return to hub)`** (pure logistics UI; zero buyer payment jargon).
2. **Shopper (`/client`)**:
   - Agent autonomously escalates the exception into the buyer's chat:
     > *"Delivery Notice: Handover Not Verified... Payment Status: $18.50 authorized · $0.00 captured."*
   - Buyer clicks **`Recibir reembolso (Anular autorización)`**.
   - Policy rule `RULE_UNVERIFIED_HANDOVER_RELEASE` passes; backend calls PayPal `/void`.
   - Shopper sees the **PayPal Authorization Voided Receipt**:
     - Authorized amount: `$18.50`
     - Amount captured: **`$0.00 USD`**
     - Authorization status: **`VOIDED (Release timing depends on payment provider)`**

#### Demo 3 & 4: Contradictory Evidence Escalation & Retry Limits
- **Demo 3 (Post-Capture Contradictory Claim)**: On a `CAPTURED` order where Door `#744` OCR, recipient PIN, and SHA-256 photo digest are on record, the buyer types: *"I never received my package! I want an instant refund!"* The agent evaluates `RULE_CONTRADICTORY_EVIDENCE_ESCALATION`, pauses automated self-service refund, and escalates the case to Merchant Operations with the full fulfillment evidence bundle attached.
- **Demo 4 (Automated Re-dispatch Limit)**: After 2 failed delivery retries, `RULE_MAX_REDISPATCH_LIMIT_REACHED` pauses further automated retries and escalates to Merchant Concierge.

#### Merchant Desk (`/merchant`): Operational Intelligence Views
- Open `/merchant` and toggle the operational filter pills:
  - **`Rejected Fulfillment · Active Auth`** (surfaces orders where delivery failed while a PayPal authorization is still open)
  - **`Escalated / Review Required`** (surfaces orders with contradictory post-capture claims or retry-limit escalations)
  - **`Verified Handover · Captured`**

---

## 6. Programmatic Verification (End-to-End CLI Proof)

Run the live verification script to execute all 4 scenarios against the MiniMax LLM, PayPal Sandbox / order state machine, two-factor PIN check, and HMAC-signed event logger:

```bash
cd app
npx tsx scripts/demo_real_agentic_flow.ts
```

### Live Output Excerpt:
```text
>>> [SCENARIO 1] AUTONOMOUS AGENT COMMERCE & BUYER-APPROVED AUTHORIZATION
Order Created: ord_...
PayPal Sandbox Order ID: ...
PayPal Authorization ID: ...
One-Time Recipient Handover PIN: ...
Financial State: $18.50 authorized · $0.00 captured (intent=AUTHORIZE)

>>> [SCENARIO 2] REAL DELIVERY FAILURE AT DOOR #742 & ESCALATION
Policy Rule: RULE_UNVERIFIED_HANDOVER_RELEASE
Policy Decision: APPROVED
Result: PayPal authorization voided (Status: VOIDED). $0.00 captured; release timing depends on payment provider.

>>> [SCENARIO 3] TWO-FACTOR HANDOVER & CONTRADICTORY CLAIM ESCALATION
Server-Side PIN Guardrail: Invalid PIN rejected -> Recipient handover PIN does not match the server-generated credential for this order.
Handover Status: CAPTURED
Tamper-Evident Event Record: PAYPAL_CAPTURED -> {"paypal_capture_id":"...","_prev_sig":"...","_sig":"..."}
Policy Rule: RULE_CONTRADICTORY_EVIDENCE_ESCALATION
Result: Self-service refund paused & ESCALATED TO MERCHANT OPERATIONS with tamper-evident handover evidence attached.

>>> [SCENARIO 4] AUTOMATED RE-DISPATCH LIMIT & CONCIERGE ESCALATION
Policy Rule: RULE_MAX_REDISPATCH_LIMIT_REACHED
Result: Automated retry paused & ESCALATED TO MERCHANT CONCIERGE.
```

---

## 7. Distributed Persistence Architecture (Turso LibSQL for Serverless)

To address the ephemeral storage limitations of serverless platforms (Vercel Lambda), Proofed implements a **hybrid dual-persistence architecture**:

- **Local Development & Fast CI**: Uses Node.js native `node:sqlite` in-memory or file mode (`data/app.sqlite`), ensuring all unit and integration tests run offline in $<3$ seconds without external dependencies.
- **Hosted Multi-Instance Serverless (Production)**: When `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set, the database adapter (`app/lib/db.ts`) synchronizes orders, items, and HMAC-signed event records across all serverless lambda instances globally via **Turso (LibSQL Serverless SQLite)**.
- **Zero-Friction Dialect Compatibility**: Because Turso executes the SQLite/LibSQL wire protocol, 100% of the integer-cent schema, index structures, and transactions remain identical without requiring Postgres dialect translations.
- **Cross-Instance Hydration & Fallback**: If an order was initialized on one serverless instance, any subsequent request to another instance automatically rehydrates and verifies the state from the distributed cloud store.

