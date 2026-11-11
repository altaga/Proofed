# Proofed — Autonomous Commerce & Physical Handover Settlement
> **Mission**: Authorize now. Capture only after verified proof of physical handover.  
> **Production Deployment**: [https://proofed-ai.vercel.app](https://proofed-ai.vercel.app)  
> **Hackathon Target**: PayPal AI Hackathon 2026  
> **Core Integration**: PayPal Orders v2 (`intent=AUTHORIZE`) & PayPal Payments v2 (`/capture`, `/void`, `/refund`)

---

## 1. Executive Summary

**Proofed** solves the fundamental accountability gap in agentic physical commerce.

While digital transactions can execute atomically (pay token $\rightarrow$ receive digital file), physical delivery is messy: couriers deliver to the wrong house number, locker solenoids jam, packages arrive crushed, and dishonest customers commit friendly fraud by falsely claiming items were never delivered.

Because of this friction, autonomous AI agents cannot safely use standard consumer payment methods. If an AI agent blindly swipes a card or captures funds upfront, every real-world delivery exception creates a 14-day chargeback dispute, merchant processing penalties, and buyer mistrust.

**Proofed eliminates this friction through a strict zero-trust protocol:**
1. **Zero-Trust Pricing**: The AI agent never decides prices. All quotes are computed deterministically in integer cents against a SQLite catalog.
2. **Pre-Handover Hold**: When a customer confirms an item, PayPal Orders v2 creates an authorization hold (`intent: "AUTHORIZE"`). **Exactly $0.00 is charged upfront.**
3. **Computer Vision Verification**: At the delivery doorstep or locker kiosk, edge computer vision performs doorplate OCR and box integrity checks.
4. **Conditional Capture**: Funds are captured via PayPal Payments v2 **ONLY** when immutable proof of physical handover (cryptographic photo hash, doorplate OCR match, timestamp) is committed to the ledger.
5. **Autonomous Escalation & Anti-Fraud**: If delivery fails, the agent escalates the issue directly to the customer in chat. If a malicious customer attempts friendly fraud, the agent cross-references the immutable physical ledger and blocks the refund attempt.

---

## 2. What Proofed Does vs. What It Does NOT Do

| Capability | What Proofed DOES | What Proofed DOES NOT Do |
|---|---|---|
| **Pricing & Money** | Calculates all prices, subtotals, and taxes strictly in **integer cents** ($18.50 = `1850`) via deterministic TypeScript policy (`app/lib/policy.ts`). | **NEVER** allows the LLM to invent, discount, calculate, or hallucinate prices or currency amounts. Floating-point currency math is banned. |
| **Payment Flow** | Stages checkouts with PayPal Orders v2 using `intent: "AUTHORIZE"`. Buyer sees an authorization hold with `$0.00` charged until delivery. | **NEVER** uses `intent: "CAPTURE"` upfront. Funds are never debited before physical proof is established. |
| **Physical Verification** | Uses computer vision to read doorstep numbers (`#744` vs `#742`), inspect packaging condition, and compute SHA-256 hashes of handover photos. | Does not rely on unverified human trust or unverifiable driver checkboxes. |
| **Actor Separation** | Isolates actor interfaces: Shopper (`/client`), Courier (`/delivery`), Kiosk (`/device`), and Seller (`/merchant`). Couriers only see delivery logistics. | **NEVER** exposes buyer financial details, PayPal IDs, or hold statuses to the courier on `/delivery`. |
| **Fulfillment Failures** | Autonomously detects physical mismatches (e.g., door `#742` instead of `#744`), returns package to hub, and escalates to buyer chat with options (`Pedir otro` or `Recibir reembolso`). | Does not silently cancel orders without buyer input, nor does it leave authorization holds hanging indefinitely. |
| **Dispute & Fraud Defense** | Cross-references customer refund claims against immutable physical evidence (`evidence` table). Blocks friendly fraud if photo hash confirms delivery. | Does not blindly issue refunds when physical proof contradicts the claim. |
| **Velocity Limits** | Caps automated re-dispatches to 2 attempts per destination before requiring human Merchant Concierge review. | Does not permit infinite automated re-dispatch loops from malicious users or bots. |

---

## 3. Why This Is Critical for PayPal

1. **Unlocking Autonomous Agentic Commerce**:  
   AI agents will conduct trillions of dollars in physical commerce over the next decade. Autonomous agents cannot operate on traditional credit card rails where funds are captured blindly. PayPal's `intent: "AUTHORIZE"` provides the ideal programmatic escrow layer.
2. **Re-Activating Underutilized Core PayPal Infrastructure**:  
   Most modern e-commerce implementations default to immediate capture (`intent: "CAPTURE"`). Proofed showcases the true power of PayPal Orders v2 two-phase commit: **Authorize $\rightarrow$ Verify Physical Handover $\rightarrow$ Capture (or Void)**.
3. **Eliminating the 14-Day Chargeback Dispute Window**:  
   Traditional disputes cost merchants \$15–\$50 in dispute fees plus lost merchandise. By retaining holds and capturing *only* upon verified handover—backed by cryptographic photo hashes and OCR—Proofed prevents chargebacks from ever occurring.
4. **True Two-Sided Trust**:  
   - **Shopper Peace of Mind**: Shoppers know their money never leaves their account until the package is physically at their door.
   - **Merchant Protection**: Merchants are shielded against friendly fraud (false "item not received" claims) through cryptographic audit trails.

---

## 4. System Architecture & Actor Surfaces

```
                    ┌────────────────────────────────────────────────────────┐
                    │                      MINIMAX LLM                       │
                    │        (Natural Language & Tool Calling Engine)        │
                    └───────────▲────────────────────────────────▲───────────┘
                                │                                │
                      Tool Calls│                      Tool Calls│
                      (Search,  │                      (Audit,   │
                      Quote)    │                      Recover)  │
                                │                                │
┌───────────────────────────────┴──────────┐   ┌─────────────────┴────────────────────────┐
│             SHOPPER APP                  │   │              MERCHANT DESK               │
│               (/client)                  │   │          (/merchant & /backend)          │
│ • Natural language chat with budget      │   │ • Real-time order ledger (AG Grid)       │
│ • Zero-trust catalog pricing             │   │ • Active holds vs. captured revenue      │
│ • PayPal hold badge ($0.00 charged)      │   │ • Append-only event audit trail          │
│ • Autonomous escalation on delivery fail │   │ • Fraud attempt alerts & evidence drawer │
└───────────────────────▲──────────────────┘   └─────────────────▲────────────────────────┘
                        │                                        │
                        │               SQLITE LEDGER            │
                        │    (node:sqlite · Immutable Evidence)  │
                        └───────┬────────────────────────┬───────┘
                                │                        │
                                │                        │
┌───────────────────────────────┴──────────┐   ┌─────────┴────────────────────────────────┐
│             COURIER APP                  │   │               PAYPAL APIS                │
│              (/delivery)                 │   │      (Orders v2 & Payments v2)           │
│ • Physical manifest (#744 Maple St)      │   │ • POST /v2/checkout/orders (AUTHORIZE)   │
│ • Edge Computer Vision (Doorplate OCR)   │   │ • POST /v2/payments/authorizations/      │
│ • Box condition assessment               │   │        {id}/capture                      │
│ • Zero payment jargon (Pure logistics)   │   │ • POST /v2/payments/authorizations/      │
└──────────────────────────────────────────┘   │        {id}/void                         │
                                               └──────────────────────────────────────────┘
```

---

## 5. The 4 Real-World Agentic Demos (Step-by-Step Script)

### Screen Setup for Demonstrations
Open two browser windows side-by-side:
- **Left Window (Shopper)**: `https://proofed-ai.vercel.app/client`
- **Right Window (Courier)**: `https://proofed-ai.vercel.app/delivery`
*(Optional 3rd Window on second screen for Merchant/Auditor: `/merchant` or `/backend`)*

---

### Demo 1: Autonomous Commerce & Automated Hold (`intent=AUTHORIZE`)
> **Core Concept**: Autonomous AI shopping with strict budget guardrails, verified integer cent pricing, and zero upfront capture.

| Step | Actor | Action & UI Flow | Agentic Under-the-Hood Behavior |
|:---:|:---:|---|---|
| **1.1** | **Shopper** (`/client`) | Enters: *"I have a $20 budget, what snacks or coffee do you have?"* | MiniMax LLM executes tools: `search_catalog` and `propose_checkout`. Parses budget (\$20 = 2000¢). Queries catalog for items $\le$ 2000¢. |
| **1.2** | **Agent** | Returns quote for *Ethiopian Yirgacheffe Whole Beans* (\$18.50 = 1850¢). | Validates stock and pricing against SQLite integer cents. Zero pricing hallucination. |
| **1.3** | **Shopper** (`/client`) | Observes product quote card with official SVG illustration and **Powered by PayPal** badge: `Hold active · $0.00 charged · PIN: [6-char]`. | Calls PayPal Orders v2 with `intent: "AUTHORIZE"`. PayPal authorization hold ID generated. |
| **1.4** | **Auditor** (`/client`) | Opens bottom drawer: **`System Audit · Inspect logs`**. | Shows live execution trace: tool arguments, policy compliance check, zero-trust integer verification (`PASS`). |
| **1.5** | **Seller** (`/merchant`) | Refreshes merchant console. | Order appears as `AUTHORIZED`. Funds held: `$18.50`. Funds captured: `$0.00`. |
| **1.6** | **Courier** (`/delivery`) | Arrives at destination `#744 Maple St`. Selects **Door #744 (Match)** and clicks **`Verify delivery & complete handoff`**. | Edge Vision AI verifies door number matches manifest. Generates SHA-256 photo hash. |
| **1.7** | **System** | Order status flips to `CAPTURED`. Shopper sees verified delivery; Seller sees `$18.50` captured. | Server calls PayPal Payments v2 `/capture` strictly upon receipt of verified physical evidence. |

---

### Demo 2: Real Physical Delivery Failure & Autonomous Escalation
> **Core Concept**: Courier arrives at the wrong house. Vision AI rejects handover. Zero dollars charged. Agent autonomously escalates incident to the buyer chat and allows instant release of hold.

| Step | Actor | Action & UI Flow | Agentic Under-the-Hood Behavior |
|:---:|:---:|---|---|
| **2.1** | **Shopper** (`/client`) | Has an active order destined for **#744 Maple St**. | Order is in `AUTHORIZED` state with \$0.00 debited. |
| **2.2** | **Courier** (`/delivery`) | Arrives at address, takes photo. Selects sample **Door #742 (Mismatch)**. | Vision AI runs doorstep OCR, detects doorplate `#742` instead of `#744` (+120m distance). |
| **2.3** | **Courier** (`/delivery`) | Screen flags: `Blocked — wrong house number. Handover rejected.` Courier clicks **`Report delivery failure (Return to hub)`**. | Courier UI contains zero payment jargon. Package custody returned to hub. Order status becomes `DELIVERY_FAILED`. |
| **2.4** | **Seller** (`/merchant`) | Console updates: Order status `DELIVERY_FAILED`. | Append-only event logged: `DELIVERY_FAILED` (Actor: `courier_vision`, Reason: `wrong_address`). Hold remains uncaptured. |
| **2.5** | **Shopper** (`/client`) | Agent **autonomously escalates** the incident directly into chat: *"Delivery Notice: Handover Not Verified. Courier arrived at door #742... Your funds remain 100% safe ($0.00 debited)."* | Background poller detects physical exception and initiates natural language recovery prompt with 2 action buttons. |
| **2.6** | **Shopper** (`/client`) | Clicks **`Recibir reembolso (Liberar retención)`** (or types *"reembolso"*). | Triggers Anti-Fraud engine `evaluateFraudAudit(orderId, 'refund')`. Engine confirms failure was genuine (Risk Score: `0.04 LOW · PASS`). |
| **2.7** | **System** | Calls PayPal Payments v2 `/void`. Displays **Official Settlement & Refund Receipt**: Original Hold: `$18.50`, Charged: **`$0.00 USD`**, Returned: **`100% available`**, Audit Decision: **`APPROVED`**. | Hold is instantly released. Zero banking delays. Seller inventory is safely unlocked. |

---

### Demo 3: Friendly Fraud Claim Blocked by Cryptographic Evidence
> **Core Concept**: A dishonest customer claims they never received a package that was actually delivered. The agent audits the immutable physical ledger, cross-references photo hashes, and blocks the refund.

| Step | Actor | Action & UI Flow | Agentic Under-the-Hood Behavior |
|:---:|:---:|---|---|
| **3.1** | **Context** | Order was successfully delivered to **#744 Maple St** in Demo 1. Order status is `CAPTURED`. | The SQLite database holds an immutable evidence record: doorplate `#744` match, timestamp, and photo SHA-256 hash. |
| **3.2** | **Malicious Shopper** (`/client`) | Types in chat: *"I never received my package! I want an instant refund!"* | MiniMax agent receives complaint and calls tool `audit_fraud_risk(orderId, 'refund')`. |
| **3.3** | **Agent Anti-Fraud** | Evaluates claim against immutable physical ledger: 1) Delivery confirmed? `YES`. 2) Photo hash on record? `YES (SHA-256)`. 3) Captured upon proof? `YES`. | Computes Risk Score: **`0.95 (CRITICAL)`**. Flags: `CONTRADICTS_PHYSICAL_PROOF`, `VERIFIED_PHOTO_ON_RECORD`. Policy decision: `BLOCKED`. |
| **3.4** | **Shopper** (`/client`) | Agent replies with firm rejection: *"Refund BLOCKED by Zero-Trust Audit: Physical handover was verified at doorstep #744 with cryptographic photo hash (SHA: 86bd1711...). Non-delivery claims contradict immutable ledger evidence."* | The agent protects the merchant from friendly fraud without needing human intervention. |
| **3.5** | **Seller** (`/merchant`) | Merchant console logs event: `FRAUD_ATTEMPT_BLOCKED` (Risk: 0.95). | Merchant is saved from a 14-day PayPal dispute and penalty fees. |

