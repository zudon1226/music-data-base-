/**
 * Seed disposable songs/videos + Storage objects for isolated moderation probes.
 * Usage:
 *   MDB_ISOLATED_SUPABASE_E2E=1 node scripts/seed-isolated-storage-moderation-fixtures.mjs
 *   MDB_ISOLATED_SUPABASE_E2E=1 node scripts/seed-isolated-storage-moderation-fixtures.mjs --clean
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertBlocksProductionRef, loadEnv, resolveIsolatedSupabaseConfig } from "./_isolated-storage-probe-env.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(root, "scripts", ".mdb-isolated-storage-fixtures.json");
const FIXTURE_TAG = "mdb-isolated-mod";
const TEST_PASSWORD = "mdb-isolated-test-password-2026";

const MINIMAL_MP3 = Buffer.from(
    "ID3\u0003\u0000\u0000\u0000\u0000\u0000\u0000" + "mdb-isolated-mod-fixture".repeat(8),
    "binary",
);
const MINIMAL_MP4 = Buffer.from(
    "mdb-isolated-mod-video-fixture".repeat(16),
    "binary",
);

function encodeStoragePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

async function cleanupFromManifest(admin, client, manifest) {
    if (!manifest) return;
    for (const path of manifest.storagePaths || []) {
        const [bucket, ...rest] = path.split("/");
        const objectPath = rest.join("/");
        if (bucket && objectPath) {
            await admin.storage.from(bucket).remove([objectPath]);
        }
    }
    if (manifest.songIds?.length) {
        await client.query("delete from public.songs where id = any($1::uuid[])", [manifest.songIds]);
    }
    if (manifest.videoIds?.length) {
        await client.query("delete from public.videos where id = any($1::uuid[])", [manifest.videoIds]);
    }
    for (const userId of manifest.userIds || []) {
        await admin.auth.admin.deleteUser(userId).catch(() => {});
    }
}

async function ensureUser(admin, email, meta = {}) {
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
        await admin.auth.admin.updateUserById(existing.id, { password: TEST_PASSWORD, email_confirm: true, ...meta });
        return existing.id;
    }
    const created = await admin.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        ...meta,
    });
    if (created.error || !created.data.user) {
        throw new Error(created.error?.message || `Failed to create ${email}`);
    }
    return created.data.user.id;
}

async function upsertProfile(client, userId, { isAdmin = false } = {}) {
    await client.query(
        `insert into public.profiles (id, user_id, account_type, is_admin, updated_at)
         values ($1, $1, $2, $3, now())
         on conflict (id) do update set account_type = excluded.account_type, is_admin = excluded.is_admin, updated_at = now()`,
        [userId, isAdmin ? "admin" : "listener", isAdmin],
    );
}

async function uploadObject(admin, bucket, path, body, contentType) {
    const { error } = await admin.storage.from(bucket).upload(path, body, {
        upsert: true,
        contentType,
    });
    if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
}

const env = loadEnv();
assertBlocksProductionRef(env);
const config = resolveIsolatedSupabaseConfig(env);
const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const args = new Set(process.argv.slice(2));
const pgClient = new pg.Client({ connectionString: config.dbUrl });

try {
    await pgClient.connect();
    const priorManifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null;
    if (priorManifest?.tag === FIXTURE_TAG && !args.has("--clean")) {
        await cleanupFromManifest(admin, pgClient, priorManifest);
    }

    if (args.has("--clean")) {
        const manifest = priorManifest;
        await cleanupFromManifest(admin, pgClient, manifest);
        if (existsSync(MANIFEST)) {
            writeFileSync(MANIFEST, "{}", "utf8");
        }
        console.log(JSON.stringify({ seed: "cleaned" }, null, 2));
        process.exit(0);
    }

    const ownerId = await ensureUser(admin, `${FIXTURE_TAG}-owner@mdb.local.test`);
    const otherId = await ensureUser(admin, `${FIXTURE_TAG}-other@mdb.local.test`);
    const adminId = await ensureUser(admin, `${FIXTURE_TAG}-admin@mdb.local.test`);
    await upsertProfile(pgClient, ownerId, { isAdmin: false });
    await upsertProfile(pgClient, otherId, { isAdmin: false });
    await upsertProfile(pgClient, adminId, { isAdmin: true });

    const ownerPrefix = `${ownerId}/${FIXTURE_TAG}`;
    const paths = {
        clearSong: `${ownerPrefix}/clear-track.mp3`,
        heldSong: `${ownerPrefix}/held-track.mp3`,
        removedSong: `${ownerPrefix}/removed-track.mp3`,
        orphanSong: `${ownerPrefix}/orphan-track.mp3`,
        ambiguousSong: `${ownerPrefix}/ambiguous-track.mp3`,
        legacyOrphan: `${ownerPrefix.split("/")[0]}-legacy-orphan.mp3`,
        legacyClear: `${ownerPrefix.split("/")[0]}-legacy-clear.mp3`,
        legacyHeld: `${ownerPrefix.split("/")[0]}-legacy-held.mp3`,
        legacyAmbiguous: `${ownerPrefix.split("/")[0]}-legacy-ambiguous.mp3`,
        clearVideo: `${ownerPrefix}/clear-video.mp4`,
        heldVideo: `${ownerPrefix}/held-video.mp4`,
    };

    for (const p of [
        paths.clearSong,
        paths.heldSong,
        paths.removedSong,
        paths.orphanSong,
        paths.ambiguousSong,
        paths.legacyOrphan,
        paths.legacyClear,
        paths.legacyHeld,
        paths.legacyAmbiguous,
        paths.clearVideo,
        paths.heldVideo,
    ]) {
        const bucket = p.endsWith(".mp4") ? "videos" : "songs";
        const body = bucket === "videos" ? MINIMAL_MP4 : MINIMAL_MP3;
        const type = bucket === "videos" ? "video/mp4" : "audio/mpeg";
        await uploadObject(admin, bucket, p, body, type);
    }

    const songIds = [];
    const insertSong = async (storagePath, moderation_state, title) => {
        const id = crypto.randomUUID();
        songIds.push(id);
        await pgClient.query(
            `insert into public.songs (id, title, artist, category, type, audio_url, storage_path, user_id, moderation_state)
             values ($1, $2, 'Fixture Artist', 'Test', 'Beats', '/api/audio?path=' || $3, $3, $4, $5)`,
            [id, title, storagePath, ownerId, moderation_state],
        );
        return id;
    };

    const clearSongId = await insertSong(paths.clearSong, "clear", "Clear song");
    const heldSongId = await insertSong(paths.heldSong, "takedown_pending", "Held song");
    const removedSongId = await insertSong(paths.removedSong, "removed", "Removed song");
    const legacyClearSongId = await insertSong(paths.legacyClear, "clear", "Legacy clear song");
    const legacyHeldSongId = await insertSong(paths.legacyHeld, "takedown_pending", "Legacy held song");
    await pgClient.query(
        `insert into public.songs (id, title, artist, category, type, audio_url, storage_path, user_id, moderation_state)
         values ($1, 'Legacy ambiguous A', 'Fixture', 'Test', 'Beats', '', $2, $3, 'clear'),
                ($4, 'Legacy ambiguous B', 'Fixture', 'Test', 'Beats', '', $2, $3, 'removed')`,
        [crypto.randomUUID(), paths.legacyAmbiguous, ownerId, crypto.randomUUID()],
    );
    await pgClient.query(
        `insert into public.songs (id, title, artist, category, type, audio_url, storage_path, user_id, moderation_state)
         values ($1, 'Ambiguous A', 'Fixture', 'Test', 'Beats', '', $2, $3, 'clear'),
                ($4, 'Ambiguous B', 'Fixture', 'Test', 'Beats', '', $2, $3, 'removed')`,
        [crypto.randomUUID(), paths.ambiguousSong, ownerId, crypto.randomUUID()],
    );

    const videoIds = [];
    const insertVideo = async (storagePath, moderation_state, title) => {
        const id = crypto.randomUUID();
        videoIds.push(id);
        await pgClient.query(
            `insert into public.videos (id, title, user_id, storage_path, video_url, moderation_state)
             values ($1, $2, $3, $4, '/api/video-playback?path=' || $4, $5)`,
            [id, title, ownerId, storagePath, moderation_state],
        );
        return id;
    };

    const clearVideoId = await insertVideo(paths.clearVideo, "clear", "Clear video");
    const heldVideoId = await insertVideo(paths.heldVideo, "takedown_pending", "Held video");

    const manifest = {
        tag: FIXTURE_TAG,
        userIds: [ownerId, otherId, adminId],
        emails: {
            owner: `${FIXTURE_TAG}-owner@mdb.local.test`,
            other: `${FIXTURE_TAG}-other@mdb.local.test`,
            admin: `${FIXTURE_TAG}-admin@mdb.local.test`,
        },
        password: TEST_PASSWORD,
        songIds: [...songIds],
        videoIds: [...videoIds],
        storagePaths: [
            `songs/${paths.clearSong}`,
            `songs/${paths.heldSong}`,
            `songs/${paths.removedSong}`,
            `songs/${paths.orphanSong}`,
            `songs/${paths.ambiguousSong}`,
            `songs/${paths.legacyOrphan}`,
            `songs/${paths.legacyClear}`,
            `songs/${paths.legacyHeld}`,
            `songs/${paths.legacyAmbiguous}`,
            `videos/${paths.clearVideo}`,
            `videos/${paths.heldVideo}`,
        ],
        cases: {
            clearSong: { id: clearSongId, path: paths.clearSong },
            heldSong: { id: heldSongId, path: paths.heldSong },
            removedSong: { id: removedSongId, path: paths.removedSong },
            orphanSong: { path: paths.orphanSong },
            ambiguousSong: { path: paths.ambiguousSong },
            legacyOrphan: { path: paths.legacyOrphan },
            legacyClear: { id: legacyClearSongId, path: paths.legacyClear },
            legacyHeld: { id: legacyHeldSongId, path: paths.legacyHeld },
            legacyAmbiguous: { path: paths.legacyAmbiguous },
            clearVideo: { id: clearVideoId, path: paths.clearVideo },
            heldVideo: { id: heldVideoId, path: paths.heldVideo },
        },
    };
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
    console.log(JSON.stringify({ seed: "ok", manifestPath: "scripts/.mdb-isolated-storage-fixtures.json", cases: Object.keys(manifest.cases) }, null, 2));
}
catch (error) {
    console.error("Seed failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
}
finally {
    await pgClient.end().catch(() => {});
}

export { encodeStoragePath };
