# Proofed — System Architecture & Design

Proofed is an agentic physical commerce platform featuring guaranteed payment accountability. It enforces a strict principle: **Authorize now. Capture only after proof of handover.**

---

## 1. High-Level System Flow

```mermaid
flowchart TD
    subgraph ClientLayer["Client & Physical Touchpoints"]
        Shopper["Shopper UI (/)<br/>Natural language chat & shelf"]
        Kiosk["Pickup Station (/device)<br/>Locker/kiosk confirmation"]
        Merchant["Merchant Desk (/merchant)<br/>AG Grid ledger & controls"]
        Presenter["Demo Presenter (/demo)<br/>Side-by-side synchronized view"]
    end

    subgraph AgentLayer["Agentic Layer"]
        SessionAPI["/api/agent/session"]
        ChatAPI["/api/agent/chat"]
        MiniMax["MiniMax LLM<br/>Tool calling (SKU + Qty only)"]
    end

    subgraph CoreEngine["Policy Engine & Backend (/lib)"]
        Policy["Policy Engine (policy.ts)<br/>Pricing in integer cents<br/>Stock reservation<br/>State transitions"]
        DB[(SQLite catalog & event log)]
        PayPalClient["PayPal Client (paypal.ts)<br/>Orders v2 & Payments v2"]
    end

    subgraph PayPalCloud["PayPal Sandbox"]
        PPOrders["Orders v2<br/>intent = AUTHORIZE"]
        PPSDK["PayPal JS SDK<br/>Buyer interactive approval"]
        PPCapture["Payments v2<br/>Capture / Void / Refund"]
        PPWebhooks["PayPal Webhooks<br/>Signature verification"]
    end

    Shopper -->|Message| ChatAPI
    ChatAPI -->|Prompt + tools| MiniMax
    MiniMax -->|propose_quote, substitute| Policy
    Policy -->|Read price & stock| DB

    Shopper -->|Smart Button approve| PPSDK
    PPSDK -->|Approve hold| PPOrders
    PPOrders -->|Auth ID| Policy

    Kiosk -->|Code + photo hash + note| Policy
    Policy -->|Trigger capture| PPCapture

    Kiosk -.->|Report failure/jam| Policy
    Policy -.->|Auto-void hold| PPCapture

    Merchant -->|Reconcile / manual overrides| Policy
    PPWebhooks -->|Event dispatch| Policy
    Policy -->|Append state changes| DB
```

---

## 2. Zero-Trust AI Payment Model

A fundamental flaw in naive agentic commerce is allowing language models to determine monetary values. Proofed solves this through strict separation of responsibilities:

| Responsibility | Handled By | Guardrail Enforced |
|---|---|---|
| Natural dialogue | MiniMax LLM | Evaluates buyer intent, suggests SKUs |
| Price calculation | Policy Engine (`lib/policy.ts`) | **Calculated from SQLite catalog cents**. LLM amounts are rejected. |
| Budget enforcement | Backend Parser (`lib/budget.ts`) | Shopper's stated budget is parsed into cents and checked server-side. |
| Stock reservation | SQLite Database (`lib/db.ts`) | Orders cannot be created if inventory is `0` (e.g. `DC-BTL-01`). |
| Payment creation | PayPal Client (`lib/paypal.ts`) | Fixed `intent: "AUTHORIZE"`, amount locked to server quote cents. |

```mermaid
sequenceDiagram
    autonumber
    actor Buyer as Shopper
    participant UI as Shopper UI
    participant Agent as Agent API
    participant Engine as Policy Engine (TypeScript)
    participant Catalog as SQLite Catalog
    participant PayPal as PayPal Orders v2

    Buyer->>UI: "I have a $20 budget. Do you have a keychain?"
    UI->>Agent: POST /api/agent/chat
    Agent->>Engine: Tool Call: propose_quote(sku="DC-KEY-01", qty=1)
    Note over Engine: Engine checks catalog, IGNORES model price assumptions
    Engine->>Catalog: SELECT * FROM products WHERE sku='DC-KEY-01'
    Catalog-->>Engine: Price: 1200 cents ($12.00), Stock: 15
    Engine->>Engine: Verify 1200 <= 2000 cents (Budget OK)
    Engine-->>UI: Quote confirmed: $12.00 (Hold ready)
    UI->>PayPal: Create Order (intent=AUTHORIZE, amount=$12.00)
    Buyer->>PayPal: Approves via PayPal JS SDK
    PayPal-->>UI: Order APPROVED (Auth ID generated)
```

