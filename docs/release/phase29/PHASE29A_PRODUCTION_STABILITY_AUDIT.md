# Phase 29A — Production Stability and Creator Onboarding Audit

**Audit time:** 2026-11-23 (UTC ~15:26–15:35Z)  
**Production site:** https://www.digitalmusicdatabase.com  
**Vercel project:** `music-data-base`  
**Runtime commit (deployed):** `ee675362803ccd0b0f3b42e21a8a90be02bc7812` (Phase 28H)  
**Supabase Production:** `aehuszoadgqtbkxsliyy`  
**Phase 28M reference:** `docs/release/phase28/PHASE28M_PRODUCTION_RELEASE_REPORT.md`

**Scope:** Read-only audit. **No** Production data changes, account creation, uploads, deploys, role changes, or payment activation. **No** code changes in this phase.

**Evidence methods:** Live HTTP/API probes, read-only Supabase CLI queries, browser snapshot (existing session only), codebase review @ `ee67536`, Vercel env **names** only.

---

## Executive summary

| Question | Verdict |
|----------|---------|
| **Overall Production stability** | **CONDITIONAL** — platform/core APIs healthy; catalog and several creator paths **unverified live** |
| **Controlled creator onboarding readiness** | **CONDITIONAL YES** — small, owner-monitored wave with founding approval; **not** open self-serve at scale |

---

## Finding legend

| Class | Meaning |
|-------|---------|
| **PASS** | Verified on Production or strongly evidenced |
| **ISSUE** | Verified gap with user impact |
| **BLOCKED** | Cannot verify without authorized credentials / forbidden by audit scope |
| **NOT VERIFIED** | Not exercised this audit |

**Priority:** Critical · High · Medium · Low

---

## 1. Production health

| ID | Check | Class | Priority | Evidence | User impact / recommendation |
|----|-------|-------|----------|----------|------------------------------|
| H1 | `GET /api/launch/status` | **PASS** | — | `ok: true`; env flags set; **51** tables Ready; **11** storage buckets Ready | Core platform wiring healthy |
| H2 | Supabase connectivity | **PASS** | — | Launch status reaches DB; songs table Ready | N/A |
| H3 | Storage buckets | **PASS** | — | songs, videos, covers, ringtones, etc. Ready in launch status | Upload/playback storage available |
| H4 | Public music catalog API | **PASS** | — | `GET /api/songs` → Roll Call, `plays: 1`, Production storage host | Guests can load public catalog |
| H5 | Staging Supabase ref in app | **PASS** | — | API/storage URLs use `aehuszoadgqtbkxsliyy`; songs API audio URL Production | No staging leakage in catalog payloads |
| H6 | Homepage / navigation | **PASS** | Medium | Browser snapshot @ www: search, nav, Roll Call in results, player chrome (pre-existing authenticated session) | Primary shell loads; guest shell **NOT VERIFIED** (session was signed-in) |
| H7 | Mobile vs desktop layout | **NOT VERIFIED** | Medium | No dedicated mobile viewport pass in 29A | **29B:** responsive smoke on iOS/Android viewports |
| H8 | API error rates / server logs | **NOT VERIFIED** | Low | Vercel log drain not inspected | **29B:** owner dashboard log sample during first creator upload |
| H9 | Registration / auth flows | **BLOCKED** | High | No new accounts; no password operations | **29B:** scripted signup smoke with disposable test account **or** owner-led invite only |
| H10 | Deployment health post-28M | **PASS** | — | Phase 28M: `dpl_JEEXdXHKsvq7UqowNCr2Xv7xDRB2`, Ready, www aliases | N/A |

---

## 2. Artist experience

| ID | Check | Class | Priority | Evidence | User impact / recommendation |
|----|-------|-------|----------|----------|------------------------------|
| A1 | Artist Dashboard / Studio UI | **NOT VERIFIED** | High | Requires approved **artist** session; not opened in 29A | **29B:** owner-accompanied walkthrough of first artist upload |
| A2 | Upload Song API auth | **PASS** | — | Guest `POST /api/upload-audio` → **400** (empty body); publication required when exercised on Preview in Phase 28G | Guests cannot silently upload |
| A3 | Publication modes (draft / public / ringtone) | **PASS** | Medium | `parseSongUsageFromBody` + `publicationMode` in upload route @ `ee67536` | Creators must choose publication; **29B:** confirm UI exposes choice clearly |
| A4 | Cover artwork | **NOT VERIFIED** | Medium | No live upload | **29B:** first upload includes cover path |
| A5 | Public catalog visibility | **PASS** | Low | Only `streaming_enabled=true` in public API; 1 public song | New public uploads should appear after publish; drafts hidden server-side post-28M RLS |
| A6 | Creator insights / play counts | **ISSUE** | Medium | Server durable play active (Roll Call `plays: 1`); client uses `persistQualifiedSongPlay` after successful `audio.play()` @ `ee67536` | Studio metrics may still diverge if play API fails silently (`ok: false`); **29B:** verify insights after one real play in Studio |
| A7 | Upload Album / Video / Podcast Studio | **NOT VERIFIED** | High | No authenticated creator session | **29B:** phase-scoped upload matrix (music first) |

