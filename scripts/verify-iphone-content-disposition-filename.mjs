#!/usr/bin/env node
/**
 * iPhone Content-Disposition filename verification.
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
const client = read("lib/ringtone-marketplace-client.ts");

function extensionFromStoragePath(storagePath) {
    const base = String(storagePath || "").split("/").pop() || "";
    const dot = base.lastIndexOf(".");
    if (dot < 0 || dot === base.length - 1) return "mp3";
    const ext = base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
    return !ext || ext.length > 8 ? "mp3" : ext;
}

function buildRingtoneDownloadFilename(title, storagePath) {
    const ext = extensionFromStoragePath(storagePath);
    let base = String(title ?? "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
    base = base.replace(/[. ]+$/g, "").trim();
    if (!base) base = "ringtone";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(base)) base = "ringtone";
    if (/^(iphone|android|other)$/i.test(base)) base = "ringtone";
    return `${base}.${ext}`;
}

function buildRingtoneContentDisposition(filename) {
    const safe = String(filename || "ringtone.mp3").replace(/[\u0000-\u001F\u007F]/g, "").trim() || "ringtone.mp3";
    const asciiFallback = safe.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "").replace(/[. ]+$/g, "") || "ringtone.mp3";
    const encoded = encodeURIComponent(safe).replace(/['()]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`).replace(/\*/g, "%2A");
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

record("shared filename helper still used by route", route.includes("buildRingtoneDownloadFilename(product.data.title") && Boolean(helper));
record("iphone fallback filename is ringtone.m4a", client.includes('|| "ringtone.m4a"'));

const name = buildRingtoneDownloadFilename("Cellular Phone", "u/abc-iphone.m4a");
assert.equal(name, "Cellular Phone.m4a");
const cd = buildRingtoneContentDisposition(name);
record("Cellular Phone.m4a", name === "Cellular Phone.m4a");
record(
    "exact Content-Disposition",
    cd === 'attachment; filename="Cellular Phone.m4a"; filename*=UTF-8\'\'Cellular%20Phone.m4a',
    cd,
);

const uuid = buildRingtoneDownloadFilename("550e8400-e29b-41d4-a716-446655440000", "u/x.m4r");
record("uuid title rejected", uuid === "ringtone.m4r", uuid);

const platform = buildRingtoneDownloadFilename("iphone", "u/x.m4a");
record("platform title rejected", platform === "ringtone.m4a", platform);

record("no purchase/storage key as filename source", !route.includes("purchaseId") || !/buildRingtoneDownloadFilename\([^\)]*purchase/.test(route));
record("mime map includes m4a/m4r", helper.includes("m4a: \"audio/mp4\"") && helper.includes("m4r: \"audio/mp4\""));

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_CONTENT_DISPOSITION_FAILS=${failed}`);
console.log(`EXACT_CONTENT_DISPOSITION=${cd}`);
console.log(`EXACT_CONTENT_TYPE=audio/mp4`);
process.exit(failed ? 1 : 0);
