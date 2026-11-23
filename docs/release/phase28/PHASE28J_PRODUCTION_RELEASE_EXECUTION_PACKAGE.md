# Phase 28J — Production Release Execution Package

**Report time:** 2026-11-23  
**Branch:** `release/pwa-microsoft-store` (tip `4801f4b`)  
**Production Supabase:** `aehuszoadgqtbkxsliyy`  
**Staging Supabase:** `jzlegcbotqfzevtczwhx` (migration **applied**, acceptance **PASS**)  
**Required migration:** `supabase/migrations/202611231200_song_qualified_play_durable.sql`  
**Minimum application commit (durable play + publication/RLS-aligned API):** `ee67536`  
**Harness / docs commits (no additional runtime vs `ee67536` for play):** `10008ff`, `accb4e8`, `4801f4b`  
**Validated Preview (application artifact):** `dpl_2k5yujaKtTZ2dzZCcNzjo9UFmdxL` / `ee67536`  
**Roll Call (do not mutate in this release):** `497b9cfd-e752-4060-9528-5134a2ff7f37`  

**Phase 28J boundary:** preparation only — **no** Production migration, deploy, env change, or Roll Call modification was performed.

---

## Final verdict: **READY FOR CONTROLLED PRODUCTION RELEASE** (CONDITIONAL)

| Condition | Detail |
|-----------|--------|
| **C1** | Operator runs migration inside an explicit **`BEGIN` … `COMMIT`** transaction (file has no built-in transaction). |
| **C2** | **PITR enabled** verified before cutover (`pitr_enabled: true` on 2026-11-23 read). |
| **C3** | Deploy Production application **`ee67536` or later** on the same release train **as or immediately after** successful migration (avoid sustained `database_error` 500s on play). |
| **C4** | Roll Call play smoke only via **separate authorized** procedure — not throttle floods or fixture scripts. |
| **C5** | Owner sign-off on removal of `public_catalog_read` (`using (true)`) — required for draft privacy; see policy impact §3. |

---

## 1. Migration and runbook audit

### 1.1 References

| Artifact | Path |
|----------|------|
| Migration SQL | `supabase/migrations/202611231200_song_qualified_play_durable.sql` |
| Phase 28I readiness | `docs/release/phase28/PHASE28I_PRODUCTION_MIGRATION_READINESS.md` |
| Preflight (read-only) | `docs/release/phase28/PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql` |
| Postflight (read-only) | `docs/release/phase28/PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql` |
| Staging apply helper (staging guard only) | `scripts/apply-phase28h-staging-migration.mjs` |

### 1.2 Objects created (additive)

| Object | Notes |
|--------|--------|
| `public.song_play_qualified_events` | PK `id`, UNIQUE `(song_id, listener_key, playback_session_id)`, FK → `songs` **ON DELETE CASCADE** |
| Index `song_play_qualified_events_song_qualified_idx` | `(song_id, qualified_at desc)` |
| `public.song_play_listener_throttle` | PK `(song_id, listener_key)`, FK → `songs` **ON DELETE CASCADE** |
| `public.song_play_min_interval_seconds()` | Returns **45**; **IMMUTABLE** SQL; granted **service_role** only |
| `public.record_song_qualified_play(uuid, text, uuid)` | Returns **jsonb**; **SECURITY DEFINER**; **`SET search_path = public`** |

### 1.3 RPC behavior (verified from SQL + staging)

| Step | Behavior |
|------|----------|
| Input validation | Null/blank → `reason: invalid_input` |
| Song lock | `SELECT … FOR UPDATE` on `songs` |
| Playability | Public: `streaming_enabled = true` and not ringtone-only (`ringtone_enabled` true with streaming not true). Owner: listener_key `user:{uuid}` matches `user_id` or `producer_id` |
| Throttle | Per `(song_id, listener_key)` 45s window; returns `duplicate: true, reason: throttled` |
| Session dedup | Unique constraint on qualified events; `duplicate_session` without increment |
| Accept | Increment `songs.plays`, upsert throttle, `accepted: true` |
| Errors | `exception when others` → `database_error` (no throw to client) |

**Security:** RPC and play tables are **not** executable/readable by `anon` / `authenticated`. Server routes use **service_role** client only.

### 1.4 `songs` SELECT policy replacement

