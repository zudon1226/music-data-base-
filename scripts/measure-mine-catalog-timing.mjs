/**
 * Measure scope=mine pagination latency (no secrets logged).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const STAGING = "jzlegcbotqfzevtczwhx";

loadMixtapeStagingE2eCredentialsFromFile();
const env = {};
for (const line of readFileSync(join(root, ".env.staging.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)/)?.[1];
if (ref !== STAGING) {
    console.error("staging_ref_mismatch");
    process.exit(1);
}
const email = process.env.MDB_MIXTAPE_E2E_EMAIL || "";
const password = process.env.MDB_MIXTAPE_E2E_PASSWORD || "";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await sb.auth.signInWithPassword({ email, password });
if (error || !data.session) process.exit(1);
const userId = data.user.id;
const token = data.session.access_token;
const pages = [];
let cursor = "";
let hasMore = true;
const t0 = Date.now();
while (hasMore) {
    const q = new URLSearchParams({ scope: "mine", userId, limit: "40" });
    if (cursor) q.set("cursor", cursor);
    const start = performance.now();
    const res = await fetch(`${BASE}/api/mixtapes?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    const ms = Math.round(performance.now() - start);
    const n = Array.isArray(body.mixtapes) ? body.mixtapes.length : 0;
    pages.push({ ms, n, status: res.status, hasMore: Boolean(body.hasMore) });
    hasMore = Boolean(body.hasMore && body.nextCursor);
    cursor = String(body.nextCursor || "");
    if (!n) break;
    if (pages.length > 200) break;
}
console.log(
    JSON.stringify(
        {
            pageCount: pages.length,
            totalMs: Date.now() - t0,
            mixtapeRows: pages.reduce((s, p) => s + p.n, 0),
            p50Ms: pages.map((p) => p.ms).sort((a, b) => a - b)[Math.floor(pages.length / 2)],
            maxMs: Math.max(...pages.map((p) => p.ms)),
            firstPageMs: pages[0]?.ms,
            lastPageMs: pages[pages.length - 1]?.ms,
        },
        null,
        2,
    ),
);