---
name: demo-runner
description: Procedures for resetting the demo catalog, running Playwright UI tests, refreshing screenshots, and conducting live presentations.
---

# Demo Runner Skill

This skill documents how to reset the local demo state, run end-to-end user flows, and capture clean screenshots for presentation.

## Quick Reset

Before presenting or running automated tests, reset the SQLite database to a pristine catalog state:

```bash
npm run demo:reset
```

This clears old orders, resets product inventory (setting the water bottle `DC-BTL-01` to 0 stock for the demo failure scenario), and purges temporary evidence logs.

## Demo Presentation Flow

1. **Start the local server**:
   ```bash
   npm run dev
   ```
2. **Open the Presenter Screen**:
   Navigate to [http://localhost:3000/demo](http://localhost:3000/demo).
   - Top banner: Real-time transaction receipt & stepper.
   - Left pane: Shopper chat & product shelf.
   - Right pane: Pickup station terminal (`/device`).

3. **Success Scenario (Under 60 seconds)**:
   - In Shop, send: `I have a $20 budget. Do you have a keychain?`
   - Observe agent tool calls in the action log.
   - Point out that price is sourced from catalog cents ($12.00).
   - Click the PayPal Smart Button to approve the hold.
   - Show that status changes to `Hold placed` (NOT captured).
   - Enter pickup code on the right pickup terminal and press **Confirm handover and capture**.
   - Show status transition to `CAPTURED` with real capture ID.

4. **Failure & Substitution Scenario (60-120 seconds)**:
   - Ask for SKU `DC-BTL-01` (seeded out of stock). Show policy engine rejection.
   - Order the Venue Pin (`DC-PIN-01`).
   - On Pickup, report `Station jam`.
   - Show status moves to `DELIVERY_FAILED` while funds remain held.
   - Select suggested substitute item, confirm substitution.
   - Show original authorization is VOIDED and replaced with new authorization.

## Automated Verification & Screenshots

To refresh all screenshots in `docs/screenshots/` using headless Playwright:

```bash
npm run screenshots
```
