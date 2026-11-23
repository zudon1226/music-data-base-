# Phase 29K — Production creator & upload acceptance

**Environment:** [www.digitalmusicdatabase.com](https://www.digitalmusicdatabase.com) (Production)  
**Date:** 2026-11-23  
**Production deploy (app):** unchanged since `f0bbdb9` (Phase 29H) — acceptance is API + DB + new fixture data only.

## Summary

| Area | Result | Notes |
|------|--------|-------|
| Video-only Creator fixture | **PASS** | Provisioned `mdb-phase29k-video-creator@mdb-production.invalid` (`74363267…`); `musicRpc=false`, `videoRpc=true` |
| Creator upload gates | **PASS** | Music `403`, video prepare `200` |
| Creator dashboard permissions | **PASS** | `canUpload=true`, no artist/producer dashboards |
| Artist / Producer uploads | **PASS** | Legal-compliant production users; music/video prepare `200`; album create validation `400` (not role block) |
| Ringtone draft API (artist/producer) | **PASS** | `201` on save-draft probe |
| Listener discovery & playback | **PASS** | Roll Call `price_cents=129`; song storage HEAD `200` |
| Security (direct API) | **PASS** | Guest `401`; listener uploads `403`; spoofed `userId` `403` |
| Beta safety | **PASS** | `publicBetaPaidPurchaseLocked=true`, `paidCheckoutAvailable=false`; checkout `403` |
| Ringtone download E2E | **BLOCKED** | Marketplace `total=0` on www — publish owner test ringtone to continue |
| Device UI matrix | **BLOCKED** | Owner manual: desktop + iPhone Safari + Android Chrome |

## Harness

```bash
# One-time fixture (requires MDB_CONFIRM_PRODUCTION_FIXTURE=1 + Production env)
npm run provision:production-video-creator

# Full HTTP + DB-backed acceptance
npm run verify:phase29k-production-acceptance

# Ringtone (stays open until catalog has a free published item)
npm run verify:production-ringtone-download
```

Evidence: `tmp/phase29k-production-acceptance-evidence.json`, `tmp/phase29k-production-video-creator-fixture.json` (gitignored; contains password).

## 1. Creator (video-only)

- **Provision:** `scripts/provision-production-video-creator.mjs` — founding_creator approval, legal acceptances (`terms`, `privacy`, `creator_upload`).
- **Music upload:** `POST /api/upload-audio` → **403**
- **Video upload:** `POST /api/video-upload` → **200** (prepare-storage-upload)
- **Ringtone studio:** eligibility `canAccessRingtoneStudio=false` (expected for video-only creator)
- **Profile API:** `role=creator`, `canUpload=true`, artist/producer dashboards false
- **DB RPC:** `can_upload_music_content=false`, `can_upload_video_content=true`

## 2. Artist / Producer

Fixture selection prefers profiles with **`creator_upload` legal acceptance** and approved founding state (avoids false fails on legacy accounts missing legal rows).

| Check | Artist | Producer |
|-------|--------|----------|
| Music prepare | 200 | 200 |
| Video prepare | 200 | 200 |
| Album create | 400 (validation) | 400 (validation) |
| Dashboard flags | `canArtistDashboard` | `canProducerDashboard` |
| Ringtone draft | 201 | 201 |

**Note:** Producer `19cooperstreetllc@gmail.com` correctly returns **403** until Creator / Upload Agreement is accepted — not an upload-role defect.

## 3. Listener

- Public catalogs: songs, videos, mixtapes, marketplace, podcasts
- Roll Call visible with pricing field
- Upload paths denied; checkout beta-locked
- Beats catalog empty (`beats=0`) — data, not gate regression

## 4. Security

- Unauthenticated POSTs → **401**
- Authenticated listener POSTs → **403**
- Listener session with foreign `userId` in body → **403** (reject spoofing)

RLS/storage split verified in Phase 29J; no Production migration changes in 29K.

## 5. Beta safety

- Marketplace: `publicBetaPaidPurchaseLocked=true`
- Guest/authenticated checkout probes remain locked

## 6. Release / deploy

- **No Production app redeploy** required for 29K harness results.
- Commit track: acceptance scripts + this report when ready.

## Open items (owner)

1. Publish a **free test ringtone** on Production → re-run `verify:production-ringtone-download` + device matrix.
2. **Device UI:** Creator Dashboard, studios, full upload bytes (not just prepare-storage), ringtone processing on iPhone/Android.
3. Optional: record `creator_upload` legal acceptance for `19cooperstreetllc@gmail.com` if that account should upload without visiting `/legal/creator-upload`.

## Root-cause note (producer false fail)

Initial harness picked the first `producer` row regardless of legal acceptance. Fixed by `pickFixtureAccounts` + `classifyUploadHttp` (distinguishes **legal 403** vs **role 403**).