---

## 3. Producer experience

| ID | Check | Class | Priority | Evidence | User impact / recommendation |
|----|-------|-------|----------|----------|------------------------------|
| P1 | Producer Dashboard / Studio | **NOT VERIFIED** | High | No producer session | **29B:** same controlled wave as artists or defer producer invites |
| P2 | Producer credit / beats | **NOT VERIFIED** | Medium | Codebase supports `producer_beats`; Production count not audited live | Verify on first producer signup |
| P3 | Public discovery | **PASS** | Low | Search finds Roll Call; empty beyond that | First listings need discovery UX messaging (see U3) |

---

## 4. Listener experience

| ID | Check | Class | Priority | Evidence | User impact / recommendation |
|----|-------|-------|----------|----------|------------------------------|
| L1 | Global search | **PASS** | — | www UI: query "Roll Call" → song results; catalog scope banner text present | Works for minimal catalog |
| L2 | Library search scope | **NOT VERIFIED** | Medium | Requires library saves data + auth | **29B:** listener with saves |
| L3 | Music playback | **PASS** | Medium | Phase 28M API play; client `togglePlay` calls durable persist after successful play | **29B:** one browser HTML5 play confirmation (authorized) |
| L4 | Recently played / favorites / playlists | **NOT VERIFIED** | Medium | APIs exist; no E2E | Historical Phase 20 listener matrix incomplete |
| L5 | Guest vs authenticated | **PASS** | — | Mixtape upload/playback **401** guest; subscriptions public read OK | Boundaries hold |
| L6 | Mobile player controls | **NOT VERIFIED** | Medium | No mobile device test | **29B:** mobile play/pause |

---

## 5. Other content modules

| Module | Class | Functional state | Notes |
|--------|-------|------------------|-------|
| **Music streaming catalog** | **PASS** | Fully functional (thin) | 1 public song (Roll Call) |
| **Mixtapes** | **ISSUE** | Partial | `GET /api/mixtapes` OK; categories populated; **`mixtapes: []`**, **0** published in DB; guest POST **401** |
| **Videos** | **ISSUE** | Partial / empty | `GET /api/videos` → empty array; **0** videos in DB |
| **Podcasts** | **ISSUE** | Partial / empty | `GET /api/podcasts` → minimal/empty payload |
| **Ringtones marketplace** | **PASS** (beta-locked) | Shell functional, no inventory | `ringtones: []`; `publicBetaPaidPurchaseLocked: true`; `paidCheckoutAvailable: false` |
| **Downloads / sales cart** | **NOT VERIFIED** | Beta-locked | Tables Ready in launch status; paid sales locked in code |

---

## 6. Security and monetization

| ID | Check | Class | Priority | Evidence | User impact / recommendation |
|----|-------|-------|----------|----------|------------------------------|
| S1 | Draft privacy (RLS) | **PASS** | — | Phase 28M migration; **0** draft songs on Production today; anon streaming-only policy | Future drafts protected; **29B:** spot-check first creator draft |
| S2 | Cross-user access | **NOT VERIFIED** | High | No second creator account on Production | **29B:** two-creator RLS probe after first draft exists |
| S3 | Upload authorization | **PASS** | — | Mixtape uploads **401** guest; upload-audio rejects empty guest body | N/A |
| S4 | Durable play tracking | **PASS** | — | RPC + events on Production; Roll Call `plays` 0→1 @ 28M; client persist path in `ee67536` | N/A |
| S5 | RPC failure fallback | **PASS** | — | Server: no silent in-memory fallback when RPC exists (`song-play-server.ts`) | Failed persists return 500 |
| S6 | Subscription checkout lock | **PASS** | — | `publicBetaPaidSubscriptionCheckoutLocked: true` on `/api/subscriptions`; Vercel env name present | Paid subs blocked |
| S7 | Ringtone purchase lock | **PASS** | — | Marketplace API `publicBetaPaidPurchaseLocked: true` | Purchases blocked |
| S8 | Sponsor / founding / sales locks | **PASS** | — | Vercel env: `NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED`, `NEXT_PUBLIC_FOUNDING_BETA_LOCKED`, sales lock libs in repo | Monetization not accidentally enabled |
| S9 | Creator self-signup flag | **PASS** | Low | `NEXT_PUBLIC_CREATOR_SELF_SIGNUP_ENABLED` present on Production (value not logged) | Confirm owner intent vs founding-invite flow |

