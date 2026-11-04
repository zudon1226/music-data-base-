# Apple IAP — internal QA isolation (StoreKit purchase sheet)

**Default:** disabled. Public beta commerce lock stays **on** for all users (Stripe, marketplace, UI notices).

## Goal

Allow **named staging QA accounts** on **Vercel Preview + staging Supabase** to open the **native StoreKit purchase sheet** while:

- `NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED` remains unset or `true`
- `APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED` remains `true` (verify/restore still `verified_no_grant`)
- Production Supabase / Production Vercel cannot enable the path (fail-closed)

## Mechanism

1. **Server gate:** `GET /api/apple/internal-qa/storekit?userId=` (authenticated, matching user).
2. **Master switch (Preview only):** `APPLE_IAP_INTERNAL_QA_ENABLED=1`
3. **Allowlist:** `APPLE_IAP_INTERNAL_QA_USER_IDS=<uuid>,<uuid>` (staging QA accounts only)
4. **Runtime checks (all required):**
   - `NEXT_PUBLIC_SUPABASE_URL` contains **`jzlegcbotqfzevtczwhx`**
   - URL must **not** contain production ref **`aehuszoadgqtbkxsliyy`**
   - `VERCEL_ENV` is **not** `production`
   - `isProductionAppleIapRuntime()` is false
   - Global commerce lock is **still locked**
5. **Native bridge:** `purchaseIosStoreKitProduct({ accessToken })` calls the gate; only then passes `commerceLocked: false` to `MDBStoreKit`.

Ordinary users: no token path change → remain `COMMERCE_LOCKED` in native plugin.

## Preview env (when authorized — Preview scope only)

| Variable | Example |
|----------|---------|
| `APPLE_IAP_INTERNAL_QA_ENABLED` | `1` |
| `APPLE_IAP_INTERNAL_QA_USER_IDS` | comma-separated staging user UUIDs |

**Never** set on Production Vercel scope. Even if mis-set, production Supabase URL and `VERCEL_ENV=production` block activation.

## Products

Use **staging** App Store product IDs only; activate rows in **staging DB** (`active=true`) for load tests — never production catalog.

## Limitations

- QA UI entry points must pass `accessToken` into `purchaseIosStoreKitProduct` (no bypass for anonymous clients).
- Client-side patching could always attack any mobile app; server still **never grants** paid entitlements in Stage 1.
- Does not unlock Stripe checkout or marketplace cart — only native StoreKit `commerceLocked` for allowlisted users.

## Verification

```bash
node scripts/verify-apple-iap-internal-qa.mjs
node lib/apple/apple-iap-internal-qa.test.mjs
```
