# Apple IAP — Staging preview deployment configuration

**Do not deploy** until Apple IAP changes are reviewed and deployment is explicitly authorized. This document is the **intended Preview** configuration only.

## Branch and change set

| Item | Value |
|------|--------|
| Current branch | `fix/storage-moderation-enforcement` (local; **ahead of origin by 1** commit unrelated to Apple IAP) |
| Apple IAP work | **Uncommitted** — includes `app/api/apple/*`, `lib/apple/*`, `lib/ios/mdb-storekit-bridge.ts`, migrations `202611031700_*` / `202611031800_*`, iOS plugin, scripts, docs |
| Staging Supabase | **`jzlegcbotqfzevtczwhx`** (migrations applied; six inactive SKUs seeded) |
| Production Supabase | **`aehuszoadgqtbkxsliyy`** — must remain on **Production** Vercel scope only |

## Preview Supabase separation

Before or as part of preview setup (requires Vercel + Supabase CLI auth):

```bash
node scripts/sync-vercel-preview-supabase-staging.mjs
node scripts/verify-vercel-preview-supabase-separation.mjs
```

Preview should expose:

- `NEXT_PUBLIC_SUPABASE_URL` → `https://jzlegcbotqfzevtczwhx.supabase.co`
- Matching staging anon + service role keys (Preview scope only)
- `MDB_PREVIEW_SUPABASE_ENABLED` / `NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED` per existing MDB preview flags

## Apple API routes (Node runtime)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/apple/products?userId=` | Active SKU product IDs (auth required) |
| POST | `/api/apple/transactions/verify` | JWS verify + audit (`verified_no_grant`) |
| POST | `/api/apple/transactions/restore` | Batch entitlement JWS restore |
| POST | `/api/apple/notifications?environment=Sandbox` | App Store Server Notifications V2 |

## Recommended Vercel **Preview** environment variables

| Variable | Preview value | Notes |
|----------|---------------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jzlegcbotqfzevtczwhx.supabase.co` | From sync script |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon JWT | Preview only |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service role | Preview only; server routes |
| `NEXT_PUBLIC_PUBLIC_BETA_COMMERCE_LOCKED` | **unset** or `true` | Unset = locked (beta default) |
| `APPLE_IAP_VERIFY_ENABLED` | unset or `true` | Set `false` to 503 verify routes |
| `APPLE_IAP_WEBHOOK_ENVIRONMENT` | `Sandbox` | ASN default for preview |
| `APPLE_APP_STORE_BUNDLE_ID` | unset → `com.digitalmusicdatabase.app` | Optional override |
| `APPLE_APP_STORE_APP_APPLE_ID` | omit on preview | Required only for **Production** JWS verifier |
| `APPLE_IAP_ENABLE_ONLINE_CERT_CHECKS` | omit or `0` | Optional OCSP/revocation online checks |
| `APPLE_IAP_INTERNAL_QA_ENABLED` | omit (default off) | Preview only; see `apple-iap-internal-qa-isolation.md` |
| `APPLE_IAP_INTERNAL_QA_USER_IDS` | omit | Comma-separated staging QA user UUIDs; Preview only |

**Not env-configurable (code):** `APPLE_IAP_STAGE1_ENTITLEMENT_GRANTS_DISABLED = true` in `lib/apple/apple-iap-stage1.ts` — always no paid grants.

## App Store Connect webhook URL (after preview exists)

```
POST https://<vercel-preview-host>/api/apple/notifications?environment=Sandbox
```

Use Apple’s **Sandbox** notification testing; do not point production App Store production notifications at preview unless explicitly planned.

## Pre-deploy verification (local, no deploy)

```bash
npm run verify:apple-iap
node scripts/verify-public-beta-commerce-lock.mjs
node scripts/verify-apple-iap-preview-readiness.mjs
```

## Deployment steps (when authorized)

1. Review diff (Apple IAP + unrelated tree — **never** `git add -A`).
2. Push branch / open PR; trigger Vercel Preview.
3. Confirm preview hostname uses staging Supabase (`verify-vercel-preview-supabase-separation.mjs`).
4. Smoke: authenticated `GET /api/apple/products` → `commerceLocked: true`, product IDs empty until staging SKUs set `active=true` for sandbox-only tests.
5. Register ASN sandbox URL in App Store Connect (manual).

## iOS app loading preview web

Default `capacitor.config.ts` uses production web URL. For device QA against preview:

1. Temporarily set `server.url` to the preview HTTPS origin.
2. `npx cap sync ios` and rebuild on Mac.
3. Revert before commit unless product decision says otherwise.
