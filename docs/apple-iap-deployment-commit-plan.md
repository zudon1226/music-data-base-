# Apple IAP — path-scoped deployment commit plan

**Do not run `git add -A`.** Review this list before any commit/push/deploy.

## Audit vs working tree (2026-11-03)

| Check | Result |
|-------|--------|
| All untracked Apple API / `lib/apple` / scripts / docs | Covered below |
| `ios/CapApp-SPM/Package.swift` | **Not modified** in current diff — omit from commit unless Cap sync changes it later |
| `lib/listener-purchases-service.ts` | **Apple-only hunks** (vault import + merge) — include |
| `package.json` diff | **`verify:apple-iap`** + **`@apple/app-store-server-library`** only (deps hunk) |
| `project.pbxproj` diff | **MDBStoreKitPlugin only** — safe to stage whole file |
| Unrelated modified files | **37** paths — do **not** stage (page, support, connect, storage migrations, other verify scripts) |
| Accidental includes | `supabase/.temp/`, `evidence/`, probes — **never** stage |

## Branch context

- **Branch:** `fix/storage-moderation-enforcement`
- **Apple IAP:** uncommitted; mixed with unrelated WIP on same branch

## Include in Apple IAP commit(s) only

### API routes

- `app/api/apple/products/route.ts`
- `app/api/apple/transactions/verify/route.ts`
- `app/api/apple/transactions/restore/route.ts`
- `app/api/apple/notifications/route.ts`
- `app/api/apple/internal-qa/storekit/route.ts`

### Internal QA (StoreKit sheet isolation)

- `lib/apple/apple-iap-internal-qa.ts`
- `lib/apple/apple-iap-internal-qa.test.mjs`
- `scripts/verify-apple-iap-internal-qa.mjs`
- `docs/apple-iap-internal-qa-isolation.md`
- `docs/apple-iap-mac-build-procedure.md`
- `docs/apple-iap-deployment-commit-plan.md` (this file)

### Libraries

- `lib/apple/**` (entire directory)
- `lib/ios/mdb-storekit-bridge.ts`
- `lib/apple/certs/*.cer` (Apple root CAs)

### Listener My Purchases (Apple receipts)

- `lib/listener-purchases-service.ts` — **only if diff is Apple vault merge** (review hunk)

### iOS native

- `ios/App/App/MDBStoreKitPlugin.swift`
- `ios/App/App.xcodeproj/project.pbxproj` — **only MDBStoreKit-related hunks**
- `ios/App/CapApp-SPM/Package.swift` — **only if Capacitor sync requirement for IAP**

### Migrations (staging already applied; file for repo history)

- `supabase/migrations/202611031700_apple_iap_foundation.sql`
- `supabase/migrations/202611031800_apple_iap_staging_readiness.sql`

### Scripts

- `scripts/_apple-iap-staging-guard.mjs`
- `scripts/apply-apple-iap-staging-migration.mjs`
- `scripts/seed-apple-iap-staging-skus.mjs`
- `scripts/seed-apple-iap-staging-skus.sql`
- `scripts/validate-apple-root-certificates.mjs`
- `scripts/run-apple-jws-library-chain-test.mjs`
- `scripts/verify-apple-certificate-chain.mjs`
- `scripts/verify-apple-iap-foundation.mjs`
- `scripts/verify-apple-iap-e2e-matrix.mjs`
- `scripts/verify-apple-iap-preview-readiness.mjs`
- `scripts/verify-apple-iap-staging-rls.mjs`
- `scripts/verify-apple-iap-staging-rls.sql`
- `scripts/verify-apple-storekit-native.mjs`
- `scripts/verify-apple-iap-internal-qa.mjs`
- `scripts/print-apple-iap-xcode-build.mjs`
- `scripts/sync-vercel-preview-supabase-staging.mjs` — preview Supabase separation (IAP staging dependency)

### Docs

- `docs/apple-iap-*.md` (all Apple IAP handoff/readiness/checklist docs, including `apple-iap-app-store-connect-sandbox-checklist.md`)

### Package manifest (surgical)

- `package.json` / `package-lock.json` — stage **only** if changes include `@apple/app-store-server-library` and `verify:apple-iap` script (review diff; do not pick up unrelated script edits)

### Verification touch-ups (Apple-related hunks only)

- `scripts/verify-public-beta-commerce-lock.mjs` — Apple route assertions
- `scripts/verify-capacitor-ios-foundation.mjs` — StoreKit plugin checks

