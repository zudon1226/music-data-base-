# iOS Capacitor wrapper (remote production web app)

## Architecture

- **Native shell:** Capacitor 8 iOS project under `ios/`.
- **Runtime:** WKWebView loads the live Next.js site (no static export embed).
- **Production URL:** `https://www.digitalmusicdatabase.com` (`capacitor.config.ts` → `server.url`).
- **Bundle ID (placeholder, not registered with Apple yet):** `com.digitalmusicdatabase.app`
- **Marketing version / build:** `1.0.0` / `1`

## macOS / Xcode workflow (not run on Windows)

```bash
npm install
npm run cap:sync
open ios/App/App.xcodeproj   # or App.xcworkspace if using CocoaPods later
```

Archive and upload to TestFlight from Xcode after App ID, certificates, and icons are configured.

## Native-web integration (audit)

| Area | Expected in wrapper | Notes |
|------|---------------------|--------|
| Signup / login | PASS | Supabase auth in WKWebView; verify cookie/session persistence on device. |
| File uploads | PASS* | Uses `<input type="file">`; iOS may prompt for photo library (`NSPhotoLibraryUsageDescription`). Large audio may use document picker. |
| Audio playback | PASS* | HTML5 `<audio>` in web app; **no background audio** configured yet. |
| Video playback | PASS* | `<video playsInline>`; inline OK; PiP/background not configured. |
| Ringtone creation | PASS* | Web UI + APIs; file uploads as above; ffmpeg processing is server-side. |
| Personal ringtone download | PASS* | Anchor download; may need future `@capacitor/filesystem` / Share if iOS blocks downloads. |
| Support / feedback | PASS | Same web UI + APIs. |
| Global language | PASS | Web i18n unchanged. |
| Account deletion | PASS | Profile flow + `/api/account/delete` on production. |
| Deep links | FAIL (future) | In-app routing only; no Universal Links / associated domains yet. |

\* = likely works in WKWebView; confirm on physical device during TestFlight QA.

## Browser-only APIs (future Capacitor plugins, not in this task)

- Background audio + lock-screen controls (if product requires playback while app is backgrounded).
- Native file picker polish (`@capacitor/camera` only if camera capture is added; currently file picker only).
- Push notifications (no web push / APNs in repo).
- Universal Links for `/podcast/*`, magic links, etc.

## Background audio recommendation

The web player uses in-page HTML5 audio without `Media Session API` or iOS `UIBackgroundModes` `audio`. **Do not enable background audio in this wrapper yet.** Users expect continuous playback when switching apps only after a deliberate native or Capacitor media session phase. Enabling `UIBackgroundModes` without a native audio pipeline does not reliably keep WKWebView audio alive.

## App icon

Repository has **no committed square PNG logo** (`/music-data-base-logo.png` is referenced in web metadata but not present under `public/`). Replace Capacitor default `AppIcon` assets on macOS before App Store submission.

## Payment / beta locks

Unchanged by this wrapper. Production env continues to control subscription, ringtone, and sponsor checkout locks; Stripe remains TEST per deployment config.
