# Phase 29H — Production-first backlog report

**Date:** 2026-11-23  
**Branch:** `release/pwa-microsoft-store`  
**Commit:** `f0bbdb9`  
**Production deploy:** `dpl_DPxDMWdyhAQ1FHMeaCpaNQcciGFk` → **https://www.digitalmusicdatabase.com**

---

## Open acceptance (not blocking other work)

| Item | Status |
|------|--------|
| Production ringtone download | **OPEN** — marketplace `total=0` until owner publishes free test ringtone on www |
| Probe | `npm run verify:production-ringtone-download` |

---

## Completed in this release (`f0bbdb9`)

| Area | Change |
|------|--------|
| Listener catalog | `GET /api/songs` includes **`price_cents`** on public streaming rows (29G Production gap) |
| Upload gates | Album create → `requireMusicUploadAccess`; video routes → `requireVideoUploadAccess` |
| Listener nav | Block **Creator Dashboard** in `CREATOR_ONLY_NAV_VIEWS` |
| Workflow | Production-first Cursor rule + docs + Production ringtone probe script |
| Tests | Role/nav/video-creator verify scripts pass; 29G sales experience 12/12 |

**Excluded from commit:** video-only DB migration (`202611221200_*` untracked), billing/signup WIP, recovery manifests, bulk phase docs.

---

## Phase 29 — shipped vs Production-tested

| Phase | Feature | On `f0bbdb9` | Production-tested |
|-------|---------|--------------|-------------------|
| 29E | Guest home mobile overflow | Yes (`88311ce`) | **Partial** — verify on www after deploy |
| 29F | Song/album upload pricing | Yes (`ca20a88`) | API **partial** — owner creator session |
| 29G | Listener prices + beta-safe Buy | Yes (`7266fa7` + **price_cents API**) | **This deploy** — public `price_cents` live |
| 29B–D | Guest/six-link nav, mobile UI | Yes | **Owner** device pass pending |
| Ringtone | Studio + marketplace code | Yes | Download **blocked** (no catalog row) |

---

## Production probes (post-deploy)

| Route | Expected |
|-------|----------|
| `/api/launch/status` | `ok: true` |
| `/api/songs` | Roll Call + **`price_cents`** field present |
| `/api/ringtones/marketplace` | `total=0`, `publicBetaPaidPurchaseLocked=true` |
| Guest upload POST | 401 without session |

---

## Prioritized outstanding work

### P0 — Mobile (www)

1. Guest **Home** horizontal overflow — re-measure 390/375/412 on **Production** (29E).
2. Authenticated **six-link** nav scroll + `aria-current` on phones.
3. Creator Studio upload forms on narrow viewports (song/album/video).

### P1 — Permissions (automated + owner spot-check)

1. Listener cannot open Creator Dashboard / upload (server + nav).
2. Artist vs Producer studio modes (`verify-role-based-navigation`, `verify-effective-role-access`).
3. Video-only creator account — **after** owner applies `202611221200_video_creator_account_type.sql` on Production (not in this deploy).

### P2 — Upload / catalog E2E on Production

1. Artist: audio upload, publication mode, catalog visibility.
2. Album create + items list.
3. Mixtape studio (large catalog pagination).
4. Video upload via `/api/video-upload` only (not legacy 404 confusion).
5. Listener: play Roll Call; library vs global search (Phase 28).

### P3 — Gaps / broken UX (from 29A audit)

1. Empty states (mixtapes/videos/podcasts zero rows).
2. Guest incognito signup entry.
3. Play count UI vs server `plays` (post-28M).

### Deferred (policy)

- Paid checkout, Stripe charges, creator payouts — **off**.
- Staging data migration — **no**.
- Full `app/page.tsx` eslint — CI/high-memory only.

---

## Verify commands (run before next Production cut)

```bash
node scripts/verify-role-based-navigation.mjs
node scripts/verify-effective-role-access.mjs
node scripts/verify-listener-nav-workspace.mjs
node scripts/verify-video-creator-account.mjs
node scripts/verify-phase29g-sales-experience.mjs
node scripts/verify-public-beta-ringtone-lock.mjs
npm run verify:production-ringtone-download
```

---

## Failed / skipped deploy note

`vercel deploy --prod` on linked **recovery** project `dpl_8TPdNQBu3XptTUDntLMAAtqp8RLD` failed (missing anon key on that project). **Canonical Production** deploy used `--project music-data-base` per Phase 28M runbook.