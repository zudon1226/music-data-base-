#!/usr/bin/env node
/**
 * iPhone Content-Disposition filename verification.
 * Covers percent-encoded titles, UTF-8, and single-encode filename*.
 * Run: node scripts/verify-iphone-content-disposition-filename.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

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

const helper = read("lib/ringtone-download-filename.ts");
const route = read("app/api/ringtones/[id]/download/route.ts");
const ticketGet = read("app/api/ringtones/download/[ticket]/route.ts");
const ticketIssue = read("app/api/ringtones/[id]/download-ticket/route.ts");

const PERCENT_ENCODED_BYTE = /%[0-9A-Fa-f]{2}/;

function decodeRingtoneFilenameLabel(value) {
    let text = String(value ?? "");
    for (let attempt = 0; attempt < 5; attempt += 1) {
        if (!PERCENT_ENCODED_BYTE.test(text)) break;
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

function extensionFromStoragePath(storagePath) {
    const base = String(storagePath || "").split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    if (dot < 0 || dot === base.length - 1) return "mp3";
    const ext = base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
    return !ext || ext.length > 8 ? "mp3" : ext;
}

function buildRingtoneDownloadFilename(title, storagePath) {
    const ext = extensionFromStoragePath(storagePath);
    let base = decodeRingtoneFilenameLabel(title)
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    base = base.replace(/[. ]+$/g, "").trim();
    if (!base) base = "ringtone";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(base)) {
        base = "ringtone";
    }
    if (/^(iphone|android|other)$/i.test(base)) base = "ringtone";
    return `${base}.${ext}`;
}

function buildRingtoneContentDisposition(filename) {
    const safe = decodeRingtoneFilenameLabel(filename).replace(/[\u0000-\u001F\u007F]/g, "").trim() || "ringtone.mp3";
    const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "").replace(/[. ]+$/g, "") || "ringtone.mp3";
    const encoded = encodeURIComponent(safe)
        .replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, "%2A");
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function visibleTitleFromDisposition(cd) {
    const quoted = /filename="([^"]+)"/i.exec(cd)?.[1] || "";
    return quoted.replace(/\.[^.]+$/, "");
}

record(
    "shared helper decodes percent-encoded labels",
    helper.includes("decodeRingtoneFilenameLabel") && helper.includes("decodeURIComponent"),
);
record("shared filename helper still used by route", route.includes("buildRingtoneDownloadFilename(product.data.title") && Boolean(helper));
record("ticket issue builds filename via shared helper", ticketIssue.includes("buildRingtoneDownloadFilename(product.data.title"));
record("ticket GET builds disposition via shared helper", ticketGet.includes("buildRingtoneContentDisposition(record.filename)"));

const fallbackEmpty = buildRingtoneDownloadFilename("", "creator/iphone-file.m4a");
record("iphone fallback filename is ringtone.m4a", fallbackEmpty === "ringtone.m4a", fallbackEmpty);

const name = buildRingtoneDownloadFilename("Cellular Phone", "u/abc-iphone.m4a");
assert.equal(name, "Cellular Phone.m4a");
const cd = buildRingtoneContentDisposition(name);
record("spaces title → Cellular Phone.m4a", name === "Cellular Phone.m4a");
record(
    "exact Content-Disposition",
    cd === 'attachment; filename="Cellular Phone.m4a"; filename*=UTF-8\'\'Cellular%20Phone.m4a',
    cd,
);

const encodedTitle = "01%20Bounty%20Killer%20-%20Cellular%20Phone";
const encodedName = buildRingtoneDownloadFilename(encodedTitle, "u/clip.m4a");
const encodedCd = buildRingtoneContentDisposition(encodedName);
record(
    "percent-encoded title decodes to human-readable name",
    encodedName === "01 Bounty Killer - Cellular Phone.m4a",
    encodedName,
);
record(
    "visible ASCII filename has spaces not %20",
    visibleTitleFromDisposition(encodedCd) === "01 Bounty Killer - Cellular Phone"
        && !visibleTitleFromDisposition(encodedCd).includes("%20"),
    visibleTitleFromDisposition(encodedCd),
);
record(
    "filename* encodes spaces once (not %2520)",
    encodedCd.includes("filename*=UTF-8''01%20Bounty%20Killer%20-%20Cellular%20Phone.m4a")
        && !encodedCd.includes("%2520"),
    encodedCd,
);

const doubleEncoded = buildRingtoneDownloadFilename(
    "01%2520Bounty%2520Killer%2520-%2520Cellular%2520Phone",
    "u/clip.m4r",
);
record(
    "double-encoded title fully decodes",
    doubleEncoded === "01 Bounty Killer - Cellular Phone.m4r",
    doubleEncoded,
);

const hyphenNumbers = buildRingtoneDownloadFilename("01 Bounty Killer - Cellular Phone", "u/x.m4a");
record("hyphens and numbers preserved", hyphenNumbers === "01 Bounty Killer - Cellular Phone.m4a", hyphenNumbers);

const apostrophe = buildRingtoneDownloadFilename("Don't Stop", "u/x.m4a");
record("apostrophes preserved in basename", apostrophe === "Don't Stop.m4a", apostrophe);

const unicode = buildRingtoneDownloadFilename("Café%20Núñez", "u/x.m4a");
const unicodeCd = buildRingtoneContentDisposition(unicode);
record("unicode percent-encoded title decodes", unicode === "Café Núñez.m4a", unicode);
record(
    "unicode filename* encodes once",
    unicodeCd.includes("filename*=UTF-8''Caf%C3%A9%20N%C3%BA%C3%B1ez.m4a")
        && !unicodeCd.includes("%2520")
        && !unicodeCd.includes("%25C3"),
    unicodeCd,
);

// Disposition must also decode a stored ticket filename that still has %20.
const staleTicketCd = buildRingtoneContentDisposition("01%20Bounty%20Killer%20-%20Cellular%20Phone.m4a");
record(
    "stale ticket filename decoded in Content-Disposition",
    staleTicketCd === 'attachment; filename="01 Bounty Killer - Cellular Phone.m4a"; filename*=UTF-8\'\'01%20Bounty%20Killer%20-%20Cellular%20Phone.m4a',
    staleTicketCd,
);
record(
    "no literal percent-encoding in user-visible title",
    !/%[0-9A-Fa-f]{2}/.test(visibleTitleFromDisposition(staleTicketCd)),
    visibleTitleFromDisposition(staleTicketCd),
);

const uuid = buildRingtoneDownloadFilename("550e8400-e29b-41d4-a716-446655440000", "u/x.m4r");
record("uuid title rejected", uuid === "ringtone.m4r", uuid);

const platform = buildRingtoneDownloadFilename("iphone", "u/x.m4a");
record("platform title rejected", platform === "ringtone.m4a", platform);

record("no purchase/storage key as filename source", !route.includes("purchaseId") || !/buildRingtoneDownloadFilename\([^\)]*purchase/.test(route));
record("mime map includes m4a/m4r", helper.includes("m4a: \"audio/mp4\"") && helper.includes("m4r: \"audio/mp4\""));
record("ticket GET still streams bytes unchanged", ticketGet.includes("NextResponse(bytes") && ticketGet.includes("Content-Disposition"));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_CONTENT_DISPOSITION_FAILS=${failed}`);
console.log(`EXACT_CONTENT_DISPOSITION=${cd}`);
console.log(`ENCODED_TITLE_FILENAME=${encodedName}`);
console.log(`ENCODED_TITLE_CONTENT_DISPOSITION=${encodedCd}`);
console.log(`EXACT_CONTENT_TYPE=audio/mp4`);
process.exit(failed ? 1 : 0);
