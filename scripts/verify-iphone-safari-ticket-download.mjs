#!/usr/bin/env node
/**
 * iPhone Safari ticket-download architecture contracts.
 * Run: node scripts/verify-iphone-safari-ticket-download.mjs
 */
import { existsSync, readFileSync } from "node:fs";
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

const ticketLib = read("lib/ringtone-download-ticket.ts");
const ticketIssue = read("app/api/ringtones/[id]/download-ticket/route.ts");
const ticketGet = read("app/api/ringtones/download/[ticket]/route.ts");
const client = read("lib/ringtone-marketplace-client.ts");
const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");
const migration = read("supabase/migrations/202607200001_ringtone_download_tickets.sql");
const androidRoute = read("app/api/ringtones/[id]/download/route.ts");

record("ticket issue route exists", Boolean(ticketIssue) && ticketIssue.includes("createRingtoneDownloadTicket"));
record("ticket GET route exists", Boolean(ticketGet) && ticketGet.includes("consumeRingtoneDownloadTicket"));
record("ticket TTL ~60s", ticketLib.includes("RINGTONE_DOWNLOAD_TICKET_TTL_MS = 60_000"));
record("ticket stores hash only", ticketLib.includes("hashRingtoneDownloadTicket") && ticketLib.includes("ticket_hash") && migration.includes("ticket_hash"));
record("ticket bound to user/ringtone/storage/filename", ticketLib.includes("userId") && ticketLib.includes("ringtoneId") && ticketLib.includes("storagePath") && ticketLib.includes("filename"));
record("ticket issue authenticates", ticketIssue.includes("requireMatchingUserId"));
record("ticket issue authorizes purchase", ticketIssue.includes("PURCHASE_REQUIRED") && ticketIssue.includes("buyerHasPaidRingtonePurchase"));
record("ticket issue resolves storage server-side", ticketIssue.includes("iphone_storage_path") && !ticketIssue.includes("body.storagePath"));
record("ticket GET consumes atomically", ticketLib.includes("consumed_at") && ticketGet.includes("consumeRingtoneDownloadTicket"));
record(
    "ticket GET returns attachment audio bytes",
    ticketGet.includes("Content-Disposition")
        && ticketGet.includes("new NextResponse(bytes")
        && ticketGet.includes("buildRingtoneContentDisposition"),
);
record("ticket GET never redirects to supabase", !ticketGet.includes("createSignedUrl") && !ticketGet.includes("signedUrl") && !ticketGet.includes("Location:"));
record("ticket GET marks private no-store + nosniff", ticketGet.includes("private, no-store") && ticketGet.includes("nosniff"));
record("invalid/expired ticket returns 410", ticketGet.includes("410") && ticketGet.includes("TICKET_INVALID"));
record("client uses download-ticket endpoint", client.includes("/download-ticket") && client.includes("downloadUrl"));
record("client navigates ticket URL via location.replace or assign", client.includes("location.replace(downloadUrl)") && client.includes("window.location.assign(downloadUrl)"));

const iphoneHelper = (() => {
    const start = client.indexOf("export function startIphoneSecureRingtoneDownload");
    if (start < 0) return "";
    const end = client.indexOf("export function triggerBrowserAudioDownload", start);
    return end > start ? client.slice(start, end) : client.slice(start, start + 2500);
})();
record("client never Blob/createObjectURL for iPhone helper", !iphoneHelper.includes("createObjectURL") && !iphoneHelper.includes("triggerBrowserAudioDownload"));
record("client never form.submit for iPhone", !iphoneHelper.includes("form.submit"));
record("UI still opens instruction panel", marketUi.includes("setInstallGuide") && marketUi.includes("Open GarageBand"));
record("android download route still streams bytes", androidRoute.includes('deviceType === "android"') && androidRoute.includes(".download(storagePath)") && androidRoute.includes("NextResponse(bytes"));
record("android client helper untouched", client.includes("export async function downloadAndroidRingtoneAudio") && client.includes('deviceType: "android"'));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_SAFARI_TICKET_DOWNLOAD_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
