# Phase 28I — Scoped Harness Commit and Production Migration Readiness

**Report time:** 2026-11-23  
**Branch:** `release/pwa-microsoft-store`  
**Baseline application commit:** `ee67536` (Phase 28H — durable play, songs RLS, staging fixtures)  
**Validated Preview:** `dpl_2k5yujaKtTZ2dzZCcNzjo9UFmdxL` → `https://music-data-base-pwa-clean-git-baseline-recovered-qt17l4if3.vercel.app`  
**Staging Supabase:** `jzlegcbotqfzevtczwhx` (Phase 28H migration **applied**)  
**Production Supabase:** `aehuszoadgqtbkxsliyy` (**not** modified in Phase 28I)

---

## Final verdict: **CONDITIONAL** → **READY FOR PRODUCTION MIGRATION**

The migration is **additive** (new tables, RPC, policy replacement on `songs`) and **read-only verified** on Production prerequisites. Apply the **database migration before or together with** deploying application code that depends on `record_song_qualified_play` (deploying app first is still safe: API falls back to legacy in-memory path only when the RPC is **missing**, not on RPC runtime errors).

**Remaining release blockers (not migration):** Production **application** promote/deploy of Phase 28H+ code; post-migration production smoke on qualified play persistence (Roll Call remains the canonical production song — do **not** use it for throttle abuse tests).

---

## 1. Scoped harness commit (Phase 28H completion)

| Item | Detail |
|------|--------|
| **Harness commit** | `10008ff` |
| **Parent** | `ee67536` |
| **Pushed** | `origin/release/pwa-microsoft-store` *(after Phase 28I doc commit — confirm with `git status`)* |

### Files committed (harness scope only)

| File | Purpose |
|------|---------|
| `scripts/verify-phase28g-authenticated-preview.mjs` | Dedicated E2E draft row; catalog keyword; throttle row cleanup; ringtone restore |
| `scripts/verify-phase28h-song-play-durable.mjs` | Side-effect-free RPC probe; isolated listener IP; throttle cleanup |
| `docs/release/phase28/PHASE28H_FINAL_PREVIEW_GAP_CLOSURE.md` | Final Preview URL, deployment ID, 37/37 acceptance |

**Uncommitted unrelated work:** preserved (album routes, billing WIP, phase9–29 docs, etc.).

### Test results (pre-push)

| Command | Result |
|---------|--------|
| `npm run verify:phase28` | **PASS** |
| `npm run verify:search` | **PASS** |
| `npm run verify:phase28h` | **PASS** |
| `npm run verify:phase28g-preview` (`qt17l4if3`, Deployment Protection) | **PASS** — 37 PASS, 0 FAIL, 0 BLOCKED |

---

## 2. Migration summary

**Filename:** `supabase/migrations/202611231200_song_qualified_play_durable.sql`

| Change class | Detail |
|--------------|--------|
| **Tables (new)** | `song_play_qualified_events` (session idempotency), `song_play_listener_throttle` (45s window) |
| **Indexes** | `song_play_qualified_events_song_qualified_idx` |
| **Functions** | `song_play_min_interval_seconds()` → `45`; `record_song_qualified_play(uuid, text, uuid)` **security definer** |
| **Grants** | Play tables: REVOKE from `anon`, `authenticated`, `public`. RPC: **service_role execute only** |
| **RLS** | Enable RLS on new tables (no client policies). **`songs` SELECT:** drop `public_catalog_read` and permissive public read; anon = `streaming_enabled = true`; authenticated = streaming **or** own `user_id` / `producer_id` |
| **Data mutation** | **None** on existing rows (DDL + policy only) |
| **Write path in prod app today** | Production site uses client play increments for music (Phase 27 audit); migration does not break reads of the single public Roll Call row |

### Staging evidence

| Check | Result |
|-------|--------|
| `scripts/apply-phase28h-staging-migration.mjs` | Applied (staging `DATABASE_URL` only) |
| RPC `record_song_qualified_play` | **Present** on staging |
| `verify:phase28h` + `verify-phase28g-preview` | **PASS** on staging + Preview |

