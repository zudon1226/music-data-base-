# MDB Production-first development and testing

**Effective:** 2026-11-23  
**Production:** https://www.digitalmusicdatabase.com  
**Staging Supabase:** `jzlegcbotqfzevtczwhx` (development / Preview only)  
**Production Supabase:** `aehuszoadgqtbkxsliyy`

## Policy

Production is the **primary acceptance environment**. Features are not “done” until they pass on **www.digitalmusicdatabase.com** on desktop and mobile browsers (and the Capacitor wrapper when relevant).

Preview and staging exist to **isolate risk** — not to replace Production sign-off.

## Required workflow

| Step | Action |
|------|--------|
| 1 | Complete feature in repo (`music-data-base-pwa-clean-git-baseline-recovered`, branch `release/pwa-microsoft-store` unless redirected). |
| 2 | Run automated verify scripts for the touched area. |
| 3 | Review migrations, grants, and RLS before Production apply. |
| 4 | Review changed files; exclude unrelated WIP from the release commit/deploy. |
| 5 | Deploy **verified** commit to **Production**. |
| 6 | Probe live Production (`/api/launch/status`, feature APIs). |
| 7 | Owner/device pass: desktop Chrome, iPhone Safari, Android Chrome. |
| 8 | Record deployment id/SHA, probe results, and open issues. |

## Staging rules

- Do **not** infer Production behavior from staging-only rows (e.g. ringtones published only on staging).
- All devices under test should use **`https://www.digitalmusicdatabase.com`** unless a one-off experiment is explicitly documented.
- After Production verification passes for a SHA, **do not** require a full duplicate matrix on Preview.

## Safety

- Beta locks stay on: paid ringtone checkout, paid subscriptions, sales checkout (env defaults).
- Free ringtone **acquisition** is allowed; **download** requires a purchase/entitlement row (including $0 “free acquisition”).
- No staging→Production data copy for catalog rows; creators publish on Production through normal UI.
- Roll back by redeploying the previous Production deployment if needed.

## Android / iOS store app note

`capacitor.config.ts` loads **`https://www.digitalmusicdatabase.com`**. Store builds therefore follow Production automatically; they do **not** load Vercel Preview URLs.

## Cursor rule

Persistent agent guidance: `.cursor/rules/production-first-workflow.mdc`

## Current priority

**Production ringtone download acceptance** — see `docs/release/phase29/PRODUCTION_RINGTONE_DOWNLOAD_ACCEPTANCE.md`.