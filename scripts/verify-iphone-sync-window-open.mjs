#!/usr/bin/env node
/**
 * iPhone helper must open about:blank synchronously before any await.
 * Run: node scripts/verify-iphone-sync-window-open.mjs
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

const client = read("lib/ringtone-marketplace-client.ts");
const marketUi = read("components/ringtone-marketplace/ringtone-marketplace-workspace.tsx");

const helper = (() => {
    const start = client.indexOf("export function startIphoneSecureRingtoneDownload");
    if (start < 0) return "";
    const end = client.indexOf("export function triggerBrowserAudioDownload", start);
    return end > start ? client.slice(start, end) : client.slice(start, start + 2500);
})();

const openIdx = helper.indexOf('window.open("about:blank", "_blank")');
const awaitIdx = helper.search(/\bawait\b/);

record("helper opens about:blank", openIdx >= 0);
record(
    "window.open occurs before first await",
    openIdx >= 0 && awaitIdx >= 0 && openIdx < awaitIdx,
    `open@${openIdx} await@${awaitIdx}`,
);
record("failed ticket closes blank window", helper.includes("downloadWindow?.close()"));
record("no useEffect download kickoff", !/useEffect\([\s\S]{0,300}startIphoneSecureRingtoneDownload/.test(marketUi));
record("no setTimeout download kickoff", !marketUi.includes("setTimeout(() => startIphoneSecureRingtoneDownload"));
record("marketplace calls helper once on iphone path", (marketUi.match(/startIphoneSecureRingtoneDownload\(/g) || []).length === 1);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_SYNC_WINDOW_OPEN_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
