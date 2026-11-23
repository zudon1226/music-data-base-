#!/usr/bin/env node
/**
 * Phase 29I (P2) — Production upload E2E harness (HTTP preflight + optional owner session).
 *
 * Without credentials: guest POST probes return 401; documents routes only.
 *
 * Env (never log values):
 *   MDB_PRODUCTION_BASE_URL
 *   MDB_PRODUCTION_TEST_EMAIL / MDB_PRODUCTION_TEST_PASSWORD
 *   MDB_PRODUCTION_SUPABASE_ANON_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = String(process.env.MDB_PRODUCTION_BASE_URL || "https://www.digitalmusicdatabase.com").replace(/\/$/, "");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const evidenceDir = join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });

const results = [];
function record(id, status, detail = "") {
    results.push({ id, status, detail });
    console.log(`${status.padEnd(7)} [${id}]${detail ? ` — ${detail}` : ""}`);
}

async function postJson(path, body = {}) {
    const response = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    return { status: response.status, json, text: text.slice(0, 120) };
}

async function main() {
    const probes = [
        ["/api/upload-audio", { mode: "prepare-storage-upload", storagePath: "00000000-0000-0000-0000-000000000001/x.mp3" }],
        ["/api/albums/create", { title: "probe" }],
        ["/api/video-upload", { mode: "prepare-storage-upload", storagePath: "00000000-0000-0000-0000-000000000001/x.mp4" }],
        ["/api/ringtones", { title: "probe" }],
    ];
    for (const [path, body] of probes) {
        const r = await postJson(path, body);
        record(
            `guest-${path.replace(/\//g, "-")}`,
            r.status === 401 || r.status === 403 ? "PASS" : "WARN",
            `http=${r.status}`,
        );
    }

    const catalog = await fetch(`${BASE}/api/songs`, { headers: { Accept: "application/json" } });
    const songs = catalog.ok ? await catalog.json().catch(() => ({})) : null;
    const rollCall = Array.isArray(songs?.songs)
        ? songs.songs.find((s) => /roll call/i.test(String(s.title || "")))
        : null;
    record(
        "listener-catalog-roll-call",
        rollCall?.id ? "PASS" : "FAIL",
        rollCall
            ? `streaming=${rollCall.streaming_enabled !== false} price_cents=${rollCall.price_cents}`
            : "Roll Call missing from public catalog",
    );

    const email = String(process.env.MDB_PRODUCTION_TEST_EMAIL || "").trim();
    const password = String(process.env.MDB_PRODUCTION_TEST_PASSWORD || "").trim();
    const anonKey = String(process.env.MDB_PRODUCTION_SUPABASE_ANON_KEY || "").trim();
    if (!email || !password || !anonKey) {
        record("authenticated-upload-matrix", "BLOCKED", "set MDB_PRODUCTION_TEST_* for full upload E2E");
    } else {
        const client = createClient(`https://${PRODUCTION_REF}.supabase.co`, anonKey, { auth: { persistSession: false } });
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error || !data.session?.access_token) {
            record("authenticated-upload-matrix", "FAIL", "sign-in failed");
        } else {
            record("authenticated-upload-matrix", "BLOCKED", "owner-led UI upload steps not automated in this harness");
        }
    }

    writeFileSync(
        join(evidenceDir, "production-upload-e2e-evidence.json"),
        JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), results }, null, 2),
    );
    const fails = results.filter((r) => r.status === "FAIL");
    console.log(`\nPRODUCTION_UPLOAD_E2E_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});