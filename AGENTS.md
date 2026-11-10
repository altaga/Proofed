# AGENTS.md — Agent Operations & Architecture Manual

> **Mission**: Authorize now. Capture only after proof of handover.  
> **Repository**: Proofed (PayPal AI Hackathon 2026)  
> **Target Audience**: Autonomous AI coding agents and human engineers.

---

## 1. Executive Summary & Purpose

Proofed solves the accountability gap in agentic physical commerce. In a stadium, micro-store, or locker venue:
1. An AI agent assists the buyer and proposes items from a catalog.
2. The shopper approves a hold using PayPal Orders v2 with `intent=AUTHORIZE`.
3. Funds remain **HELD** (authorized) on the shopper's PayPal account — no capture occurs.
4. When the buyer collects the item at `/device` (locker kiosk), physical handover evidence (code, optional photo hash, station timestamp) is recorded.
5. Only upon verified handover does the server call PayPal Payments v2 `/capture`.
6. If handover fails (locker jammed, missing product, buyer no-show), the agent investigates and the hold is released via `/void` (or refunded if already captured).

---

## 2. Strict Architectural Invariants (Non-Negotiable)

When editing or generating code in this repository, you MUST adhere to these rules:

1. **Zero-Trust AI Pricing**:
   - The LLM **NEVER** decides or computes prices, subtotals, or totals.
   - The LLM only emits `sku` and `quantity`.
   - All monetary calculations are performed in TypeScript against SQLite catalog integer cents (`app/lib/policy.ts`).
2. **Integer Cents**:
   - Currency is stored and calculated as integer cents (`$12.00` = `1200`).
   - Floats are forbidden for money. Formatting happens only in `app/lib/money.ts`.
3. **Authorize Before Capture**:
   - Checkouts must always be created with `intent: "AUTHORIZE"`.
   - Captures are strictly conditional on handover verification.
4. **Idempotency**:
   - Every mutation sent to PayPal requires a deterministic `PayPal-Request-Id` header.
5. **Node.js Built-In SQLite**:
   - Use Node 22+ native `node:sqlite`. Do not introduce native C++ drivers (`better-sqlite3`).
6. **Append-Only Auditing**:
   - State changes, agent tool steps, and webhook deliveries must be written to `order_events`.

---

## 3. Directory Layout & Organization

```
Proofed/
├── .gitignore                  # Root gitignore (clean, ignoring build, env, sqlite, tests)
├── package.json                # Root package.json with delegation scripts to app/
├── LICENSE                     # MIT License
├── README.md                   # Clean, high-impact root project README
├── AGENTS.md                   # This instruction manual
├── app/                        # Full-stack Next.js application codebase
│   ├── app/                    # Next.js 15 App Router (pages and API routes)
│   │   ├── api/                # REST endpoints (agent, orders, paypal, device, stats)
│   │   ├── demo/               # Presenter screen (receipt + shop + pickup kiosk)
│   │   ├── device/             # Physical pickup kiosk stand-in screen
│   │   ├── merchant/           # Merchant desk screen with AG Grid & event log
│   │   ├── layout.tsx          # Root HTML layout and font definitions
│   │   ├── page.tsx            # Shopper experience (chat + shelf + smart buttons)
│   │   └── globals.css         # Swiss/Fintech design system stylesheet
│   ├── components/             # Composable React UI components
│   │   ├── AgentLog.tsx        # Real-time agent tool trace and policy guardrail audit
│   │   ├── DeviceKiosk.tsx     # Handover terminal interface
│   │   ├── MerchantDesk.tsx    # AG Grid order ledger & drawer
│   │   ├── ShopperApp.tsx      # Natural language shopping chat
│   │   ├── TransactionPanel.tsx# Live receipt and horizontal status stepper
│   │   └── ...
│   ├── data/                   # SQLite database storage directory (.gitkeep)
│   ├── lib/                    # Core business logic & integrations
│   │   ├── agent.ts            # MiniMax chat agent & tool invocation
│   │   ├── agent-tools.ts      # Tool definitions (search_catalog, propose_quote)
│   │   ├── budget.ts           # Spoken budget parser (converts "$20" -> 2000 cents)
│   │   ├── catalog-seed.ts     # Initial catalog data (including out-of-stock item)
│   │   ├── db.ts               # SQLite client using node:sqlite
│   │   ├── orders.ts           # Order repository & event logger
│   │   ├── paypal.ts           # PayPal Orders v2 & Payments v2 client
│   │   ├── policy.ts           # Policy engine, catalog pricing, and guardrails
│   │   └── state-machine.ts    # Formal order lifecycle state machine
│   ├── public/                 # Static assets, SVG product illustrations, favicon
│   ├── scripts/                # Utility scripts (seed.ts, demo-reset.ts, pack.sh, rename.sh)
│   ├── tests/                  # Test suites (vitest unit/integration, playwright e2e)
│   ├── package.json            # Application dependencies and npm scripts
│   ├── tsconfig.json           # TypeScript configuration
│   └── next.config.ts          # Next.js configuration
├── docs/                       # Research, architecture, and demonstration guides
│   ├── ARCHITECTURE.md         # Comprehensive system architecture & diagrams
│   ├── DEMO_SCRIPT.md          # 3-minute video recording walkthrough
│   ├── RESEARCH.md             # Original hackathon technical research & PayPal specifications
│   └── screenshots/            # UI screenshots (demo.png, shop.png, device.png, merchant.png)
├── skills/                     # Reusable operational playbooks for agents
│   ├── paypal-sandbox/         # PayPal sandbox API operations and debugging
│   ├── agent-policy-eval/      # Agent tool calling and policy guardrail verification
│   └── demo-runner/            # Demo catalog reset and presentation procedures
└── rules/                      # Coding, design, and fintech standards
    ├── fintech-guardrails.md   # Non-negotiable monetary & payment rules
    ├── design-system.md        # Anti-vibecoding and Swiss premium design rules
    └── codebase-standards.md   # Architectural, TypeScript, and testing standards
```

