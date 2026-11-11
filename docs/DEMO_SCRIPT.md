# Proofed — 3-Minute Hackathon Demo Script

> **Positioning**: Proofed — The trust layer between AI payments and the physical world.  
> **Core Principle**: Authorize now (`intent=AUTHORIZE`). Capture only after verified physical handover.  
> **Production Deployment**: [https://proofed-ai.vercel.app](https://proofed-ai.vercel.app)

---

## Technical Verification Script (Live Execution Proof)

To verify that every agent tool call, computer vision check, one-time recipient PIN validation, HMAC-signed event record, and PayPal Sandbox operation runs end-to-end:

```bash
cd app
npx tsx scripts/demo_real_agentic_flow.ts
```

---

## 3-Minute Video Presentation Timeline

| Time | Segment | Focus |
|---|---|---|
| **0:00–0:15** | **The Problem** | An AI agent can initiate a purchase in milliseconds, but physical fulfillment is uncertain (wrong door, damaged box, jammed locker). |
| **0:15–0:35** | **Proofed & PayPal Authorizations** | Introduce Proofed's conditional capture workflow using PayPal Orders v2 (`intent=AUTHORIZE`) for short-window local commerce and micro-retail (aligned with PayPal's 3-day honor period / 29-day validity). |
| **0:35–1:15** | **Full Demo 1: Successful Transaction** | Unstructured budget request $\rightarrow$ Buyer approval $\rightarrow$ `$18.50 authorized, $0.00 captured` $\rightarrow$ Two-factor handover (Door `#744` OCR + Recipient One-Time PIN) $\rightarrow$ PayPal `/capture`. |
| **1:15–1:55** | **Full Demo 2: Failed Delivery & Void** | Courier arrives at wrong door `#742` $\rightarrow$ Vision rejects handover $\rightarrow$ AI escalates to customer chat $\rightarrow$ Buyer chooses release $\rightarrow$ PayPal `/void` (`$0.00 captured; release timing depends on payment provider`). |
| **1:55–2:15** | **Policy Capabilities (Demos 3 & 4)** | Brief walkthrough of contradictory fulfillment evidence escalation (`RULE_CONTRADICTORY_EVIDENCE_ESCALATION`) and automated retry limit (`RULE_MAX_REDISPATCH_LIMIT_REACHED`). |
| **2:15–2:35** | **Merchant Operational Views & Close** | Show `/merchant` operational filter (*"Rejected Fulfillment · Active Auth"*), HMAC-signed tamper-evident event log, and closing thesis. |

---

## Step-by-Step Recording Walkthrough

### 0:00–0:35 — Problem & Positioning
> *"AI agents can initiate purchases, but they cannot assume that physical delivery succeeds. Proofed is the trust layer between AI payments and the physical world—connecting buyer-approved PayPal authorizations, two-factor physical handover verification, conditional capture, and autonomous exception recovery into one workflow."*

### 0:35–1:15 — Demo 1: Buyer Approval, Two-Factor Handover & Capture
1. Open **Shopper Chat** (`/client`) and enter:
   > *"I have a $20 budget, what snacks or coffee do you have?"*
2. **Show Agentic Reasoning & Financial Safety**:
   - MiniMax LLM calls `search_catalog` and `propose_checkout`.
   - Prices are verified in SQLite integer cents (`$18.50` = `1850` cents).
   - Buyer approval creates a PayPal Order (`intent=AUTHORIZE`).
   - Point to the status badge: **`$18.50 authorized · $0.00 captured`** and **`RECIPIENT PIN: [6-char code]`**.
   - Expand **`System Audit · Inspect logs`** at the bottom to show the live tool execution trace.
3. Switch to **Courier View** (`/delivery`):
   - Select **Door #744 (Match)**.
   - Point to **Step 03 (Recipient Acknowledgment & Handoff)**:
     1. Computer Vision: `Door #744 OCR & Parcel Intact`
     2. Recipient One-Time PIN: verified server-side against the order credential
     3. Evidence Binding: `SHA-256 Digest + Server HMAC`
   - Click **`Verify recipient PIN & complete handoff`**.
   - Server records the signed handover event and executes PayPal Payments v2 `/capture`.

### 1:15–1:55 — Demo 2: Failed Delivery at Door #742 & Authorization Void
1. On `/delivery`, select **Door #742 (Mismatch)**.
2. Computer vision detects `#742` instead of `#744 Maple St` (+120m away) and flags: `Blocked — wrong house number. Handover rejected.`
3. Click **`Report delivery failure (Return to hub)`**.
4. Switch back to **Shopper Chat** (`/client`):
   - The AI agent autonomously escalates the exception to the customer:
     > *"Delivery Notice: Handover Not Verified... Payment Status: $18.50 authorized · $0.00 captured."*
   - Click **`Recibir reembolso (Anular autorización)`**.
   - Policy rule `RULE_UNVERIFIED_HANDOVER_RELEASE` verifies that handover never occurred and voids the authorization via PayPal `/void`.
   - Show the **PayPal Authorization Voided Receipt**:
     - Authorized amount: `$18.50`
     - Amount captured: **`$0.00 USD`**
     - Authorization status: **`VOIDED (Release timing depends on payment provider)`**

### 1:55–2:15 — Demos 3 & 4: Contradictory Evidence & Retry Limits
- **Contradictory Evidence Escalation**: When a post-capture non-delivery claim is submitted on an order that has verified Door `#744` OCR, a verified recipient PIN, and a tamper-evident SHA-256 photo digest, rule `RULE_CONTRADICTORY_EVIDENCE_ESCALATION` pauses automated self-service refund and escalates the case to Merchant Operations with full fulfillment evidence attached.
- **Retry Limit Escalation**: After 2 consecutive failed delivery retries, rule `RULE_MAX_REDISPATCH_LIMIT_REACHED` pauses automated re-dispatch and escalates to Merchant Concierge.

### 2:15–2:35 — Merchant Operational Views (`/merchant`)
1. Open `/merchant` and click the operational filter:
   - **`Rejected Fulfillment · Active Auth`**
   - **`Escalated / Review Required`**
2. Open an order drawer to show the **HMAC-signed tamper-evident event timeline** and PayPal transaction IDs.
3. Close with:
   > *"Proofed doesn't just help AI agents buy physical goods. It helps them establish what happened after the purchase—and make the appropriate payment decision."*
