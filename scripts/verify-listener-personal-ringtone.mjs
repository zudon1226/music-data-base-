/**
 * Static verification for listener personal ringtone from library.
 * Usage: node scripts/verify-listener-personal-ringtone.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

function record(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const migration = read("supabase/migrations/202609131200_listener_personal_ringtones.sql");
const personalAccess = read("lib/personal-ringtone-access.ts");
const ringtoneAccess = read("lib/ringtone-access.ts");
const resolved = read("lib/resolved-account-role.ts");
const sourceSongs = read("app/api/ringtones/source-songs/route.ts");
const postRoute = read("app/api/ringtones/route.ts");
const downloadRoute = read("app/api/ringtones/[id]/download/route.ts");
const marketplace = read("app/api/ringtones/marketplace/route.ts");
const jobs = read("lib/ringtone-jobs.ts");
const salePerm = read("lib/ringtone-sale-permissions.ts");
const nav = read("lib/role-based-navigation.ts");
const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
const en = read("lib/i18n/messages/en.ts");

record("migration adds is_personal", migration.includes("is_personal"));
record("migration personal marketplace guard", migration.includes("ringtone_products_personal_marketplace_guard"));
record("canPersonalRingtones capability", resolved.includes("canPersonalRingtones"));
record("listener-only personal flag", resolved.includes("canPersonalRingtones: !isCreator"));
record("library source assert", personalAccess.includes("library_saves"));
record("ringtone_creation permission in library assert", personalAccess.includes("songAllowsRingtoneCreation"));
record("assertAuthorizedSourceSong", ringtoneAccess.includes("assertAuthorizedSourceSong"));
record("source-songs library mode", sourceSongs.includes('mode: "library"'));
record("POST sets is_personal", postRoute.includes("is_personal: isPersonal"));
record("POST blocks personal upload source", postRoute.includes("LIBRARY_REQUIRED"));
record("sale permission helper", salePerm.includes("ringtone_sale_enabled"));
record("create price sale check", postRoute.includes("assertSourceSongAllowsRingtoneSale"));
record("marketplace excludes personal", marketplace.includes('eq("is_personal", false)'));
record("personal download gate", downloadRoute.includes("assertPersonalRingtoneDownloadAllowed"));
record("personal processing status approved", jobs.includes('personal ? "approved"'));
record("nav personal ringtones view", nav.includes("canPersonalRingtones"));
record("workspace personal mode", workspace.includes("data-ringtone-personal"));
record("i18n personal keys", en.includes("personalRingtonesTitle"));

const personalKeys = [
    "personalRingtonesTitle",
    "personalSubtitle",
    "personalNoSaleHint",
    "createPersonalRingtone",
    "creatingPersonal",
    "personalReady",
    "personalCreateFailed",
    "noLibrarySongs",
    "downloadPersonalAndroid",
    "downloadPersonalIphone",
    "personalBadge",
];
const messagesDir = join(root, "lib/i18n/messages");
let localeMissing = 0;
for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith(".ts") || file === "index.ts") continue;
    const text = readFileSync(join(messagesDir, file), "utf8");
    for (const key of personalKeys) {
        if (!text.includes(`${key}:`)) {
            localeMissing += 1;
            record(`i18n ${file} missing ${key}`, false);
        }
    }
}
record("GLOBAL LANGUAGE structural keys", localeMissing === 0, localeMissing ? `${localeMissing} missing entries` : "");

if (process.exitCode) {
    console.error("\nListener personal ringtone verification failed.");
} else {
    console.log("\nListener personal ringtone static verification passed.");
}