| Action | Detail |
|--------|--------|
| **Dropped** | `Music Data Base public read songs table`, `public_catalog_read`, prior 28H policy names (idempotent `drop if exists`) |
| **Created** | Anon: `streaming_enabled = true`. Authenticated: streaming **or** `user_id` / `producer_id` = `auth.uid()` |
| **Unchanged** | `owners_insert`, `owners_update`, `owners_delete`, `platform_admin_full_access` (`is_platform_admin()`) |

### 1.5 Idempotency and transactions

| Topic | Assessment |
|-------|------------|
| Re-run safety | `create table if not exists`, `drop policy if exists`, `create or replace function` → largely re-runnable |
| **Critical risk** | Policy **drops** occur **before** new policies are created. **Partial run without `ROLLBACK` can remove anon SELECT access.** |
| Staging evidence | Applied successfully via transactional apply script |
| Data mutation | **None** on existing `songs` rows |

### 1.6 Rollback / recovery

| Strategy | When |
|----------|------|
| **Forward-fix** | Preferred — fix failed DDL and re-run in transaction |
| **Policy restore** | Emergency only — restore `public_catalog_read` **re-opens draft leakage** via direct client reads |
| **Drop play objects** | Only if reverting application to pre-28H **and** accepting loss of durable dedup |
| **PITR** | Last resort — owner-approved; project `aehuszoadgqtbkxsliyy`, **PITR enabled** |

---

## 2. Production application compatibility (`ee67536`)

### 2.1 Files in scope (commit `ee67536`)

| File | Role |
|------|------|
| `lib/song-play-server.ts` | Durable-first play pipeline |
| `lib/song-play-persistence.ts` | RPC wrapper + `isMissingSongPlayRpcError` |
| `app/api/songs/[id]/play/route.ts` | Unchanged route surface; uses `recordSongPlay` |
| `app/api/songs/route.ts` | Already filters public catalog with `streaming_enabled = true` + owner merge |
| `lib/song-usage-permissions.ts` | `songAllowsStreaming` / publication modes (pre-28H; unchanged in `ee67536`) |

**No** billing, Stripe, checkout, subscription, or payout files in `ee67536`.

### 2.2 Play API path after migration

```
recordSongPlay → recordDurableSongQualifiedPlay (RPC)
  ├─ error + missingRpc → recordSongPlayLegacyInMemory (in-memory 45s only)
  ├─ error (RPC exists, other failure) → HTTP 500 (no legacy fallback)
  └─ success → map accepted / duplicate / not_playable to HTTP
```

| Scenario | Result |
|----------|--------|
| RPC **present**, healthy | **Durable** dedup/throttle only — **no** in-memory fallback |
| RPC **missing** (pre-migration deploy) | Legacy in-memory + direct `plays` update |
| RPC returns `database_error` | **500** — operator must fix DB, not silently degrade |
| Guest public song | `anon:{ip-hash}` listener key server-side |
| Authenticated | `user:{auth.uid()}` |
| Owner draft play | RPC `v_is_owner` + API owner merge on catalog |

### 2.3 Required deploy commit

| Deploy target | Minimum commit | Recommended |
|---------------|----------------|-------------|
| **Production Vercel** | `ee67536` | `4801f4b` (same application code as `ee67536` for play; includes Phase 28I/J runbooks) |
| **Do not deploy** | Commits with unrelated local WIP (album/billing dirty tree) unless explicitly scoped elsewhere |

### 2.4 Roll Call compatibility (read-only Production, 2026-11-23)

| Field | Value |
|-------|-------|
| `id` | `497b9cfd-e752-4060-9528-5134a2ff7f37` |
| `streaming_enabled` | **true** |
| `ringtone_enabled` | **false** |
| `plays` | **0** |
| Post-migration anon RLS | **Visible** (streaming true) |
| Post-migration RPC `v_public_ok` | **true** |

### 2.5 Search and publication

| Area | Compatibility |
|------|----------------|
| Global catalog search | API still serves `streaming_enabled = true` rows — Roll Call remains eligible |
| Library scope | Unchanged in `ee67536` |
| Upload publication modes | `public_streaming` / `draft` / `ringtone_only` unchanged; new drafts on Production will **not** leak via anon RLS after migration (improvement vs `public_catalog_read`) |
| Ringtone-only | Excluded from public API catalog; RPC denies public play; owner/admin paths unchanged |

### 2.6 Billing lock