---

## 3. Order Lifecycle State Machine

Transitions between states are deterministic and strictly enforced by `lib/state-machine.ts`. Any illegal transition is rejected and logged.

```mermaid
stateDiagram-v2
    [*] --> CREATED: Shopper initiates checkout
    CREATED --> APPROVED: Buyer approves via PayPal JS SDK
    APPROVED --> AUTHORIZED: Server calls Orders v2 /authorize
    
    AUTHORIZED --> DELIVERY_CONFIRMED: Station verifies pickup code & evidence
    DELIVERY_CONFIRMED --> CAPTURED: Server calls Payments v2 /capture
    
    AUTHORIZED --> DELIVERY_FAILED: Station reports locker jam or missing item
    DELIVERY_FAILED --> AUTHORIZED: Agent offers valid substitution
    DELIVERY_FAILED --> VOIDED: Hold canceled via Payments v2 /void
    
    AUTHORIZED --> VOIDED: Timeout or buyer cancellation
    CAPTURED --> REFUNDED: Merchant initiates refund post-capture
    
    CAPTURED --> [*]
    VOIDED --> [*]
    REFUNDED --> [*]
```

### Transition Matrix

| Current State | Allowed Next State | Action / Trigger |
|---|---|---|
| `CREATED` | `APPROVED` | Shopper completes PayPal SDK popup |
| `APPROVED` | `AUTHORIZED` | Backend authorizes hold via `/v2/checkout/orders/{id}/authorize` |
| `AUTHORIZED` | `DELIVERY_CONFIRMED` | Pickup station submits valid pickup code & evidence |
| `AUTHORIZED` | `DELIVERY_FAILED` | Station reports locker jam, damaged goods, or timeout |
| `AUTHORIZED` | `VOIDED` | Handover canceled or unresolvable; hold voided in PayPal |
| `DELIVERY_CONFIRMED` | `CAPTURED` | Backend successfully captures funds via Payments v2 |
| `DELIVERY_FAILED` | `AUTHORIZED` | Shopper/Agent agrees to substitute item; hold updated/reissued |
| `DELIVERY_FAILED` | `VOIDED` | Substitution rejected; original authorization voided |
| `CAPTURED` | `REFUNDED` | Goods returned or merchant desk manual refund |

---

## 4. Physical Handover Evidence System

In physical retail (stadiums, micro-kiosks, unattended lockers), holding funds prevents charging the consumer before they actually receive the goods.

1. **Pickup Code**: A cryptographically random, human-friendly code generated upon authorization.
2. **Photo Hash (Optional)**: SHA-256 hash of locker sensor capture or operator snapshot.
3. **Station Identifier & Note**: Metadata identifying the physical terminal executing the transaction.
4. **Append-Only Event Store**: Every handover attempt, failure trace, and capture timestamp is written to the SQLite `order_events` table with immutable timestamps.

---

## 5. Security & Idempotency

- **Idempotency Keys**: All state-modifying requests to PayPal include an idempotency header (`PayPal-Request-Id: {orderId}-{action}-{timestamp}`).
- **Webhook Verification**: PayPal incoming webhook signatures (`PAYPAL-AUTH-ALGO`, `PAYPAL-TRANSMISSION-ID`, `PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-SIG`) are verified via PayPal's verification endpoint before processing.
- **Local Fallback Reconciliation**: A background reconciliation job continuously polls PayPal for status consistency in sandbox environments where webhooks are not publicly routable.
- **Zero Native SQLite Dependencies**: Built on Node.js 22+ native `node:sqlite`, eliminating native C++ binary build issues across macOS, Linux, and Windows.
