# Proofed — demo script (under 3 minutes)

Record in English at 1280×800, showing the running app. Use a PayPal sandbox personal (buyer) account and the sandbox business app already configured in `.env`. Reset to a known catalog first:

```bash
npm run demo:reset
npm run dev
```

Open [http://localhost:3000/demo](http://localhost:3000/demo). That Presenter screen is the judges’ map: the transaction receipt across the top, Shop on the left, Pickup on the right.

## 0:00–0:20 — Problem

"When an AI agent buys something in a physical venue, the merchant still needs proof of handover before money should move. Proofed places a PayPal authorization, not a capture, and only captures after the pickup station records evidence."

Point at the receipt: Quote → Hold placed → Handover verified → Captured, and the color legend (Held, Captured, Voided, Refunded, Failed).

## 0:20–1:20 — Success path

1. In the Shop pane (or open `/`), the draft already says `I have a $20 budget. Do you have a keychain?` Press **Send**.
2. Wait for the agent action log. Point at each step: what the model requested, the input, the result, and the guardrail — for example “Price and stock from the catalog, not the model” and “Backend priced the cart from catalog cents.” If the backend rejects a quote, that line is marked as a backend override.
3. The receipt updates with the catalog total (the Pudgy Keychain is **$12.00**). Ask it to check out if it has not already.
4. When the PayPal button appears, say: "This creates an Orders v2 payment with intent AUTHORIZE." Approve with the sandbox buyer.
5. The receipt moves to **Hold placed**. Read the money line: “$12.00 held on the shopper’s PayPal, not charged yet.” Show the PayPal authorization id (sandbox link) and the pickup code.
6. In Pickup, type or paste the code and press **Confirm handover and capture**.
7. Status becomes **CAPTURED**. The money line says the shopper was charged. The capture id is on the receipt.
8. Open **Merchant**, click the row, and show the same stepper, PayPal ids, evidence hash, and event log.

## 1:20–2:25 — Failure and Autonomous Recovery (The Negative Path ROI)

1. Show the **Autonomous Agent Crisis Hub** in the center of the screen:
   "Physical fulfillment is chaotic: solenoids jam, parcels get crushed on doorsteps, drones drop at the wrong porch. In traditional commerce, the customer was debited $12 upfront and faces a 14-day bank chargeback dispute. In Proofed, the funds are merely authorized — and the autonomous agent takes over."
2. Click **⚡ Solenoid Jam** (or **💥 Parcel Damaged**):
   - The UI immediately transforms into the **Crisis War Room**:
   - Point to the **Zero-Capture Security Shield**: "PayPal Payments v2 `/capture` is permanently locked. The buyer was debited $0.00."
   - Point to the **Agent Live Neural Reasoning Stream**: logs real-time sensor fault, financial guard lockout, and recovery synthesis in under 120ms.
3. Show the **3 Autonomous Countermeasure Cards**:
   - **Countermeasure 1 (Hardware)**: Auto-reroutes to Locker Bay #08 without canceling the hold.
   - **Countermeasure 2 (Catalog)**: Smart budget substitution (swaps broken $12 item for $8 Enamel Pin, returning $4.00 back to available buyer wallet).
   - **Countermeasure 3 (Financial)**: One-click instant PayPal `/void`. Press **Instant PayPal /void (Release Hold)**.
4. The hold is released live on the PayPal sandbox in under 1.5s!
   - The Buyer Wallet widget immediately restores available capital to $250.00 ($0 charged).
   - Point out the **Autonomous Concierge Apology Voucher** (`PRFD-CARE-XXXX`) issued to preserve customer loyalty.
   - Contrast this with the side-by-side scorecard: "14 days dispute & $15 penalty vs 1.2s auto-void and $0 penalty."


## 2:25–2:50 — Controls

- The model never sends an amount to PayPal. The backend reads catalog cents.
- Every mutation stores a PayPal-Request-Id.
- Webhooks verify signatures when `PAYPAL_WEBHOOK_ID` and a public HTTPS URL are set; locally we also reconcile with GET.
- On Merchant, click **Reconcile now** if you want to show that job.

## 2:50–3:00 — Close

Return to `/demo`. The presenter view should now show the live captured (or substituted) transaction above both panes.
