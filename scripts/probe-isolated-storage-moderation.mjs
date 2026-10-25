/**
 * HTTP probes for isolated storage moderation enforcement.
 * Usage:
 *   MDB_ISOLATED_SUPABASE_E2E=1 node scripts/probe-isolated-storage-moderation.mjs
 * Optional app probes (requires Next on APP_BASE_URL, default http://127.0.0.1:3000):
 *   MDB_ISOLATED_PROBE_APP=1 MDB_ISOLATED_SUPABASE_E2E=1 node scripts/probe-isolated-storage-moderation.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertBlocksProductionRef, loadEnv, resolveIsolatedSupabaseConfig } from "./_isolated-storage-probe-env.mjs";
import {
    dropModerationStateColumns,
    hideSongsCatalogTable,
    hideVideosCatalogTable,
    restoreModerationStateColumns,
    restoreSongsCatalogTable,
    restoreVideosCatalogTable,
} from "./_isolated-probe-faults.mjs";
import { evaluateFailClosedProbe, responseLooksLikeMedia } from "../lib/isolated-probe-fail-closed.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(root, "scripts", ".mdb-isolated-storage-fixtures.json");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

async function storageGet(apiUrl, bucket, objectPath, bearerKey, route = "object") {
    const url = `${apiUrl}/storage/v1/${route}/${bucket}/${encodePath(objectPath)}`;
    const response = await fetch(url, {
        method: "GET",
        headers: {
            apikey: bearerKey,
            Authorization: `Bearer ${bearerKey}`,
        },
        redirect: "manual",
    });
    const bodySample = response.status === 200 ? `[${response.headers.get("content-length") || "?"} bytes]` : (await response.text()).slice(0, 120);
    return { status: response.status, ok: response.ok, urlKind: route, bodySample };
}

async function signIn(url, anonKey, email, password) {
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session?.access_token) {
        throw new Error(error?.message || `sign-in failed for ${email}`);
    }
    return data.session.access_token;
}

function expectAccess(label, result, shouldAllow) {
    const allowed = result.status >= 200 && result.status < 300;
    const pass = allowed === shouldAllow;
    return { label, pass, shouldAllow, status: result.status, urlKind: result.urlKind };
}

async function verifySchema(client) {
    const buckets = await client.query(
        "select id, public from storage.buckets where id in ('songs','videos') order by id",
    );
    const fn = await client.query(
        "select proname from pg_proc join pg_namespace n on n.oid = pronamespace where n.nspname = 'public' and proname = 'storage_catalog_object_may_be_read'",
    );
    return {
        buckets: buckets.rows,
        hasReadGateFunction: fn.rowCount > 0,
    };
}

async function probeAppRoute(baseUrl, path, options = {}) {
    const headers = {};
    if (options.range) {
        headers.Range = options.range;
    }
    if (options.bearer) {
        headers.Authorization = `Bearer ${options.bearer}`;
    }
    const response = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers,
        redirect: "manual",
    });
    const contentType = response.headers.get("content-type") || "";
    const bodyBuffer = await response.arrayBuffer();
    const isMediaBody = responseLooksLikeMedia(contentType) && bodyBuffer.byteLength > 0;
    let jsonCode = "";
    if (contentType.toLowerCase().includes("application/json") && bodyBuffer.byteLength > 0) {
        try {
            const parsed = JSON.parse(new TextDecoder().decode(bodyBuffer));
            jsonCode = String(parsed.code || "");
        }
        catch {
            jsonCode = "";
        }
    }
    return {
        status: response.status,
        ok: response.ok,
        contentType,
        acceptRanges: response.headers.get("accept-ranges") || "",
        contentRange: response.headers.get("content-range") || "",
        contentLength: response.headers.get("content-length") || String(bodyBuffer.byteLength),
        isMediaBody,
        jsonCode,
        bodyBytes: bodyBuffer.byteLength,
    };
}

async function probeAppPost(baseUrl, path, body, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (options.bearer) {
        headers.Authorization = `Bearer ${options.bearer}`;
    }
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "manual",
    });
    const contentType = response.headers.get("content-type") || "";
    const bodyBuffer = await response.arrayBuffer();
    const isMediaBody = responseLooksLikeMedia(contentType) && bodyBuffer.byteLength > 0;
    let jsonCode = "";
    if (contentType.toLowerCase().includes("application/json") && bodyBuffer.byteLength > 0) {
        try {
            const parsed = JSON.parse(new TextDecoder().decode(bodyBuffer));
            jsonCode = String(parsed.code || "");
        }
        catch {
            jsonCode = "";
        }
    }
    return {
        status: response.status,
        ok: response.ok,
        contentType,
        isMediaBody,
        jsonCode,
        bodyBytes: bodyBuffer.byteLength,
    };
}

function expectAppProbe(label, probe, { allow, expectStatus, require206Range = false, allowNoMediaOnDeny = true }) {
    let pass;
    if (allow) {
        const wanted = expectStatus ?? 200;
        pass = probe.status === wanted;
        if (require206Range) {
            pass = pass
                && probe.acceptRanges.toLowerCase() === "bytes"
                && /^bytes /i.test(probe.contentRange);
        }
    }
    else {
        if (expectStatus !== undefined) {
            pass = probe.status === expectStatus;
        }
        else {
            pass = probe.status === 404 || probe.status === 400 || probe.status === 403 || probe.status === 401;
            if (!probe.isMediaBody && probe.status === 503) {
                pass = true;
            }
        }
        if (allowNoMediaOnDeny && probe.isMediaBody) {
            pass = false;
        }
    }
    return {
        label,
        pass,
        shouldAllow: allow,
        status: probe.status,
        contentType: probe.contentType,
        acceptRanges: probe.acceptRanges,
        contentRange: probe.contentRange,
        isMediaBody: probe.isMediaBody,
        jsonCode: probe.jsonCode || undefined,
        layer: "app",
    };
}

function expectFailClosedAppProbe(label, probe, options = {}) {
    const evaluation = evaluateFailClosedProbe(probe, options);
    return {
        label,
        pass: evaluation.pass,
        shouldAllow: false,
        status: probe.status,
        contentType: probe.contentType,
        isMediaBody: probe.isMediaBody,
        jsonCode: probe.jsonCode || undefined,
        layer: "app_fault",
        note: options.note || "",
    };
}

async function sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertNextUsesLocalSupabase(appBase, config) {
    const response = await fetch(`${appBase}/api/audio?path=__mdb_probe_missing__`, { redirect: "manual" });
    if (response.status === 503) {
        const body = await response.json().catch(() => ({}));
        if (String(body.code || "") === "MODERATION_UNAVAILABLE") {
            throw new Error("Next app responded but moderation schema probe returned 503 unexpectedly.");
        }
    }
    if (config.urlHost !== "127.0.0.1" && config.urlHost !== "localhost") {
        throw new Error("Refusing app probes: Supabase API host is not localhost.");
    }
}

const env = loadEnv();
assertBlocksProductionRef(env);
if (String(env.NEXT_PUBLIC_SUPABASE_URL || "").includes(PRODUCTION_REF)) {
    throw new Error(`Blocked production ref ${PRODUCTION_REF} in NEXT_PUBLIC_SUPABASE_URL.`);
}

const config = resolveIsolatedSupabaseConfig(env);
if (!existsSync(MANIFEST)) {
    console.error("Missing fixture manifest. Run seed-isolated-storage-moderation-fixtures.mjs first.");
    process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const { cases, emails, password } = manifest;

const pgClient = new pg.Client({ connectionString: config.dbUrl });
const results = [];
let schema = null;

try {
    await pgClient.connect();
    schema = await verifySchema(pgClient);

    const fixtureStateChecks = [
        ["songs", cases.clearSong.id, "clear"],
        ["songs", cases.heldSong.id, "takedown_pending"],
        ["songs", cases.removedSong.id, "removed"],
        ["songs", cases.legacyHeld.id, "takedown_pending"],
        ["videos", cases.clearVideo.id, "clear"],
        ["videos", cases.heldVideo.id, "takedown_pending"],
    ];
    for (const [table, id, expected] of fixtureStateChecks) {
        const relation = table === "videos" ? "public.videos" : "public.songs";
        const row = await pgClient.query(`select moderation_state from ${relation} where id = $1`, [id]);
        const actual = row.rows[0]?.moderation_state ?? null;
        results.push({
            label: `sql_fixture_state_${table}_${expected}`,
            pass: actual === expected,
            shouldAllow: false,
            layer: "sql",
            note: actual === expected ? "" : `expected ${expected}, found ${actual ?? "missing"}`,
        });
    }

    async function expectReadGate(label, bucket, objectPath, shouldAllow) {
        const gate = await pgClient.query(
            "select public.storage_catalog_object_may_be_read($1, $2) as allowed",
            [bucket, objectPath],
        );
        const allowed = gate.rows[0]?.allowed === true;
        results.push({
            label,
            pass: allowed === shouldAllow,
            shouldAllow,
            status: allowed ? 200 : 403,
            layer: "sql",
        });
    }

    await expectReadGate("sql_clear_song", "songs", cases.clearSong.path, true);
    await expectReadGate("sql_held_song", "songs", cases.heldSong.path, false);
    await expectReadGate("sql_removed_song", "songs", cases.removedSong.path, false);
    await expectReadGate("sql_orphan_song", "songs", cases.orphanSong.path, false);
    await expectReadGate("sql_ambiguous_clear_removed", "songs", cases.ambiguousSong.path, false);
    await expectReadGate("sql_legacy_ambiguous_clear_removed", "songs", cases.legacyAmbiguous.path, false);
    await expectReadGate("sql_clear_video", "videos", cases.clearVideo.path, true);
    await expectReadGate("sql_held_video", "videos", cases.heldVideo.path, false);

    const legacyAdmin = await pgClient.query(
        "select count(*)::int as n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'app_bucket_platform_admin_full_access'",
    );
    results.push({
        label: "sql_legacy_admin_all_absent",
        pass: Number(legacyAdmin.rows[0]?.n || 0) === 0,
        shouldAllow: false,
        layer: "sql",
        note: "app_bucket_platform_admin_full_access must not grant songs/videos SELECT",
    });

    const ownerLookup = await pgClient.query("select user_id from public.songs where id = $1", [cases.clearSong.id]);
    const fixtureOwnerId = ownerLookup.rows[0]?.user_id;
    if (!fixtureOwnerId) throw new Error("Clear fixture song is missing an owner.");
    await pgClient.query("begin");
    try {
        const clearHeldPath = `sql-gate/${crypto.randomUUID()}-clear-held.mp3`;
        const multiClearPath = `sql-gate/${crypto.randomUUID()}-multi-clear.mp3`;
        await pgClient.query(
            `insert into public.songs (id, title, artist, category, type, audio_url, storage_path, user_id, moderation_state)
             values ($1, 'SQL clear sibling', 'Fixture', 'Test', 'Beats', '', $2, $3, 'clear'),
                    ($4, 'SQL held sibling', 'Fixture', 'Test', 'Beats', '', $2, $3, 'takedown_pending')`,
            [crypto.randomUUID(), clearHeldPath, fixtureOwnerId, crypto.randomUUID()],
        );
        const clearHeldGate = await pgClient.query(
            "select public.storage_catalog_object_may_be_read('songs', $1) as allowed",
            [clearHeldPath],
        );
        results.push({
            label: "sql_duplicate_clear_plus_held",
            pass: clearHeldGate.rows[0]?.allowed !== true,
            shouldAllow: false,
            layer: "sql",
        });
        await pgClient.query(
            `insert into public.songs (id, title, artist, category, type, audio_url, storage_path, user_id, moderation_state)
             values ($1, 'SQL clear A', 'Fixture', 'Test', 'Beats', '', $2, $3, 'clear'),
                    ($4, 'SQL clear B', 'Fixture', 'Test', 'Beats', '', $2, $3, 'clear')`,
            [crypto.randomUUID(), multiClearPath, fixtureOwnerId, crypto.randomUUID()],
        );
        const multiClearGate = await pgClient.query(
            "select public.storage_catalog_object_may_be_read('songs', $1) as allowed",
            [multiClearPath],
        );
        results.push({
            label: "sql_duplicate_multiple_clear",
            pass: multiClearGate.rows[0]?.allowed !== true,
            shouldAllow: false,
            layer: "sql",
        });
    }
    finally {
        await pgClient.query("rollback");
    }

    const ownerJwt = await signIn(config.url, config.anonKey, emails.owner, password);
    const otherJwt = await signIn(config.url, config.anonKey, emails.other, password);
    const adminJwt = await signIn(config.url, config.anonKey, emails.admin, password);

    // Private buckets: Supabase Storage returns 400 for anon JWT before RLS; clear catalog bytes
    // are expected via guarded app routes (/api/audio, /api/video-playback), not direct anon Storage.
    const matrix = [
        { key: "clearSong_anon", bucket: "songs", path: cases.clearSong.path, jwt: config.anonKey, allow: false, note: "private bucket rejects anon JWT at Storage API" },
        { key: "clearSong_owner", bucket: "songs", path: cases.clearSong.path, jwt: ownerJwt, allow: true },
        { key: "clearSong_other", bucket: "songs", path: cases.clearSong.path, jwt: otherJwt, allow: true },
        { key: "heldSong_anon", bucket: "songs", path: cases.heldSong.path, jwt: config.anonKey, allow: false },
        { key: "heldSong_owner", bucket: "songs", path: cases.heldSong.path, jwt: ownerJwt, allow: false },
        { key: "removedSong_owner", bucket: "songs", path: cases.removedSong.path, jwt: ownerJwt, allow: false },
        { key: "orphanSong_anon", bucket: "songs", path: cases.orphanSong.path, jwt: config.anonKey, allow: false },
        { key: "ambiguousSong_anon", bucket: "songs", path: cases.ambiguousSong.path, jwt: config.anonKey, allow: false },
        { key: "legacyOrphan_anon", bucket: "songs", path: cases.legacyOrphan.path, jwt: config.anonKey, allow: false },
        { key: "heldSong_owner_auth_storage", bucket: "songs", path: cases.heldSong.path, jwt: ownerJwt, allow: false },
        { key: "heldSong_admin_auth_storage", bucket: "songs", path: cases.heldSong.path, jwt: adminJwt, allow: false },
        { key: "heldVideo_owner_auth_storage", bucket: "videos", path: cases.heldVideo.path, jwt: ownerJwt, allow: false },
        { key: "heldVideo_admin_auth_storage", bucket: "videos", path: cases.heldVideo.path, jwt: adminJwt, allow: false },
        { key: "clearVideo_anon", bucket: "videos", path: cases.clearVideo.path, jwt: config.anonKey, allow: false, note: "private bucket rejects anon JWT at Storage API" },
        { key: "heldVideo_owner", bucket: "videos", path: cases.heldVideo.path, jwt: ownerJwt, allow: false },
        { key: "heldVideo_admin", bucket: "videos", path: cases.heldVideo.path, jwt: adminJwt, allow: false, note: "held media via guarded app routes, not Storage SELECT" },
    ];

    for (const row of matrix) {
        const objectResult = await storageGet(config.url, row.bucket, row.path, row.jwt, "object");
        const rowResult = expectAccess(`${row.key}_object`, objectResult, row.allow);
        if (row.note) rowResult.note = row.note;
        results.push(rowResult);
        const publicResult = await storageGet(config.url, row.bucket, row.path, row.jwt, "object/public");
        const publicAllowed = publicResult.status >= 200 && publicResult.status < 300;
        results.push({
            label: `${row.key}_publicRoute`,
            pass: !publicAllowed,
            shouldAllow: false,
            status: publicResult.status,
            urlKind: "object/public",
            note: "public object route must not succeed for private buckets",
        });
    }

    if (String(env.MDB_ISOLATED_PROBE_APP || "").trim() === "1") {
        for (const key of ["legacyClear", "legacyHeld", "legacyOrphan", "legacyAmbiguous"]) {
            if (!cases[key]?.path) {
                throw new Error(`Fixture manifest missing cases.${key}. Re-run seed-isolated-storage-moderation-fixtures.mjs`);
            }
        }
        const appBase = String(env.APP_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
        await assertNextUsesLocalSupabase(appBase, config);
        const fakeCatalogId = "00000000-0000-4000-8000-000000000099";
        const appCases = [
            { label: "api_audio_clear_with_id", path: `/api/audio?path=${encodeURIComponent(cases.clearSong.path)}&songId=${cases.clearSong.id}`, allow: true, expectStatus: 200 },
            { label: "api_audio_clear_id_rejects_other_path", path: `/api/audio?path=${encodeURIComponent(cases.heldSong.path)}&songId=${cases.clearSong.id}`, allow: false, expectStatus: 400 },
            { label: "api_audio_clear_path_only", path: `/api/audio?path=${encodeURIComponent(cases.clearSong.path)}`, allow: true, expectStatus: 200 },
            { label: "api_audio_held_anon", path: `/api/audio?path=${encodeURIComponent(cases.heldSong.path)}&songId=${cases.heldSong.id}`, allow: false },
            { label: "api_audio_held_owner_bearer", path: `/api/audio?path=${encodeURIComponent(cases.heldSong.path)}&songId=${cases.heldSong.id}`, bearer: ownerJwt, allow: false, note: "held: use /api/moderation/media-preview, not /api/audio" },
            { label: "api_audio_held_other_bearer", path: `/api/audio?path=${encodeURIComponent(cases.heldSong.path)}&songId=${cases.heldSong.id}`, bearer: otherJwt, allow: false },
            { label: "api_audio_held_admin_bearer", path: `/api/audio?path=${encodeURIComponent(cases.heldSong.path)}&songId=${cases.heldSong.id}`, bearer: adminJwt, allow: false, note: "held: admin must not bypass via /api/audio" },
            { label: "api_audio_removed", path: `/api/audio?path=${encodeURIComponent(cases.removedSong.path)}&songId=${cases.removedSong.id}`, allow: false },
            { label: "api_audio_removed_owner_bearer", path: `/api/audio?path=${encodeURIComponent(cases.removedSong.path)}&songId=${cases.removedSong.id}`, bearer: ownerJwt, allow: false },
            { label: "api_audio_removed_admin_bearer", path: `/api/audio?path=${encodeURIComponent(cases.removedSong.path)}&songId=${cases.removedSong.id}`, bearer: adminJwt, allow: false },
            { label: "api_audio_orphan", path: `/api/audio?path=${encodeURIComponent(cases.orphanSong.path)}`, allow: false },
            { label: "api_audio_ambiguous", path: `/api/audio?path=${encodeURIComponent(cases.ambiguousSong.path)}`, allow: false },
            { label: "api_audio_missing_catalog_id", path: `/api/audio?path=${encodeURIComponent(cases.clearSong.path)}&songId=${fakeCatalogId}`, allow: false },
            { label: "api_audio_legacy_clear_filename_only", path: `/api/audio?path=${encodeURIComponent(cases.legacyClear.path)}`, allow: true, expectStatus: 200 },
            { label: "api_audio_legacy_held_filename_only", path: `/api/audio?path=${encodeURIComponent(cases.legacyHeld.path)}`, allow: false },
            { label: "api_audio_legacy_orphan_filename_only", path: `/api/audio?path=${encodeURIComponent(cases.legacyOrphan.path)}`, allow: false },
            { label: "api_audio_legacy_ambiguous_filename_only", path: `/api/audio?path=${encodeURIComponent(cases.legacyAmbiguous.path)}`, allow: false },
            { label: "api_video_clear", path: `/api/video-playback?path=${encodeURIComponent(cases.clearVideo.path)}&videoId=${cases.clearVideo.id}`, allow: true, expectStatus: 200 },
            { label: "api_video_clear_id_rejects_other_path", path: `/api/video-playback?path=${encodeURIComponent(cases.heldVideo.path)}&videoId=${cases.clearVideo.id}`, allow: false, expectStatus: 400 },
            { label: "api_video_clear_range", path: `/api/video-playback?path=${encodeURIComponent(cases.clearVideo.path)}&videoId=${cases.clearVideo.id}`, allow: true, expectStatus: 206, range: "bytes=0-15", require206Range: true },
            { label: "api_video_held_anon", path: `/api/video-playback?path=${encodeURIComponent(cases.heldVideo.path)}&videoId=${cases.heldVideo.id}`, allow: false },
            { label: "api_video_held_owner_bearer", path: `/api/video-playback?path=${encodeURIComponent(cases.heldVideo.path)}&videoId=${cases.heldVideo.id}`, bearer: ownerJwt, allow: false, note: "held: use /api/moderation/media-preview" },
            { label: "api_video_held_other_bearer", path: `/api/video-playback?path=${encodeURIComponent(cases.heldVideo.path)}&videoId=${cases.heldVideo.id}`, bearer: otherJwt, allow: false },
            { label: "api_video_held_admin_bearer", path: `/api/video-playback?path=${encodeURIComponent(cases.heldVideo.path)}&videoId=${cases.heldVideo.id}`, bearer: adminJwt, allow: false },
            { label: "preview_song_clear_owner", path: `/api/moderation/media-preview?mediaType=song&mediaId=${cases.clearSong.id}`, bearer: ownerJwt, allow: false, expectStatus: 400, note: "clear items use standard playback" },
            { label: "preview_song_held_anon", path: `/api/moderation/media-preview?mediaType=song&mediaId=${cases.heldSong.id}`, allow: false, expectStatus: 401 },
            { label: "preview_song_held_owner", path: `/api/moderation/media-preview?mediaType=song&mediaId=${cases.heldSong.id}`, bearer: ownerJwt, allow: true, expectStatus: 200 },
            { label: "preview_song_held_other", path: `/api/moderation/media-preview?mediaType=song&mediaId=${cases.heldSong.id}`, bearer: otherJwt, allow: false, expectStatus: 403 },
            { label: "preview_song_held_admin", path: `/api/moderation/media-preview?mediaType=song&mediaId=${cases.heldSong.id}`, bearer: adminJwt, allow: true, expectStatus: 200 },
            { label: "preview_song_removed_owner", path: `/api/moderation/media-preview?mediaType=song&mediaId=${cases.removedSong.id}`, bearer: ownerJwt, allow: false, expectStatus: 403 },
            { label: "preview_song_removed_admin", path: `/api/moderation/media-preview?mediaType=song&mediaId=${cases.removedSong.id}`, bearer: adminJwt, allow: true, expectStatus: 200 },
            { label: "preview_video_held_owner", path: `/api/moderation/media-preview?mediaType=video&mediaId=${cases.heldVideo.id}`, bearer: ownerJwt, allow: true, expectStatus: 200 },
            { label: "api_video_orphan", path: `/api/video-playback?path=${encodeURIComponent(cases.orphanSong.path)}`, allow: false },
            { label: "api_video_missing_catalog_id", path: `/api/video-playback?path=${encodeURIComponent(cases.clearVideo.path)}&videoId=${fakeCatalogId}`, allow: false },
        ];
        for (const row of appCases) {
            const probe = await probeAppRoute(appBase, row.path, { range: row.range, bearer: row.bearer });
            const rowResult = expectAppProbe(row.label, probe, row);
            if (row.note) rowResult.note = row.note;
            results.push(rowResult);
        }

        const ownerUserId = String(manifest.userIds?.[0] || "").trim();
        const downloadCases = [
            {
                label: "download_song_held_owner",
                path: `/api/songs/${cases.heldSong.id}/download`,
                body: { userId: ownerUserId, accessToken: ownerJwt },
                bearer: ownerJwt,
                allow: false,
                expectStatus: 404,
            },
            {
                label: "download_song_removed_owner",
                path: `/api/songs/${cases.removedSong.id}/download`,
                body: { userId: ownerUserId, accessToken: ownerJwt },
                bearer: ownerJwt,
                allow: false,
                expectStatus: 404,
            },
            {
                label: "download_song_removed_admin",
                path: `/api/songs/${cases.removedSong.id}/download`,
                body: { userId: manifest.userIds?.[2] || ownerUserId, accessToken: adminJwt },
                bearer: adminJwt,
                allow: false,
                expectStatus: 404,
            },
            {
                label: "download_video_held_owner",
                path: `/api/videos/${cases.heldVideo.id}/download`,
                body: { userId: ownerUserId, accessToken: ownerJwt },
                bearer: ownerJwt,
                allow: false,
                expectStatus: 404,
            },
        ];
        for (const row of downloadCases) {
            const probe = await probeAppPost(appBase, row.path, row.body, { bearer: row.bearer });
            const rowResult = expectAppProbe(row.label, probe, row);
            results.push(rowResult);
        }

        let moderationDropped = false;
        let songsHidden = false;
        let videosHidden = false;
        try {
            await dropModerationStateColumns(pgClient);
            moderationDropped = true;
            await sleep(1500);
            const moderationFaultPaths = [
                {
                    label: "fault_moderation_missing_api_audio",
                    path: `/api/audio?path=${encodeURIComponent(cases.clearSong.path)}&songId=${cases.clearSong.id}`,
                },
                {
                    label: "fault_moderation_missing_api_video",
                    path: `/api/video-playback?path=${encodeURIComponent(cases.clearVideo.path)}&videoId=${cases.clearVideo.id}`,
                },
            ];
            for (const row of moderationFaultPaths) {
                const probe = await probeAppRoute(appBase, row.path);
                results.push(expectFailClosedAppProbe(row.label, probe, {
                    expectStatuses: [503],
                    requireJsonCode: "MODERATION_UNAVAILABLE",
                    note: "moderation_state column removed locally",
                }));
            }

            await restoreModerationStateColumns(pgClient);
            moderationDropped = false;
            await sleep(1500);

            songsHidden = await hideSongsCatalogTable(pgClient);
            await sleep(1500);
            const audioDbFault = await probeAppRoute(
                appBase,
                `/api/audio?path=${encodeURIComponent(cases.clearSong.path)}&songId=${cases.clearSong.id}`,
            );
            results.push(expectFailClosedAppProbe("fault_songs_catalog_missing_api_audio", audioDbFault, {
                expectStatuses: [500, 503],
                note: "songs table renamed locally",
            }));

            videosHidden = await hideVideosCatalogTable(pgClient);
            await sleep(1500);
            const videoDbFault = await probeAppRoute(
                appBase,
                `/api/video-playback?path=${encodeURIComponent(cases.clearVideo.path)}&videoId=${cases.clearVideo.id}`,
            );
            results.push(expectFailClosedAppProbe("fault_videos_catalog_missing_api_video", videoDbFault, {
                expectStatuses: [500, 503],
                note: "videos table renamed locally",
            }));
        }
        finally {
            if (moderationDropped) {
                await restoreModerationStateColumns(pgClient).catch(() => {});
            }
            if (songsHidden) {
                await restoreSongsCatalogTable(pgClient).catch(() => {});
            }
            if (videosHidden) {
                await restoreVideosCatalogTable(pgClient).catch(() => {});
            }
        }
    }

    const failed = results.filter((r) => !r.pass);
    console.log(JSON.stringify({
        probe: failed.length ? "failed" : "passed",
        schema,
        supabaseHost: config.urlHost,
        executed: results.length,
        failed: failed.length,
        results,
    }, null, 2));
    process.exit(failed.length ? 1 : 0);
}
catch (error) {
    console.error("Probe failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
}
finally {
    await pgClient.end().catch(() => {});
}
