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

## 1:20–2:25 — Failure and substitution

1. Back in Shop: `Please propose the water bottle, SKU DC-BTL-01.` The shelf card is out of stock (seeded with 0). The quote is rejected for a real reason — point at the red “Backend rejected or overrode the agent” line.
2. Buy the enamel pin instead (`I'd like the Venue Enamel Pin (DC-PIN-01) if it fits a $20 budget.`), then approve PayPal again.
3. On Pickup, choose **Station jam** and press **Report delivery failure**. Status is `DELIVERY_FAILED`; the receipt still says the amount is held.
4. Press **Substitute with …** on a suggested item, then **Confirm substitution** (or ask the assistant to recover in Shop).
5. The original authorization is VOIDED and a new AUTHORIZE order appears. Show “Hold released” / “Replacement order …” and the Substituted / Voided branches on the receipt.

## 2:25–2:50 — Controls

- The model never sends an amount to PayPal. The backend reads catalog cents.
- Every mutation stores a PayPal-Request-Id.
- Webhooks verify signatures when `PAYPAL_WEBHOOK_ID` and a public HTTPS URL are set; locally we also reconcile with GET.
- On Merchant, click **Reconcile now** if you want to show that job.

## 2:50–3:00 — Close

Return to `/demo`. The presenter view should now show the live captured (or substituted) transaction above both panes.
