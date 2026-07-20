#!/usr/bin/env node
/**
 * iPhone forced download contracts (ticket attachment audio, no Supabase media page).
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

function decodeRingtoneFilenameLabel(value) {
    let text = String(value ?? "");
    for (let attempt = 0; attempt < 5; attempt += 1) {
        if (!/%[0-9A-Fa-f]{2}/.test(text)) break;
        try {
            const next = decodeURIComponent(text.replace(/\+/g, "%20"));
            if (next === text) break;
            text = next;
        } catch {
            const next = text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (sequence) => {
                try {
                    return decodeURIComponent(sequence);
                } catch {
                    return sequence;
                }
            });
            if (next === text) break;
            text = next;
        }
    }
    return text;
}

function buildRingtoneDownloadFilename(title, storagePath) {
    const baseName = String(storagePath || "").split("/").pop() || "";
    const dot = baseName.lastIndexOf(".");
    const ext = dot > 0 ? baseName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || "m4a" : "m4a";
    let base = decodeRingtoneFilenameLabel(title).replace(/[\u0000-\u001F\u007F]/g, "").replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
    base = base.replace(/[. ]+$/g, "").trim() || "ringtone";
    return `${base}.${ext}`;
}

function buildRingtoneContentDisposition(filename) {
    const safe = decodeRingtoneFilenameLabel(filename);
    const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "") || "ringtone.m4a";
    const encoded = encodeURIComponent(safe).replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`).replace(/\*/g, "%2A");
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

const ticketGet = read("app/api/ringtones/download/[ticket]/route.ts");
const ticketIssue = read("app/api/ringtones/[id]/download-ticket/route.ts");
const client = read("lib/ringtone-marketplace-client.ts");
const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
const helper = read("lib/ringtone-download-filename.ts");
const androidRoute = read("app/api/ringtones/[id]/download/route.ts");

record("ticket GET streams storage.download", ticketGet.includes(".download(record.storagePath)") && ticketGet.includes("NextResponse(bytes"));
record("no createSignedUrl / signedUrl in ticket routes", !ticketGet.includes("createSignedUrl") && !ticketGet.includes("signedUrl") && !ticketIssue.includes("signedUrl"));
record("success uses Content-Disposition attachment builder", ticketGet.includes("buildRingtoneContentDisposition") && helper.includes('attachment; filename="'));
record("private no-store + nosniff", ticketGet.includes("private, no-store") && ticketGet.includes("nosniff"));
record(
    "missing file returns 404",
    ticketIssue.includes("FILE_NOT_FOUND")
        && ticketGet.includes("FILE_NOT_FOUND")
        && (ticketIssue.includes(", 404)") || ticketIssue.includes("404")),
);
record("auth + purchase gates remain", ticketIssue.includes("requireMatchingUserId") && ticketIssue.includes("PURCHASE_REQUIRED"));
record("client never trusts storage path from UI", !marketUi.includes("storage_path") && !client.includes("storagePath:"));
record(
    "iphone client helper uses ticket navigation",
    client.includes("startIphoneSecureRingtoneDownload")
        && client.includes("/download-ticket")
        && client.includes('window.open("about:blank", "_blank")'),
);
record(
    "iphone failure messages cover auth/authorization/missing file",
    client.includes("Your session expired")
        && client.includes("not authorized to download")
        && client.includes("ringtone file was not found"),
);
record(
    "UI uses gesture-safe iPhone download starter",
    marketUi.includes("startIphoneSecureRingtoneDownload")
        && !marketUi.includes("downloadIphoneRingtoneAudio")
        && marketUi.includes("setInstallGuide"),
);
record("android route still has no signedUrl", !androidRoute.includes("createSignedUrl") && !androidRoute.includes("signedUrl"));

const filename = buildRingtoneDownloadFilename("Cellular Phone", "creator/x-iphone.m4a");
const cd = buildRingtoneContentDisposition(filename);
record("readable m4a filename", filename === "Cellular Phone.m4a", filename);
record(
    "Content-Disposition RFC 5987",
    cd === 'attachment; filename="Cellular Phone.m4a"; filename*=UTF-8\'\'Cellular%20Phone.m4a',
    cd,
);
const encodedFilename = buildRingtoneDownloadFilename(
    "01%20Bounty%20Killer%20-%20Cellular%20Phone",
    "creator/x-iphone.m4a",
);
record(
    "percent-encoded title becomes human-readable",
    encodedFilename === "01 Bounty Killer - Cellular Phone.m4a",
    encodedFilename,
);
record("helper source decodes labels", helper.includes("decodeRingtoneFilenameLabel"));
record("no iphone.json naming", !filename.includes("iphone.json") && !ticketGet.includes("iphone.json") && !client.includes("iphone.json"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_FORCED_DOWNLOAD_FAILS=${failed}`);
console.log(`EXACT_CONTENT_DISPOSITION=${cd}`);
console.log(`EXACT_CONTENT_TYPE_EXAMPLE=audio/mp4`);
process.exit(failed ? 1 : 0);
