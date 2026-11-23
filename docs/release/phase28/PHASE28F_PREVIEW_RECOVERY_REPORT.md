# Phase 28F — Preview Build Recovery and Staging Configuration Report

**Report time:** 2026-11-23 (local)  
**Branch:** `release/pwa-microsoft-store`  
**Phase 28 baseline commit:** `bccfbe0`  
**HEAD at report time:** `1f4d92b`

---

## Final verdict: **CONDITIONAL**

| Gate | Status |
|------|--------|
| Vercel Preview build **Ready** | **PASS** |
| Preview uses **staging** Supabase (`jzlegcbotqfzevtczwhx`) | **PASS** (URL in API payloads; local env guards) |
| Production Supabase (`aehuszoadgqtbkxsliyy`) untouched | **PASS** (no Production promote; no Production env writes) |
| Phase 28 play / dedup / throttle fixtures | **PASS** (`verify-phase28e-staging-api.mjs` + Preview HTTP via `vercel curl`) |
| Full UI search / library / publish E2E on Preview | **PARTIAL** (logic covered by `verify:phase28` / `verify:search` locally; authenticated library/owner-draft HTTP not automated on protected Preview) |
| Unauthenticated public HTTP to Preview | **BLOCKED** (Vercel **Deployment Protection** — expected for team previews) |
| Production deploy / monetization enablement | **Not performed** |

**Promotion:** Not ready for unconditional production release until Preview deployment protection strategy for CI/automation is agreed (bypass secret or disabled SSO for preview branch), and owner-session library/draft HTTP checks are executed or accepted as covered by staging DB + unit scripts.

---

## 1. Root causes of Preview build failures (28E → 28F)

| Phase | Root cause | Resolution |
|-------|------------|------------|
| 28E (commits after `bccfbe0`) | `app/page.tsx` imported Creator Dashboard / Video Creator / mixtape modules not in first commit | Seven dependency follow-ups (`96be568` … `1bf212e`) — **TypeScript compile restored** |
| 28E latest errors | Missing `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and all Preview env) on linked Vercel project | **28F:** configured Preview + Development env from `.env.staging.local` via `scripts/sync-vercel-preview-staging-env.mjs` |
| 28E sync tool bug | Legacy `vercel env add <key> preview` CLI | Updated to `--environment preview --value …` (Windows-safe) |
| Local `npm run build` (non-Vercel) | Staging URL without `VERCEL_ENV=preview` trips `supabase-config` guard | Expected; Vercel Preview sets `VERCEL_ENV=preview` — **remote build PASS** |
| False alarm (28F) | `verify-phase28-preview-build-deps.mjs` resolved `@/` imports under `app/` | **Fixed** path resolution for `@/` → repo root |

**Not a blocker:** Mixtape libs (`mixtape-playback-client`, `mixtape-types`, `mixtape-routes`) are **tracked in git**; deps checker had a resolver bug only.

---

## 2. Commits

| SHA | Purpose |
|-----|---------|
| `bccfbe0` | Phase 28 scoped feature (play, search scope, publication) |
| `96be568` … `1bf212e` | Build fixes for Creator/Video imports in `page.tsx` (preserved) |
| **`e321290`** | Phase 28F: env sync script, build-deps regression, staging API fixture script |
| **`1f4d92b`** | Phase 28F: `vercel curl` fallback for protected Preview play tests |

Working tree WIP (upload/video/albums, docs bulk) **not** committed per scope rules.

---

## 3. Files changed in Phase 28F commits

| File | Change |
|------|--------|
| `scripts/sync-vercel-preview-staging-env.mjs` | **Added** — push staging Preview env to linked Vercel project (names only in logs) |
| `scripts/verify-phase28-preview-build-deps.mjs` | **Added** — static import graph check for `app/page.tsx` |
| `scripts/verify-phase28e-staging-api.mjs` | **Added/updated** — staging DB + Preview play API; Vercel auth fallback via `vercel curl` |

No changes to Production Vercel env. No `.env*` committed.

---

## 4. Vercel project and deployment

| Field | Value |
|-------|--------|
| Project | `music-data-base-pwa-clean-git-baseline-recovered` (`prj_DeYFcFGOgLKuVafS5mIEqRxEJmJo`) |
| Team | `zudon1226-5137s-projects` |
| Link file | `.vercel/project.json` (created via `npx vercel link`) |
| **Ready Preview deployment** | `dpl_9FaGdAgpggeQQqRbPCtnbcbWNmgG` |
| Preview URL | `https://music-data-base-pwa-clean-git-baseline-recovered-p1ex4fyjt.vercel.app` |
| Branch alias | `…-git-70959d-zudon1226-5137s-projects.vercel.app` |
| Target | **preview** (not production) |
| Build duration | ~1m 58s |
| Git-triggered deploy | Push `e321290` → automatic Preview build |

