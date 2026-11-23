# Phase 29B — Production Creator Acceptance and User Experience

**Date:** 2026-11-23  
**Production:** https://www.digitalmusicdatabase.com  
**Vercel project:** `music-data-base`  
**Production runtime (live):** `ee675362803ccd0b0f3b42e21a8a90be02bc7812` (Phase 28M)  
**Supabase Production:** `aehuszoadgqtbkxsliyy`  
**Prior audit:** [PHASE29A_PRODUCTION_STABILITY_AUDIT.md](./PHASE29A_PRODUCTION_STABILITY_AUDIT.md)  
**Navigation implementation notes:** [PHASE29B_FEATURE_NAVIGATION_REPORT.md](./PHASE29B_FEATURE_NAVIGATION_REPORT.md)

**Scope executed:** Read-only Production probes, browser observation (existing session), local UX/security fixes, **no Production deploy**, **no Production data or role changes**, **no account creation**, **no Roll Call play re-test on Production** (plays preserved at `1`).

---

## Final verdict

### **CONDITIONAL** — ready for a **small, owner-monitored founding-creator wave** after Preview deploy of 29B fixes and one authorized Artist E2E on Preview or Production with owner session.

| Gate | Status |
|------|--------|
| Guest discovery & navigation UX | **Fixed locally**; **not on Production** until deploy |
| Guest upload HTTP semantics | **Fixed locally** (401 before validation); Production still **400** @ `ee67536` |
| Empty states (mixtapes / videos / podcasts) | **Improved locally** |
| Artist upload → publish E2E | **BLOCKED** — no owner-authorized Artist browser session in this run |
| Browser Roll Call replay | **NOT RUN** on Production (preserve `plays: 1`) |
| Payment / checkout activation | **Not changed** — all locks remain |

---

## 1. Approved Artist Production E2E

| Step | Result | Evidence |
|------|--------|----------|
| Open Artist Studio | **BLOCKED** | No authorized Artist credentials or delegated session in agent environment |
| Upload draft + cover | **BLOCKED** | Same |
| Owner draft access / guest isolation | **NOT EXERCISED** | Code + 28M RLS evidence in 29A; no second creator account |
| Publish → catalog → play → dashboard stats | **BLOCKED** | Requires approved Artist session and approved original asset |

**Blocker:** Owner must run steps 1–9 with an approved founding Artist account or share a time-boxed assisted session. Agent did **not** create accounts, change roles, or modify Production catalog rows.

---

## 2. Browser playback and durable statistics (Roll Call)

| Check | Production @ 2026-11-23 | Notes |
|-------|-------------------------|--------|
| Roll Call ID | `497b9cfd-e752-4060-9528-5134a2ff7f37` | Unchanged |
| `GET /api/songs` → `plays` | **1** | Matches Phase 28M smoke |
| `streaming_enabled` | **true** | Public catalog |
| Audio URL host | `aehuszoadgqtbkxsliyy.supabase.co` | Production storage |
| Additional browser play on Production | **Skipped** | Phase scope: do not alter Roll Call stats |
| Durable play API (`POST /api/songs/{id}/play`) | **PASS (code)** | `ee67536` server persist path; verified in 28M/29A |

**API snapshot (Production):**

```json
{"title":"Roll Call","id":"497b9cfd-e752-4060-9528-5134a2ff7f37","plays":1,"streaming_enabled":true}
```

---

## 3. Guest and incognito acceptance

### Production probes (unauthenticated HTTP)

| Check | Result |
|-------|--------|
| `GET /` | **200** (~24 KB shell) |
| `GET /podcast`, `/mixtapes` | **200** |
| `GET /api/songs` | **200** — 1 public song |
| `GET /api/videos` | **200** — `[]` |
| `GET /api/mixtapes?scope=public` | **200** — empty catalog payload |
| `GET /api/ringtones/marketplace` | **200** — `publicBetaPaidPurchaseLocked: true`, `paidCheckoutAvailable: false` |
| `POST /api/upload-audio` empty body | **400** — `Select a publication choice…` (should be **401**) |
| `POST /api/upload-audio` `{}` | **400** — same (auth should precede publication validation) |

### Guest upload 400 → 401 (local fix)

**Root cause (Production @ `ee67536`):** `handleSaveSongMetadata` validated `parseSongUsageFromBody` before `requireAudioUploadUser`, so anonymous posts hit publication validation first.

**Local fix:**

- `requireAudioUploadUser` runs **before** publication and `storagePath` checks in `handleSaveSongMetadata`.
- `handlePrepareStorageUpload` authenticates **before** `storagePath is required`.

**Verifier:** `node scripts/verify-upload-audio-save-metadata-auth-order.mjs` — **PASS** (local tree).

**Production remains 400 until deploy** — no deploy in 29B.

