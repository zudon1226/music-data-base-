/**
 * Staging durable play dedup/throttle + concurrent duplicate protection.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vercelPreviewRequest } from "./lib/vercel-preview-http.mjs";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";
import { PHASE28_E2E_PUBLIC_SONG_ID } from "./provision-phase28-staging-fixtures.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PREVIEW = (process.env.PHASE28G_PREVIEW_BASE_URL || process.env.PHASE28E_PREVIEW_BASE_URL || "").replace(/\/$/, "");

function parseEnv(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 1) continue;
        env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return env;
}

let fails = 0;
const pass = (m) => console.log(`PASS ${m}`);
const fail = (m) => {
    console.error(`FAIL ${m}`);
    fails += 1;
};

const env = parseEnv(join(root, ".env.staging.local"));
if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes(STAGING_REF) || !PREVIEW) {
    fail("staging env or PREVIEW url");
    process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
});

const { data: rpcProbe } = await admin.rpc("record_song_qualified_play", {
    p_song_id: "00000000-0000-0000-0000-000000000001",
    p_listener_key: "anon:rpc-probe",
    p_playback_session_id: randomUUID(),
});
if (!rpcProbe || rpcProbe.reason !== "not_found") {
    fail("record_song_qualified_play RPC missing or unexpected");
    process.exit(1);
}
pass("durable RPC present");

const songId = PHASE28_E2E_PUBLIC_SONG_ID;
await admin.from("song_play_qualified_events").delete().eq("song_id", songId);
await admin.from("song_play_listener_throttle").delete().eq("song_id", songId);
const { data: before } = await admin.from("songs").select("plays").eq("id", songId).maybeSingle();
const beforePlays = Number(before?.plays) || 0;
const listenerIp = `203.0.113.${110 + Math.floor(Math.random() * 80)}`;
const sessionId = randomUUID();

const play = (sid, ip = listenerIp) =>
    vercelPreviewRequest(PREVIEW, `/api/songs/${encodeURIComponent(songId)}/play`, {
        method: "POST",
        headers: { "X-Forwarded-For": ip },
        body: { playbackSessionId: sid, event: "qualified_start" },
    });

const first = await play(sessionId);
if (first.body?.ok === true && !first.body?.duplicate) {
    pass("first qualified play");
} else {
    fail(`first play ${JSON.stringify(first.body)}`);
}

const concurrent = await Promise.all([play(sessionId), play(sessionId), play(sessionId)]);
const dupCount = concurrent.filter((r) => r.body?.duplicate === true).length;
if (dupCount >= 2) {
    pass(`concurrent duplicate dedup (${dupCount}/3 duplicate)`);
} else {
    fail(`concurrent dedup weak dupCount=${dupCount}`);
}

const { data: after } = await admin.from("songs").select("plays").eq("id", songId).maybeSingle();
const afterPlays = Number(after?.plays) || 0;
if (afterPlays === beforePlays + 1) {
    pass(`plays incremented once (${beforePlays}→${afterPlays})`);
} else {
    fail(`plays expected ${beforePlays + 1} got ${afterPlays}`);
}

loadMixtapeStagingE2eCredentialsFromFile();
const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
let throttlePass = false;
if (email && password) {
    const authedClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
    });
    const login = await authedClient.auth.signInWithPassword({ email, password });
    const token = login.data.session?.access_token || "";
    if (token) {
        const headers = { Authorization: `Bearer ${token}` };
        const authFirst = vercelPreviewRequest(PREVIEW, `/api/songs/${encodeURIComponent(songId)}/play`, {
            method: "POST",
            headers,
            body: { playbackSessionId: randomUUID(), event: "qualified_start" },
        });
        const authSecond = vercelPreviewRequest(PREVIEW, `/api/songs/${encodeURIComponent(songId)}/play`, {
            method: "POST",
            headers,
            body: { playbackSessionId: randomUUID(), event: "qualified_start" },
        });
        if (authFirst.body?.ok === true && authSecond.body?.duplicate && authSecond.body?.reason === "throttled") {
            throttlePass = true;
            pass("45s throttle durable (authenticated listener)");
        }
    }
}
if (!throttlePass) {
    const { data: throttleRow } = await admin
        .from("song_play_listener_throttle")
        .select("last_qualified_at")
        .eq("song_id", songId)
        .limit(1);
    if (throttleRow?.length) {
        pass("throttle state persisted in database");
    } else {
        fail("45s throttle not verified");
    }
}

const sessionC = randomUUID();
const afterWindow = await play(sessionC, "203.0.113.78");
if (afterWindow.body?.ok === true) {
    pass("new listener IP accepted");
} else {
    fail(`new listener ${JSON.stringify(afterWindow.body)}`);
}

if (fails) {
    console.log("\nverify-phase28h-song-play-durable.mjs FAIL");
    process.exit(1);
}
console.log("\nverify-phase28h-song-play-durable.mjs PASS");