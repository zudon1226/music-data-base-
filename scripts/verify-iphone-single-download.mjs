#!/usr/bin/env node
/**
 * iPhone single-request download click contract.
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
const route = read("app/api/ringtones/[id]/download/route.ts");

record("downloadLockRef still present", marketUi.includes("downloadLockRef"));
record("iphone calls downloadIphoneRingtoneAudio once", (marketUi.match(/downloadIphoneRingtoneAudio\(/g) || []).length === 1);
record("iphone triggers one browser audio download", marketUi.includes("triggerBrowserAudioDownload(result.blob, result.filename)"));
record("no signedUrl handling in marketplace UI", !marketUi.includes("signedUrl") && !marketUi.includes("downloadPurchasedRingtone"));
record("no window.open in marketplace UI", !marketUi.includes("window.open"));
record("no JSON Blob construction for download", !client.includes("new Blob([JSON.stringify") && !marketUi.includes("iphone.json"));
record("install guide remains UI-only with GarageBand steps", marketUi.includes("Open GarageBand") && marketUi.includes("setInstallGuide"));
record("android helper untouched marker", client.includes("Android: one POST to the secure download endpoint") && client.includes('deviceType: "android"'));
record("route insert download log once", (route.match(/ringtone_downloads\"\)\.insert/g) || []).length === 1);
record("iphone success is NextResponse bytes not json()", /\/\/ --- iPhone:[\s\S]*return new NextResponse\(bytes/.test(route));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_SINGLE_DOWNLOAD_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