Prior Preview deployments on `1bf212e` failed on **missing anon key at prerender** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).

---

## 5. Environment variables (names and verification only — no values)

**Source:** `.env.staging.local` (local only, never logged).

| Variable | Preview status | Verification |
|----------|----------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Set | Contains staging ref `jzlegcbotqfzevtczwhx`; **not** production ref |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Set | Required for Next prerender; build **Ready** after set |
| `SUPABASE_SERVICE_ROLE_KEY` | Set (sensitive) | Server routes; not exposed in client bundle |
| `MDB_PREVIEW_SUPABASE_ENABLED` | Set | Server preview-staging gate |
| `NEXT_PUBLIC_MDB_PREVIEW_SUPABASE_ENABLED` | Set | Client preview-staging gate |
| `NEXT_PUBLIC_MDB_SUPABASE_BROWSER_IDENTITY` | Set | `preview-staging` (defaulted by sync script if absent locally) |
| `DATABASE_URL` | Present locally | **Not** pushed to Vercel (not required for this build) |

**Beta locks:** No code changes to Stripe/checkout in 28F commits; `npm run verify:supabase-identity` **PASS**. `verify:public-beta-support` reported staging DB ticket-table permission issues (support path), unrelated to Phase 28 playback.

**Automation note:** CLI may add a **Protection Bypass for Automation** secret on the project when using `npx vercel curl`; treat as team-scoped credential (revoke if unused).

---

## 6. Build and test results

### Local

| Check | Result |
|-------|--------|
| `node scripts/verify-phase28-preview-build-deps.mjs` | **PASS** (130 imports) |
| `npm run verify:phase28` | **PASS** |
| `npm run verify:search` | **PASS** |
| `npm run build` with `VERCEL_ENV=preview` + staging env in process | **PASS** |
| `npm run verify:supabase-identity` | **PASS** |

### Vercel Preview

| Check | Result |
|-------|--------|
| `next build` on Vercel | **PASS** (Ready) |
| `GET /api/songs` (via `vercel curl`) | **PASS** — staging storage host in `audio_url` |
| Catalog search `?search=MDB Staging` | **PASS** (fixture title returned) |

### `scripts/verify-phase28e-staging-api.mjs`

`PHASE28E_PREVIEW_BASE_URL=https://music-data-base-pwa-clean-git-baseline-recovered-p1ex4fyjt.vercel.app`

| Test | Result |
|------|--------|
| Staging ref guard | **PASS** |
| Qualified play on fixture (not Roll Call) | **PASS** |
| Play count persisted in staging DB | **PASS** |
| Duplicate session dedup | **PASS** |
| 45s throttle (model) | **PASS** |
| Invalid event rejected | **PASS** |
| Draft RLS sample | **SKIP** (0 non-public rows on staging) |

**Roll Call** (`497b9cfd-e752-4060-9528-5134a2ff7f37`) **not** used.

---

## 7. Security findings

| Topic | Finding |
|-------|---------|
| Cross-environment Supabase | Preview build and API use **staging** project only |
| Production env on Vercel | **Not modified** |
| Preview SSO | Unauthenticated `fetch` to Preview returns **401** Vercel auth — reduces public scraping; automation must use `vercel curl` or bypass secret |
| Play API | Public streaming songs accept anonymous qualified plays; non-public songs return **403** (code path unchanged) |
| Monetization | No production promote; no subscription unlock |

---

## 8. Remaining blockers

1. **Vercel Deployment Protection** — raw `PHASE28E_PREVIEW_BASE_URL` + `fetch` fails without `vercel curl`; document bypass secret for CI or adjust team Preview protection for release branch.
2. **Owner draft / library search HTTP** — no staging draft fixtures; library scope tests remain on local `verify:phase28` / `verify:search` until owner-session Preview tests are scripted.
3. **Optional:** commit WIP upload/auth files only if Preview upload regression is required (out of Phase 28F build scope; build already Ready).

---

## 9. Summary

Phase 28F recovered the Preview pipeline by configuring **staging** Supabase environment variables on the correct Vercel project and confirming a **Ready** Preview at `dpl_9FaGdAgpggeQQqRbPCtnbcbWNmgG`. TypeScript/module blockers from 28E were already addressed on `1bf212e`; the final build failure was **environment-only**. Play-count fixture tests pass against live Preview using staging data and `vercel curl` where deployment protection applies.

**Verdict: CONDITIONAL** — ready for **production review** of Phase 28 code paths with the caveats above; not **READY FOR PRODUCTION** deploy until protection/CI and authenticated E2E gaps are closed or waived.