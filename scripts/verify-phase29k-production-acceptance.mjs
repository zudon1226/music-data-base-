#!/usr/bin/env node
/**
 * Phase 29K — Production creator/upload/listener acceptance (HTTP + DB RPC).
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadProductionEnv, productionBaseUrl } from "./lib/load-production-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = productionBaseUrl();
const results = [];
function record(id, status, detail = "") {
    const detailText = detail === undefined || detail === null ? "" : String(detail);
    results.push({ id, status, detail: detailText });
    console.log(`${status.padEnd(7)} [${id}]${detailText ? ` — ${detailText}` : ""}`);
}

function authHeaders(token) {
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" };
}

async function getJson(path) {
    const r = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
    const body = await r.json().catch(() => ({}));
    return { status: r.status, body };
}

async function postJson(path, body, token) {
    const r = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: token ? authHeaders(token) : { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
    });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 120) }; }
    return { status: r.status, json };
}

async function signIn(env, email, password) {
    const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session?.access_token) return null;
    return { token: data.session.access_token, userId: data.user?.id || "" };
}

async function mintMagicSession(env, email) {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
    });
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data?.properties?.hashed_token) return null;
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    if (!verified.data.session?.access_token) return null;
    return { token: verified.data.session.access_token, userId: verified.data.user?.id || "" };
}

const LEGAL_UPLOAD_DENIAL = /Creator \/ Upload Agreement/i;

function classifyUploadHttp(status, json) {
    const error = String(json?.error || json?.message || "");
    if (status === 401) return { gate: "unauthorized" };
    if (status === 403 && LEGAL_UPLOAD_DENIAL.test(error)) return { gate: "legal" };
    if (status === 403) return { gate: "denied" };
    if (status === 200 || status === 400) return { gate: "allowed" };
    return { gate: "other", error };
}

async function pickFixtureAccounts(dbUrl) {
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
        const { rows } = await client.query(`
      select
        u.id as user_id,
        u.email,
        lower(p.account_type) as account_type,
        exists (
          select 1 from public.legal_acceptances la
          where la.user_id = u.id and la.policy_type = 'creator_upload'
        ) as has_creator_legal,
        coalesce(fm.approval_status, 'none') as founding_approval
      from auth.users u
      join public.profiles p on p.user_id = u.id
      left join public.founding_members fm on fm.user_id = u.id
      where lower(p.account_type) in ('listener','artist','producer','founding_artist','founding_producer','creator','founding_creator')
    `);
        return rows;
    } finally {
        await client.end().catch(() => {});
    }
}

function pickBestRow(rows, accountTypes) {
    const pool = rows.filter((r) => accountTypes.includes(r.account_type));
    pool.sort((a, b) => {
        const score = (row) => {
            let s = 0;
            if (row.has_creator_legal) s += 4;
            if (row.founding_approval === "approved" || row.founding_approval === "none") s += 2;
            if (row.founding_approval === "rejected") s -= 8;
            return s;
        };
        return score(b) - score(a);
    });
    return pool[0] || null;
}

function loadCreatorFixture() {
    const path = join(root, "tmp", "phase29k-production-video-creator-fixture.json");
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
}

async function main() {
    const env = loadProductionEnv();
    const evidenceDir = join(root, "tmp");
    mkdirSync(evidenceDir, { recursive: true });

    // --- Guest / listener discovery ---
    for (const [id, path] of [
        ["catalog-songs", "/api/songs"],
        ["catalog-videos", "/api/videos?limit=3"],
        ["catalog-mixtapes", "/api/mixtapes?scope=public&limit=3"],
        ["catalog-marketplace", "/api/ringtones/marketplace?filter=all"],
        ["launch", "/api/launch/status"],
    ]) {
        const r = await getJson(path);
        record(`guest-${id}`, r.status === 200 ? "PASS" : "FAIL", `http=${r.status}`);
    }

    const roll = await getJson("/api/songs");
    const songs = Array.isArray(roll.body?.songs) ? roll.body.songs : [];
    const rc = songs.find((s) => /roll call/i.test(String(s?.title || "")));
    record("listener-roll-call-visible", rc?.id ? "PASS" : "FAIL", rc ? `price_cents=${rc.price_cents}` : "missing");

    record("guest-upload-audio-401", (await postJson("/api/upload-audio", { mode: "prepare-storage-upload", storagePath: "00000000-0000-0000-0000-000000000001/x.mp3" })).status === 401 ? "PASS" : "FAIL", "");
    record("guest-video-upload-401", (await postJson("/api/video-upload", { mode: "prepare-storage-upload", storagePath: "00000000-0000-0000-0000-000000000001/x.mp4" })).status === 401 ? "PASS" : "FAIL", "");
    record("guest-sales-checkout-401", (await postJson("/api/sales/checkout", { userId: "00000000-0000-0000-0000-000000000002", items: [] })).status === 401 ? "PASS" : "FAIL", "");

    const ringtoneMarket = await getJson("/api/ringtones/marketplace?filter=free");
    const betaLocked = ringtoneMarket.body?.publicBetaPaidPurchaseLocked === true;
    record("free-ringtone-discovery", ringtoneMarket.status === 200 ? "PASS" : "FAIL", `total=${ringtoneMarket.body?.total ?? "?"}`);
    record("beta-paid-checkout-locked", betaLocked ? "PASS" : "FAIL", `paidCheckoutAvailable=${ringtoneMarket.body?.paidCheckoutAvailable}`);

    const launch = await getJson("/api/launch/status");
    record("beta-launch-status", launch.status === 200 ? "PASS" : "WARN", `http=${launch.status}`);

    const producersCatalog = await getJson("/api/producers");
    const beatCount = Array.isArray(producersCatalog.body?.beats) ? producersCatalog.body.beats.length : 0;
    record("listener-beat-discovery", producersCatalog.status === 200 ? "PASS" : "FAIL", `beats=${beatCount}`);

  const podcasts = await getJson("/api/podcasts?limit=3");
    record("listener-podcast-catalog", podcasts.status === 200 ? "PASS" : "WARN", `http=${podcasts.status}`);

    // --- Video Creator fixture ---
    const fixture = loadCreatorFixture();
    let creatorSession = null;
    if (fixture?.email && fixture?.password) {
        creatorSession = await signIn(env, fixture.email, fixture.password);
    } else if (process.env.MDB_PHASE29K_VIDEO_CREATOR_EMAIL && process.env.MDB_PHASE29K_VIDEO_CREATOR_PASSWORD) {
        creatorSession = await signIn(env, process.env.MDB_PHASE29K_VIDEO_CREATOR_EMAIL, process.env.MDB_PHASE29K_VIDEO_CREATOR_PASSWORD);
    }

    if (!creatorSession) {
        record("creator-video-creator-session", "BLOCKED", "run provision-production-video-creator.mjs first");
    } else {
        record("creator-session", "PASS", `user=${creatorSession.userId.slice(0, 8)}…`);
        const music = await postJson("/api/upload-audio", {
            mode: "prepare-storage-upload",
            userId: creatorSession.userId,
            storagePath: `${creatorSession.userId}/probe.mp3`,
        }, creatorSession.token);
        record("creator-music-upload-denied", music.status === 403 ? "PASS" : "FAIL", `http=${music.status}`);

        const video = await postJson("/api/video-upload", {
            mode: "prepare-storage-upload",
            userId: creatorSession.userId,
            storagePath: `${creatorSession.userId}/probe.mp4`,
        }, creatorSession.token);
        record("creator-video-upload-allowed", video.status === 200 || video.status === 400 ? "PASS" : "FAIL", `http=${video.status} (400=validation ok, not 403 gate)`);

        const eligibilityRes = await fetch(
            `${BASE}/api/ringtones/eligibility?userId=${encodeURIComponent(creatorSession.userId)}`,
            { headers: authHeaders(creatorSession.token) },
        );
        const eligibilityBody = await eligibilityRes.json().catch(() => ({}));
        record(
            "creator-ringtone-eligibility",
            eligibilityRes.status === 200 ? "PASS" : "WARN",
            `studio=${eligibilityBody?.canAccessRingtoneStudio} musicRingtone=${eligibilityBody?.canCreateRingtones}`,
        );

        const profileRes = await fetch(
            `${BASE}/api/user-profile?userId=${encodeURIComponent(creatorSession.userId)}`,
            { headers: authHeaders(creatorSession.token) },
        );
        const profileBody = await profileRes.json().catch(() => ({}));
        record(
            "creator-dashboard-permissions",
            profileBody.canUpload === true
                && profileBody.isArtist === false
                && profileBody.isProducer === false
                && profileBody.canProducerDashboard === false
                && profileBody.canArtistDashboard === false
                ? "PASS"
                : "FAIL",
            `canUpload=${profileBody.canUpload} role=${profileBody.role}`,
        );

        if (env.DATABASE_URL) {
            const db = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
            await db.connect();
            try {
                const m = await db.query("select public.can_upload_music_content($1::uuid) ok", [creatorSession.userId]);
                const v = await db.query("select public.can_upload_video_content($1::uuid) ok", [creatorSession.userId]);
                record("creator-db-rpc-split", m.rows[0]?.ok === false && v.rows[0]?.ok === true ? "PASS" : "FAIL", `music=${m.rows[0]?.ok} video=${v.rows[0]?.ok}`);
            } finally {
                await db.end().catch(() => {});
            }
        }
    }

    if (rc?.audio_url || rc?.stream_url) {
        const playbackUrl = String(rc.audio_url || rc.stream_url);
        const head = await fetch(playbackUrl, { method: "HEAD" }).catch(() => null);
        record("listener-song-playback-url", head && head.ok ? "PASS" : "WARN", head ? `http=${head.status}` : "fetch failed");
    }

    // --- Artist / Producer / Listener via magic link (read-only session mint) ---
    if (env.DATABASE_URL) {
        const rows = await pickFixtureAccounts(env.DATABASE_URL);
        for (const slot of [
            { id: "artist", types: ["artist", "founding_artist"] },
            { id: "producer", types: ["producer", "founding_producer"] },
            { id: "listener", types: ["listener"] },
        ]) {
            const row = pickBestRow(rows, slot.types);
            if (!row?.email) {
                record(`${slot.id}-session`, "BLOCKED", "no profile");
                continue;
            }
            const session = await mintMagicSession(env, row.email);
            if (!session) {
                record(`${slot.id}-session`, "FAIL", "magiclink session failed");
                continue;
            }
            record(`${slot.id}-session`, "PASS", `${row.account_type} legal=${row.has_creator_legal}`);

            const music = await postJson("/api/upload-audio", {
                mode: "prepare-storage-upload",
                userId: session.userId,
                storagePath: `${session.userId}/probe.mp3`,
            }, session.token);
            const video = await postJson("/api/video-upload", {
                mode: "prepare-storage-upload",
                userId: session.userId,
                storagePath: `${session.userId}/probe.mp4`,
            }, session.token);

            if (slot.id === "listener") {
                record("listener-music-denied", music.status === 403 || music.status === 401 ? "PASS" : "FAIL", `http=${music.status}`);
                record("listener-video-denied", video.status === 403 || video.status === 401 ? "PASS" : "FAIL", `http=${video.status}`);
                const spoof = await postJson("/api/upload-audio", {
                    mode: "prepare-storage-upload",
                    userId: "00000000-0000-0000-0000-000000000099",
                    storagePath: "00000000-0000-0000-0000-000000000099/probe.mp3",
                }, session.token);
                record("security-listener-spoof-userid", spoof.status === 401 || spoof.status === 403 ? "PASS" : "FAIL", `http=${spoof.status}`);
            } else {
                const musicGate = classifyUploadHttp(music.status, music.json);
                const videoGate = classifyUploadHttp(video.status, video.json);
                record(`${slot.id}-music-gate`, musicGate.gate === "allowed" ? "PASS" : musicGate.gate === "legal" ? "BLOCKED" : "FAIL", `http=${music.status} gate=${musicGate.gate}`);
                record(`${slot.id}-video-gate`, videoGate.gate === "allowed" ? "PASS" : videoGate.gate === "legal" ? "BLOCKED" : "FAIL", `http=${video.status} gate=${videoGate.gate}`);

                const album = await postJson("/api/albums/create", {
                    userId: session.userId,
                    title: "Phase29K Probe Album",
                    storagePath: `${session.userId}/albums/probe-cover.jpg`,
                }, session.token);
                const albumGate = classifyUploadHttp(album.status, album.json);
                record(`${slot.id}-album-create-gate`, albumGate.gate === "allowed" ? "PASS" : albumGate.gate === "legal" ? "BLOCKED" : albumGate.gate === "denied" ? "FAIL" : "WARN", `http=${album.status}`);

                const profileRes = await fetch(
                    `${BASE}/api/user-profile?userId=${encodeURIComponent(session.userId)}`,
                    { headers: authHeaders(session.token) },
                );
                const profileBody = await profileRes.json().catch(() => ({}));
                if (slot.id === "artist") {
                    record("artist-dashboard-permissions", profileBody.canArtistDashboard === true ? "PASS" : "FAIL", `canUpload=${profileBody.canUpload}`);
                } else {
                    record("producer-dashboard-permissions", profileBody.canProducerDashboard === true ? "PASS" : "FAIL", `canUpload=${profileBody.canUpload}`);
                }

                const ringtoneDraft = await postJson("/api/ringtones", {
                    userId: session.userId,
                    action: "save-draft",
                    title: "Phase29K Probe",
                }, session.token);
                record(`${slot.id}-ringtone-draft-api`, ringtoneDraft.status === 401 ? "FAIL" : ringtoneDraft.status === 403 ? "WARN" : "PASS", `http=${ringtoneDraft.status}`);
            }

            if (slot.id === "listener") {
                const checkout = await postJson("/api/sales/checkout", { userId: session.userId, items: [] }, session.token);
                record("listener-checkout-beta-locked", checkout.status === 403 ? "PASS" : "WARN", `http=${checkout.status}`);
            }
        }
    }

    record("device-ui-matrix", "BLOCKED", "owner: desktop + iPhone Safari + Android Chrome on www");

    writeFileSync(join(evidenceDir, "phase29k-production-acceptance-evidence.json"), JSON.stringify({
        base: BASE,
        checkedAt: new Date().toISOString(),
        results,
    }, null, 2));

    const fails = results.filter((r) => r.status === "FAIL");
    console.log(`\nPHASE29K_PRODUCTION_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});