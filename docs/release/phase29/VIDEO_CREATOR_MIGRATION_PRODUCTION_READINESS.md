# Video-only creator migration — Production readiness (read-only)

**File:** `supabase/migrations/202611221200_video_creator_account_type.sql`  
**Status:** **APPLIED** on Production (2026-11-23) — see `PHASE29J_VIDEO_CREATOR_MIGRATION_REPORT.md`  
**Application requires:** owner review + explicit approval + transactional apply with rollback plan.

---

## What it does

| Change | Risk |
|--------|------|
| Extends `profiles.account_type` / `user_roles.role` CHECK to include `creator` / `founding_creator` | Low — additive enum values |
| Splits RPC: `can_upload_music_content` vs `can_upload_video_content` | **Medium** — changes who may insert songs vs videos |
| Replaces `can_upload_creator_content` → music-only wrapper | **Medium** — callers expecting combined gate must use correct RPC |
| RLS: `songs` insert requires music RPC; `videos` insert requires video RPC | **High visibility** — mis-apply can block legitimate uploads |
| Storage restrictive policies on `songs`, `videos`, `producer-beats` buckets | **High** — failed policy = upload 403 |

---

## Security properties (positive)

- `creator` / video-only accounts: **cannot** insert music (`can_upload_music_content` returns false).
- Listeners / premium listeners: **cannot** upload music or video.
- Founding **approval** still required for non-admin uploads.
- Functions are `security definer` with fixed `search_path` (matches Phase 28 style).

---

## Rollback

1. Restore prior `can_upload_creator_content` definition (combined gate) from last known migration snapshot.
2. Revert `owners_insert` on `songs` / `videos` and storage policies to pre-migration names.
3. Revert CHECK constraints only if no rows use `creator` / `founding_creator` yet.

**Safer rollback window:** apply before assigning any `account_type = 'creator'` on Production.

---

## App alignment (f0bbdb9)

| Layer | State |
|-------|--------|
| `/api/upload-audio`, `/api/albums/create` | `requireMusicUploadAccess` |
| `/api/video-upload`, `/api/upload-video` | `requireVideoUploadAccess` |
| `verify-video-creator-account.mjs` | **PASS** |

Until migration is applied, **video-only creators cannot upload on Production** even if UI/account type exists in app code — DB RPC/RLS remains legacy combined behavior.

---

## Verdict

| Question | Answer |
|----------|--------|
| Ready to apply after owner sign-off? | **CONDITIONAL YES** — SQL reviewed; no destructive DDL |
| Safe to apply without deploy? | **NO** — apply in same maintenance window as code that expects split RPCs (already on www @ f0bbdb9) |
| Apply now without owner? | **NO** |

---

## Pre-apply checklist (owner)

1. Snapshot / note current policies on `songs`, `videos`, `storage.objects`.
2. Apply migration in a single transaction on `aehuszoadgqtbkxsliyy`.
3. Smoke: guest 401 on uploads; Artist audio POST; Artist video POST; Listener denied.
4. Optional: assign one test `creator` account and confirm video-only path.