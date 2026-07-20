#!/usr/bin/env node
/**
 * iPhone forced download contracts (attachment audio, no Supabase media page).
 * Run: node scripts/verify-iphone-ringtone-forced-download.mjs
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

function buildRingtoneDownloadFilename(title, storagePath) {
    const baseName = String(storagePath || "").split("/").pop() || "";
    const dot = baseName.lastIndexOf(".");
    const ext = dot > 0 ? baseName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "m4a" : "m4a";
    let base = String(title ?? "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
    base = base.replace(/[. ]+$/g, "").trim() || "ringtone";
    return `${base}.${ext}`;
}

function buildRingtoneContentDisposition(filename) {
    const safe = String(filename || "ringtone.m4a");
    const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "ringtone.m4a";
    const encoded = encodeURIComponent(safe).replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`).replace(/\*/g, "%2A");
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

const route = read("app/api/ringtones/[id]/download/route.ts");
const client = read("lib/ringtone-marketplace-client.ts");
const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
const helper = read("lib/ringtone-download-filename.ts");

record("iphone branch streams storage.download", route.includes("// --- iPhone:") && route.includes(".download(storagePath)"));
record("no createSignedUrl / signedUrl in download route", !route.includes("createSignedUrl") && !route.includes("signedUrl"));
record("success uses Content-Disposition attachment builder", route.includes("buildRingtoneContentDisposition") && helper.includes('attachment; filename="'));
record("private no-store + nosniff", route.includes("private, no-store") && route.includes("nosniff"));
record("missing file returns 404", route.includes('code: "FILE_NOT_FOUND"') && route.includes(", 404)"));
record("auth + purchase gates remain", route.includes("requireMatchingUserId") && route.includes("PURCHASE_REQUIRED"));
record("client never trusts storage path from UI", !marketUi.includes("storage_path") && !client.includes("storagePath:"));
record("iphone client helper exists", client.includes("downloadIphoneRingtoneAudio") && client.includes('deviceType: "iphone"'));
record("iphone rejects unexpected JSON", client.includes("UNEXPECTED_JSON_DOWNLOAD"));
record("iphone clear 401/403/404 errors", client.includes("status === 401") && client.includes("status === 403") && client.includes("status === 404"));
record("UI does not window.open / location assign storage", !marketUi.includes("window.open") && !marketUi.includes("window.location"));
record("UI uses downloadIphoneRingtoneAudio + triggerBrowserAudioDownload", marketUi.includes("downloadIphoneRingtoneAudio") && marketUi.includes("triggerBrowserAudioDownload"));

const filename = buildRingtoneDownloadFilename("Cellular Phone", "creator/x-iphone.m4a");
const cd = buildRingtoneContentDisposition(filename);
record("readable m4a filename", filename === "Cellular Phone.m4a", filename);
record(
    "Content-Disposition RFC 5987",
    cd === 'attachment; filename="Cellular Phone.m4a"; filename*=UTF-8\'\'Cellular%20Phone.m4a',
    cd,
);
record("no iphone.json naming", !filename.includes("iphone.json") && !route.includes("iphone.json") && !client.includes("iphone.json"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_FORCED_DOWNLOAD_FAILS=${failed}`);
console.log(`EXACT_CONTENT_DISPOSITION=${cd}`);
console.log(`EXACT_CONTENT_TYPE_EXAMPLE=audio/mp4`);
process.exit(failed ? 1 : 0);