## Explicitly exclude (unrelated WIP)

- `app/page.tsx`, `app/api/songs/route.ts`, support screenshot routes/services
- Connect/payout webhook changes, billing constants (unless Apple-only — review)
- Storage migration edits, playlists/support migrations not listed above
- `evidence/`, `probe-out.txt`, `probe-result.json`
- `supabase/.temp/`, `supabase/.branches/`, `supabase/config.toml` (unless team standard)
- All other modified verify scripts not listed above

## Pre-deploy checklist (after commit, when authorized)

1. `node scripts/verify-apple-iap-preview-readiness.mjs`
2. `node scripts/sync-vercel-preview-supabase-staging.mjs` (Preview env → `jzlegcbotqfzevtczwhx`)
3. `node scripts/verify-vercel-preview-supabase-separation.mjs`
4. Vercel Preview deploy from reviewed commit
5. Smoke Apple routes on preview host

## Protections unchanged

- No Production Supabase env for Preview Apple testing
- Commerce lock unset/true; grant kill switch true
- Staging SKUs remain `active=false` until deliberate staging-only activation

## Exact staging commands (do not run until reviewed)

From repo root, **PowerShell** (one path per `git add` — no `-A`):

```powershell
git add app/api/apple/products/route.ts
git add app/api/apple/transactions/verify/route.ts
git add app/api/apple/transactions/restore/route.ts
git add app/api/apple/notifications/route.ts
git add app/api/apple/internal-qa/storekit/route.ts
git add lib/apple
git add lib/ios/mdb-storekit-bridge.ts
git add lib/listener-purchases-service.ts
git add ios/App/App/MDBStoreKitPlugin.swift
git add ios/App/App.xcodeproj/project.pbxproj
git add supabase/migrations/202611031700_apple_iap_foundation.sql
git add supabase/migrations/202611031800_apple_iap_staging_readiness.sql
git add scripts/_apple-iap-staging-guard.mjs
git add scripts/apply-apple-iap-staging-migration.mjs
git add scripts/seed-apple-iap-staging-skus.mjs
git add scripts/seed-apple-iap-staging-skus.sql
git add scripts/validate-apple-root-certificates.mjs
git add scripts/run-apple-jws-library-chain-test.mjs
git add scripts/verify-apple-certificate-chain.mjs
git add scripts/verify-apple-iap-foundation.mjs
git add scripts/verify-apple-iap-e2e-matrix.mjs
git add scripts/verify-apple-iap-preview-readiness.mjs
git add scripts/verify-apple-iap-staging-rls.mjs
git add scripts/verify-apple-iap-staging-rls.sql
git add scripts/verify-apple-storekit-native.mjs
git add scripts/verify-apple-iap-internal-qa.mjs
git add scripts/print-apple-iap-xcode-build.mjs
git add scripts/sync-vercel-preview-supabase-staging.mjs
git add scripts/verify-public-beta-commerce-lock.mjs
git add scripts/verify-capacitor-ios-foundation.mjs
git add docs/apple-iap-app-store-connect-setup.md
git add docs/apple-iap-app-store-connect-sandbox-checklist.md
git add docs/apple-iap-deployment-commit-plan.md
git add docs/apple-iap-device-sandbox-qa-checklist.md
git add docs/apple-iap-internal-qa-isolation.md
git add docs/apple-iap-ios-xcode-handoff.md
git add docs/apple-iap-mac-build-procedure.md
git add docs/apple-iap-sandbox-readiness.md
git add docs/apple-iap-staging-preview-config.md
git add package.json package-lock.json
git status
```

If `package.json` / `package-lock.json` pick up unrelated edits later, use `git add -p package.json` and stage only `verify:apple-iap` + `@apple/app-store-server-library` hunks.

## Proposed commit message (not executed)

```
Add Apple IAP Stage 1 server foundation, staging registry, and iOS StoreKit bridge.

Verify StoreKit JWS via Apple's library without entitlement grants during public beta;
add staging-only catalog/events migrations, preview Supabase wiring, and guarded internal QA for native purchase sheets on allowlisted preview users only.
```

## Pre-commit verification

```bash
npm run verify:apple-iap
node scripts/verify-apple-iap-preview-readiness.mjs
node scripts/verify-listener-purchases.mjs
node scripts/verify-public-beta-commerce-lock.mjs
node scripts/run-next-build-isolated.mjs
```