---

## 3. Production schema comparison (read-only, 2026-11-23)

Executed via `npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy` (no credentials logged).

| Object | Production present? |
|--------|-------------------|
| `song_play_qualified_events` | **false** |
| `song_play_listener_throttle` | **false** |
| `record_song_qualified_play` | **false** |

### Production `songs` policies (current)

| policyname | roles | cmd |
|------------|-------|-----|
| `public_catalog_read` | anon, authenticated | SELECT |
| `owners_insert` | authenticated | INSERT |
| `owners_update` | authenticated | UPDATE |
| `owners_delete` | authenticated | DELETE |
| `platform_admin_full_access` | authenticated | ALL |

**Gap vs staging (post-28H):** Production still has **`public_catalog_read`** (`using (true)` class policy). Migration replaces anon/authenticated **SELECT** with streaming-only rules. With **current** Production data (`streaming_songs: 1`, `non_streaming_songs: 0`, `total_songs: 1`), anon catalog visibility for Roll Call remains correct **after** migration.

### Backward compatibility (deployed Production app vs migration-first)

| Order | Effect |
|-------|--------|
| **Migration only** (app not updated) | Stricter `songs` RLS; no client access to play tables; play RPC unused until app ships. Roll Call still selectable by anon. |
| **App only** (RPC missing) | `lib/song-play-server.ts` uses **legacy in-memory** dedup + direct `plays` update (`missingRpc` path). |
| **Migration + app** | Durable cross-instance dedup/throttle; failed RPC → **500** (no silent legacy on error). |

**Important:** After app deploy **with** durable code, Production **must** have the RPC or rely on explicit `missingRpc` fallback. Do not leave migration failed/partial.

---

## 4. Operational impact and locking

| Topic | Assessment |
|-------|----------------|
| **Duration** | Single transactional migration (staging apply: seconds). |
| **Locks** | `create table if not exists` + `create or replace function` + policy DDL — brief `songs` policy catalog update; RPC first call uses `for update` on `songs` row (runtime, not migration). |
| **Downtime** | None expected for read-only catalog; play endpoint may briefly error if migrated mid-traffic before RPC exists (only if new app already live). |
| **Rollback** | See §6 — forward-fix preferred; policy restore script required for full revert. |

---

## 5. Production migration runbook

### 5.1 Preconditions

- [ ] Operator confirms dashboard project ref **`aehuszoadgqtbkxsliyy`** (Music Data Base).
- [ ] Confirm **PITR / backups** current (`npx supabase backups list --remote=aehuszoadgqtbkxsliyy`).
- [ ] Staging migration already **PASS** (`verify:phase28h`).
- [ ] Maintenance window (optional) — low traffic; no simultaneous Production schema changes.
- [ ] **Do not** run against `jzlegcbotqfzevtczwhx` from Production runbook.
- [ ] **Do not** modify Roll Call row or play counts during cutover testing.

### 5.2 Pre-migration read-only checks

```bash
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy -f docs/release/phase28/PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql
```

Expect: play tables **absent**, `public_catalog_read` **present**, song counts as baseline.

### 5.3 Apply migration (Production only)

**File:** `supabase/migrations/202611231200_song_qualified_play_durable.sql`

**Methods (choose one):**

1. Supabase SQL Editor — paste file; run as single transaction (file has no explicit `begin` — wrap manually if desired).
2. Operator CLI with Production **session pooler / direct** URL — same pattern as `scripts/apply-phase28h-staging-migration.mjs` but **guard** URL must contain `aehuszoadgqtbkxsliyy` and **must not** use staging refs. **Do not commit Production `DATABASE_URL`.**

**Purpose:** durable qualified-play persistence + harden draft leakage via `songs` RLS.

### 5.4 Post-migration verification SQL

