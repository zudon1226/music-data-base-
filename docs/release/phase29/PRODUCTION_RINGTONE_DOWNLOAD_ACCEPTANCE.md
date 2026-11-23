# Production ringtone download acceptance

**Production:** https://www.digitalmusicdatabase.com  
**Policy:** `docs/release/MDB-PRODUCTION-FIRST-WORKFLOW.md`  
**Probe script:** `node scripts/verify-production-ringtone-download.mjs`  
**Evidence:** `tmp/production-ringtone-download-evidence.json`

## Expected flow (catalog ringtone)

1. Guest sees ringtone on **Ringtone Marketplace** (`filter=all` or `filter=free`).
2. Signed-in listener taps **Get free** (`POST /api/ringtones/:id/purchase`) → free acquisition row (`payment_status=paid`, $0).
3. **Android:** `POST /api/ringtones/:id/download` with `deviceType=android` → binary audio + `Content-Disposition: attachment`.
4. **iPhone:** same route with `deviceType=iphone` (or ticket flow from UI) → attachment stream, no signed URL JSON.

Beta **paid** checkout remains locked; free acquisition must not charge.

## Publication gate (owner in progress)

**Status:** Awaiting authorized free test ringtone published on **Production** via normal Artist account (owner action).  
**Last probe:** 2026-11-23 — `GET /api/ringtones/marketplace?filter=free` → `total=0`, `publicBetaPaidPurchaseLocked=true`, `paidCheckoutAvailable=false`.

When `total ≥ 1`, re-run `npm run verify:production-ringtone-download` and complete the manual matrix below.

---

## Automated probes (2026-11-23)

| Check | Result | Detail |
|-------|--------|--------|
| `GET /api/launch/status` | **PASS** | `ok: true` |
| Beta lock on marketplace | **PASS** | `publicBetaPaidPurchaseLocked: true` |
| Unauthenticated download | **PASS** | HTTP **401** on sample id |
| **Marketplace catalog** | **BLOCKED** | `total=0` — no published ringtones on Production |
| Authenticated byte download | **BLOCKED** | Requires catalog row + `MDB_PRODUCTION_TEST_EMAIL/PASSWORD` |

### Root cause of cross-platform “missing ringtone”

The Roll Call ringtone was published on **staging only** (`jzlegcbotqfzevtczwhx`). Production marketplace is empty until the **same artist publishes on www** through normal Creator / Ringtone Studio (no staging row copy).

Capacitor loads Production (`capacitor.config.ts` → `www.digitalmusicdatabase.com`), matching phone browsers that use the public site.

## Owner actions to complete acceptance

1. On **Production**, sign in as Roll Call artist (`07fdeef9…` account on `aehuszoadgqtbkxsliyy`).
2. Create/submit/publish the **$0** marketplace ringtone from the owned Roll Call source (same workflow verified on staging).
3. Re-run: `node scripts/verify-production-ringtone-download.mjs` (optional env: production test account + anon key for byte-level download).
4. Manual matrix on **www** only:
   - Desktop Chrome — marketplace + download
   - iPhone Safari — Get free + iPhone download
   - Android Chrome — Get free + Android download

## Contract tests (local, pre-Production)

| Script | Result |
|--------|--------|
| `verify-public-beta-ringtone-lock.mjs` | PASS |
| `verify-iphone-ringtone-forced-download.mjs` | PASS (entitlement gates) |

## Production deployment note

Live Production deployment inspected: **Ready** (`dpl_JEEXdXHKsvq7UqowNCr2Xv7xDRB2`, ~2026-11-23). Download routes and beta locks are live; **data** is the gating item, not missing code on www.

## Rollback

Redeploy prior Production Vercel deployment if a bad publish occurs; unpublish/archive ringtone via creator tools (do not delete entitlements blindly).