# Proofed — demo script (under 3 minutes)

Record in English, showing the running app. Use a PayPal sandbox personal (buyer) account and the sandbox business app already configured in `.env`.

## 0:00–0:20 — Problem

"When an AI agent buys something in a physical venue, the merchant still needs proof of handover before money should move. Proofed places a PayPal authorization, not a capture, and only captures after the pickup station records evidence."

Show the shop page: Dome City Gift Shop, the assistant, the merchant and pickup links.

## 0:20–1:10 — Success path

1. In Shop, send: `I have a $20 budget. Do you have a keychain?`
2. Wait for the assistant to call catalog tools (pills appear). Point at the live price from the database, not a guessed number.
3. Ask it to check out the keychain. When the PayPal button appears, say: "This creates an Orders v2 payment with intent AUTHORIZE."
4. Log in with the sandbox buyer and approve.
5. Show the pickup code and the PayPal authorization id.
6. Open Pickup station, enter the code, add a short note, optionally attach a photo, press **Confirm handover and capture**.
7. Show status CAPTURED and mention that Payments v2 captured the authorization. Open Merchant desk, select the row in AG Grid, point to the capture id and the evidence hash.

## 1:10–2:20 — Failure path

1. New chat: `Please propose the water bottle, SKU DC-BTL-01.` The catalog lists it with zero stock — the quote is rejected for a real reason.
2. Buy a pin or postcard instead, approve PayPal again.
3. On the pickup station choose **Station jam** and **Report delivery failure**. Status becomes DELIVERY_FAILED; the authorization is still held.
4. Back in Shop: `The station jammed. Investigate order <id> and cancel if needed.`
5. The assistant calls `investigate_failure` then `propose_recovery` with `cancel`, which VOIDs the authorization.
6. On the merchant desk, show VOIDED, the event log (DELIVERY_FAILED → PAYPAL_VOIDED), and that no capture exists.

## 2:20–2:50 — Controls

Quick cuts:

- "The model never sends an amount to PayPal. The backend reads catalog cents."
- "Every mutation stores a PayPal-Request-Id."
- "Webhooks verify signatures when PAYPAL_WEBHOOK_ID and a public HTTPS URL are set; locally we also reconcile with GET."

## 2:50–3:00 — Close

"Authorize now. Capture only after proof of handover."
