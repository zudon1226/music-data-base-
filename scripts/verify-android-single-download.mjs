#!/usr/bin/env node
/**
 * Android single-download click contract (no JSON / no second file / no signed URL).
 * Run: node scripts/verify-android-single-download.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
const client = read("lib/ringtone-marketplace-client.ts");
const route = read("app/api/ringtones/[id]/download/route.ts");

record("downloadLockRef present", marketUi.includes("downloadLockRef"));
record("android branch calls downloadAndroidRingtoneAudio once", marketUi.includes("downloadAndroidRingtoneAudio({"));
record("android branch triggers one browser audio download", marketUi.includes("triggerBrowserAudioDownload(result.blob, result.filename)"));
record(
    "android branch does not window.open signed URL",
    /deviceType === \"android\"[\s\S]*?return;[\s\S]*?downloadPurchasedRingtone/.test(marketUi)
        && !/deviceType === \"android\"[\s\S]{0,900}window\.open/.test(marketUi),
);
record(
    "android client rejects unexpected JSON body",
    client.includes("UNEXPECTED_JSON_DOWNLOAD")
        && client.includes('contentType.includes("application/json")'),
);
record(
    "android client does not create JSON Blob download",
    !client.includes('new Blob([JSON.stringify')
        && !/android[\s\S]{0,200}application\/json/.test(client.replace("UNEXPECTED_JSON_DOWNLOAD", "")),
);
record("no -android.json filename construction", !marketUi.includes("-android.json") && !client.includes("-android.json") && !route.includes("-android.json"));
record("install guide is UI-only (not a file download)", marketUi.includes("setInstallGuide") && !marketUi.includes("installation.json"));
record("iphone still uses downloadPurchasedRingtone + window.open", marketUi.includes("downloadPurchasedRingtone") && marketUi.includes("window.open(signedUrl"));
record("purchase auth gate unchanged", route.includes("PURCHASE_REQUIRED") && route.includes("buyerHasPaidRingtonePurchase"));
record("download row insert remains single path", (route.match(/ringtone_downloads\"\)\.insert/g) || []).length === 1);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nANDROID_SINGLE_DOWNLOAD_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
