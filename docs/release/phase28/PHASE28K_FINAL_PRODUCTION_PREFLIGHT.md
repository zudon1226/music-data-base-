# Phase 28K — Final Production Release Preflight

**Report time:** 2026-11-23  
**Branch:** `release/pwa-microsoft-store`  
**Remote tip:** `69b86d8` (synced with `origin`)  
**Phase 28J package:** `69b86d8`  
**Migration file:** `supabase/migrations/202611231200_song_qualified_play_durable.sql`  
**Production Supabase:** `aehuszoadgqtbkxsliyy`  
**Roll Call (read-only baseline):** `497b9cfd-e752-4060-9528-5134a2ff7f37`  

**Phase 28K boundary:** **read-only** — no migration, deploy, env, data, or Roll Call changes performed.

---

## Final verdict: **READY FOR CONTROLLED RELEASE** (CONDITIONAL)

| ID | Condition (carry forward from Phase 28J) |
|----|------------------------------------------|
| **K1** | Migration executed only inside explicit `BEGIN;` … `COMMIT;` (or `ROLLBACK` on any error). |
| **K2** | `pitr_enabled: true` reconfirmed immediately before cutover (verified 2026-11-23). |
| **K3** | Production app promote at **`ee67536` minimum** (or `69b86d8` tip — **no runtime delta** vs `ee67536` in `app/` or `lib/`). |
| **K4** | Operator confirms **Production Vercel** env var **names** (§4) on the **www** project — not enumerable from linked Preview CLI in this workspace. |
| **K5** | Roll Call smoke: **one** authorized qualified play only (§5); no throttle/staging fixtures on Production. |

**NO-GO triggers:** migration objects already partially present; migration run without transaction; wrong Supabase ref; deploy includes local WIP from working tree.

---

## 1. Git and application artifact

### 1.1 Branch / remote (evidence)

| Check | Result |
|-------|--------|
| Branch | `release/pwa-microsoft-store` |
| Tracking | `origin/release/pwa-microsoft-store` (in sync at preflight) |
| Local WIP | **Present** — unrelated modified/untracked files **not** in release commits |

### 1.2 Exact commit hashes

| Commit | Full SHA | Role |
|--------|----------|------|
| **`ee67536`** | `ee675362803ccd0b0f3b42e21a8a90be02bc7812` | **Application + migration runtime** |
| **`10008ff`** | `10008ff284f5f0863a3d6c8c4ccb619a4cfb7079` | Harness/docs only |
| **`accb4e8`** | `accb4e869891a743a010a4087dade8628b5cb485` | Docs + preflight SQL |
| **`4801f4b`** | `4801f4bf50e8628ac88d5ef852f71f5d6737fd6e` | Doc edit only |
| **`69b86d8`** | `69b86d824276b6f0f45bfa2462c5f9d360eb1df9` | Phase 28J execution package |

### 1.3 `ee67536` runtime changes (application release core)

| Path | Change |
|------|--------|
| `lib/song-play-persistence.ts` | **New** — RPC client, `missingRpc` detection |
| `lib/song-play-server.ts` | Durable-first play; legacy only if RPC **missing** |
| `supabase/migrations/202611231200_song_qualified_play_durable.sql` | Migration source (apply on Production separately) |
| `app/api/songs/...` | **Not modified** in `ee67536` (play route already delegates to `recordSongPlay`) |
| `package.json` | `verify:phase28h` script only |
| Scripts / docs under `scripts/`, `docs/release/phase28/` | Staging acceptance / reports |

### 1.4 Commits after `ee67536` (non-runtime)

`git diff ee67536..69b86d8 --name-only` touches **only**:

- `docs/release/phase28/*` (PHASE28H–J)
- `scripts/verify-phase28g-authenticated-preview.mjs`
- `scripts/verify-phase28h-song-play-durable.mjs`

**No** files under `app/` or `lib/` changed after `ee67536`.