---

## 4. Key Developer & Agent Commands

Run all commands from the repository root:

| Command | Action |
|---|---|
| `npm run dev` | Starts local Next.js dev server on [http://localhost:3000](http://localhost:3000) |
| `npm run build` | Compiles production Next.js build |
| `npm run seed` | Seeds SQLite catalog with default products |
| `npm run demo:reset` | Resets SQLite database to pristine demo state |
| `npm test` | Runs core unit tests (state machine, policy, budget, text) |
| `npm run test:paypal` | Runs PayPal sandbox integration tests |
| `npm run test:agent` | Runs agent tool calling and conversation tests |
| `npm run test:all` | Runs all Vitest test suites |
| `npm run test:e2e` | Runs Playwright end-to-end tests (including a11y contrast checks) |
| `npm run screenshots` | Refreshes all PNG screenshots in `docs/screenshots/` |
| `npm run pack` | Creates clean downloadable zip bundle in `/workspace/paypal-hack-dist` |

---

## 5. Order State Machine Reference

Defined in `app/lib/state-machine.ts`:

- `CREATED`: Order initialized by shopper cart.
- `APPROVED`: Shopper approved hold via PayPal JS SDK popup.
- `AUTHORIZED`: Backend successfully authorized hold on PayPal (`purchase_units.payments.authorizations[0].id`).
- `DELIVERY_CONFIRMED`: Pickup code and physical handover verified at station.
- `CAPTURED`: Funds captured via PayPal Payments v2.
- `DELIVERY_FAILED`: Station reported locker jam or damaged goods.
- `VOIDED`: Hold canceled and released back to buyer.
- `REFUNDED`: Funds refunded post-capture.

---

## 6. API Route Catalog

- `POST /api/agent/session`: Initializes or retrieves a shopper conversation session.
- `POST /api/agent/chat`: Sends user message to MiniMax LLM, executes tool calls through policy engine, and returns updated cart and action traces.
- `POST /api/orders`: Creates an order draft from cart.
- `POST /api/paypal/authorize`: Finalizes hold authorization after JS SDK approval.
- `POST /api/device/confirm`: Submits pickup code and evidence; triggers payment capture.
- `POST /api/device/fail`: Reports delivery failure; sets `DELIVERY_FAILED` and initiates agent recovery.
- `POST /api/orders/[id]/recovery`: Proposes or accepts replacement items for substitution.
- `POST /api/paypal/void`: Manually or automatically releases authorization hold.
- `POST /api/paypal/refund`: Refunds an already-captured payment.
- `POST /api/paypal/webhooks`: Ingests and verifies incoming PayPal webhook notifications.
- `POST /api/jobs/reconcile`: Queries PayPal API to reconcile local order states.

---

## 7. Guidelines for Modifying Code

- **UI Changes**: Review [rules/design-system.md](file:///c:/Users/VAI/Github/Proofed/rules/design-system.md). Follow Swiss/Fintech aesthetics. Always run `npm run test:e2e` to verify WCAG AA color contrast.
- **Backend/Payment Changes**: Review [rules/fintech-guardrails.md](file:///c:/Users/VAI/Github/Proofed/rules/fintech-guardrails.md). Never permit LLM-controlled prices. Always maintain integer cents.
- **Testing**: Whenever touching `policy.ts`, `state-machine.ts`, or `budget.ts`, run `npm test` before concluding your turn.
