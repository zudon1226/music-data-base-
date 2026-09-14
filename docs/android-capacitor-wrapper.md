# Android Capacitor wrapper (remote production web app)

## Architecture

- **Native shell:** Capacitor 8 Android project under `android/`.
- **Runtime:** WebView loads `https://www.digitalmusicdatabase.com` (`capacitor.config.ts` → `server.url`).
- **Package ID:** `com.digitalmusicdatabase.app`
- **Version:** `1.0.0` (versionCode `1`)
- **iOS:** Unchanged under `ios/`; shared config in `capacitor.config.ts` only.

## Windows workflow

```bash
npm install
npm run build
npm run cap:sync:android
cd android && .\gradlew.bat assembleDebug
```

Release AAB/signing is done in Play Console / Android Studio (not automated here).

## Android permissions (manifest)

| Permission | Why |
|------------|-----|
| `INTERNET` | Required to load the production web app and call Supabase/APIs. |

No camera, microphone, notification, or broad storage permissions: uploads use the system file picker (`<input type="file">`); no push notifications in the web app; no in-browser recording APIs.

## File / media compatibility (audit)

| Feature | Wrapper expectation | Android notes |
|---------|---------------------|---------------|
| Signup / login | PASS | Supabase session in WebView; verify on device. |
| Song / video / podcast upload | PASS* | File picker; large files depend on network. |
| Image / support screenshot | PASS* | Same file picker. |
| Audio / video playback | PASS* | HTML5 `<audio>` / `<video playsInline>`; inline playback. |
| Personal ringtone creation | PASS* | Web UI + server APIs; 30s rules enforced server-side. |
| Personal ringtone download | PASS* | Authenticated POST stream → blob; `lib/blob-download.ts` anchor + Android WebView fallback. Server: `assertPersonalRingtoneDownloadAllowed`, beta purchase locks unchanged. |
| Support / feedback | PASS | Existing web flow. |
| Account deletion | PASS | `/api/account/delete` on production. |
| Global language | PASS | Web i18n. |

\* Confirm on a physical device during internal testing.

## Personal ringtone download (no checkout bypass)

Server route `POST /api/ringtones/[id]/download`:

- Requires authenticated user matching `userId`.
- Personal ringtones: `assertPersonalRingtoneDownloadAllowed` (owner, allowed source song, clip limits).
- Marketplace ringtones: paid purchase + `assertMarketplaceRingtoneDownloadAllowed` (beta locks apply).
- Does not create Stripe charges or marketplace purchases on download.

## Background audio

**NEEDS NATIVE FOLLOW-UP** — Web HTML5 audio does not declare Android foreground service or media session. Playback is expected to **pause** when the app is backgrounded or the screen locks until a native/Capacitor media session phase is added. Current web playback is unchanged.

## Branding assets

Launcher icons and splash screens generated from `public/music-data-base-logo.png` (same source as iOS). Regenerate:

```bash
mkdir -p resources
cp public/music-data-base-logo.png resources/icon.png
cp public/music-data-base-logo.png resources/splash.png
npx @capacitor/assets generate --android
```

## Google Play readiness (repo evidence — not submitted)

| Item | Status |
|------|--------|
| Privacy policy URL | `https://www.digitalmusicdatabase.com/legal/privacy` (`lib/legal-policies.ts`) |
| Terms URL | `/legal/terms` |
| Account deletion | In-app Profile flow + API |
| Support / feedback | `SupportReportPanel` + tickets API |
| Content moderation | DMCA / trust policies; moderation tooling in platform |
| User-generated content | Creator uploads; policies documented |
| Package ID | `com.digitalmusicdatabase.app` |
| Version name / code | `1.0.0` / `1` |
| App icon | Generated under `android/app/src/main/res/mipmap-*` |
| Feature graphic | **Required in Play Console** (1024×500) — not in repo |
| Phone/tablet screenshots | **Required in Play Console** — capture from app |
| Data Safety form | Manual: account, email, UGC, crash/support data; no sale stated in privacy policy text |
| Content rating | Manual questionnaire (UGC, login, music/video) |
| Signing / AAB | **Not produced** until Play App Signing configured |

## Payment / beta locks

Unchanged. Production env controls subscription, ringtone, and sponsor checkout locks; Stripe remains TEST per deployment documentation.
