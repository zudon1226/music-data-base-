/**
 * Capacitor iOS foundation verification (Windows-safe static checks).
 * Usage: node scripts/verify-capacitor-ios-foundation.mjs
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
record("Capacitor core installed", Boolean(pkg.dependencies?.["@capacitor/core"]));
record("Capacitor cli installed", Boolean(pkg.dependencies?.["@capacitor/cli"]));
record("Capacitor ios installed", Boolean(pkg.dependencies?.["@capacitor/ios"]));
record("No Capacitor android package", !pkg.dependencies?.["@capacitor/android"]);

record("capacitor.config.ts exists", existsSync(join(root, "capacitor.config.ts")));
const config = read("capacitor.config.ts");
record("production server url", config.includes("https://www.digitalmusicdatabase.com"));
record("bundle id candidate", config.includes("com.digitalmusicdatabase.app"));
record("app name", config.includes("Music Data Base"));

record("ios folder", existsSync(join(root, "ios")));
record("Xcode project", existsSync(join(root, "ios/App/App.xcodeproj/project.pbxproj")));
record("Info.plist", existsSync(join(root, "ios/App/App/Info.plist")));
record("android folder absent", !existsSync(join(root, "android")));

const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
record("marketing version 1.0.0", pbx.includes("MARKETING_VERSION = 1.0.0"));
record("build number 1", pbx.includes("CURRENT_PROJECT_VERSION = 1"));
record("bundle identifier in project", pbx.includes("PRODUCT_BUNDLE_IDENTIFIER = com.digitalmusicdatabase.app"));

const plist = read("ios/App/App/Info.plist");
record("photo library permission", plist.includes("NSPhotoLibraryUsageDescription"));
record("no microphone permission yet", !plist.includes("NSMicrophoneUsageDescription"));
record("no camera permission yet", !plist.includes("NSCameraUsageDescription"));
record("no background audio mode yet", !plist.includes("UIBackgroundModes"));

const locks = read("lib/public-beta-subscription-checkout.ts") + read("lib/public-beta-ringtone-purchase.ts") + read("lib/public-beta-sponsor-checkout.ts");
record("subscription lock env documented", locks.includes("NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED"));
record("ringtone lock env documented", locks.includes("NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED"));
record("sponsor lock env documented", locks.includes("NEXT_PUBLIC_PUBLIC_BETA_SPONSOR_CHECKOUT_LOCKED"));

const logoCandidates = ["public/music-data-base-logo.png", "www/music-data-base-logo.png"];
const hasLogoSource = logoCandidates.some((rel) => existsSync(join(root, rel)));
const hasIosIcon = existsSync(join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
record("app icon source in repo", hasLogoSource, hasLogoSource ? "" : "APP ICON SOURCE REQUIRED");
record("ios app icon asset file", hasIosIcon);

const failed = results.filter((row) => !row.ok);
console.log(`\nCapacitor iOS foundation: ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
if (!hasLogoSource) {
    console.log("APP ICON SOURCE REQUIRED — add square logo before App Store icon generation.");
}
process.exit(failed.length === 0 ? 0 : 1);
