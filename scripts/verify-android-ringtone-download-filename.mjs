#!/usr/bin/env node
/**
 * Android ringtone Content-Disposition / filename contracts.
 * Run: node scripts/verify-android-ringtone-download-filename.mjs
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

// Inline mirrors of lib/ringtone-download-filename.ts for node verification without TS transpile.
function extensionFromStoragePath(storagePath) {
    const base = String(storagePath || "").split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    if (dot < 0 || dot === base.length - 1) return "mp3";
    const ext = base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!ext || ext.length > 8) return "mp3";
    return ext;
}

function buildRingtoneDownloadFilename(title, storagePath) {
    const ext = extensionFromStoragePath(storagePath);
    let base = String(title ?? "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    base = base.replace(/[. ]+$/g, "").trim();
    if (!base) base = "ringtone";
    if (base.length > 120) {
        base = base.slice(0, 120).replace(/[. ]+$/g, "").trim() || "ringtone";
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(base)) {
        base = "ringtone";
    }
    if (/^(iphone|android|other)$/i.test(base)) {
        base = "ringtone";
    }
    return `${base}.${ext}`;
}

function buildRingtoneContentDisposition(filename) {
    const safe = String(filename || "ringtone.mp3").replace(/[\u0000-\u001F\u007F]/g, "").trim() || "ringtone.mp3";
    const asciiFallback = safe
        .replace(/[^\x20-\x7E]/g, "_")
        .replace(/"/g, "")
        .replace(/[. ]+$/g, "")
        || "ringtone.mp3";
    const encoded = encodeURIComponent(safe)
        .replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
        .replace(/\*/g, "%2A");
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

const route = read("app/api/ringtones/[id]/download/route.ts");
const helper = read("lib/ringtone-download-filename.ts");
const client = read("lib/ringtone-marketplace-client.ts");

record("filename helper module exists", Boolean(helper));
record("route uses title-based filename builder", route.includes("buildRingtoneDownloadFilename(product.data.title"));
record("route sets private no-store + nosniff", route.includes("private, no-store") && route.includes("nosniff"));
record("route never appends -android.json", !route.includes("-android.json") && !helper.includes("-android.json"));
record("android path downloads storage bytes", route.includes(".download(storagePath)") && route.includes("NextResponse(bytes"));
record("android path does not createSignedUrl", !route.includes("createSignedUrl"));
record("iphone also streams audio (no signed URL)", route.includes("// --- iPhone:") && !route.includes("signedUrl"));

const cellular = buildRingtoneDownloadFilename("Cellular Phone", "creator/abc-android.mp3");
assert.equal(cellular, "Cellular Phone.mp3");
record("Cellular Phone.mp3 from title", cellular === "Cellular Phone.mp3", cellular);

const unsafe = buildRingtoneDownloadFilename('Song<>:"/\\|?*Name', "x/file.m4a");
record("unsafe chars sanitized", unsafe === "SongName.m4a", unsafe);

const uuidTitle = buildRingtoneDownloadFilename("550e8400-e29b-41d4-a716-446655440000", "x/a.mp3");
record("uuid title rejected", uuidTitle === "ringtone.mp3", uuidTitle);

const platformTitle = buildRingtoneDownloadFilename("android", "x/a.mp3");
record("platform title rejected", platformTitle === "ringtone.mp3", platformTitle);

const cd = buildRingtoneContentDisposition("Cellular Phone.mp3");
record(
    "Content-Disposition RFC 5987 shape",
    cd === 'attachment; filename="Cellular Phone.mp3"; filename*=UTF-8\'\'Cellular%20Phone.mp3',
    cd,
);

record(
    "client parses Content-Disposition filename",
    client.includes("parseFilenameFromContentDisposition")
        && client.includes("downloadAndroidRingtoneAudio"),
);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nANDROID_FILENAME_FAILS=${failed}`);
console.log(`EXACT_CONTENT_DISPOSITION=${cd}`);
process.exit(failed ? 1 : 0);