### 1.5 WIP exclusion

Release artifact = **`ee67536`** runtime (minimum) or **`69b86d8`** tip. **Do not** deploy from dirty working tree paths including (non-exhaustive): `app/api/albums/*`, `app/api/upload-*`, `lib/billing/payment-provider.ts`, untracked phase9–29 docs, `supabase/migrations/202611221200_video_creator_account_type.sql`.

---

## 2. Production database identity (read-only)

### 2.1 Project ref and backups

**Command:**

```bash
npx supabase backups list --remote=aehuszoadgqtbkxsliyy --output-format json
```

| Field | Evidence (2026-11-23) |
|-------|------------------------|
| `target.project_ref` | **`aehuszoadgqtbkxsliyy`** |
| `target.project_name` | Music Data Base |
| `target.environment` | production |
| `pitr_enabled` | **`true`** |
| `walg_enabled` | **`true`** |
| `region` | us-east-1 |

### 2.2 Migration not applied

**Command:**

```bash
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy --output-format json \
  "select exists (... song_play_qualified_events) as song_play_qualified_events,
          exists (... song_play_listener_throttle) as song_play_listener_throttle,
          exists (... record_song_qualified_play) as record_song_qualified_play;"
```

| Object | Present on Production |
|--------|----------------------|
| `song_play_qualified_events` | **false** |
| `song_play_listener_throttle` | **false** |
| `record_song_qualified_play` | **false** |

**Conclusion:** Migration **`202611231200`** is **not** applied on Production.

### 2.3 Prerequisites / current policies

**Command:**

```bash
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy -f docs/release/phase28/PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql
```

**Policy snapshot (CLI JSON, 2026-11-23):**

| policyname | cmd | roles |
|------------|-----|-------|
| `owners_delete` | DELETE | authenticated |
| `owners_insert` | INSERT | authenticated |
| `owners_update` | UPDATE | authenticated |
| `platform_admin_full_access` | ALL | authenticated |
| `public_catalog_read` | SELECT | anon, authenticated |

`public_catalog_read` **`using (true)`** (verified in Phase 28J).

**Song inventory:**

| non_streaming | streaming | total |
|---------------|-----------|-------|
| **0** | **1** | **1** |

**Roll Call baseline:**

| `id` | `streaming_enabled` | `plays` |
|------|---------------------|---------|
| `497b9cfd-e752-4060-9528-5134a2ff7f37` | **true** | **0** |

### 2.4 Migration checksum (verified against repo @ `69b86d8`)

| Digest | Value |
|--------|--------|
| **SHA-256** | `1118ffd305e9e497daa7682af978eecd025ec98b4eeb3e615f51f1a04ae121c8` |
| **sha12** (staging apply script style) | `1118ffd305e9` |

Operator must confirm the file hash on the release machine before apply:

```powershell
Get-FileHash -Algorithm SHA256 supabase/migrations/202611231200_song_qualified_play_durable.sql
```

---

## 3. Migration execution safety

### 3.1 Atomic execution

| Topic | Finding |
|-------|---------|
| File contains `BEGIN`/`COMMIT` | **No** — operator **must** wrap entire file |
| DDL on failure + rollback | Restores pre-migration policy state |
| DDL without transaction | **Risk:** `public_catalog_read` dropped before new SELECT policies → **anon catalog broken** until fixed |

**Stop condition:** any error → `ROLLBACK;` — do not deploy `ee67536` play path expecting RPC.

### 3.2 Policy replacement safety

| Phase in migration | Risk if interrupted (no transaction) |
|--------------------|--------------------------------------|
| `drop policy … public_catalog_read` | Anon loses permissive SELECT until new policies exist |
| `create policy … anon read streaming` | Restores intended public catalog rule |

With transaction: **failed execution cannot leave Production without a SELECT policy** (all drops rolled back).

