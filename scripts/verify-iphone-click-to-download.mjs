#!/usr/bin/env node
/**
 * Production-like iPhone click → instruction panel + ticket download start.
 * Run: node scripts/verify-iphone-click-to-download.mjs
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

const iphoneHandler = (() => {
    const start = marketUi.indexOf("// iPhone: open instructions + open blank download context");
    if (start < 0) {
        const alt = marketUi.indexOf("// iPhone:");
        return alt >= 0 ? marketUi.slice(alt, alt + 1800) : "";
    }
    const end = marketUi.indexOf("function renderMarketplaceCard", start);
    return end > start ? marketUi.slice(start, end) : marketUi.slice(start, start + 1800);
})();

record(
    "iphone click opens instruction panel",
    iphoneHandler.includes("setInstallGuide") && iphoneHandler.includes("Open GarageBand"),
);
record(
    "iphone click also starts secure download in same handler",
    iphoneHandler.includes("startIphoneSecureRingtoneDownload({") && iphoneHandler.includes("setInstallGuide"),
);
record(
    "download is not deferred to useEffect",
    !/useEffect\([\s\S]{0,400}startIphoneSecureRingtoneDownload/.test(marketUi)
        && !marketUi.includes("setTimeout(() => startIphoneSecureRingtoneDownload"),
);
record(
    "gesture-safe helper opens about:blank then tickets",
    client.includes('window.open("about:blank", "_blank")')
        && client.includes("/download-ticket")
        && client.includes("location.replace(downloadUrl)"),
);
const iphoneHelper = (() => {
    const start = client.indexOf("export function startIphoneSecureRingtoneDownload");
    if (start < 0) return "";
    const end = client.indexOf("export function triggerBrowserAudioDownload", start);
    return end > start ? client.slice(start, end) : client.slice(start, start + 2500);
})();
record(
    "no Blob/createObjectURL/temp-anchor on iPhone path",
    !iphoneHelper.includes("createObjectURL")
        && !iphoneHelper.includes("form.submit")
        && !iphoneHandler.includes("triggerBrowserAudioDownload"),
);
record(
    "no Supabase storage URL / signedUrl",
    !marketUi.includes("signedUrl")
        && !client.includes("createSignedUrl")
        && !ticketIssue.includes("createSignedUrl")
        && !ticketGet.includes("createSignedUrl"),
);
record("ticket issue + GET routes present", Boolean(ticketIssue) && Boolean(ticketGet));
record(
    "failure surfaces inside instruction panel",
    marketUi.includes("installGuide.error")
        && iphoneHandler.includes("onFailure")
        && client.includes("downloadWindow?.close()"),
);
record(
    "download lock prevents duplicate clicks",
    marketUi.includes("downloadLockRef") && iphoneHandler.includes("onSettled"),
);
record(
    "android path still uses fetch helper",
    marketUi.includes("downloadAndroidRingtoneAudio")
        && client.includes("export async function downloadAndroidRingtoneAudio"),
);
record(
    "exactly one iPhone download starter call site",
    (marketUi.match(/startIphoneSecureRingtoneDownload\(/g) || []).length === 1,
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_CLICK_TO_DOWNLOAD_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