---

### Demo 4: Velocity & Loop Abuse Prevention
> **Core Concept**: Prevent automated bots or malicious users from repeatedly requesting re-dispatches after consecutive delivery failures.

| Step | Actor | Action & UI Flow | Agentic Under-the-Hood Behavior |
|:---:|:---:|---|---|
| **4.1** | **Shopper** (`/client`) | After a delivery failure, shopper selects **`Pedir otro (Re-enviar a 744 Maple St)`**. | Agent calls `evaluateFraudAudit(orderId, 'retry')`. Retry count = 1. Decision: `APPROVED (Risk: 0.12)`. Re-dispatch scheduled. |
| **4.2** | **Shopper / Bot** (`/client`) | After repeated consecutive failures, user attempts a 3rd re-dispatch. | Velocity counter evaluates `RECOVERY_RETRY >= 2`. |
| **4.3** | **Agent Anti-Fraud** | Risk evaluation triggers: **Risk Score: `0.88 (HIGH)`**. Flag: `VELOCITY_LIMIT_EXCEEDED`, `REPEAT_FAILURE_LOOP_DETECTED`. Decision: `BLOCKED`. | Agent frena el bucle: *"Re-dispatch BLOCKED by Anti-Fraud Guardrail: Maximum automated attempts (2) reached for destination #744 Maple St. Case escalated to Merchant Concierge."* |
| **4.4** | **Seller** (`/merchant`) | Order is locked with a warning tag for manual merchant resolution. | Protects courier fleet and warehouse inventory from runaway automated dispatch loops. |

