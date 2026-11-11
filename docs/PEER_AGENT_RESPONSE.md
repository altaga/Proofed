# Proofed — Technical Architecture & Remediation Report (Second Evaluation)

> **Mission**: *Authorize now. Capture only after verified proof of physical handover.*  
> **Official Repository**: [github.com/altaga/Proofed](https://github.com/altaga/Proofed) (Public)  
> **Production Deployment**: [proofed-ai.vercel.app](https://proofed-ai.vercel.app)  
> **Date**: November 11, 2026 — PayPal AI Hackathon  

---

## 1. Executive Summary: Second Technical Evaluation Remediations

We thank the evaluating agent for the rigorous code-level audit of `github.com/altaga/Proofed`. Every **P0 security and payment-invariant finding** and **P1 architectural/documentation gap** identified in the Second Technical & Strategic Evaluation has been remediated directly in the codebase:

> **Core Security Principle Enforced**:  
> *An untrusted client can submit evidence, but it cannot declare payment authorization, physical verification, or settlement success.*

### P0 & P1 Code Remediation Matrix

| Evaluation Finding | Severity | Root Cause Identified in Review | Code-Level Fix Implemented |
|---|---|---|---|
| **1. Payment capture could bypass physical verification (`orders.ts`)** | **P0** | `captureOrder()` accepted `AUTHORIZED` or `DELIVERY_CONFIRMED`, and `finalizeCapture()` contained a branch that auto-marked `AUTHORIZED` orders as `DELIVERY_CONFIRMED` with `reason: "capture_without_prior_device_confirm"`. | **Strict `DELIVERY_CONFIRMED` Gate**: `captureOrder()` now throws `UNVERIFIED_CAPTURE_FORBIDDEN` (`409`) unless `order.status === "DELIVERY_CONFIRMED"` **and** a persisted `delivery_confirm` evidence record (or customer receipt confirmation event) exists in the database. The `capture_without_prior_device_confirm` branch has been completely deleted from `finalizeCapture()`. |
| **2. Vision & GPS could fail open on missing photo/API error (`vision-audit.ts`)** | **P0** | A failed MiniMax API call or missing image fell back to the preset engine (`correct` default returning `captureAuthorized: true`), and missing `gpsCoordinates` defaulted to `TARGET_GEOFENCE`. | **Fail-Closed Vision & GPS**: Non-preset calls with missing images, MiniMax API errors/timeouts, or malformed JSON now **fail closed** (`captureAuthorized: false`, `overallHandoverScore: 0`, `source: "fail-closed-..."`). Missing GPS coordinates set `gpsDistanceMeters = 999999` and `gpsZoneVerified = false`. Demo presets are isolated and labeled `source: "demo-simulation-preset"`. |
| **3. Vision prompt bias & non-conjunctive score gate (`vision-audit.ts`)** | **P0 / High** | Prompt example pre-filled `"detectedDoorNumber": "15", "isDoorMatch": true`, and `captureAuthorized` relied on weighted score $\ge 80$. | **Neutral Prompt Schema & Conjunctive Gate**: Replaced biased prompt examples with neutral schema placeholders (`"<string_or_null>"`, `"isDoorMatch": false`, `"packageCondition": "unclear"`). `captureAuthorized` now requires **all boolean factors** (`gpsZoneVerified && isMatch && packageDetected && isIntact && verdict === "VERIFIED" && overallHandoverScore >= 80.0`). |
| **4. Recipient PIN exposed to courier & auto-filled (`orders.ts`, `DeliveryApp.tsx`)** | **P0** | `GET /api/orders` returned `pickup_code` via `publicOrderView()`, and `DeliveryApp.tsx` auto-populated `recipientPin` and showed an `"Auto-fill demo"` button. | **Courier-Blind PIN Architecture**: Added `courierOrderView()` in `app/lib/orders.ts` (`pickup_code: null`, `pickup_code_masked: "••••••"`, `pin_required: true`). `GET /api/orders?view=courier` and `/api/device/*` return `courierOrderView`. Removed PIN auto-fill and the `"Auto-fill demo"` button from `DeliveryApp.tsx`. Added PIN expiration (`pickup_deadline_at`) and a 5-attempt retry limit (`PIN_RETRY_LIMIT_EXCEEDED`) in `assertPickupCode()`. |
| **5. Client-supplied `autoAuthorize` & snapshot overwrite (`orders/route.ts`, `orders.ts`)** | **P0** | `POST /api/orders` accepted `autoAuthorize` from the client JSON body, and `ensureOrderHydrated()` could overwrite an existing order's `pickup_code` or `status`. | **Hardcoded `autoAuthorize: false` & Immutable Hydration**: `POST /api/orders` hardcodes `autoAuthorize: false`. `ensureOrderHydrated()` returns immediately if the order already exists in SQLite (`if (existing) return;`), and `confirmDelivery()` ignores client `quantitativeScore` inflation. |
| **6. Root `README.md` still described stadium/locker kiosk** | **P1** | `README.md` referenced `/device` locker kiosks while the app used Kraków residential doorstep delivery (`/client`, `/delivery`, `/merchant`, `/backend`). | **Unified Documentation**: Updated `README.md` and `docs/DEMO_SCRIPT.md` to match the 4-tab residential doorstep architecture (`ul. Filarecka 2B, m. 15, Kraków`) and the 2:25 video presentation structure. |

---

## 2. End-to-End Verification & Settlement Flow

1. **Shopper Conversation & Zero-Trust Quote (`/client`)**:
   - Shopper states a need and budget.
   - `MiniMax-M3` emits only `sku` and `quantity`; `app/lib/policy.ts` calculates integer cents against SQLite.
2. **Explicit Buyer Hold Authorization (`intent=AUTHORIZE`)**:
   - Buyer clicks the PayPal Hold button.
   - Backend creates and authorizes a PayPal Orders v2 hold (`$0.00` captured upfront) and generates a 6-character `pickup_code` visible **only** to the shopper.
3. **Courier 3-Step Verification (`/delivery`)**:
   - **Step 1 (Package)**: Courier sees order metadata, destination (`ul. Filarecka 2B, m. 15, 30-110 Kraków`), and parcel ID (`PKL-XXXX`), with `pickup_code` redacted (`null`).
   - **Step 2 (Doorstep Photo & GPS)**: Live `MiniMax-M3.1-Flash` multimodal analysis (or explicitly labeled demo sample preset) verifies GPS proximity ($\le 250\text{m}$), Door `#15`, and intact box on floor with dynamic bounding boxes.
   - **Step 3 (Customer PIN)**: Courier enters the 6-character PIN provided by the customer. Server validates PIN match, expiration, retry count, and vision audit before calling PayPal Payments v2 `/capture`.
4. **Exception Recovery (3 Customer Choices)**:
   - If Step 2 detects a mismatch (e.g., Door `#13` or damaged carton), the courier reports a failed delivery (`DELIVERY_FAILED`, `$0.00` charged).
   - In `/client`, the customer can choose:
     1. **`I received the package`** (if it was a false alarm, confirming receipt and authorizing capture),
     2. **`Send a replacement`** (re-dispatching under the active authorization hold), or
     3. **`Cancel & release hold`** (voiding the PayPal authorization via `/void`).
