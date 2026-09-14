/**
 * Capacitor Android foundation verification (Windows-safe static checks).
 * Usage: node scripts/verify-capacitor-android-foundation.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

const pkg = JSON.parse(read("package.json"));
record("Capacitor android installed", Boolean(pkg.dependencies?.["@capacitor/android"]));
record("ios package preserved", Boolean(pkg.dependencies?.["@capacitor/ios"]));
record("ios folder preserved", existsSync(join(root, "ios")));

record("android folder", existsSync(join(root, "android")));
record("android manifest", existsSync(join(root, "android/app/src/main/AndroidManifest.xml")));
record("MainActivity", existsSync(join(root, "android/app/src/main/java/com/digitalmusicdatabase/app/MainActivity.java")));

const config = read("capacitor.config.ts");
record("production server url", config.includes("https://www.digitalmusicdatabase.com"));
record("shared app id", config.includes("com.digitalmusicdatabase.app"));

const manifest = read("android/app/src/main/AndroidManifest.xml");
record("INTERNET permission", manifest.includes("android.permission.INTERNET"));
record("no RECORD_AUDIO", !manifest.includes("RECORD_AUDIO"));
record("no CAMERA permission", !manifest.includes("CAMERA"));
record("no POST_NOTIFICATIONS", !manifest.includes("POST_NOTIFICATIONS"));

const gradle = read("android/app/build.gradle");
record("versionName 1.0.0", gradle.includes('versionName "1.0.0"'));
record("versionCode 1", gradle.includes("versionCode 1"));
record("applicationId", gradle.includes('applicationId "com.digitalmusicdatabase.app"'));

const strings = read("android/app/src/main/res/values/strings.xml");
record("app name", strings.includes("Music Data Base"));

record("launcher icon mdpi", existsSync(join(root, "android/app/src/main/res/mipmap-mdpi/ic_launcher.png")));
record("splash drawable", existsSync(join(root, "android/app/src/main/res/drawable/splash.png")));

record("blob download helper", existsSync(join(root, "lib/blob-download.ts")));
record("ringtone client uses helper", read("lib/ringtone-creator-client.ts").includes("blob-download"));

const locks = read("lib/public-beta-subscription-checkout.ts") + read("lib/public-beta-ringtone-purchase.ts") + read("lib/public-beta-sponsor-checkout.ts");
record("subscription lock documented", locks.includes("NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED"));
record("ringtone lock documented", locks.includes("NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED"));
record("sponsor lock documented", locks.includes("NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED"));

const failed = results.filter((row) => !row.ok);
console.log(`\nCapacitor Android foundation: ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
process.exit(failed.length === 0 ? 0 : 1);
