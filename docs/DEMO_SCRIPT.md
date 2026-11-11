# Proofed — 3-Minute Hackathon Demo Script

> **Mission**: Authorize now. Capture only on verified proof of physical handover.  
> **Production Deployment**: [https://proofed-ai.vercel.app](https://proofed-ai.vercel.app)  
> **Format**: 3-minute video recording or live hackathon presentation.

---

## Technical Verification Script (Proof It Is 100% Agentic)

To prove to judges that every decision, tool call, OCR inspection, and fraud audit is 100% agentic and deterministic, run:

```bash
cd app
npx tsx scripts/demo_real_agentic_flow.ts
```

This executes all 4 real-world scenarios live against the MiniMax LLM and SQLite ledger, outputting real tool traces, zero-trust integer cent pricing, and cryptographic audit decisions.

---

## 3-Minute Video Presentation Walkthrough

### 0:00–0:25 — The Problem: The Agentic Physical Commerce Gap

> *"In physical commerce, autonomous AI agents cannot just swipe a customer's credit card upfront. If an autonomous agent buys something, and the courier drops it at the wrong door, the solenoid jams, or a customer claims false non-delivery, you get a 14-day bank dispute and merchant penalty.*  
>  
> *Proofed solves this with a strict zero-trust principle: **Authorize now (`intent=AUTHORIZE`). Capture ONLY after verified proof of physical handover.**"*

Show the launcher at [https://proofed-ai.vercel.app](https://proofed-ai.vercel.app) featuring the decoupled modules: **Shopper Chat (`/client`)**, **Courier Mobile (`/delivery`)**, **Pickup Kiosk (`/device`)**, and **Merchant Desk (`/merchant`)**.

---

### 0:25–1:15 — Scenario 1: Autonomous Commerce & Automated PayPal Hold

1. Open **Shopper Chat** at `/client`.
2. Type or tap the preset:
   > *"I have a $20 budget, what snacks or coffee do you have?"*
3. **Point out the Agentic Execution**:
   - The LLM calls `search_catalog`, `get_item`, and `propose_checkout`.
   - The LLM **never invents prices**: the price is verified against SQLite catalog integer cents ($18.50).
   - In automatic mode, the agent immediately quotes **Ethiopian Yirgacheffe Whole Beans ($18.50)**.
   - The order is automatically staged on PayPal with `intent=AUTHORIZE`.
   - Point to the **"Powered by PayPal"** badge and status:  
     **`Hold active · $0.00 charged · PIN: VNRP4Y`**.
   - Expand the bottom **`System Audit · Inspect logs`** drawer to show the live tool execution trace (`PASS`).

---

### 1:15–2:00 — Scenario 2: Real Physical Delivery Failure & Autonomous Escalation

1. Switch to the **Courier View** on `/delivery`.
2. Notice the order is loaded with destination **744 Maple St, Apt 2B**.
3. Under **Sample photo**, select **Door #742 (Mismatch)**.
4. **Point out the Computer Vision Agent**:
   - The vision model performs doorstep OCR and detects door `#742` instead of destination `#744` (+120m distance).
   - Telemetry reports: `Blocked — wrong house number. Handover rejected.`
   - Press **`Report delivery failure (Return to hub)`**.
5. Switch back to **Shopper Chat** (`/client`):
   - Notice the incident has **autonomously escalated** to the customer!
   - The assistant posts: *"Delivery Notice: Handover Not Verified. Courier arrived at door #742... Your funds remain 100% safe ($0.00 debited)."*
   - Tap **`Recibir reembolso (Liberar retención)`** (or type *"reembolso"*).
   - The **Anti-Fraud Cross-Referencing Engine** inspects the immutable ledger:
     - Verified handover? `No`
     - Doorplate OCR mismatch confirmed? `Yes (#742)`
     - Risk Score: `0.04 (LOW) · PASS`
   - PayPal authorization hold is released live via API `/void`.
   - Show the **Official Settlement & Refund Receipt**:
     - Original Hold: `$18.50`
     - Amount Charged: **`$0.00 USD`**
     - Returned to balance: **`100% available`**
     - **`ANTI-FRAUD AUDIT TRAIL: PASS`**

---

### 2:00–2:35 — Scenario 3: Friendly Fraud Attempt Blocked by Physical Proof

> *"What happens when a dishonest buyer tries to claim a refund on an order that was actually delivered?"*

1. Create a fresh order and open `/delivery`.
2. Select **Door #744 (Match)** and press **`Verify delivery & complete handoff`**.
3. Point to the ledger:
   - Doorplate `#744` confirmed, parcel intact.
   - PayPal Payments v2 `/capture` executes.
   - Cryptographic photo hash (`SHA-256`) is written to `evidence`.
4. Now open `/client` as the buyer and type:
   > *"I never received my package! I want an instant refund!"*
5. **Point out the Fraud Prevention Guardrail**:
   - The agent calls `audit_fraud_risk(orderId, 'refund')`.
   - The cross-referencing engine detects that immutable evidence shows verified delivery at `#744`.
   - **Risk Score: `0.95 (CRITICAL)` · `CONTRADICTS_PHYSICAL_PROOF`**.
   - The agent **BLOCKS the refund**:
     > *"Refund BLOCKED by Zero-Trust Audit: Physical handover was verified at doorstep #744 with cryptographic photo hash (SHA: 86bd1711...). Funds were legitimately captured upon proof of delivery."*

---

### 2:35–2:50 — Scenario 4: Velocity & Loop Abuse Prevention

> *"What if a bot or malicious user tries to exploit re-dispatches in an infinite loop?"*

1. On a failed delivery, show that the first re-dispatch (`Pedir otro`) is approved (`Attempt 1 of 2 · Risk: 0.12`).
2. Show that if re-dispatches are repeatedly triggered ($\ge 2$), the agent's velocity guardrail triggers:
   - **Risk Score: `0.88 (HIGH)` · `VELOCITY_LIMIT_EXCEEDED`**.
   - **`Re-dispatch BLOCKED`** and escalated to Merchant Concierge.

---

### 2:50–3:00 — Summary & Conclusion

> *"Proofed bridges autonomous AI commerce and physical fulfillment:  
> Zero-trust integer pricing. Authorize now. Capture only on verified physical proof.  
> Immutable audit trails that eliminate fraud on both sides of the transaction."*