### Incognito browser

**NOT VERIFIED in isolation:** MCP browser retained a signed-in session (`Logout` visible on `/podcast`). Owner should confirm incognito: COMING SOON hub on `/`, signup entry, no cookie bleed, guest upload → **401** after deploy.

---

## 4. Public feature navigation

### Production (live)

| Destination | Route | Status |
|-------------|-------|--------|
| Home | `/` | Live (entry hub when logged out) |
| Mixtapes | `/mixtapes` | Live |
| Podcasts | `/podcast` | Live |
| Music / Videos / Ringtones deep links | — | **Not in Production nav** @ `ee67536` (3-link guest nav) |

### Local implementation (awaiting deploy)

Six-link `GuestPublicDiscoveryNav` with horizontal scroll; routes `/music`, `/videos`, `/ringtones` mirror `/mixtapes` pattern. Personal items stay in authenticated chrome. Ringtones show **Beta** browse-only pill when purchases locked.

`node scripts/verify-guest-public-discovery-nav.mjs` — **PASS**

### Screenshots

Not captured in this run (no clean incognito MCP profile). After deploy, capture: iPhone 390×844 and Android 412×915 on `/`, `/music`, `/podcast`.

---

## 5. Empty-state experience (local)

| Module | Change |
|--------|--------|
| **Mixtapes** | Distinguishes search vs empty catalog; guest copy points to Music/Podcasts; creator copy mentions Mixtape Studio |
| **Videos** | Guest `/videos` hides upload form; honest “No published videos yet” + founding creator guidance |
| **Podcasts** | Guest discover empty state explains Podcast Studio + where to browse meanwhile |

Markers: `data-mixtape-empty-reason`, `data-video-discovery-empty`, `data-podcast-discovery-empty`.

---

## 6. Mobile search and playback

| Check | Production | Local |
|-------|------------|-------|
| iPhone / Android layout pass | **NOT VERIFIED** | CSS: horizontal guest nav scroller, 40px touch targets |
| Search + Roll Call | **PASS** (authenticated browser: search prefilled “Roll Call”) | — |
| Library vs global search | **NOT VERIFIED** (needs listener saves) | — |
| Mobile player controls | **NOT VERIFIED** | — |

---

## 7. Security and monetization (Production read-only)

| Control | Result |
|---------|--------|
| Draft privacy (RLS) | **PASS** per 28M / 29A; no new draft rows created |
| Cross-user access | **NOT EXERCISED** (no second creator) |
| Artist upload authorization | **PASS** code paths; guest upload mis-ordered on prod |
| Durable play tracking | **PASS** — Roll Call `plays: 1` |
| Ringtone purchase lock | **PASS** — `publicBetaPaidPurchaseLocked: true` |
| Paid checkout | **OFF** — `paidCheckoutAvailable: false` |
| Subscriptions / sponsor / sales | **Unchanged** — beta locks per 29A |

---

## 8. Files changed (local, pre-commit scope)

Phase 29B–scoped paths:

- `lib/public-guest-discovery.ts`
- `app/music/page.tsx`, `app/videos/page.tsx`, `app/ringtones/page.tsx`
- `components/public-guest/*`
- `components/public-beta/mdb-public-entry.tsx`
- `components/mixtapes/MixtapeDiscoveryWorkspace.tsx`
- `components/podcasts/PodcastDiscoveryWorkspace.tsx`
- `app/page.tsx` (guest discovery shell, video guest UX)
- `app/api/upload-audio/route.ts` (auth order)
- `lib/i18n/messages/en.ts` (nav.music, nav.ringtones, beta labels)
- `scripts/verify-guest-public-discovery-nav.mjs`
- `scripts/verify-upload-audio-save-metadata-auth-order.mjs`
- `docs/release/phase29/PHASE29B_*`

**Unrelated dirty work preserved** (album routes, billing, other docs) — not part of this commit.

**Commit hash:** *(pending scoped commit in this branch)*

---

## 9. Remaining blockers

1. **Deploy 29B to Preview** — validate six-link nav, empty states, guest upload **401**.
2. **Owner-led Artist E2E** — draft → publish → play → dashboard metrics with approved asset.
3. **True incognito pass** — confirm login hub, no session inheritance, signup entry.
4. **One cautious Roll Call browser play** on Preview or prod after owner approves (optional; plays currently `1`).
5. **Mobile device smoke** — search, play, nav on real iPhone/Android.

---

## Sign-off matrix

| Stakeholder need | Ready? |
|------------------|--------|
| Founding creator wave (controlled) | **CONDITIONAL** — after Preview + Artist E2E |
| Open public self-serve creators | **NO-GO** |
| Listener guest discovery | **CONDITIONAL** — after nav deploy |
| Monetization launch | **NO-GO** — locks intentional |