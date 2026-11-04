# MDB iOS — Mac build procedure (Apple IAP)

**Compile status:** not verified until Mac log shows `** BUILD SUCCEEDED **`.

## 1. Machine requirements

- macOS with **Xcode 16.x** (scheme `LastUpgradeVersion = 1640`)
- Apple Developer account (for device / archive)
- Node.js LTS matching repo

## 2. One-time setup

```bash
cd /path/to/music-data-base-storage-fix
npm ci
```

Open Xcode once and accept license / install iOS platform if prompted.

## 3. Sync Capacitor iOS

```bash
npm run build          # if your workflow requires fresh web assets in www/
npx cap sync ios
```

Optional (preview QA only, do not commit without approval): set `server.url` in `capacitor.config.ts` to Vercel Preview HTTPS, then `npx cap sync ios` again.

## 4. Signing

```bash
open ios/App/App.xcodeproj
```

Target **App** → **Signing & Capabilities** → **Team** (not stored in git).  
Bundle ID must remain **`com.digitalmusicdatabase.app`**.

## 5. Build commands

Print copy-paste commands:

```bash
node scripts/print-apple-iap-xcode-build.mjs
```

**Recommended first compile check (Simulator):**

```bash
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath ios/App/build/DerivedData \
  build 2>&1 | tee ios/App/build/xcodebuild-simulator.log
```

**Compile-only (no signing):**

```bash
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  CODE_SIGNING_ALLOWED=NO \
  -derivedDataPath ios/App/build/DerivedData \
  build 2>&1 | tee ios/App/build/xcodebuild-generic.log
```

## 6. Verify success

```bash
grep "BUILD SUCCEEDED" ios/App/build/xcodebuild-*.log
```

Store logs for pre-launch sign-off.

## 7. Run on device

Use Xcode **Run** with sandbox Apple ID on device, or archive + TestFlight internal.

## 8. Static checks (any OS)

```bash
npm run verify:apple-iap
npm run verify:capacitor-ios
```

### Capacitor verifier note (not an iOS compile blocker)

`verify:capacitor-ios` may report **2/27** failures when the repo includes **`@capacitor/android`** and an **`android/`** folder (iOS-only policy checks). **All StoreKit / Xcode / bridge checks still pass.** Failures are:

- `No Capacitor android package` — fails if `@capacitor/android` is listed in `package.json`
- `android folder absent` — fails if `android/` exists

These are unrelated to `MDBStoreKitPlugin` compilation. **iOS sign-off uses `xcodebuild` success + `verify:apple-iap`.**

## 9. Canonical Xcode command (copy-paste)

```bash
cd /path/to/music-data-base-storage-fix
npm ci && npx cap sync ios
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath ios/App/build/DerivedData \
  build 2>&1 | tee ios/App/build/xcodebuild-simulator.log
grep 'BUILD SUCCEEDED' ios/App/build/xcodebuild-simulator.log
```

See also [apple-iap-ios-xcode-handoff.md](./apple-iap-ios-xcode-handoff.md).
