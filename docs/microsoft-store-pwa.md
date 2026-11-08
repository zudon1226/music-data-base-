# Microsoft Store — PWA packaging (Music Data Base)

Publisher: **Music Data Base LLC**  
Production origin: **https://www.digitalmusicdatabase.com**

This document covers packaging the existing web app as a **Progressive Web App (PWA)** for Microsoft Store. **Do not submit until you explicitly approve** a release that includes the PWA artifacts below on production.

## What was added in the repo

| Asset | Purpose |
|-------|---------|
| `app/manifest.ts` | Web app manifest (`display: standalone`, icons, theme) |
| `public/sw.js` | Network-only service worker (installability; no offline media/auth cache) |
| `components/pwa/register-service-worker.tsx` | Registers SW in browser; skipped in Capacitor shells |
| `public/pwa/icon-*.png` | Windows + standard PWA icon sizes (from iOS App Icon) |
| `scripts/verify-pwa-microsoft-store.mjs` | Local static readiness checks |
| `scripts/generate-pwa-icons.mjs` | Regenerate icons after branding updates |

Commerce, Supabase RLS, Apple IAP, and Android Capacitor flows are **unchanged**. Public beta commerce remains locked via existing env flags.

## PWABuilder workflow (after production deploy)

1. Open [PWABuilder](https://www.pwabuilder.com/) and enter `https://www.digitalmusicdatabase.com`.
2. Confirm **Manifest** includes name, `standalone`, `start_url`, and 192/512 icons (plus 44–310 for Store tiles).
3. Confirm **Service worker** is detected at `/sw.js` (network-only).
4. Use **Publish** → **Microsoft Store** to generate an MSIX/app package, or download the Windows packaging project.
5. Test install: app opens in its own window (not browser tab), login and playback work online.

## Partner Center (manual — your action)

1. [Microsoft Partner Center](https://partner.microsoft.com/) — account under **Music Data Base LLC**.
2. Reserve app name **Music Data Base** (or match manifest `name`).
3. Create **New product** → **PWA** / **Web app** (wording varies; link the live HTTPS URL).
4. Age rating, privacy policy URL: `https://www.digitalmusicdatabase.com/legal/privacy`
5. Support contact: `zudon1226@gmail.com` (or dedicated support email).
6. Store screenshots: capture from installed PWA on Windows (1920×1080 or sizes Partner Center requests).
7. Submit for certification after package + metadata are complete.

## Safety notes

- Service worker does **not** cache `/api/*`, Supabase responses, or streamed media.
- Offline mode is **not** a product goal; installability only.
- Subscriptions, checkout, and payouts stay disabled while public beta commerce lock is active.

## Icon refresh

```bash
node scripts/generate-pwa-icons.mjs
```

## Verification

```bash
npm run verify:pwa
npm run lint
npm run build
```

## Preview deployment plan (no production)

Use an existing Vercel **Preview** for branch `fix/storage-moderation-enforcement` (or a dedicated `pwa/ms-store-prep` branch after scoped commit). **Do not** change Production env or promote to Production until PWABuilder passes on Preview.

| Step | Action |
|------|--------|
| 1 | Scoped commit: PWA files only (`app/manifest.ts`, `lib/pwa/*`, `public/sw.js`, `public/pwa/*`, `components/pwa/*`, layout/next config deltas, `scripts/verify-pwa-microsoft-store.mjs`, docs). **No** `git add -A`. |
| 2 | Push branch → wait for Vercel Preview build (uses Preview env: `NEXT_PUBLIC_*`, Supabase staging if already configured). |
| 3 | Preview smoke: `https://<preview-host>/manifest.webmanifest`, `https://<preview-host>/sw.js`, `https://<preview-host>/pwa/icon-512.png`. |
| 4 | Edge on Windows: **Install** from Preview URL; confirm standalone window + online login/playback. |
| 5 | PWABuilder against **Preview URL** first (manifest `id` / `start_url` still target production origin — acceptable for packaging tests; switch to production URL before Store submission). |
| 6 | After Preview passes: deploy same commit to Production, then re-run PWABuilder on `https://www.digitalmusicdatabase.com`. |

**Local build note:** `npm run build` requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and related vars Vercel uses). Current `.env.local` may only carry Vercel OIDC pull token — use Vercel Preview env or `vercel env pull` to `.env.local` for local full builds.

**Dependencies:** `npm ci` from lockfile restores a complete `typescript` package (corrupted partial installs omitted `lib/typescript.js`, often on OneDrive paths). Node **v24** works; project typescript **5.9.3** requires Node `>=14.17`. ESLint may need `NODE_OPTIONS=--max-old-space-size=8192` on this machine.
