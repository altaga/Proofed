---
name: paypal-sandbox
description: Comprehensive procedures and troubleshooting guide for PayPal Sandbox Orders v2 (intent=AUTHORIZE) and Payments v2 (capture, void, refund).
---

# PayPal Sandbox Skill

This skill guides agents and developers through verifying, testing, and debugging the PayPal Sandbox integration within Proofed.

## Overview of PayPal APIs Used

Proofed uses two distinct PayPal API sets:
1. **Orders v2 API** (`https://api-m.sandbox.paypal.com/v2/checkout/orders`):
   - Used with `intent: "AUTHORIZE"`.
   - Creation, buyer approval, and authorization execution.
2. **Payments v2 API** (`https://api-m.sandbox.paypal.com/v2/payments`):
   - `POST /v2/payments/authorizations/{authorization_id}/capture`
   - `POST /v2/payments/authorizations/{authorization_id}/void`
   - `POST /v2/payments/captures/{capture_id}/refund`

## Required Environment Variables

Check `app/.env` (or project root `.env`):
- `PAYPAL_CLIENT_ID`: Sandbox REST App Client ID.
- `PAYPAL_CLIENT_SECRET`: Sandbox REST App Secret.
- `PAYPAL_WEBHOOK_ID`: (Optional) Sandbox Webhook ID for live webhook verification.
- `PAYPAL_BUYER_EMAIL`: (Optional) Sandbox Personal buyer test account.
- `PAYPAL_BUYER_PASSWORD`: (Optional) Sandbox Personal buyer password.

## Verification Checklist

### 1. Generating an Access Token manually

```bash
curl -v -X POST "https://api-m.sandbox.paypal.com/v1/oauth2/token" \
  -u "$PAYPAL_CLIENT_ID:$PAYPAL_CLIENT_SECRET" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```

### 2. Inspecting an Authorization

```bash
curl -v -X GET "https://api-m.sandbox.paypal.com/v2/payments/authorizations/$AUTH_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

Expected status:
- `CREATED`: Hold active, awaiting capture or void. Valid for 29 days.
- `CAPTURED`: Funds transferred to merchant.
- `VOIDED`: Hold released back to customer credit limit.
- `EXPIRED`: Hold lapsed beyond validity window.

### 3. Capturing an Authorization

```bash
curl -v -X POST "https://api-m.sandbox.paypal.com/v2/payments/authorizations/$AUTH_ID/capture" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "PayPal-Request-Id: test-capture-$AUTH_ID" \
  -d '{}'
```

### 4. Voiding an Authorization

```bash
curl -v -X POST "https://api-m.sandbox.paypal.com/v2/payments/authorizations/$AUTH_ID/void" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "PayPal-Request-Id: test-void-$AUTH_ID"
```

## Running PayPal Integration Tests

Run the dedicated integration test suite:

```bash
npm run test:paypal
```

Note: Integration tests will mock sandbox responses if credentials are not configured, or call live sandbox endpoints if valid credentials are provided in `.env`.
