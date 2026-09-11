/**
 * Live RLS checks for creator upload alignment (disposable fixtures, fully cleaned up).
 * Usage: node scripts/verify-creator-rls-alignment-live.mjs
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = pg;
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function loadEnv() {
    const env = { ...process.env };
    const path = join(root, ".env.local");
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function isLocked(value) {
    if (value === undefined || value === "") return true;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return true;
}

const env = loadEnv();
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const token = randomBytes(4).toString("hex");
const password = `Verify-${token}-Aa1!`;

record("beta subscription lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_SUBSCRIPTION_CHECKOUT_LOCKED));
record("beta ringtone lock ON", isLocked(env.NEXT_PUBLIC_PUBLIC_BETA_PAID_RINGTONE_PURCHASES_LOCKED));

if (!databaseUrl || !supabaseUrl || !anonKey || !serviceKey) {
    record("live prerequisites", false, "database/supabase env missing");
    process.exit(1);
}

const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const pgClient = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await pgClient.connect();

const userIds = [];
const songIds = [];
const videoIds = [];
const authEmails = [];

async function createFixtureUser(email, accountType) {
    authEmails.push(email);
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const userId = created.data.user?.id || "";
    if (!userId) throw new Error(`createUser failed for ${email}`);
    userIds.push(userId);
    await admin.from("profiles").upsert({
        id: userId,
        user_id: userId,
        account_type: accountType,
        is_admin: false,
        updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    return userId;
}

async function signInClient(email) {
    const client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message || "signIn failed");
    return client;
}

async function cleanup() {
    for (const id of songIds) await admin.from("songs").delete().eq("id", id);
    for (const id of videoIds) await admin.from("videos").delete().eq("id", id);
    for (const email of authEmails) {
        const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const user = listed.data.users.find((row) => row.email === email);
        if (user?.id) await admin.auth.admin.deleteUser(user.id);
    }
    await pgClient.end().catch(() => {});
}

try {
    const fn = await pgClient.query(`
        select proname from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'can_upload_creator_content'
    `);
    record("can_upload_creator_content exists", fn.rows.length === 1);

    const listenerEmail = `rls-listener-${token}@verify.local`;
    const artistEmail = `rls-artist-${token}@verify.local`;
    const producerEmail = `rls-producer-${token}@verify.local`;
    const listenerId = await createFixtureUser(listenerEmail, "listener");
    const artistId = await createFixtureUser(artistEmail, "artist");
    const producerId = await createFixtureUser(producerEmail, "producer");

    await admin.from("user_roles").upsert([
        { user_id: listenerId, role: "founding_artist", status: "active" },
        { user_id: artistId, role: "artist", status: "active" },
        { user_id: producerId, role: "producer", status: "active" },
    ], { onConflict: "user_id,role" });

    const listenerClient = await signInClient(listenerEmail);
    const artistClient = await signInClient(artistEmail);
    const producerClient = await signInClient(producerEmail);

    const listenerSong = {
        id: randomUUID(),
        title: `Listener Song ${token}`,
        artist: "Verify",
        category: "New Releases",
        type: "Artists",
        audio_url: "https://example.com/l.mp3",
        storage_path: `${listenerId}/l-${token}.mp3`,
        user_id: listenerId,
    };
    const listenerInsert = await listenerClient.from("songs").insert(listenerSong).select("id").maybeSingle();
    record("listener song insert denied", Boolean(listenerInsert.error), listenerInsert.error?.message || "insert succeeded unexpectedly");

    const listenerVideo = {
        id: randomUUID(),
        title: `Listener Video ${token}`,
        creator: "Verify",
        category: "New Releases",
        video_url: "https://example.com/l.mp4",
        storage_path: `${listenerId}/lv-${token}.mp4`,
        user_id: listenerId,
    };
    const listenerVideoInsert = await listenerClient.from("videos").insert(listenerVideo).select("id").maybeSingle();
    record("listener video insert denied", Boolean(listenerVideoInsert.error), listenerVideoInsert.error?.message || "insert succeeded unexpectedly");

    const artistSongId = randomUUID();
    const artistSong = {
        id: artistSongId,
        title: `Artist Song ${token}`,
        artist: "Verify Artist",
        category: "New Releases",
        type: "Artists",
        audio_url: "https://example.com/a.mp3",
        storage_path: `${artistId}/a-${token}.mp3`,
        user_id: artistId,
    };
    const artistInsert = await artistClient.from("songs").insert(artistSong).select("id").maybeSingle();
    record("artist own song insert allowed", !artistInsert.error && artistInsert.data?.id === artistSongId, artistInsert.error?.message || artistSongId);
    if (artistInsert.data?.id) songIds.push(artistSongId);

    const producerVideoId = randomUUID();
    const producerVideo = {
        id: producerVideoId,
        title: `Producer Video ${token}`,
        creator: "Verify Producer",
        category: "New Releases",
        video_url: "https://example.com/p.mp4",
        storage_path: `${producerId}/pv-${token}.mp4`,
        user_id: producerId,
    };
    const producerInsert = await producerClient.from("videos").insert(producerVideo).select("id").maybeSingle();
    record("producer own video insert allowed", !producerInsert.error && producerInsert.data?.id === producerVideoId, producerInsert.error?.message || producerVideoId);
    if (producerInsert.data?.id) videoIds.push(producerVideoId);

    const crossSongId = randomUUID();
    const crossInsert = await artistClient.from("songs").insert({
        ...artistSong,
        id: crossSongId,
        title: `Cross User Song ${token}`,
        storage_path: `${producerId}/cross-${token}.mp3`,
        user_id: producerId,
    }).select("id").maybeSingle();
    record("cross-user song insert denied", Boolean(crossInsert.error), crossInsert.error?.message || "cross insert succeeded unexpectedly");

    const ringtoneFn = await pgClient.query(`
        select public.can_create_ringtones($1::uuid) as listener_ok,
               public.can_create_ringtones($2::uuid) as artist_ok,
               public.can_create_ringtones($3::uuid) as producer_ok
    `, [listenerId, artistId, producerId]);
    const ring = ringtoneFn.rows[0] || {};
    record("ringtone role listener denied", ring.listener_ok === false, String(ring.listener_ok));
    record("ringtone role artist allowed", ring.artist_ok === true, String(ring.artist_ok));
    record("ringtone role producer allowed", ring.producer_ok === true, String(ring.producer_ok));

    const staleListenerFn = await pgClient.query(
        "select public.can_upload_creator_content($1::uuid) as ok",
        [listenerId],
    );
    record("stale founding_artist ignored for listener profile", staleListenerFn.rows[0]?.ok === false);

    const selectPolicy = await pgClient.query(`
        select count(*)::int as n
        from pg_policies
        where schemaname = 'public'
          and tablename = 'songs'
          and cmd = 'SELECT'
          and roles::text like '%authenticated%'
    `);
    record("songs SELECT policies unchanged count", selectPolicy.rows[0]?.n >= 1, `count=${selectPolicy.rows[0]?.n}`);
} catch (error) {
    record("live verification runtime", false, error instanceof Error ? error.message : String(error));
} finally {
    await cleanup();
}

const failed = results.filter((row) => !row.ok).length;
console.log(`\n${failed === 0 ? "ALL LIVE CHECKS PASSED" : `${failed} LIVE CHECK(S) FAILED`} (${results.length} total)`);
process.exit(failed === 0 ? 0 : 1);