### 3.3 RPC grants and RLS (from reviewed SQL)

| Control | Setting |
|---------|---------|
| Play tables RLS | **ENABLED** |
| Play tables client grants | **REVOKE ALL** from anon, authenticated, public |
| Play tables policies | **None** (no client access) |
| `record_song_qualified_play` | **SECURITY DEFINER**, `search_path = public` |
| RPC execute | **service_role** only |

**Migration DDL:** no `UPDATE`/`DELETE` on `songs` rows; no table truncation. Runtime play increment occurs **only inside RPC** after apply.

### 3.4 Postflight SQL vs migration objects

| Postflight check (`PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql`) | Migration creates |
|------------------------------------------------------------------------|-------------------|
| `to_regclass('…song_play_qualified_events')` | `create table … song_play_qualified_events` |
| `to_regclass('…song_play_listener_throttle')` | `create table … song_play_listener_throttle` |
| `to_regproc('…record_song_qualified_play(uuid,text,uuid)')` | `create or replace function …` |
| `public_catalog_read_still_present` → expect **false** | `drop policy … public_catalog_read` |
| Named streaming policies | `Music Data Base anon read streaming songs` + authenticated policy |
| `relrowsecurity` on play tables | `alter table … enable row level security` |
| `event_rows` / `throttle_rows` | Start **0**; after smoke may be **≥1** |
| Roll Call row snapshot | Unchanged metadata; `plays` may increase by **1** after authorized smoke |

**Note:** Postflight queries on play tables **fail pre-migration** (expected). Run only **after** successful `COMMIT`.

---

## 4. Deployment readiness

### 4.1 Target and commit

| Item | Value |
|------|--------|
| **Intended Production site** | `https://www.digitalmusicdatabase.com` (existing Production) |
| **Minimum git commit** | `ee675362803ccd0b0f3b42e21a8a90be02bc7812` |
| **Recommended tip** | `69b86d824276b6f0f45bfa2462c5f9d360eb1df9` (docs only beyond `ee67536`) |
| **Validated Preview artifact (staging)** | `ee67536` / `dpl_2k5yujaKtTZ2dzZCcNzjo9UFmdxL` |

Promote **annotated tag or branch commit**, not uncommitted WIP.

### 4.2 Required environment variable **names** (values not read/logged)

From `lib/supabase-config.ts` / `lib/server-supabase.ts` — Production **must** define at build/runtime:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Must resolve to project **`aehuszoadgqtbkxsliyy`** on Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/API anon client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server routes + **`record_song_qualified_play`** RPC |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (optional fallback exists) |

Preview-only flags (`MDB_PREVIEW_*`, `NEXT_PUBLIC_MDB_PREVIEW_*`) must be **absent or disabled** on Production.

**Unresolved (operator):** `npx vercel env ls production` against the **linked Preview recovery project** returned **no** variables — Production www may use a **different Vercel project**. Confirm names above in the **Production** dashboard before deploy.

### 4.3 Durable RPC behavior after migration + `ee67536`

| Path | Behavior |
|------|----------|
| RPC succeeds | Durable dedup/throttle; **no** in-memory model |
| RPC missing (`missingRpc`) | Legacy in-memory + direct `plays` update |
| RPC error (exists, fails) | **HTTP 500** — **no** silent in-memory fallback |

Source: `lib/song-play-server.ts` lines 134–145.

### 4.4 Monetization lock

| Check | Result |
|-------|--------|
| `ee67536` diff | **No** billing/Stripe file changes |
| Stripe checkout in app | Present in codebase historically; **not enabled** by Phase 28 releases |
| Phase 28K action | **No** activation |

---

## 5. Controlled Roll Call smoke-test procedure (authorized release only)

**Scope:** document for **post-migration + post-deploy** window. **Do not** run during Phase 28K.

### 5.1 Preconditions

