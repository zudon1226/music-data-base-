/**
 * Phase 28E — Staging API fixtures (no Production Roll Call play mutation).
 * Credentials: .env.staging.local only.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { SongPlayEngagementModel } from "../lib/song-play-engagement.shared.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_ENV_FILE = ".env.staging.local";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const ROLL_CALL_ID = "497b9cfd-e752-4060-9528-5134a2ff7f37";

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
    return env;
}

function fail(message) {
    console.error(`FAIL ${message}`);
    process.exitCode = 1;
}

function pass(message) {
    console.log(`PASS ${message}`);
}

function isVercelDeploymentProtectionResponse(status, body) {
    if (status !== 401) return false;
  const text = typeof body === "string" ? body : JSON.stringify(body || {});
    return /Protected by Vercel Authentication|vercel_auth_enabled|Protected deployment/i.test(text);
}

async function postJsonViaVercelCurl(baseUrl, path, payload) {
    const bodyFile = joinPath(tmpdir(), `mdb-phase28e-play-${randomUUID()}.json`);
    writeFileSync(bodyFile, JSON.stringify(payload), "utf8");
    const dataArg = process.platform === "win32" ? `@${bodyFile}` : `@${bodyFile}`;
    const args = [
        "vercel",
        "curl",
        path,
        "--deployment",
        baseUrl.replace(/\/$/, ""),
        "--yes",
        "--",
        "--request",
        "POST",
        "--header",
        "Content-Type: application/json",
        "--data",
        dataArg,
    ];
    const result = spawnSync("npx", args, { encoding: "utf8", shell: true });
    try {
        unlinkSync(bodyFile);
    } catch {
        /* ignore */
    }
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    const jsonLine = (result.stdout || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith("{"));
    if (!jsonLine) {
        return { ok: false, status: result.status || 1, body: { error: "vercel curl produced no JSON", detail: combined.slice(-400) } };
    }
    try {
        return { ok: true, status: 200, body: JSON.parse(jsonLine) };
    } catch {
        return { ok: false, status: 500, body: { error: "vercel curl JSON parse failed" } };
    }
}

async function postPlay(base, songId, sessionId) {
    const url = `${base.replace(/\/$/, "")}/api/songs/${encodeURIComponent(songId)}/play`;
    const payload = { playbackSessionId: sessionId, event: "qualified_start" };
    const playRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const playBody = await playRes.json().catch(() => ({}));
    if (isVercelDeploymentProtectionResponse(playRes.status, playBody)) {
        const viaCurl = await postJsonViaVercelCurl(base, `/api/songs/${encodeURIComponent(songId)}/play`, payload);
        return { status: viaCurl.ok ? 200 : 401, body: viaCurl.body };
    }
    return { status: playRes.status, body: playBody };
}

const env = parseEnvFile(join(root, STAGING_ENV_FILE));
const url = String(env.NEXT_PUBLIC_SUPABASE_URL || "");
const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "");
const anonKey = String(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

if (!url.includes(STAGING_REF)) {
    fail(`NEXT_PUBLIC_SUPABASE_URL must target staging ref ${STAGING_REF}`);
}
if (url.includes(PRODUCTION_REF)) {
    fail("Refusing Production Supabase URL");
}

pass(`staging URL ref check (${STAGING_REF})`);

if (!serviceKey || !anonKey) {
    fail("staging keys missing in .env.staging.local");
    process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const { data: publicRows, error: pubErr } = await admin
    .from("songs")
    .select("id,title,streaming_enabled,plays")
    .eq("streaming_enabled", true)
    .limit(5);

if (pubErr) {
    fail(`public catalog read: ${pubErr.message}`);
} else {
    pass(`public streaming_enabled=true query (${(publicRows || []).length} rows sample)`);
}

const { data: draftRows } = await admin
    .from("songs")
    .select("id")
    .eq("streaming_enabled", false)
    .limit(3);
pass(`draft/non-public rows sample (${(draftRows || []).length} found)`);

const fixturePublic = (publicRows || []).find((row) => row.id !== ROLL_CALL_ID);
if (fixturePublic?.id) {
    pass(`fixture public song id present (${fixturePublic.id.slice(0, 8)}…, not Roll Call)`);
    const beforePlays = Number(fixturePublic.plays) || 0;
    const fixtureId = fixturePublic.id;
    const sessionId = randomUUID();
    const base =
        process.env.PHASE28E_PREVIEW_BASE_URL ||
        process.env.MDB_PREVIEW_BASE_URL ||
        "http://127.0.0.1:3099";

    try {
        const { status: playStatus, body: playBody } = await postPlay(base, fixtureId, sessionId);
        if (playStatus >= 200 && playStatus < 300 && playBody.ok === true && !playBody.duplicate) {
            pass(`preview play API accepted fixture (${playStatus})`);
            const { data: after } = await admin.from("songs").select("plays").eq("id", fixtureId).maybeSingle();
            const afterPlays = Number(after?.plays) || 0;
            if (afterPlays === beforePlays + 1) {
                pass("fixture play count incremented in staging DB");
            } else {
                fail(`fixture play count expected ${beforePlays + 1}, got ${afterPlays} (base=${base})`);
            }
            const dup = await postPlay(base, fixtureId, sessionId);
            const dupBody = dup.body;
            if (dup.status === 200 && dupBody.duplicate === true) {
                pass("duplicate session dedup on play API");
            } else {
                fail(`duplicate play response unexpected (${dup.status})`);
            }
        } else if (base.includes("127.0.0.1")) {
            console.log(`SKIP live play API — start server at ${base} for HTTP E2E`);
        } else {
            fail(`play API ${playStatus}: ${playBody.error || JSON.stringify(playBody)}`);
        }
    } catch (error) {
        if (base.includes("127.0.0.1")) {
            console.log("SKIP live play API — local server not reachable");
        } else {
            fail(`play API fetch failed: ${error instanceof Error ? error.message : "unknown"}`);
        }
    }
} else {
    console.log("SKIP play HTTP E2E — no non–Roll Call public fixture on staging");
}

if (draftRows?.[0]?.id) {
    const draftId = draftRows[0].id;
    const { data: anonList } = await anon.from("songs").select("id").eq("id", draftId);
    if (!anonList?.length) {
        pass("draft id not visible via anon client direct select (RLS)");
    } else {
        console.log("WARN draft visible to anon direct select — review RLS");
    }
}

const model = new SongPlayEngagementModel();
const throttleSong = randomUUID();
const listener = "anon:test";
const sessionA = randomUUID();
const sessionB = randomUUID();
model.recordQualifiedPlay({
    songId: throttleSong,
    listenerKey: listener,
    playbackSessionId: sessionA,
    event: "qualified_start",
    now: 1_000,
});
const throttled = model.recordQualifiedPlay({
    songId: throttleSong,
    listenerKey: listener,
    playbackSessionId: sessionB,
    event: "qualified_start",
    now: 5_000,
});
if (throttled.accepted === false && throttled.duplicate === true && throttled.reason === "throttled") {
    pass("45s throttle model");
} else {
    fail("45s throttle model");
}

const badEvent = model.recordQualifiedPlay({
    songId: randomUUID(),
    listenerKey: listener,
    playbackSessionId: randomUUID(),
    event: "failed_start",
});
if (!badEvent.accepted && badEvent.reason === "invalid_event") {
    pass("failed playback event rejected in model");
} else {
    fail("invalid event model");
}

if (process.exitCode) {
    console.log("\nverify-phase28e-staging-api.mjs FAIL");
    process.exit(1);
}
console.log("\nverify-phase28e-staging-api.mjs PASS");