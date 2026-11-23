# Phase 28M — Production Release Report

**Execution window:** 2026-11-23 (local / UTC ~15:18–15:22Z)  
**Authorized by:** owner (Phase 28M)  
**Vercel project:** `music-data-base`  
**Supabase Production:** `aehuszoadgqtbkxsliyy`  
**Application runtime commit:** `ee675362803ccd0b0f3b42e21a8a90be02bc7812`  
**Migration:** `202611231200_song_qualified_play_durable.sql` (SHA-256 `1118ffd305e9e497daa7682af978eecd025ec98b4eeb3e615f51f1a04ae121c8`)

---

## Final verdict: **RELEASE SUCCESSFUL**

| Phase | Result |
|-------|--------|
| Preflight | **PASS** |
| Production migration (transactional) | **PASS** |
| Production deploy (`ee67536`) | **PASS** |
| Roll Call smoke (single qualified play) | **PASS** |
| Post-release checks | **PASS** |

**Note:** Smoke validated **server durable play** via `POST /api/songs/:id/play`. **In-browser audio** was not separately instrumented in this automated run; catalog + storage URL unchanged.

---

## 1. Step 1 — Preflight (before migrate)

| Check | Result |
|-------|--------|
| Production Supabase ref | **`aehuszoadgqtbkxsliyy`** |
| PITR | **`pitr_enabled: true`** |
| Migration checksum | **MATCH** |
| RPC pre-existing | **false** |
| Vercel project for www | **`music-data-base`** (not Preview recovery project) |
| Env vars present (names only) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Beta locks present | Subscription, ringtone purchases, sponsor checkout, founding beta |
| Runtime commit artifact | **`ee67536`** (deploy via detached worktree) |

---

## 2. Step 2 — Production database migration

**Method:** `npx supabase db query --remote=aehuszoadgqtbkxsliyy --yes -f docs/release/phase28/PHASE28M_PRODUCTION_MIGRATION_TX.sql`  
**Wrapper:** `BEGIN;` + exact migration file + `COMMIT;` (see `PHASE28M_PRODUCTION_MIGRATION_TX.sql` in repo)

**Outcome:** **Committed successfully** (CLI returned success; no rollback).

### Postflight evidence

| Object / check | Expected | Actual |
|----------------|----------|--------|
| `song_play_qualified_events` | exists | **true** |
| `song_play_listener_throttle` | exists | **true** |
| `record_song_qualified_play` | 1 function | **`rpc_count: 1`** |
| `SECURITY DEFINER` | true | **`prosecdef: true`** |
| `search_path` | `public` | **`proconfig: ["search_path=public"]`** |
| `public_catalog_read` dropped | false | **`old_policy: false`** |
| Anon streaming policy | exists | **`new_anon: true`** |
| Roll Call row | streaming, plays unchanged pre-smoke | **streaming true, plays 0** (pre-smoke) |
| Pre-smoke event rows | 0 | **0** |
| Client grants on play tables (anon/auth) | 0 | **0** |

**No** manual edits to Roll Call metadata, artwork paths, audio `storage_path`, or publication flags.

---

## 3. Step 3 — Production application deployment

| Field | Value |
|-------|--------|
| **Deployment ID** | `dpl_JEEXdXHKsvq7UqowNCr2Xv7xDRB2` |
| **Deployment URL** | `https://music-data-base-5tju1512e-zudon1226-5137s-projects.vercel.app` |
| **Status** | **Ready** |
| **Source** | Git worktree at commit **`ee67536`** (clean tree, no local WIP) |
| **CLI** | `npx vercel deploy --prod --yes --project music-data-base` |

**Aliases (verified):**

- `https://www.digitalmusicdatabase.com`
- `https://digitalmusicdatabase.com`
- `https://music-data-base.vercel.app`

**Health:** `GET https://www.digitalmusicdatabase.com/api/launch/status` → **`ok: true`**, all `productionChecks` **ok**, `supabaseConfigError` empty.

**Catalog:** `GET /api/songs` includes Roll Call; `plays` synced after smoke (see §4).

---

## 4. Step 4 — Controlled Roll Call smoke

| Field | Value |
|-------|--------|
| Song ID | `497b9cfd-e752-4060-9528-5134a2ff7f37` |
| **plays_before** (DB) | **0** |
| **plays_after** (DB) | **1** |
| **Delta** | **+1** |
| Play API | `POST /api/songs/497b9cfd-e752-4060-9528-5134a2ff7f37/play` |
| Response | `{"ok":true,"plays":1,"songId":"497b9cfd-…"}` |
| `song_play_qualified_events` (Roll Call) | **1** row |
| `song_play_listener_throttle` (Roll Call) | **1** row |
| Duplicate / throttle abuse tests | **Not run** (per authorization) |

**Metadata unchanged (API):** title Roll Call, artist Tenor Saw, `streaming_enabled: true`, `ringtone_enabled: false`, same `storage_path` / `audio_url` host **`aehuszoadgqtbkxsliyy`**.

---

## 5. Step 5 — Final verification

| Area | Result |
|------|--------|
| Guest catalog (`GET /api/songs`) | **PASS** — Roll Call listed |
| Durable play active | **PASS** — RPC + event/throttle rows |
| RPC error → in-memory fallback | **N/A in prod** — RPC present; play returned success via durable path |
| Staging ref in production bundle (HTML spot check) | **Not in initial HTML**; API/storage use **Production** ref |
| Monetization | **Locked** — beta checkout flags unchanged on Vercel |
| Unrelated Production DDL beyond migration | **None observed** |

---

## 6. Artifacts

| Path | Purpose |
|------|---------|
| `PHASE28M_PRODUCTION_MIGRATION_TX.sql` | Transactional apply record used at cutover |
| `PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql` | Postflight queries |

---

## 7. Recovery / incidents

| Item | Status |
|------|--------|
| Failed migration rollback | **Not required** |
| Rollback of deploy | **Not required** |

---

## Summary

Production received the reviewed Phase 28H migration inside a **single transaction**, then **`ee67536`** was deployed to **`music-data-base`** with **Ready** status on **www** and apex domains. Roll Call **`plays`** moved **0 → 1** with **one** qualified play event and throttle row persisted. Beta payment locks remain enabled.

**Final verdict: RELEASE SUCCESSFUL**