- Steps C–E of `PHASE28J_PRODUCTION_RELEASE_EXECUTION_PACKAGE.md` **complete**
- Roll Call metadata, artwork, audio, `streaming_enabled` **unchanged**

### 5.2 Before snapshot (read-only)

```bash
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy --output-format json \
  "select plays from public.songs where id = '497b9cfd-e752-4060-9528-5134a2ff7f37';"
```

**Record:** `plays_before = 0` (2026-11-23 preflight).

Optional: `GET https://www.digitalmusicdatabase.com/api/songs` — confirm Roll Call in JSON; record API `plays`.

### 5.3 One authorized playback

1. Open Production site; start **Roll Call** playback once (HTML5 qualified listen).
2. Ensure client issues **one** `POST /api/songs/497b9cfd-e752-4060-9528-5134a2ff7f37/play` with:
   - `event: "qualified_start"`
   - `playbackSessionId`: **new UUID** (generate once; **reuse forbidden** for second increment test in this procedure)

**Do not:** repeat play spam, parallel requests, staging harness scripts, or throttle tests on Production.

### 5.4 Success criteria

| Check | Expected |
|-------|----------|
| HTTP response | `200`, `ok: true`, `plays` = `plays_before + 1` |
| `songs.plays` (read-only SQL) | Same as response |
| `song_play_qualified_events` count (postflight) | **≥1** row for Roll Call (service_role SQL editor only) |
| UI | Playback audible; catalog still lists Roll Call |

### 5.5 After snapshot

Record `plays_after`. Delta **must be exactly 1** for this procedure.

**Out of scope:** duplicate-session test, 45s throttle test, `verify:phase28h` on Production.

### 5.6 Stop / incident

| Symptom | Action |
|---------|--------|
| Play API 500 | Halt; check RPC + service role; see Phase 28J §I |
| `plays` unchanged after success response | Halt; compare API vs DB; no manual row edits |
| `plays` +2 or more | Halt; incident — do not continue testing on Production |

---

## 6. Commands summary (read-only preflight)

```bash
# Identity + PITR
npx supabase backups list --remote=aehuszoadgqtbkxsliyy --output-format json

# Full pre-migration (not yet applied)
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy \
  -f docs/release/phase28/PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql

# Migration hash (local repo)
Get-FileHash -Algorithm SHA256 supabase/migrations/202611231200_song_qualified_play_durable.sql

# Post-migration only (after authorized apply)
npx supabase db query --read-only --remote=aehuszoadgqtbkxsliyy \
  -f docs/release/phase28/PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql
```

---

## 7. Unresolved issues

| # | Issue | Mitigation |
|---|-------|------------|
| **U1** | Production Vercel env vars not listed via CLI from this workspace | Operator dashboard checklist §4.2 before deploy |
| **U2** | Current Production app commit may predate `ee67536` | Expected; migration-only apply remains safe until deploy |
| **U3** | Client UI may still show session play counts ahead of DB (Phase 27) | Post-smoke, trust **API + SQL** for `songs.plays` |

No documentation defects requiring code change identified in Phase 28K.

---

## 8. Execution boundary attestation

| Action | Phase 28K |
|--------|-----------|
| Production migration | **Not performed** |
| Production deploy | **Not performed** |
| Production data / policies | **Not modified** |
| Roll Call row | **Read-only** (`plays=0`) |
| Monetization | **Not activated** |

---

## Summary

Phase 28K re-verified git artifacts (`ee67536` sole runtime; later commits docs/harness only), confirmed Production ref **`aehuszoadgqtbkxsliyy`**, **PITR on**, migration **absent**, migration **SHA-256** `1118ffd305e9e497daa7682af978eecd025ec98b4eeb3e615f51f1a04ae121c8`, transactional apply requirement, postflight alignment, durable play semantics, and a **minimal Roll Call smoke** script. **Release is ready for controlled execution** under conditions K1–K5 when an operator runs Phase 28J §4 with owner approval.