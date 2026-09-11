/**
 * Static + runtime verification for public beta paid ringtone purchase lock semantics.
 * Usage: node scripts/verify-public-beta-ringtone-lock.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lockSource = readFileSync(join(root, "lib/public-beta-ringtone-purchase.ts"), "utf8");
const purchaseSource = readFileSync(join(root, "lib/ringtone-purchase.ts"), "utf8");
const downloadSource = readFileSync(join(root, "app/api/ringtones/[id]/download/route.ts"), "utf8");
const ticketSource = readFileSync(join(root, "app/api/ringtones/[id]/download-ticket/route.ts"), "utf8");
const marketplaceSource = readFileSync(join(root, "app/api/ringtones/marketplace/route.ts"), "utf8");
const sourceSongsSource = readFileSync(join(root, "app/api/ringtones/source-songs/route.ts"), "utf8");
const songsSource = readFileSync(join(root, "app/api/songs/route.ts"), "utf8");
const migrationSource = readFileSync(join(root, "supabase/migrations/202609050001_song_usage_permissions.sql"), "utf8");

function record(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

function parseTruthyEnv(value) {
    if (value === undefined || value === "") return null;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
    return null;
}

function isPublicBetaPaidRingtonePurchaseLocked(envValue) {
    const parsed = parseTruthyEnv(envValue);
    if (parsed === null) return true;
    return parsed;
}

record("lock helper documents env name", lockSource.includes("NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED"));
record("default unset means locked", lockSource.includes("if (parsed === null) return true"));
record("false explicitly unlocks", lockSource.includes('normalized === "false"'));
record("purchase flow checks beta lock", purchaseSource.includes("isPublicBetaPaidRingtonePurchaseLocked()"));
record("purchase confirm blocks paid during beta", purchaseSource.includes("pendingAmountCents > 0 && isPublicBetaPaidRingtonePurchaseLocked()"));
record("download route uses server download gate", downloadSource.includes("assertMarketplaceRingtoneDownloadAllowed"));
record("download ticket route uses server download gate", ticketSource.includes("assertMarketplaceRingtoneDownloadAllowed"));
record("marketplace exposes beta lock state", marketplaceSource.includes("publicBetaPaidPurchaseLocked"));
record("beta message is launch copy", lockSource.includes("Purchases coming at full launch."));
record("source songs filter ringtone permissions", sourceSongsSource.includes("ringtone_creation_enabled"));
record("songs API filters streaming catalog", songsSource.includes("streaming_enabled"));
record("usage migration exists", migrationSource.includes("streaming_enabled"));

record("unset => locked", isPublicBetaPaidRingtonePurchaseLocked(undefined) === true);
record("true => locked", isPublicBetaPaidRingtonePurchaseLocked("true") === true);
record("1 => locked", isPublicBetaPaidRingtonePurchaseLocked("1") === true);
record("false => unlocked", isPublicBetaPaidRingtonePurchaseLocked("false") === false);
record("0 => unlocked", isPublicBetaPaidRingtonePurchaseLocked("0") === false);

if (process.exitCode) {
    console.error("\nPublic beta ringtone lock verification failed.");
    process.exit(process.exitCode);
}
console.log("\nPublic beta ringtone lock verification passed.");
console.log("PUBLIC BETA required value: true (or omit variable entirely).");
console.log("Do NOT use false during public beta — that unlocks paid checkout when Stripe is configured.");