---

## 7. Real-world usability

| ID | Finding | Class | Priority | Impact | Recommendation |
|----|---------|-------|----------|--------|----------------|
| U1 | Thin public catalog (1 song) | **ISSUE** | **High** | New listeners see sparse catalog; weak social proof | Onboarding copy: "founding catalog building"; **29B:** first 3–5 creator publishes |
| U2 | Empty mixtape/video/podcast surfaces | **ISSUE** | Medium | Modules feel "unfinished" | Hide or soften empty states; prioritize music path in onboarding |
| U3 | Publication choice complexity | **ISSUE** | Medium | Artists must understand draft vs public streaming | **29B:** in-app checklist + owner office hours for first upload |
| U4 | Founding / invite gating | **ISSUE** | Medium | Signup copy references founding invite (i18n) | Document invite + approval steps for each creator |
| U5 | Guest homepage shell | **NOT VERIFIED** | Medium | Only authenticated snapshot in 29A | **29B:** incognito homepage pass |
| U6 | `POST /api/upload-audio` **400** vs **401** for anonymous empty body | **ISSUE** | **Low** | Operators may misread probes | Document: use authenticated tests; optional API polish later |

---

## 8. Content inventory (Production DB, read-only)

| Asset | Count |
|-------|------:|
| Songs (total) | 1 |
| Songs (draft / non-streaming) | 0 |
| Public streaming songs | 1 |
| Videos | 0 |
| Published mixtapes | 0 |
| Roll Call plays (API) | 1 |

---

## 9. Overall verdicts

### Production stability: **CONDITIONAL**

**Strengths:** Launch/status green, storage and schema healthy, Phase 28 durable play + hardened songs RLS on Production, monetization locks active, auth boundaries on guest creator APIs.

**Gaps:** Most creator/listener workflows **not live-verified**; catalog nearly empty; several content modules are empty shells.

### Creator onboarding readiness: **CONDITIONAL YES**

Suitable for a **small, controlled** onboarding wave when:

1. Each creator is **founding-approved** (or operator-granted upload access).  
2. **Owner monitors** the first upload and first publish on Production.  
3. Scope is **Artist music upload** (+ optional Mixtape per Phase 20 playbook), not open video-creator signup or paid monetization.  
4. **29B** completes authenticated upload/playback E2E and guest homepage verification.

**Not ready** for open public creator self-serve at scale without 29B closure.

---

## 10. Recommended Phase 29B work (exact)

| # | Work item | Outcome |
|---|-----------|---------|
| **29B-1** | **Controlled Production creator E2E** — one approved artist: Upload Song (draft → public streaming), cover, confirm catalog + RLS | Closes A1, A7, S2 |
| **29B-2** | **Browser playback confirmation** — single Roll Call HTML5 play; UI count matches `GET /api/songs` | Closes L3 gap from 28M |
| **29B-3** | **Guest incognito pass** — homepage, signup entry, COMING SOON regions | Closes H9 partial, U5 |
| **29B-4** | **Creator onboarding runbook** (1–2 pages): founding invite, publication modes, who to contact | Closes U3, U4 |
| **29B-5** | **Empty-state UX review** — mixtapes/videos/podcasts with zero rows | Closes U2 |
| **29B-6** | **Mobile smoke** — search + play + nav | Closes H7, L6 |
| **29B-7** | **Optional:** Reconcile listener matrix from Phase 20 with one alternate listener account | Historical gap, non-blocking for creator wave |

**Explicitly out of scope for 29B unless owner requests:** enable paid checkout, production schema changes beyond hotfix, mass invites.

---

## 11. Audit boundaries (attestation)

| Action | Performed? |
|--------|------------|
| Production migration / deploy | **No** |
| Create accounts / upload content | **No** |
| Modify roles or data | **No** |
| Enable payments | **No** |
| Use staging Supabase on Production | **No** |

---

*End of Phase 29A audit.*