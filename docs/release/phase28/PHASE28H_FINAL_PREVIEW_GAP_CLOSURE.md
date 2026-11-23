# Phase 28H — Final Preview Gap Closure Report

**Report time:** 2026-11-23 (local)  
**Branch:** `release/pwa-microsoft-store`  
**Prior commit:** `5439006` (Phase 28G)  
**Staging Supabase:** `jzlegcbotqfzevtczwhx` (migration applied **staging only**)  
**Preview URL (Ready, Phase 28H):** `https://music-data-base-pwa-clean-git-baseline-recovered-qt17l4if3.vercel.app`  
**Deployment ID:** `dpl_2k5yujaKtTZ2dzZCcNzjo9UFmdxL`  
**Prior Preview (28G):** `https://music-data-base-pwa-clean-git-baseline-recovered-p1ex4fyjt.vercel.app`

---

## Final verdict: **CONDITIONAL** → **READY FOR PRODUCTION REVIEW** (staging gaps closed)

After Phase 28H code + **staging-only** migration and fixture provisioning, the four Phase 28G blockers are **closed** on staging with automated verification. Production remains untouched (no production migration, no promote).

**CONDITIONAL note:** Staging migration `202611231200_song_qualified_play_durable.sql` must be applied to **production** through your normal release process before production inherits durable play dedup/throttle and hardened songs RLS.

---

## 1. Owner-draft verification (gap closed)

| Check | Result |
|-------|--------|
| Dedicated E2E artist fixtures (`f0502a2e…`) without reassigning `07fdeef9…` playback row | **PASS** (`provision-phase28-staging-fixtures.mjs`) |
| Owner retrieves own draft (`b9d52a23…`) via `ownerUserId` merge on Preview | **PASS** (28G harness + E2E session) |
| Owner qualified play on own draft | **PASS** |
| Another creator cannot read peer draft (direct Supabase + API) | **PASS** |
| Guest / anon catalog excludes draft | **PASS** |
| Draft absent from public catalog search | **PASS** |
| Owner draft survives re-login session | **PASS** |
| Original staging playback fixture owner (`07fdeef9…`) | Unchanged (no ownership reassignment) |

**Method:** Mixtape staging E2E credentials + `vercel curl` Preview transport; draft/public rows owned by `PHASE28_E2E_ARTIST_ID`.

---

## 2. Durable 45s throttle / dedup (gap closed)

### Architecture

| Layer | Mechanism |
|-------|-----------|
| **Tables** | `song_play_qualified_events` (session dedup), `song_play_listener_throttle` (45s window) |
| **RPC** | `record_song_qualified_play(song_id, listener_key, playback_session_id)` — **service_role only** |
| **API** | `lib/song-play-server.ts` → `recordDurableSongQualifiedPlay()`; legacy in-memory only if RPC absent (local dev) |
| **Client** | Untrusted; listener key derived server-side (`user:{id}` or `anon:{ip-hash}`) |

### Concurrency / Preview tests

| Test | Result |
|------|--------|
| `verify-phase28h-song-play-durable.mjs` — concurrent duplicate session (3 parallel) | **PASS** (single play increment) |
| Authenticated 45s throttle on Preview | **PASS** |
| New listener key after throttle window / alternate IP | **PASS** |
| Failed `failed_start` event | **PASS** (28G harness) |

**Staging migration:** Applied via `scripts/apply-phase28h-staging-migration.mjs` (staging `DATABASE_URL` only).

---

## 3. Direct Supabase RLS (gap closed)

| Policy change | Detail |
|---------------|--------|
| Dropped | `public_catalog_read` (`using (true)`) on `songs` |
| Added | Anon `streaming_enabled = true` only |
| Added | Authenticated streaming **or** own `user_id` / `producer_id` |
| Play tables | RLS enabled; **no** grants to `anon` / `authenticated` |

| Test (`verify-phase28h-songs-rls.mjs`) | Result |
|----------------------------------------|--------|
| Anon cannot `select` private draft | **PASS** |
| Anon can read public streaming song | **PASS** |
| Anon cannot `insert` play events | **PASS** |
| Owner reads own draft | **PASS** |
| Creator cannot read another owner’s draft | **PASS** |

---

## 4. Non-empty Library (gap closed)

| Check | Result |
|-------|--------|
| `library_saves` rows for E2E artist (public catalog + owned public) | **PASS** (provision script) |
| Library search scoped to personal saves (“Phase28 E2E”) | **PASS** |
| Global catalog search | **PASS** (28G harness) |
| Draft not in another user’s library / catalog | **PASS** |

---

## 5. Full regression summary

| Command | Result |
|---------|--------|
| `npm run verify:phase28` | **PASS** |
| `npm run verify:search` | **PASS** |
| `npm run verify:phase28h` (provision + RLS + durable play) | **PASS** |
| `node scripts/run-staging-preview-build.mjs` | **PASS** |
| `npm run verify:phase28g-preview` (against `qt17l4if3`) | **PASS** — 37 PASS, 0 FAIL, 0 BLOCKED |

---

## 6. Files changed (Phase 28H)

| Path | Purpose |
|------|---------|
| `supabase/migrations/202611231200_song_qualified_play_durable.sql` | Durable play + songs RLS hardening |
| `lib/song-play-persistence.ts` | RPC client wrapper |
| `lib/song-play-server.ts` | Durable play path |
| `scripts/apply-phase28h-staging-migration.mjs` | Staging-only migration apply |
| `scripts/provision-phase28-staging-fixtures.mjs` | E2E artist draft/public + library saves |
| `scripts/verify-phase28h-songs-rls.mjs` | Direct RLS verification |
| `scripts/verify-phase28h-song-play-durable.mjs` | Durable dedup/throttle + Preview |
| `scripts/verify-phase28g-authenticated-preview.mjs` | Owner draft + library updates |
| `scripts/run-staging-preview-build.mjs` | Local preview build helper |
| `package.json` | `verify:phase28h` |

**Commit:** `ee67536` (Phase 28H application + migration + core verifiers)  
**Harness hardening (Phase 28I scoped commit, after `ee67536`):** E2E dedicated draft row in 28G acceptance; play-throttle isolation; durable RPC probe without side effects — keeps re-runs deterministic on staging.

---

## 7. Security / release boundaries

| Rule | Status |
|------|--------|
| Staging only for migration apply + fixtures | **PASS** |
| Production Supabase / Vercel Production | **Not modified** |
| Roll Call play tests | **Not used** |
| Monetization / Stripe | **Not enabled** |
| Vercel Deployment Protection | **Remains enabled** |

---

## 8. Remaining risks

1. **Production migration pending** — Durable play RPC + RLS policy change must ship to production before prod API relies on DB dedup (API fails safe with 500 if RPC errors; legacy fallback only when RPC **missing**).
2. **Fixture maintenance** — E2E song rows are staging test assets; keep out of production promotion checklists.
3. **Acceptance harness** — Run `verify:phase28h` before `verify:phase28g-preview` when validating durable play (shared staging song); scripts now clear throttle rows before HTTP play checks.

---

## Summary

Phase 28H closed all four Phase 28G gaps: **owner-draft acceptance** via dedicated E2E-owned staging fixtures, **durable cross-instance play dedup/throttle**, **direct RLS** for drafts and play tables, and **non-empty Library** search. Staging verification is green; production await migration + release review.

**Final verdict: READY FOR PRODUCTION REVIEW** (with explicit **production migration** gate above).