```sql
-- Objects exist
select to_regclass('public.song_play_qualified_events') is not null as events_tbl,
       to_regclass('public.song_play_listener_throttle') is not null as throttle_tbl,
       to_regproc('public.record_song_qualified_play(uuid,text,uuid)') is not null as rpc;

-- Policies: public_catalog_read must be gone; streaming policy present
select policyname, roles, cmd
from pg_policies
where schemaname = 'public' and tablename = 'songs'
order by policyname;

-- RPC probe (service_role in SQL editor only — expect reason not_found for fake id)
select public.record_song_qualified_play(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'anon:postflight',
  gen_random_uuid()
);
```

**Anon RLS spot check (Dashboard SQL as anon simulation or app):**

- `select id from songs where streaming_enabled = false` as **anon** → **0 rows** (or permission denied).
- `select id from songs where id = '497b9cfd-e752-4060-9528-5134a2ff7f37'` as **anon** → **1 row** (Roll Call).

### 5.5 Application compatibility after migration

| Requirement | Detail |
|-------------|--------|
| Server env | Production Vercel already uses `aehuszoadgqtbkxsliyy` + service role for API routes |
| Code version | Deploy `ee67536` or later (`lib/song-play-persistence.ts`, `lib/song-play-server.ts`) when enabling durable play in Production |
| Client | No change required for migration-only apply |
| Billing / Stripe | Unaffected — no billing tables in migration |

### 5.6 Failure handling

| Failure | Action |
|---------|--------|
| Migration DDL error mid-file | Transaction rollback; fix SQL; retry. Do not deploy app depending on RPC. |
| RPC exists but play API 500 | Check service_role key on Vercel; inspect RPC `database_error` in logs; **do not** disable RLS on play tables. |
| Anon cannot see Roll Call | Verify `streaming_enabled = true` on Roll Call; verify new anon policy applied. |
| Owners cannot see drafts | Verify authenticated policy includes `user_id = auth.uid()` |

### 5.7 Rollback / recovery

**Preferred:** forward-fix in a new migration.

**Full rollback (manual, high care):**

1. Restore policies from backup or re-`create policy public_catalog_read … using (true)` **only** if business accepts draft leakage risk.
2. `drop function record_song_qualified_play` + drop throttle/event tables if removing durable play.
3. PITR restore **only** with owner approval — last resort.

Keep play tables if Production app with `ee67536+` already live (otherwise app returns 500 on RPC calls).

---

## 6. Recommended execution order (release)

1. **Merge / tag** `release/pwa-microsoft-store` with `ee67536` + harness commit + Phase 28I docs (when approved).
2. **Production DB:** backups verified → apply `202611231200_song_qualified_play_durable.sql` → postflight SQL.
3. **Production app:** deploy durable play code (after or with step 2).
4. **Smoke:** guest `GET /api/songs` includes Roll Call; one qualified play via API (low volume); confirm `songs.plays` increment once; duplicate session returns `duplicate: true`.
5. **Do not** run staging fixture provision or throttle stress against Roll Call.

---

## 7. Release isolation (Phase 28I)

| Boundary | Status |
|----------|--------|
| Preview `qt17l4if3` | **Ready** (still on `ee67536` until next push build) |
| Staging migration | **Applied** (RPC present) |
| Production DB | **Not modified** in Phase 28I |
| Production deploy / promote | **Not performed** |
| Roll Call (`497b9cfd…`) | **Unchanged** |
| Billing / checkout / payouts | **Not activated** in this phase |

---

## 8. Remaining release blockers

1. **Owner-approved Production migration window** and backup/PITR confirmation.
2. **Production application deploy** of Phase 28H play pipeline after migration.
3. **Production play-count smoke** (server persistence vs legacy client increment) — separate from staging acceptance.
4. Preview rebuild after harness push (optional for docs/scripts-only commit — no runtime change).

---

## Summary

Phase 28I finalized Phase 28H harness commits, re-ran full verification against protected Preview `qt17l4if3`, and completed a read-only Production gap analysis. Production lacks durable play objects and still carries permissive `public_catalog_read` on `songs`; the staging-validated migration closes that gap without mutating existing song rows. **Apply migration to Production when approved; then deploy matching application code.**