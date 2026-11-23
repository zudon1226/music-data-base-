# Phase 28G — Authenticated Preview Acceptance Report

**Report time:** 2026-11-23 (local)  
**Branch:** `release/pwa-microsoft-store`  
**Prior baseline:** Phase 28F (`30218db`)

---

## Final verdict: **CONDITIONAL**

| Area | Result |
|------|--------|
| Deployed Preview E2E (guest + authenticated where creds allow) | **26 PASS** |
| Outstanding gaps (documented) | **4 BLOCKED** |
| Hard failures on Preview | **0 FAIL** (final harness run) |
| Production | **Untouched** |

**CONDITIONAL** — Phase 28 playback, publication validation, catalog/library search logic, and draft isolation are verified on the live Preview deployment with staging Supabase. **Owner-signed-in draft merge** on Preview requires the **fixture song owner** session (`07fdeef9…` prefix), not the mixtape E2E artist (`f0502a2e…` prefix). Serverless **45s throttle** is verified in the engagement model, not as a durable cross-request Preview guarantee.

---

## Deployment and commit

| Field | Value |
|-------|--------|
| Preview URL | `https://music-data-base-pwa-clean-git-baseline-recovered-p1ex4fyjt.vercel.app` |
| Deployment ID | `dpl_9FaGdAgpggeQQqRbPCtnbcbWNmgG` |
| Status at test time | **Ready** (Preview) |
| Staging Supabase ref | `jzlegcbotqfzevtczwhx` |
| Production ref | Not used (`aehuszoadgqtbkxsliyy`) |
| Phase 28G commit | *(this report + scripts — see § Commits)* |

---

## Authenticated test method

| Mechanism | Use |
|-----------|-----|
| **Vercel Deployment Protection** | Left enabled (no global disable) |
| **`npx vercel curl`** | Primary transport; CLI applies project **Protection Bypass for Automation** (secret not logged) |
| **`scripts/lib/vercel-preview-http.mjs`** | Wraps `vercel curl`; long `Authorization` headers via curl `@header-file` (required — `vercel curl` does not support `--config`) |
| **Staging sign-in** | `MDB_MIXTAPE_E2E_EMAIL` / `MDB_MIXTAPE_E2E_PASSWORD` from `tmp-mixtape-approved-e2e/staging-artist-credentials.env` (loaded by `load-mixtape-staging-e2e-credentials.mjs`); only **email hash** logged |
| **Staging DB evidence** | Service role from `.env.staging.local` (local only); play counts and draft toggles on **staging fixture song** only |
| **Roll Call** | **Not used** (`497b9cfd-e752-4060-9528-5134a2ff7f37`) |

**Run:**

```powershell
$env:PHASE28G_PREVIEW_BASE_URL="https://music-data-base-pwa-clean-git-baseline-recovered-p1ex4fyjt.vercel.app"
npm run verify:phase28g-preview
```

---

## Test fixtures (non-sensitive references)

| Fixture | ID prefix | Role |
|---------|-----------|------|
| Staging playback song | `d8f4002a…` | Public streaming test asset (**not** Roll Call) |
| Song owner (DB) | `07fdeef9…` | Owns staging playback fixture |
| Mixtape E2E artist (session) | `f0502a2e…` | Approved staging creator; `email_hash=9898a5e9a5d8` |
| Intruder profile | first non-owner staging profile UUID prefix | Cross-user `ownerUserId` probe |

Temporary draft/ringtone states were applied only to the staging fixture row and **restored** in a `finally` block (no new audio uploads).

---

## Test results (Preview + staging)

