# Phase 28L — Production Environment Final Gate

**Report time:** 2026-11-23  
**Branch (release train):** `release/pwa-microsoft-store` @ `e3b1bad`  
**Minimum runtime commit:** `ee675362803ccd0b0f3b42e21a8a90be02bc7812`  
**Production Supabase:** `aehuszoadgqtbkxsliyy`  
**Phase 28K U1:** **Resolved** (this report)

**Phase 28L boundary:** verification and preparation only — **no** migration, deploy, env edits, data changes, or Roll Call smoke.

---

## Final verdict: **READY FOR CONTROLLED PRODUCTION EXECUTION** (CONDITIONAL)

| Condition | Status |
|-----------|--------|
| **L1** — Correct Vercel **Production** project identified | **PASS** |
| **L2** — Required env vars present + Production Supabase identity | **PASS** (no secrets logged) |
| **L3** — Migration checksum + not applied + PITR | **PASS** |
| **L4** — Runtime artifact `ee67536` isolated from harness/docs | **PASS** |
| **L5** — Operator deploys **`ee67536`+** to **`music-data-base`**, not Preview recovery project | **Required at step 6** |

**CONDITIONAL on L5:** Current live Production deployment predates Phase 28H (`ee67536`); cutover completes only after **DB migrate + promote** to `music-data-base` Production.

---

## 1. U1 resolution — Vercel Production vs Preview

### 1.1 Projects (same Vercel team)

| Project name | Serves `www`? | Latest Production URL (CLI) | Role |
|--------------|---------------|-----------------------------|------|
| **`music-data-base`** | **Yes** | `music-data-base-17h3se15b-…vercel.app` | **MDB Production (`www`)** |
| `music-data-base-pwa-clean-git-baseline-recovered` | No | Preview-only aliases | Phase 28F–K **Preview** acceptance |
| `music-data-base-ludd` | No | Legacy / unused for www | — |

### 1.2 Domain assignment (evidence)

**Command:** `npx vercel inspect www.digitalmusicdatabase.com`

| Field | Value |
|-------|--------|
| Vercel **project** `name` | **`music-data-base`** |
| `target` | **production** |
| `status` | **Ready** |
| Current deployment ID | `dpl_3KPTJaVTV7MUmLYukKH3QyCYGFi8` |
| **Aliases** | `https://www.digitalmusicdatabase.com`, `https://digitalmusicdatabase.com`, `https://music-data-base.vercel.app` |

**Incorrect assumption (closed):** linking CLI cwd to `music-data-base-pwa-clean-git-baseline-recovered` does **not** enumerate Production www env vars.

### 1.3 Production deployment history (recent)

**Command:** `npx vercel list music-data-base --environment production`

| Age | Deployment | Status |
|-----|------------|--------|
| ~1d | `music-data-base-17h3se15b-…` | Ready (**current alias target**) |
| ~1d | `music-data-base-9uhfjppma-…` | Ready (prior) |

Git branch alias on deployment includes `release-pwa-b53903` — **verify commit SHA in Vercel dashboard** before/after promote; do not assume `ee67536` is live today.

---

## 2. Production environment variables (presence + identity, no values)

**Command:** `npx vercel env ls production --project music-data-base`

### 2.1 Required Phase 28 keys

| Variable | Listed for Production | Type (CLI) |
|----------|----------------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Secret |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Secret |

### 2.2 Identity verification (no secret material in reports)

| Method | Result |
|--------|--------|
| **A.** Public browser bundle scan (`/_next/static/chunks/…js`) | `https://aehuszoadgqtbkxsliyy.supabase.co` present; **staging ref absent** |
| **B.** Anon JWT `ref` claim from **public** chunk (first 8 chars only: `aehuszoa…`) | **`ref` matches Production `aehuszoadgqtbkxsliyy`** |
| **C.** `GET https://www.digitalmusicdatabase.com/api/launch/status` | `hasSupabaseUrl`, `hasAnonKey`, `hasServiceRoleKey` **true**; `supabaseConfigError` **empty**; **all** `productionChecks` **ok**; **`songs` table check Ready** (server uses service role against same project) |

**Service role identity:** Not decoded locally (no `vercel env pull`). Inferred **consistent with Production** because launch status performs live server queries on Production schema (`songs`, 50+ tables) without config error.

### 2.3 Monetization lock flags (names only, Production)

Present on **`music-data-base`** Production (Config):

- `NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED`
- `NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED`
- `NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED`
- `NEXT_PUBLIC_FOUNDING_BETA_LOCKED`

Stripe secrets exist (`STRIPE_SECRET_KEY`, webhooks) for infrastructure; **beta lock flags remain enabled** — no Phase 28 monetization activation.

---

## 3. Release artifact and database preflight (reconfirmed)

### 3.1 Git runtime boundary

`git diff ee67536..e3b1bad --name-only -- lib app` → **empty** (no runtime drift).

| Commit | Role |
|--------|------|
| `ee67536` | Phase 28H runtime + migration source |
| `10008ff` … `e3b1bad` | Harness / docs only |

### 3.2 Migration checksum