---

## 6. Programmatic Verification (Proof It Is 100% Agentic)

Judges, evaluators, and peer AI agents can independently verify that every scenario, tool invocation, and cryptographic check is 100% operational by running:

```bash
# From workspace root:
cd app
npx tsx scripts/demo_real_agentic_flow.ts
```

### Live Script Output:
```text
================================================================================
PROOFED: 100% AGENTIC COMMERCE & ANTI-FRAUD VERIFICATION DEMO RUNNER
Mission: Authorize now. Capture only on verified proof of physical handover.
================================================================================

>>> [SCENARIO 1] AUTONOMOUS AGENT COMMERCE WITH BUDGET
Prompt: 'I have a $20 budget, what snacks or coffee do you have?'
Agent Tools Executed: [
  'search_catalog -> Found 1 catalog item',
  'list_catalog -> Found 68 catalog items',
  'propose_checkout -> Quote $18.50'
]
Order Created: ord_mwc1c73r3366328f60
Status: AUTHORIZED (intent=AUTHORIZE, PIN: CPCTTT)
Charged Amount: $0.00 (Funds held: $18.50)

>>> [SCENARIO 2] REAL DELIVERY FAILURE AT DOOR #742 & ESCALATION
Courier arrives at wrong door #742 (+120m away). Vision engine detects mismatch.
Delivery Status: DELIVERY_FAILED (Reason: wrong_address)
Evaluating Customer Refund Request via Anti-Fraud Cross-Referencing Engine...
Audit Decision: APPROVED
Risk Score: 0.04 (LOW)
Flags: [ 'GENUINE_DELIVERY_FAILURE_VERIFIED', 'ZERO_CAPTURE_CONFIRMED' ]
Result: PayPal authorization hold successfully voided. Zero dollars charged ($0.00).

>>> [SCENARIO 3] FRIENDLY FRAUD CLAIM BLOCKED BY PHYSICAL PROOF
A new order is created and verified with photo proof at correct door #744.
Handover Status: CAPTURED (Delivered at #744)
Shopper maliciously claims: 'I did not receive the package. Refund me now!'
Agent runs evaluateFraudAudit('refund')...
Audit Decision: BLOCKED
Risk Score: 0.95 (CRITICAL)
Flags: [ 'CONTRADICTS_PHYSICAL_PROOF', 'VERIFIED_PHOTO_ON_RECORD' ]
Result: FRAUD BLOCKED. Cryptographic photo proof protects merchant from friendly fraud.

>>> [SCENARIO 4] VELOCITY & RE-DISPATCH LOOP ABUSE BLOCKED
Shopper attempts repeated re-dispatches after multiple delivery failures.
Retry Attempt 1: APPROVED (Risk: 0.12)
Customer attempts Attempt 3 (exceeding maximum retry limit of 2)...
Audit Decision: BLOCKED
Risk Score: 0.88 (HIGH)
Flags: [ 'VELOCITY_LIMIT_EXCEEDED', 'REPEAT_FAILURE_LOOP_DETECTED' ]
Result: LOOP ABUSE BLOCKED. Escalated to Merchant Concierge for manual dispatch.

================================================================================
ALL 4 REAL-WORLD AGENTIC SCENARIOS VERIFIED 100% OPERATIONAL
================================================================================
```

