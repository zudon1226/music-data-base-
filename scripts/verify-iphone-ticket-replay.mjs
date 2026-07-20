#!/usr/bin/env node
/**
 * Ticket replay rejection contracts.
 * Run: node scripts/verify-iphone-ticket-replay.mjs
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
const ticketGet = read("app/api/ringtones/download/[ticket]/route.ts");
const client = read("lib/ringtone-marketplace-client.ts");

record("consume requires consumed_at IS NULL", ticketLib.includes('.is("consumed_at", null)'));
record("memory path rejects already consumed", ticketLib.includes("if (memory.consumedAt) return null"));
record("consume sets consumed_at", ticketLib.includes("consumed_at: nowIso") || ticketLib.includes("consumedAt: nowIso"));
record("GET returns 410 when consume returns null", ticketGet.includes("if (!record)") && ticketGet.includes("410"));
record("download count insert happens after successful consume", /consumeRingtoneDownloadTicket[\s\S]*ringtone_downloads\"\)\.insert/.test(ticketGet));
record("one helper issues one ticket request", (client.match(/\/download-ticket/g) || []).length === 1);

const failed = results.filter((row) => !row.ok).length;
console.log(`\nIPHONE_TICKET_REPLAY_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
