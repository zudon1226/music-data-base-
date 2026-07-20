#!/usr/bin/env node
/**
 * iPhone single-request download click contract (one ticket + one audio GET).
 * Run: node scripts/verify-iphone-single-download.mjs
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
const ticketIssue = read("app/api/ringtones/[id]/download-ticket/route.ts");
const ticketGet = read("app/api/ringtones/download/[ticket]/route.ts");
const androidRoute = read("app/api/ringtones/[id]/download/route.ts");

record("downloadLockRef still present", marketUi.includes("downloadLockRef"));
record(
    "iphone calls startIphoneSecureRingtoneDownload once",
    (marketUi.match(/startIphoneSecureRingtoneDownload\(/g) || []).length === 1,
);
record(
    "iphone helper requests one download-ticket",
    (client.match(/\/download-ticket/g) || []).length === 1,
);
record(
    "iphone navigates one ticket URL",
    client.includes("location.replace(downloadUrl)")
        && (client.match(/location\.replace\(downloadUrl\)/g) || []).length === 1,
);
record("no signedUrl handling in marketplace UI", !marketUi.includes("signedUrl") && !marketUi.includes("downloadPurchasedRingtone"));
record("no JSON Blob construction for download", !client.includes("new Blob([JSON.stringify") && !marketUi.includes("iphone.json"));
record("install guide remains UI-only with GarageBand steps", marketUi.includes("Open GarageBand") && marketUi.includes("setInstallGuide"));
record(
    "android helper untouched marker",
    client.includes("Android: one POST to the secure download endpoint")
        && client.includes('deviceType: "android"')
        && client.includes("export async function downloadAndroidRingtoneAudio"),
);
record(
    "android route still has single download log insert",
    (androidRoute.match(/ringtone_downloads\"\)\.insert/g) || []).length === 1,
);
record(
    "ticket GET counts download once after consume",
    ticketGet.includes("ringtone_downloads\")\.insert")
        && ticketGet.includes('device_type: "iphone"'),
);
record("ticket issue does not insert download log", !ticketIssue.includes("ringtone_downloads"));

const iphoneClickBody = (() => {
    const start = marketUi.indexOf("// iPhone:");
    if (start < 0) return "";
    const end = marketUi.indexOf("function renderMarketplaceCard", start);
    return end > start ? marketUi.slice(start, end) : marketUi.slice(start, start + 2000);
})();

record(
    "iphone click does not use post-await blob trigger",
    iphoneClickBody.includes("startIphoneSecureRingtoneDownload")
        && !iphoneClickBody.includes("triggerBrowserAudioDownload")
        && !iphoneClickBody.includes("downloadIphoneRingtoneAudio")
        && !/\bawait\b/.test(iphoneClickBody.replace(/\/\/.*$/gm, "")),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_SINGLE_DOWNLOAD_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