Phase 28H/28I/J did **not** enable payments. Production deploy of `ee67536` does **not** include `lib/billing/payment-provider.ts` changes (that file is dirty locally only).

---

## 3. Policy impact assessment (read-only Production)

### 3.1 Current Production (`songs` RLS enabled)

| policyname | cmd | roles | `USING` |
|------------|-----|-------|---------|
| `public_catalog_read` | SELECT | anon, authenticated | **`true`** |
| `owners_*` | INSERT/UPDATE/DELETE | authenticated | (owner checks) |
| `platform_admin_full_access` | ALL | authenticated | `is_platform_admin()` |

### 3.2 After migration

| Audience | SELECT rule |
|----------|-------------|
| **anon** | `streaming_enabled = true` only |
| **authenticated (non-admin)** | Streaming catalog **or** own `user_id` / `producer_id` |
| **platform admin** | Unchanged `is_platform_admin()` ALL |

### 3.3 Visibility matrix

| Record type | Guest direct Supabase | Guest `/api/songs` | Owner draft |
|-------------|----------------------|---------------------|-------------|
| Roll Call (streaming) | **Yes** | **Yes** | N/A |
| Future draft (`streaming_enabled=false`) | **No** (was **Yes** via `true`) | **No** (API filter) | **Yes** (owner merge + auth policy) |
| Ringtone-only | **No** | **No** | **Yes** (owner) |
| Another creator’s draft | **No** | **No** | **No** |

### 3.4 Production data today

| Metric | Value |
|--------|-------|
| `total_songs` | **1** |
| `streaming_songs` | **1** |
| `non_streaming_songs` | **0** |

**No legitimate Production row is hidden** by the new anon policy at cutover. Future non-public uploads gain correct RLS.

---

## 4. Ordered execution checklist

**Operator:** execute in order. **Stop** on any failed **Expected result**. Do not continue to promotion.

### A. Backup / PITR confirmation

```bash
npx supabase backups list --remote=aehuszoadgqtbkxsliyy --output-format json
```

| Expected | `target.project_ref` = `aehuszoadgqtbkxsliyy`, `pitr_enabled: true`, `walg_enabled: true` |
|----------|---|
| **Stop if** | Wrong project ref, PITR off, or operator cannot restore within policy |

### B. Production preflight

```bash
cd <repo-root>
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy -f docs/release/phase28/PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql
```

| Expected | Play tables **false**, RPC **false**, `public_catalog_read` **present**, `streaming_songs=1` |
|----------|---|
| **Stop if** | Objects already partially present without documentation (investigate drift) |

### C. Migration execution

**File:** `supabase/migrations/202611231200_song_qualified_play_durable.sql`

**SQL Editor (recommended):**

```sql
begin;
-- paste entire contents of 202611231200_song_qualified_play_durable.sql
commit;
```

**Alternative:** one-shot direct connection with **URL contains `aehuszoadgqtbkxsliyy`** only (mirror `scripts/apply-phase28h-staging-migration.mjs` with Production guards). **Never** log or commit Production `DATABASE_URL`.

| Expected | `COMMIT` succeeds, no error in editor/CLI |
|----------|---|
| **Stop if** | Any error — `rollback;`, open incident, **do not** deploy app |

### D. Immediate database verification

```bash
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy -f docs/release/phase28/PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql
```

| Expected | Tables + RPC **true**; `public_catalog_read_still_present` **false**; new policy names **present**; Roll Call row **streaming_enabled true** |
|----------|---|
| **Stop if** | Missing policies, `public_catalog_read` still true, or zero songs when expecting Roll Call |

**Service role probe (SQL editor, optional):**

```sql
select public.record_song_qualified_play(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'anon:postflight-probe',
  gen_random_uuid()
);
-- expect reason = not_found
```

### E. Production application deployment

| Step | Action |
|------|--------|
| 1 | Promote/deploy Vercel **Production** from `release/pwa-microsoft-store` at **`ee67536` or `4801f4b`** |
| 2 | Confirm build **Ready**; Production env still **`aehuszoadgqtbkxsliyy`** (dashboard read-only) |
| 3 | **Do not** change env vars in this procedure unless play RPC 500 indicates missing service key |

| Expected | Production deployment Ready; site serves new bundle |
|----------|---|
| **Stop if** | Build Error, wrong Supabase ref, or accidental staging promote |

### F. Playback smoke (guest + authenticated)