### Full Unit Test Suite:
```bash
npm test
# Result: 20/20 unit tests passed (state-machine, policy, budget, text, fraud-audit)
```

---

## 7. Repository Structure & Key Source Files

- `app/lib/policy.ts`: Strict zero-trust pricing engine (integer cents, catalog limits).
- `app/lib/orders.ts`: Order lifecycle repository, inventory reservation, and event logging.
- `app/lib/paypal.ts`: Direct client for PayPal Orders v2 (`AUTHORIZE`) and Payments v2 (`CAPTURE`, `VOID`, `REFUND`).
- `app/lib/fraud-audit.ts`: Cross-referencing risk engine protecting against friendly fraud and loop abuse.
- `app/lib/state-machine.ts`: Formal state machine: `CREATED` $\rightarrow$ `AUTHORIZED` $\rightarrow$ `DELIVERY_CONFIRMED` $\rightarrow$ `CAPTURED` (or `VOIDED`/`REFUNDED`).
- `app/app/api/vision/verify/route.ts`: Computer vision endpoint performing doorstep doorplate OCR and condition analysis.
- `app/components/NearDeskChat.tsx`: Shopper natural language chat, automated hold display, and incident escalation UI.
- `app/components/DeliveryApp.tsx`: Courier mobile terminal with pure logistics terminology.
- `app/components/MerchantDesk.tsx`: Merchant operations desk with AG Grid order ledger and live audit event stream.
- `app/scripts/demo_real_agentic_flow.ts`: End-to-end executable test of all 4 real-world agentic scenarios.
