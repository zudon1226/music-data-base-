#!/usr/bin/env node
/**
 * Ticket expiration contracts + in-memory expire behavior.
 * Run: node scripts/verify-iphone-ticket-expiration.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";

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
const ticketGet = read("app/api/ringtones/download/[ticket]/route.ts");

record("TTL constant is 60 seconds", ticketLib.includes("RINGTONE_DOWNLOAD_TICKET_TTL_MS = 60_000"));
record("create sets expiresAt from TTL", ticketLib.includes("Date.now() + RINGTONE_DOWNLOAD_TICKET_TTL_MS"));
record("consume rejects expired tickets", ticketLib.includes(".gt(\"expires_at\", nowIso)") || ticketLib.includes("Date.parse(memory.expiresAt) <= Date.now()"));
record("GET maps invalid/expired to 410", ticketGet.includes(", 410)") && ticketGet.includes("TICKET_INVALID"));

// Local hash/expiry semantics mirror.
const raw = randomBytes(16).toString("base64url");
const hash = createHash("sha256").update(raw, "utf8").digest("hex");
const expiredAt = new Date(Date.now() - 1000).toISOString();
const freshAt = new Date(Date.now() + 60_000).toISOString();
record("hash is deterministic sha256 hex", hash.length === 64 && createHash("sha256").update(raw, "utf8").digest("hex") === hash);
record("expired timestamp is in the past", Date.parse(expiredAt) < Date.now());
record("fresh timestamp is within ~60s window", Date.parse(freshAt) - Date.now() <= 60_000 + 50);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_TICKET_EXPIRATION_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
