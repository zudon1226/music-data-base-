# Phase 29C — Preview Deployment and Founding Creator Acceptance

**Date:** 2026-11-23  
**Branch:** `release/pwa-microsoft-store`  
**Preview project:** `music-data-base-pwa-clean-git-baseline-recovered`  
**Production project:** `music-data-base` (www — **not** promoted)  
**Production runtime (baseline):** `ee675362803ccd0b0f3b42e21a8a90be02bc7812`  
**Production Supabase:** `aehuszoadgqtbkxsliyy`  
**Preview Supabase:** `jzlegcbotqfzevtczwhx`

Prior: [PHASE29B_FEATURE_NAVIGATION_REPORT.md](./PHASE29B_FEATURE_NAVIGATION_REPORT.md)

---

## Verdict: **CONDITIONAL**

Preview is **Ready** on Phase 29B+ commits with staging Supabase and payment locks intact. Six guest discovery routes return **HTTP 200** via `vercel curl`. **Guest upload application 401** is verified on **local runtime** matching commit `552b927`; Preview **POST** probes are **inconclusive** when `vercel curl` TLS fails and plain `fetch` hits **Vercel Deployment Protection**. **Artist Production E2E** was **not executed** (no authorized session or approved original asset). **Mobile UI** and **true incognito browser** acceptance on Preview remain **owner-required** (Deployment Protection + browser SSO).

**Founding creator onboarding:** **CONDITIONAL** — proceed only after owner UI pass on Preview and Artist E2E on Production or Preview with authorized credentials.

---

## 1. Repository and commit verification

### Git state

| Item | Value |
|------|-------|
| Branch | `release/pwa-microsoft-store` |
| HEAD | `17a676e` (docs + smoke script; includes `fd976c6` i18n + `552b927` / `443bef9`) |
| `552b927` | **Present** — Phase 29B implementation |
| `443bef9` | **Present** — 29B doc hash |
| Unrelated WIP | Preserved unstaged (album/billing scripts, etc.) |

### `552b927` scope (16 files, +781 / −95)

Core: `lib/public-guest-discovery.ts`, guest nav components/CSS, `app/music|videos|ringtones/page.tsx`, `app/page.tsx`, empty states, `upload-audio` auth order, verifiers, 29B docs.

### Static checks

| Script | Result |
|--------|--------|
| `verify-guest-public-discovery-nav.mjs` | **PASS** |
| `verify-podcast-guest-navigation.mjs` | **PASS** |
| `verify-upload-audio-save-metadata-auth-order.mjs` | **PASS** |
| ESLint (29B TS paths) | **PASS** (prior run) |
| `tsc --noEmit` | **PASS** (after `fd976c6` locale keys) |

---

## 2. Preview deployment

| Field | Value |
|-------|-------|
| **Deployment ID** | `dpl_DZN8Vro19xZtXuYF4HQPonp8HaD5` |
| **Preview URL** | https://music-data-base-pwa-clean-git-baseline-recovered-62gudnplq.vercel.app |
| Prior Preview | `dpl_HLDS5mo64h2NGsqsWNP76Yayifyo` (`87wa50fw8`) — also Ready @ `552b927` era |
| Status | **Ready** (~1m build, auto from git push) |
| Target | **preview** only |
| Trigger | Git push `release/pwa-microsoft-store` |

### Staging Supabase (confirmed)

`vercel curl …/api/songs` → `audio_url` host **`jzlegcbotqfzevtczwhx.supabase.co`** (staging catalog, not Production Roll Call).

### Payment locks (Preview API)

```text
publicBetaPaidPurchaseLocked: true
paidCheckoutAvailable: false
paymentMode: safely-disabled
```

### Production protection

| Check | Result |
|-------|--------|
| `vercel deploy --prod` in 29C | **Not run** |
| www `GET /api/songs` | **Roll Call**, `plays: 1`, `aehuszoadgqtbkxsliyy` |
| www ringtone marketplace | **Locks on** (prior probe) |
| Production project deploy list | Latest prod Ready; no 29B promote |

---

## 3. Guest authentication and routes

### HTTP route matrix (`vercel curl`, signed-out transport)

| Route | Status |
|-------|--------|
| `/` | **200** |
| `/music` | **200** |
| `/videos` | **200** |
| `/ringtones` | **200** |
| `/mixtapes` | **200** |
| `/podcast` | **200** |

