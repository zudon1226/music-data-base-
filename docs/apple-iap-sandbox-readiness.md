# Apple IAP — Sandbox readiness (staging only)

**Bundle ID:** `com.digitalmusicdatabase.app`  
**Staging Supabase ref:** `jzlegcbotqfzevtczwhx` (never `aehuszoadgqtbkxsliyy`)  
**Commerce:** `NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED` unset or true; `APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED` true — no paid grants.

## Product ID mapping (six development SKUs)

| MDB entity | App Store product ID | Registry | Staging active |
|------------|----------------------|----------|----------------|
| Listener monthly (`premium-listener`) | `com.digitalmusicdatabase.app.staging.subscription.listener.monthly` | `apple_catalog_skus` | `false` |
| Artist monthly (`artist-pro`) | `com.digitalmusicdatabase.app.staging.subscription.artist.monthly` | `apple_catalog_skus` | `false` |
| Producer monthly (`producer-pro`) | `com.digitalmusicdatabase.app.staging.subscription.producer.monthly` | `apple_catalog_skus` | `false` |
| Test album (fixture UUID) | `com.digitalmusicdatabase.app.staging.album.test` | `apple_catalog_skus` | `false` |
| Test ringtone (fixture UUID) | `com.digitalmusicdatabase.app.staging.ringtone.test` | `apple_catalog_skus` | `false` |
| Beat Basic license (fixture UUID) | `com.digitalmusicdatabase.app.staging.beat.basic.test` | `apple_catalog_skus` | `false` |

Metadata on all rows: `mdb_catalog_tier=staging_dev_only`, `production_sales_blocked=true`, `app_store_connect_status=not_activated`.

To exercise StoreKit on staging, temporarily set `active=true` **only on staging** for sandbox IDs that exist in App Store Connect — never enable production sales.

## App Store Connect setup (when authorized)

1. Create **Sandbox** subscription group and non-consumables matching the product IDs above (names clearly prefixed `STAGING DEV`).
2. Do **not** submit for production review or set production pricing.
3. Create **Sandbox Apple ID** testers in Users and Access.
4. Server Notifications V2 URL (Preview/staging host):  
   `POST https://<staging-app-host>/api/apple/notifications?environment=Sandbox`
5. Optional env: `APPLE_IAP_WEBHOOK_ENVIRONMENT=Sandbox`, `APPLE_APP_STORE_APP_APPLE_ID` for Production JWS only.

## Sandbox test cases (manual / QA)

1. **Load products** — iOS `MDBStoreKit.loadProducts` with IDs from `GET /api/apple/products` (after staging SKUs activated for sandbox).
2. **Purchase blocked** — With commerce lock on, native purchase returns `COMMERCE_LOCKED`; no entitlement rows.
3. **Verify transaction** — POST `/api/apple/transactions/verify` with StoreKit JWS + `environment=Sandbox`; expect `verified_no_grant`, `entitlementsGranted: false`.
4. **Duplicate** — Repeat same `transactionId`; expect `duplicate: true`, no extra side effects.
5. **Cross-account** — Bind transaction to user A; user B verify/restore → `409` / `ownershipConflict`.
6. **Invalid JWS** — POST malformed JWS → `422 JWS_VERIFICATION_FAILED`.
7. **Environment mismatch** — Sandbox JWS with `environment=Production` → rejection.
8. **ASN refund/revoke** — Send Apple test notification to `/api/apple/notifications`; expect `asn_no_grant` or `revoked_no_grant`, no grants.
9. **Restore** — POST `/api/apple/transactions/restore` with entitlement JWS list; `restored_no_grant`.
10. **My Purchases** — Verified Apple events appear as receipts with “verified, no beta grant”; Stripe history unchanged.

## Staging migration apply (guarded)

```bash
MDB_APPLE_IAP_STAGING_APPLY=1 \
MDB_STAGING_PROJECT_REF=jzlegcbotqfzevtczwhx \
STAGING_SUPABASE_URL=https://jzlegcbotqfzevtczwhx.supabase.co \
STAGING_DATABASE_URL='postgresql://...' \
node scripts/apply-apple-iap-staging-migration.mjs

node scripts/seed-apple-iap-staging-skus.mjs
node scripts/verify-apple-iap-staging-rls.mjs
```

Or Supabase CLI against **staging ref only** (never production `aehuszoadgqtbkxsliyy`):

```bash
SUPABASE_YES=1 npx supabase db push --project-ref jzlegcbotqfzevtczwhx
SUPABASE_YES=1 npx supabase db query --remote=jzlegcbotqfzevtczwhx -f scripts/seed-apple-iap-staging-skus.sql
npx supabase db query --remote=jzlegcbotqfzevtczwhx --read-only -f scripts/verify-apple-iap-staging-rls.sql
```

Requires explicit hosted mutation consent via `--yes` / `SUPABASE_YES=1` for writes.
