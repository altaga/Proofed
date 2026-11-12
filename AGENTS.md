<p align="center">
  <img src="docs/logo.svg" alt="Proofed Logo" width="80" height="80" />
</p>

# AGENTS.md — Agent Operations & Architecture Manual

> **Concept**: AI agents can buy in seconds, but what if delivery fails? Proofed combines PayPal authorizations, AI vision, and recipient verification to capture payment only after handover—or void failed orders.  
> **Mission**: Authorize now. Capture only after verified proof of physical handover.  
> **Repository**: Proofed (PayPal AI Hackathon 2026)  
> **Target Audience**: Autonomous AI coding agents (Antigravity, Claude Code, Cursor, Trae, MiniMax) and human engineers.  
> **Production App**: [https://proofed-ai.vercel.app](https://proofed-ai.vercel.app)

---

## 1. Executive Summary & System Purpose

Autonomous AI agents can negotiate and initiate purchases in milliseconds. But the moment physical delivery begins, the digital certainty breaks: parcels get dropped at the wrong door (#14 instead of #15), boxes arrive crushed, or packages get stolen. Traditional e-commerce charges buyers upfront (`intent=CAPTURE`), leading to disputed charges, chargeback fees, and lost trust.

**Proofed bridges the accountability gap in autonomous AI physical commerce** by binding PayPal payment capture strictly to physical delivery verification:
1. **Zero-Trust Shopping**: The AI shopping assistant recommends items from a verified merchant catalog (prices strictly computed in TypeScript integer cents).
2. **Conditional Payment Hold**: The shopper approves a hold using PayPal Orders v2 (`intent=AUTHORIZE`). Exactly `$0.00` is charged upfront, and a temporary authorization hold is created.
3. **Tri-Factor Doorstep Verification**: When the courier arrives, the `/delivery` terminal executes a 3-factor physical protocol:
   - **Factor 1 (GPS Geofence)**: Validates courier location against the delivery address coordinates.
   - **Factor 2 (Multimodal AI Vision)**: `MiniMax-M3.1-Flash` inspects the doorstep photo for apartment door number match and package integrity with bounding boxes.
   - **Factor 3 (Courier-Blind PIN)**: The courier must obtain the private 6-character Delivery PIN displayed only on the customer's `/client` screen.
4. **Conditional Settlement**:
   - **Success**: Only upon successful verification of all three factors does the backend execute PayPal Payments v2 `/capture`.
   - **Failure**: If handover fails (wrong door `#14` instead of `#15`, crushed parcel, or recipient absence), the hold is never captured and is either re-dispatched or safely released via PayPal Payments v2 `/void`.

---

## 2. Strict Architectural Invariants (Non-Negotiable)

Any autonomous agent editing code in this repository MUST preserve these invariants:

1. **Zero-Trust AI Pricing**:
   - The LLM **NEVER** computes prices, subtotals, taxes, discounts, or order totals.
   - The LLM emits only `sku` and `quantity`.
   - All monetary calculations are performed strictly in TypeScript against database integer cents (`app/lib/policy.ts`).

2. **Integer Cents Currency**:
   - All currency values are stored, calculated, and compared as integer cents (`$18.50` = `1850`).
   - Floats are strictly prohibited for financial calculations. Formatting to strings happens only in `app/lib/money.ts`.

3. **Authorize Before Capture**:
   - PayPal checkouts must always be initialized with `intent: "AUTHORIZE"`.
   - Never use `intent: "CAPTURE"` on order creation.
   - Captures are strictly conditional on physical delivery confirmation.

4. **Strict Capture Gate (`DELIVERY_CONFIRMED` Only)**:
   - `captureOrder()` in `app/lib/orders.ts` rejects any order not in `DELIVERY_CONFIRMED` status.
   - A verified physical evidence record (`delivery_confirm` event) must exist in SQLite before PayPal `/capture` is called.

5. **Fail-Closed Vision & Delivery Logic**:
   - In `app/lib/vision-audit.ts`, API timeouts, missing images, invalid coordinates, or low confidence scores fail closed (`captureAuthorized: false`, `overallHandoverScore: 0`).
   - Couriers cannot bypass verification.

6. **Courier-Blind Customer PIN**:
   - The courier endpoint (`GET /api/orders?view=courier`) returns `pickup_code: null` and `pickup_code_masked: "••••••"`.
   - Couriers must physically request the code from the recipient. Max 5 verification attempts before locking.

7. **Deterministic Idempotency**:
   - Every mutation sent to PayPal requires a deterministic `PayPal-Request-Id` header (UUID or hash of order ID and state transition) to prevent duplicate transactions.

8. **Node.js Built-In SQLite**:
   - Use Node 22+ native `node:sqlite` for local dev and tests.
   - In serverless production (Vercel), `@libsql/client` connects to Turso DB.
   - Never introduce native C++ drivers like `better-sqlite3`.

9. **Append-Only Auditing**:
   - State changes, agent tool steps, courier evidence, and PayPal API responses must be logged to `order_events` with HMAC-SHA256 signatures.

---

## 3. Directory Layout & Organization

```
Proofed/
├── .gitignore                      # Clean ignore rules (build, env, sqlite, tests)
├── package.json                    # Root workspace package.json with delegation scripts
├── LICENSE                         # MIT License
├── README.md                       # Comprehensive project documentation with embedded screenshots
├── AGENTS.md                       # This autonomous agent operations manual
├── scripts/
│   └── capture_screenshots.mjs     # Playwright automated 2x retina screenshot capture
├── docs/
│   ├── logo.svg                    # Vector brand identity mark
│   ├── ARCHITECTURE.md             # System architecture & sequence diagrams
│   ├── DEMO_SCRIPT.md              # 2:25 video recording script
│   ├── PEER_AGENT_RESPONSE.md      # Technical response to security audit
│   └── screenshots/                # Crisp UI screenshots & live sandbox proofs
│       ├── client.png              # Shopper chat & PayPal hold button
│       ├── delivery-step1.png      # Courier manifest & GPS geofence
│       ├── delivery-door15.png     # Door #15 verified handover with bounding boxes
│       ├── delivery-door14.png     # Door #14 wrong door mismatch detection
│       ├── merchant.png            # Merchant operations desk & order ledger
│       ├── backend.png             # Developer & judge technical backend inspector
│       ├── demo.png                # Synchronized presenter view
│       ├── paypal-sand.png         # PayPal Developer Sandbox API call history (201 OK)
│       ├── paypal-sand-02.png      # PayPal API response payload inspection
│       ├── transactions1.png       # PayPal buyer account - Completed capture ($18.50)
│       └── transactions2.png       # PayPal buyer account - Capture vs Canceled void hold
├── rules/
│   ├── design-system.md            # Swiss/Fintech UI rules & color tokens
│   ├── fintech-guardrails.md       # Monetary & payment guardrails
│   └── codebase-standards.md       # Coding conventions & architecture standards
└── app/                            # Full-stack Next.js application codebase
    ├── app/                        # Next.js 15 App Router
    │   ├── api/                    # REST API endpoints
    │   │   ├── agent/              # Chat agent session & tool calling
    │   │   ├── demo/               # Demo order seeding & reset endpoints
    │   │   ├── device/             # Courier verification, queue & failure reporting
│   │   ├── vision/             # Doorstep photo analysis with MiniMax vision
    │   │   ├── orders/             # Order drafting, retrieval, and recovery
    │   │   ├── paypal/             # PayPal authorize, capture, void, refund, webhooks
    │   │   └── stats/              # System metrics & ledger statistics
    │   ├── client/                 # Shopper assistant screen
    │   ├── delivery/               # Courier mobile verification terminal
    │   ├── merchant/               # Merchant desk with AG Grid order ledger
    │   ├── backend/                # Technical audit monitor for judges
    │   ├── demo/                   # Synchronized presenter screen
    │   ├── layout.tsx              # Root HTML layout and font configurations
    │   └── globals.css             # Swiss/Fintech design system stylesheet
    ├── components/                 # Composable React UI components
    │   ├── ShopperChat.tsx         # Natural language chat & PayPal Smart Buttons
    │   ├── DeliveryApp.tsx         # 3-step courier doorstep workflow
    │   ├── MerchantDesk.tsx        # AG Grid order ledger & drawer
    │   ├── BackendMonitor.tsx      # Live PayPal API inspector & event log
    │   └── TransactionPanel.tsx    # Live receipt and horizontal status stepper
    ├── lib/                        # Core business logic & integrations
    │   ├── agent.ts                # MiniMax chat agent & tool invocation
    │   ├── agent-tools.ts          # Tool schemas (search_catalog, propose_quote)
    │   ├── budget.ts               # Spoken budget parser (converts "$20" -> 2000 cents)
    │   ├── catalog-seed.ts         # Initial catalog data (including out-of-stock item)
    │   ├── db.ts                   # SQLite client using node:sqlite / Turso
    │   ├── money.ts                # Integer cents formatting & calculations
    │   ├── orders.ts               # Order repository & event logger
    │   ├── paypal.ts               # PayPal Orders v2 & Payments v2 client
    │   ├── policy.ts               # Zero-trust policy engine & guardrails
    │   ├── state-machine.ts        # Formal order lifecycle state machine
    │   └── vision-audit.ts         # Multimodal MiniMax doorstep vision audit
    ├── public/                     # Static assets, SVG door presets, favicon
    └── tests/                      # Test suites (vitest unit/integration, playwright e2e)
```

---

## 4. Key Developer & Agent Commands

Run all commands from the repository root:

| Command | Action |
|---|---|
| `npm run dev` | Starts local Next.js dev server on [http://localhost:3000](http://localhost:3000) |
| `npm run build` | Compiles production Next.js build |
| `npm test` | Runs core unit tests (state machine, policy, budget, text) |
| `npm --prefix app test tests/vision-audit.test.ts tests/fraud-audit.test.ts` | Runs vision audit and fraud evaluation tests |
| `npm run test:all` | Runs all Vitest test suites |
| `npm run test:e2e` | Runs Playwright accessibility & color contrast tests |
| `node scripts/capture_screenshots.mjs` | Refreshes all high-res retina screenshots in `docs/screenshots/` |
| `npm run seed` | Seeds SQLite catalog with default products |
| `npm run demo:reset` | Resets SQLite database to pristine demo state |

---

## 5. Order State Machine Reference

Defined in `app/lib/state-machine.ts`:

| State | Description | Allowed Next States | Trigger |
|---|---|---|---|
| `CREATED` | Order draft initialized by shopper cart | `APPROVED` | Shopper opens PayPal approval popup |
| `APPROVED` | Shopper approved hold via PayPal JS SDK | `AUTHORIZED` | Backend calls PayPal Orders v2 `/authorize` |
| `AUTHORIZED` | Funds held on PayPal account (`$0.00` charged) | `DELIVERY_CONFIRMED`, `DELIVERY_FAILED`, `VOIDED` | Handover verification or cancellation |
| `DELIVERY_CONFIRMED` | GPS + Vision + Customer PIN verified at door | `CAPTURED` | Backend calls PayPal Payments v2 `/capture` |
| `DELIVERY_FAILED` | Courier reported wrong door or damaged parcel | `VOIDED`, `AUTHORIZED` (re-dispatch) | Verification failure or dispute |
| `CAPTURED` | Funds captured via PayPal Payments v2 | `REFUNDED` | Verified handover complete |
| `VOIDED` | Authorization hold canceled and released | *(Terminal)* | Backend calls PayPal Payments v2 `/void` |
| `REFUNDED` | Post-capture refund issued | *(Terminal)* | Backend calls PayPal Payments v2 `/refund` |

---

## 6. API Route Catalog

Verified against `app/app/api/**/route.ts`.

### Agent & Catalog
- `POST /api/agent/session`: Initializes or retrieves a shopper conversation session.
- `POST /api/agent/chat`: Sends user message to MiniMax LLM, executes tool calls through zero-trust policy engine, and returns updated cart and action traces.
- `GET /api/catalog`: Merchant catalog (integer cents).
- `GET /api/config`: Public client config (PayPal client ID, mode).

### Orders & Checkout
- `POST /api/orders`: Creates an order draft from cart and the PayPal Orders v2 order (`intent: "AUTHORIZE"`).
- `GET /api/orders`: Lists orders. Couriers use `?view=courier` to mask pickup codes.
- `GET /api/orders/[id]`: Order details and event history.
- `GET /api/orders/[id]/audit`: HMAC-signed audit trail for an order.
- `POST /api/orders/[id]/recovery` and `POST /api/orders/recover`: Buyer recovery choice after failed delivery.
- `POST /api/orders/sync`: Syncs client-held orders with server state.
- `GET /api/events`: Event log feed for `/backend`.

### Courier Doorstep Delivery
- `GET /api/device/queue`: Courier delivery queue (PIN masked).
- `POST /api/vision/verify`: Doorstep photo analysis with `MiniMax-M3.1-Flash` (fail-closed).
- `POST /api/device/confirm`: GPS + photo evidence + recipient PIN. Verifies all 3 factors, sets `DELIVERY_CONFIRMED`, triggers capture.
- `POST /api/device/fail`: Reports delivery exception. Sets `DELIVERY_FAILED`.

### PayPal Sandbox Integration
- `POST /api/paypal/authorize`: PayPal Orders v2 `/authorize` after buyer approval (places the hold).
- `POST /api/paypal/capture`: Gated to `DELIVERY_CONFIRMED`; calls Payments v2 `/authorizations/{id}/capture`.
- `POST /api/paypal/void`: Releases the hold via `/authorizations/{id}/void`.
- `POST /api/paypal/refund`: Post-capture refund.
- `POST /api/paypal/webhooks`: Verifies and ingests PayPal webhooks.
- `POST /api/jobs/reconcile`: Reconciles local order state with PayPal.

### Demo & Automation
- `POST /api/demo/seed-held`: Seeds a pre-authorized demo order.
- `POST /api/demo/reset`: Resets demo state.
- `GET /api/health`, `GET /api/stats`: Health and ledger metrics.

---
## 7. Guidelines for Autonomous Coding Agents

When working in this codebase:

1. **Before Modifying UI**:
   - Read `rules/design-system.md`.
   - Adhere strictly to the Swiss/Fintech dark aesthetic (neutral dark background `#0c0c0e`, warm border `#1f1f24`, single accent `#f59e0b` or `#10b981`).
   - Do NOT introduce generic AI templates, rounded-8px gray boxes, excessive gradients, or vibecoded components.
   - Run `npm run test:e2e` to verify color contrast meets WCAG AA standards.

2. **Before Modifying Backend or Payments**:
   - Read `rules/fintech-guardrails.md`.
   - Never allow LLM text to dictate prices or totals.
   - Always verify that all arithmetic uses integer cents.
   - Run `npm test` and `npm --prefix app test tests/vision-audit.test.ts tests/fraud-audit.test.ts` before concluding your turn.

3. **When Updating Screens or Workflows**:
   - If UI elements, routes, or workflows change, run `node scripts/capture_screenshots.mjs` to regenerate screenshot assets in `docs/screenshots/`.
   - Update both `README.md` and `AGENTS.md` to reflect architectural changes.