### Guest `POST /api/upload-audio`

| Context | `{}` body | Empty body |
|---------|-----------|------------|
| **Local** `http://localhost:3010` (runtime @ `552b927`) | **401** `You must log in again before saving song metadata.` | **401** (same) |
| **Preview** plain `fetch` | **401** Vercel Deployment Protection envelope (not app) |
| **Preview** `vercel curl` POST | Transport / parse **inconclusive** (curl 56 / 400 in harness) |

**Code contract:** `552b927` runs `requireAudioUploadUser` before publication/`storagePath` checks — **PASS** per verifier + local API.

**Browser guest session (signed-out):**

| Attempt | Outcome |
|---------|---------|
| Preview URL in browser | Redirect to **vercel.com/login** (Deployment Protection) — **not** a guest app session |
| Local `next dev` @3010 | **Production browser identity** error when `.env.local` ≠ staging preview flags — page error overlay |

**Conclusion:** Six-route **shell** delivery is verified on Preview via `vercel curl`. **Nav pills, active state, Library isolation** require owner session with Protection bypass or SSO-authenticated Preview visit.

---

## 4. Mobile acceptance

| Test | Result |
|------|--------|
| iPhone ~390px horizontal nav | **NOT VERIFIED** (browser blocked as above) |
| Android ~412px | **NOT VERIFIED** |
| No page-wide overflow | **NOT VERIFIED** |
| Ringtone Beta pill | Implemented in code @ `isPublicBetaPaidRingtonePurchaseLocked()` — **UI not verified** |

CSS intent: `guest-public-discovery-nav--horizontal` scroller, 40px touch targets, green `aria-current` (see 29B report).

---

## 5. Creator acceptance (Artist Production E2E)

| Step | Result |
|------|--------|
| Artist Studio → draft → publish → play → dashboard | **BLOCKED** |
| Blocker | No owner-authorized **Production** Artist browser session and no approved **original** upload asset supplied in this run |
| Credentials / roles | **Not** created, changed, or invented |
| Production catalog | **Unchanged** (Roll Call only) |

**Do not claim Artist E2E passed.**

---

## 6. Production stability (read-only)

| Asset | State |
|-------|--------|
| Roll Call `497b9cfd-…` | `plays: 1`, `streaming_enabled: true` |
| Runtime baseline | Documented **`ee67536`** on www (29B **not** on Production) |
| DB / uploads / roles | **No** 29C mutations |

---

## 7. Evidence and artifacts

| Artifact | Location |
|----------|----------|
| Preview inspector | `vercel inspect dpl_DZN8Vro19xZtXuYF4HQPonp8HaD5` |
| Route smoke | `scripts/verify-phase29c-public-navigation-preview.mjs` |
| Upload probe | `scripts/probe-preview-guest-upload-auth.mjs` (Preview POST fragile) |
| Local upload 401 | Documented in §3 (node `fetch` to localhost) |

**Screenshots:** None — Preview browser blocked by Vercel SSO; local dev blocked by browser identity gate.

---

## 8. Remaining blockers

1. **Disable or bypass Vercel Deployment Protection** for a short Preview QA window (or use team SSO) — validate six-link nav, `aria-current`, mobile scroll, empty states, ringtone Beta copy.
2. **Artist Production E2E** with owner-approved asset and session.
3. **Promote to Production** only after Preview UI sign-off (separate phase; **not** done here).

---

## 9. Commit reference (29C line)

| Commit | Role |
|--------|------|
| `552b927bddeebe8017f2ae499774cbc91a855b19` | 29B implementation |
| `443bef94456a0792ae2492fa612740591a3b5219` | 29B doc |
| `fd976c669889f442e3544d688f62f476f5f8d6dc` | i18n locale keys (Preview build) |
| `17a676e` | 29C acceptance + smoke script (prior doc) |

---

## Sign-off matrix

| Label | Meaning |
|-------|---------|
| **READY FOR FOUNDING CREATOR ONBOARDING** | After Preview UI QA + Artist E2E |
| **CONDITIONAL** | **Current** — deploy + API smoke OK; UI + Artist blocked |
| **NO-GO** | If owner finds broken nav or auth regression after bypass |