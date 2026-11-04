/**
 * Print exact xcodebuild commands for MDB iOS (does not run xcodebuild).
 * Usage: node scripts/print-apple-iap-xcode-build.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const project = join(root, "ios/App/App.xcodeproj");
const scheme = "App";

if (!existsSync(project)) {
    console.error(`Missing Xcode project: ${project}`);
    process.exit(1);
}

const q = process.platform === "win32" ? '"' : "'";
const projArg = `-project "${project.replace(/\\/g, "/")}"`;

console.log("MDB Apple IAP — Xcode build commands (run on macOS only)\n");
console.log("Preparation:");
console.log("  npm ci && npx cap sync ios");
console.log("  open ios/App/App.xcodeproj  # set Development Team for device/archive\n");

console.log("1) Simulator Debug build:");
console.log(`xcodebuild ${projArg} -scheme ${scheme} -configuration Debug \\`);
console.log(`  -destination ${q}platform=iOS Simulator,name=iPhone 16${q} \\`);
console.log(`  -derivedDataPath ios/App/build/DerivedData build\n`);

console.log("2) Generic iOS compile-only (no code signing):");
console.log(`xcodebuild ${projArg} -scheme ${scheme} -configuration Debug \\`);
console.log(`  -destination ${q}generic/platform=iOS${q} CODE_SIGNING_ALLOWED=NO \\`);
console.log(`  -derivedDataPath ios/App/build/DerivedData build\n`);

console.log("3) Release archive (requires team + signing):");
console.log(`xcodebuild ${projArg} -scheme ${scheme} -configuration Release \\`);
console.log(`  -destination ${q}generic/platform=iOS${q} \\`);
console.log(`  -archivePath ios/App/build/MDB-App.xcarchive archive\n`);

console.log("Success = log contains ** BUILD SUCCEEDED ** or archive succeeded.");
console.log("This script did NOT invoke xcodebuild.");