| SHA-256 | Match @ `e3b1bad` |
|---------|-------------------|
| `1118ffd305e9e497daa7682af978eecd025ec98b4eeb3e615f51f1a04ae121c8` | **yes** |

### 3.3 Production database

| Check | Result |
|-------|--------|
| `record_song_qualified_play` | **`rpc_present: false`** |
| PITR | **`pitr_enabled: true`** |
| Project ref (`backups list`) | **`aehuszoadgqtbkxsliyy`** |

---

## 4. K1–K5 reconciliation (Phase 28K)

| ID | Requirement | Phase 28L status |
|----|-------------|------------------|
| **K1** | Transactional migration | **Ready** — operator must wrap SQL in `BEGIN`/`COMMIT` |
| **K2** | PITR before cutover | **PASS** (reverified) |
| **K3** | Deploy `ee67536` minimum | **Artifact ready** — **not yet on www** (see L5) |
| **K4** | Production Vercel env names | **PASS** — U1 resolved on `music-data-base` |
| **K5** | Single Roll Call smoke (later) | **Procedure in Phase 28K §5** — not executed in 28L |

---

## 5. Final ordered execution procedure

Use **`music-data-base`** Vercel project and **`aehuszoadgqtbkxsliyy`** Supabase only.

| Step | Action | Expected | **Stop if** |
|------|--------|----------|-------------|
| **1** | `npx supabase backups list --remote=aehuszoadgqtbkxsliyy --output-format json` | `pitr_enabled: true`, ref `aehuszoadgqtbkxsliyy` | PITR false or wrong ref |
| **2** | Confirm Vercel Production project = **`music-data-base`**; domains include **www** | Matches §1.2 | Wrong project |
| **2b** | `npx vercel env ls production --project music-data-base` | Three Supabase vars listed (§2.1) | Any missing |
| **2c** | `GET /api/launch/status` on www | `productionChecks` all `ok` | `supabaseConfigError` non-empty |
| **3** | Preflight: `PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql` (read-only) | RPC/tables **false**, `public_catalog_read` present | Objects already partially applied |
| **4** | `BEGIN;` + full `202611231200_song_qualified_play_durable.sql` + `COMMIT;` | Success | **Any error → `ROLLBACK;`**, no app promote |
| **5** | `PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql` (read-only) | RPC/tables **true**, `public_catalog_read_still_present` **false**, new policies present | Policy mismatch |
| **6** | **Promote/deploy** git **`ee67536`** (or `e3b1bad`) to **`music-data-base` Production** | Deployment **Ready** | Build error / wrong branch |
| **7** | Health: `GET https://www.digitalmusicdatabase.com/api/launch/status` + `GET /api/songs` | `ok: true`; Roll Call in catalog | 5xx or empty catalog |
| **8** | **One** authorized Roll Call qualified play (Phase 28K §5) | `plays` +1 max | Double increment / 500 |
| **9** | Record `plays_before` / `plays_after`; optional service_role row count on `song_play_qualified_events` | Delta **exactly 1** | Delta ≠ 1 |
| **10** | Monetization: confirm beta **LOCKED** env flags unchanged; no new checkout paths | Locks still set | Paid path unlocked unintentionally |

### Recovery (summary)

| Failure | Action |
|---------|--------|
| Step 4 fails | `ROLLBACK`; stay on current app; no data repair |
| Step 6 succeeds, step 7 play 500 | RPC/service role/logs; forward-fix |
| Anon catalog empty post-migrate | Policies + Roll Call `streaming_enabled` |
| Rollback policy emergency | Phase 28J §5.7 — **draft leakage risk** |

**SQL / doc paths:**

- Migration: `supabase/migrations/202611231200_song_qualified_play_durable.sql`
- Preflight: `docs/release/phase28/PHASE28I_PRODUCTION_PREFLIGHT_PLAY_DURABLE.sql`
- Postflight: `docs/release/phase28/PHASE28J_PRODUCTION_POSTFLIGHT_PLAY_DURABLE.sql`
- Detail: `docs/release/phase28/PHASE28J_PRODUCTION_RELEASE_EXECUTION_PACKAGE.md`

---

## 6. Remaining blockers

| # | Blocker | Owner action |
|---|---------|----------------|
| **B1** | Live www **not** on `ee67536` durable play | Production promote after migration |
| **B2** | Owner-approved maintenance window | Schedule step 4+6 |
| **B3** | Roll Call smoke | Execute step 8–9 once authorized |

No **NO-GO** technical blockers identified for controlled execution.

---

## 7. Boundary attestation (Phase 28L)

| Action | Performed? |
|--------|------------|
| Production migration | **No** |
| Production deploy | **No** |
| Env variable change | **No** |
| Roll Call smoke | **No** |
| Monetization enable | **No** |

---

## Summary

Phase 28L resolves **U1**: **Production www** is served by Vercel project **`music-data-base`**, not the Preview recovery project. Required Supabase env vars **exist** on that project; **public bundle + anon JWT ref + live launch status** confirm **`aehuszoadgqtbkxsliyy`** without logging secrets. Migration checksum and absence on Production are reconfirmed; PITR remains on. **Release may proceed** under the 10-step procedure when the operator is authorized to execute migration and promote **`ee67536`** to **`music-data-base` Production**.