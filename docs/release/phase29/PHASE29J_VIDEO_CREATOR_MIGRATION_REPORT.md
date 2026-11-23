# Phase 29J — Video-only Creator Production migration

**Production Supabase:** `aehuszoadgqtbkxsliyy`  
**Migration:** `supabase/migrations/202611221200_video_creator_account_type.sql`  
**Applied:** 2026-11-23 — `sha12=87b0dd7f70c9`  
**App on www:** `f0bbdb9` / `b72b048` (no new runtime deploy required for SQL)  
**Evidence:** `tmp/production-video-creator-preflight.json`, `tmp/production-video-creator-migration-applied.json`, `tmp/production-video-creator-post-verify.json`

---

## Pre-apply verification

| Check | Result |
|-------|--------|
| Migration additive CHECK values (`creator`, `founding_creator`) | PASS |
| Existing `creator` / `founding_creator` profile rows | **0** (no data rewrite) |
| Production profiles | 6 listener, 2 producer, 2 artist, 1 admin |
| Artist/Producer rows preserved | PASS — migration does not UPDATE profiles |
| Split RPCs before apply | absent (expected); replaced in transaction |
| Rollback plan | documented in `VIDEO_CREATOR_MIGRATION_PRODUCTION_READINESS.md` |

---

## Post-apply schema verification

| Check | Result |
|-------|--------|
| `can_upload_music_content` / `can_upload_video_content` | **PASS** |
| `can_upload_creator_content` → music only | **PASS** |
| `songs.owners_insert` → music RPC | **PASS** |
| `videos.owners_insert` → video RPC | **PASS** |
| Storage restrictive policies (songs, videos, producer-beats) | **3** policies **PASS** |
| `profiles_account_type_check` includes `creator` | **PASS** |
| Sample **producer** profile | music **true**, video **true** |
| Sample **listener** | music **false**, video **false** |
| `verify-production-video-creator-db.mjs` | **0 fails** |
| `verify-video-creator-account.mjs` | **0 fails** |

---

## Permission matrix (intended)

| Account | Music / audio upload | Video upload |
|---------|----------------------|--------------|
| Listener | no | no |
| Artist / Producer (founding approved) | yes | yes |
| **Creator / founding_creator** (founding approved) | **no** | **yes** |
| Admin | yes | yes |

Production has **no** `creator` profiles yet — live creator E2E requires first **founding_creator** onboarding or signup with `account_type=creator` + approval.

---

## API / www (Production)

| Probe | Result |
|-------|--------|
| Guest upload POSTs | **401** |
| `verify-role-based-navigation.mjs` | **0 fails** |
| Beta payment / checkout | unchanged — locks on |

---

## Operator scripts (repo)

```bash
node scripts/preflight-production-video-creator-migration.mjs
# MDB_CONFIRM_PRODUCTION_MIGRATION=1 node scripts/apply-production-video-creator-migration.mjs
node scripts/verify-production-video-creator-db.mjs
node scripts/verify-video-creator-account.mjs
```

Uses `MDB_PRODUCTION_DATABASE_URL` or sibling `music-data-base-/.env.local` **only** when URL contains `aehuszoadgqtbkxsliyy` — never staging.

---

## Remaining blockers

1. **Production ringtone download** — still open (marketplace empty).
2. **First video-only Creator account** — owner signup/founding invite + video upload smoke on www.
3. **Authenticated upload matrix** — `MDB_PRODUCTION_TEST_*` + browser.

---

## Rollback (if needed)

Single transaction revert: restore prior `owners_insert` definitions, drop/replace RPCs from last known migration, revert CHECK constraints **only if** no `creator` rows exist.