**Roll Call only; single qualified play; no load test.**

| Step | Method | Expected |
|------|--------|----------|
| F1 | `GET https://www.digitalmusicdatabase.com/api/songs` | JSON includes Roll Call `497b9cfd…` |
| F2 | `POST /api/songs/{id}/play` with valid `playbackSessionId` (UUID) + `event: qualified_start` | `200`, `ok: true`, `plays` ≥ 1 |
| F3 | Repeat same `playbackSessionId` | `200`, `duplicate: true`, `reason: duplicate_session` or `throttled`, plays **unchanged** |
| F4 | DB read-only: `select plays from songs where id = '497b9cfd-e752-4060-9528-5134a2ff7f37'` | Matches API `plays` |

| **Stop if** | 500 on play after migration+deploy, plays double on single session, or Roll Call missing from catalog |

**Not in this release:** automated throttle flood, staging fixture scripts, or play-count “correction” on Roll Call outside F2–F4.

### G. Search and publication smoke

| Step | Expected |
|------|----------|
| G1 | Global search on www finds “Roll Call” (or known title) |
| G2 | Creator upload path still rejects missing `publicationMode` (if tested in window) |
| G3 | No draft rows appear in guest catalog |

| **Stop if** | Guest sees non-streaming song in catalog |

### H. Security and payment-lock verification

| Check | Expected |
|-------|----------|
| Anon direct read of non-streaming song (dashboard SQL as anon) | **0 rows** |
| `song_play_qualified_events` insert as anon | **Denied** |
| Checkout / Stripe routes | **Unchanged / not activated** (no new env) |

### I. Rollback and incident response

| Symptom | Action |
|---------|--------|
| Migration failed mid-transaction | `rollback`; remain on old app |
| Anon cannot see Roll Call after migrate | Verify policies + `streaming_enabled`; forward-fix SQL |
| Play 500 after deploy | Verify RPC + service_role; check logs for `database_error` |
| Need full revert | Owner-approved PITR or policy restore script (document leakage risk) |

**Incident owner:** halt Production promote, preserve logs, do **not** re-enable `public_catalog_read` without security review.

---

## 5. Staging vs Production delta (why not “staging pass ⇒ automatic prod pass”)

| Risk | Staging | Production mitigation |
|------|---------|------------------------|
| Permissive RLS history | Fixed on staging | Production still has `using (true)` until migrate |
| Song cardinality | Many test rows | **Single** Roll Call row — low blast radius but **high visibility** |
| Policy drop window | Controlled apply script | **Mandatory transaction** on Production |
| App version skew | Preview at `ee67536` | Prod may lag; migration-only is safe for **current** prod app |
| Play persistence | Fully exercised on staging | Prod needs **F2–F4** after deploy |

---

## 6. Release boundaries (Phase 28J)

| Rule | Status |
|------|--------|
| Production migration applied | **No** |
| Production deploy / promote | **No** |
| Production env / data change | **No** |
| Roll Call metadata / artwork / audio | **No** |
| Roll Call play count except authorized F2 smoke | **No** |
| Monetization activation | **No** |
| Unrelated Git WIP | **Preserved** |

---

## 7. Remaining release blockers (execution-time)

1. Owner-approved maintenance window and **transactional** migration execution.  
2. Production **deploy** of `ee67536+` coordinated with migration.  
3. **F2–F4** Roll Call smoke documented in release log.  
4. Communication that **direct Supabase clients** lose all-songs read — intentional security hardening.

---

## 8. Artifact index (Phase 28J)

| File | Purpose |
|------|---------|
| `PHASE28J_PRODUCTION_RELEASE_EXECUTION_PACKAGE.md` | This package |
| `PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql` | Post-migration read-only checks |
| `PHASE28I_PRODUCTION_MIGRATION_READINESS.md` | Phase 28I runbook |
| `PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql` | Pre-migration checks |

**Git (Phase 28J):** commit containing this package (see `git log` after push).

---

## Summary

Phase 28J validates migration DDL, RPC security, and `songs` policy replacement; confirms `ee67536` play semantics (**durable when RPC exists**, **no legacy fallback on RPC errors**); and maps Production’s single Roll Call row to post-migration visibility. **PITR is enabled.** The release is **ready for a controlled Production cutover** when an operator executes §4 with transaction discipline and coordinated application deploy—without using staging fixtures or monetization changes on Production.