| ID | Result | Notes |
|----|--------|-------|
| staging-ref | **PASS** | Staging ref guard |
| preview-url | **PASS** | Target deployment |
| fixture-song | **PASS** | Non–Roll Call public song |
| creator-sign-in | **PASS** | Staging artist session |
| fixture-rebound-creator-owned | **BLOCKED** | E2E artist owns no songs on staging |
| draft-excluded-public-catalog | **PASS** | Draft hidden from guest `GET /api/songs` |
| staging-draft-row-visible-admin | **PASS** | DB draft state during test window |
| creator-owner-draft-access | **BLOCKED** | Session user ≠ fixture owner — owner merge not exercised on Preview |
| cross-user-owner-filter | **PASS** | Authenticated wrong `ownerUserId` does not receive fixture draft |
| guest-cannot-owner-draft-via-query | **PASS** | Guest + `ownerUserId` does not expose draft |
| draft-play-denied | **PASS** | `POST …/play` → not available for non-public |
| ringtone-only-excluded-streaming-catalog | **PASS** | Ringtone-only omitted from public catalog |
| public-streaming-restored-in-catalog | **PASS** | After restore, fixture back in catalog |
| upload-missing-publication-preview | **PASS** | `publicationMode` required on save-metadata |
| upload-invalid-publication-mode | **PASS** | Invalid mode rejected |
| guest-upload-denied | **PASS** | Guest upload denied |
| catalog-search-public-song | **PASS** | Client-parity filter on Preview catalog |
| catalog-search-no-false-positive | **PASS** | Noise query |
| library-saves-load | **PASS** | Authenticated `GET /api/library-saves` |
| library-empty-search | **PASS** | Empty library search |
| library-scoped-search | **PASS** | Scoped pool (empty library) |
| library-excludes-non-saved-catalog | **PASS** | Library pool independent of catalog |
| qualified-play-accepted | **PASS** | Qualified play on Preview |
| play-count-persisted-db | **PASS** | DB increment (e.g. before=6 after=7) |
| duplicate-play-dedup | **PASS** | Same session deduped |
| duplicate-play-no-double-count | **PASS** | Count stable on duplicate |
| failed-event-rejected | **PASS** | `failed_start` rejected |
| throttle-45s-model | **PASS** | Unit model |
| throttle-45s-preview-http | **BLOCKED** | Serverless in-memory throttle not cross-instance |
| rls-draft-not-selectable-anon | **BLOCKED** | Anon direct `select` may differ; **Preview API did not leak** drafts |
| fixture-restored | **PASS** | Staging fixture usage flags restored |

---

## Database evidence (staging only)

- **Draft isolation:** `streaming_enabled=false` on fixture → absent from Preview public catalog; restored to `true` after run.
- **Plays:** Monotonic increment on qualified play via Preview `POST /api/songs/{id}/play` with isolated `X-Forwarded-For` listener key (per-run).
- **Ringtone-only:** `streaming_enabled=false`, `ringtone_enabled=true` → excluded from public catalog; owner API path validated where applicable.

No Production rows, accounts, or roles modified.

---

## Security findings

| Check | Finding |
|-------|---------|
| Preview vs Production Supabase | Preview API payloads reference **staging** storage host |
| Draft leakage | Guest catalog and guest `ownerUserId` queries **do not** include drafts |
| Cross-user owner param | Mismatched authenticated `ownerUserId` **does not** expose another user’s draft |
| Play authorization | Non-public songs **403** on play API |
| Upload authorization | Guest denied; publication mode enforced server-side |
| Dedup / invalid events | Duplicate session and invalid event handled |
| Monetization / Production | No promote; no production env changes |

---

## Code delivered (Phase 28G)

| Path | Purpose |
|------|---------|
| `scripts/lib/vercel-preview-http.mjs` | Shared Preview HTTP via `vercel curl` + header file for JWT |
| `scripts/verify-phase28g-authenticated-preview.mjs` | Acceptance harness |
| `package.json` | `verify:phase28g-preview` script |
| This report | Acceptance record |

---

## Remaining blockers

1. **Fixture-owner Preview session** — Link `07fdeef9…` staging credentials (or assign fixture to mixtape E2E artist) to complete **creator-owner-draft-access** on Preview.
2. **45s throttle on serverless** — Document as model + best-effort Preview; not a merge blocker if product accepts edge in-memory limits.
3. **Listener-dedicated account** — Library tests used creator session with empty library; optional listener fixture for non-empty library search.

---

## Summary

Phase 28G executed **authenticated and guest** acceptance against the **live Preview** deployment using **`vercel curl`** (deployment protection intact), staging sign-in for the approved mixtape artist, and controlled staging DB toggles on the existing playback fixture. **Playback persistence, deduplication, publication enforcement, catalog search, library API boundaries, and draft isolation** pass on Preview. Verdict **CONDITIONAL** pending fixture-owner session for the final owner-draft merge check and acknowledged serverless throttle limits.

**Not performed:** Production deployment, promotion, monetization activation, or Production data changes.