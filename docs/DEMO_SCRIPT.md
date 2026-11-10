# Proofed — demo script (under 3 minutes)

Record in English, showing the running app. Use a PayPal sandbox personal (buyer) account and the sandbox business app already configured in `.env`. Reset to a known catalog first:

```bash
npm run demo:reset
npm run dev
```

Open [http://localhost:3000/demo](http://localhost:3000/demo).

## 0:00–0:20 — Problem

"When an AI agent buys something in a physical venue, the merchant still needs proof of handover before money should move. Proofed places a PayPal authorization, not a capture, and only captures after the pickup station records evidence."

On `/demo`, point at the three steps: Shop holds, Pickup records proof, Merchant sees the truth. The live checklists on that page update from the real database.

## 0:20–1:15 — Success path

1. Click **Open the shop** (or go to `/`).
2. The draft already says `I have a $20 budget. Do you have a keychain?` Press **Send**.
3. Wait for the tool-step cards (`search catalog`, maybe `propose checkout`). Point at the live **$12.00** Pudgy Keychain card from the database, not a guessed number.
4. Ask it to check out the keychain if it has not already. When the PayPal button appears, say: "This creates an Orders v2 payment with intent AUTHORIZE."
5. Log in with the sandbox buyer and approve.
6. Show the status timeline switching to AUTHORIZED, the pickup code, and the PayPal authorization id.
7. Open **Pickup**. Type or paste the code into the large field. Add a short note, optionally attach a photo, press **Confirm handover and capture**.
8. Show the full-screen success state (CAPTURED) and the capture id.
9. Open **Merchant desk**. Point at the Captured KPI, click the row to open the drawer, and show the capture id (sandbox link), evidence hash, and event log.

## 1:15–2:25 — Failure and substitution

1. Back in Shop, new prompt: `Please propose the water bottle, SKU DC-BTL-01.` The shelf card is marked out of stock (seeded with 0). The quote is rejected for a real reason.
2. Ask it to buy the enamel pin instead (`I'd like the Venue Enamel Pin (DC-PIN-01) if it fits a $20 budget.`), then approve PayPal again.
3. On Pickup, choose **Station jam** (the select or the reason card) and press **Report delivery failure**. The kiosk shows DELIVERY_FAILED; the authorization is still held.
4. Either:
   - Press **Substitute with …** on a suggested item, then **Confirm substitution**, or
   - In Shop: `The station jammed. Investigate order <id> and substitute something within budget.`
5. The original authorization is VOIDED and a new AUTHORIZE order appears for the substitute. Show that on the kiosk ("Replacement order …") and in the merchant drawer event log (`DELIVERY_FAILED` → `PAYPAL_VOIDED` → `RECOVERY_SUBSTITUTE`).

## 2:25–2:50 — Controls

Quick cuts:

- "The model never sends an amount to PayPal. The backend reads catalog cents."
- "Every mutation stores a PayPal-Request-Id."
- "Webhooks verify signatures when PAYPAL_WEBHOOK_ID and a public HTTPS URL are set; locally we also reconcile with GET."
- On Merchant, click **Reconcile now** if you want to show that job.

## 2:50–3:00 — Close

Return to `/demo`. "Authorize now. Capture only after proof of handover."
