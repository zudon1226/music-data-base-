/**
 * Create From Song source loading — admin catalog + ownership filters.
 * Usage: npm run verify:ringtone-source-songs-admin
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    return readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    } catch {
        // optional
    }
    return env;
}

function mainStatic() {
    const route = read("app/api/ringtones/source-songs/route.ts");
    const access = read("lib/ringtone-access.ts");
    const workspace = read("components/ringtone-creator/ringtone-creator-workspace.tsx");
    const pkg = read("package.json");

    record("route uses canonical public.songs table", route.includes('.from("songs")'));
    record(
        "route does not select missing duration_seconds",
        !/\.select\([^)]*duration_seconds/.test(route)
            && route.includes('.select("id,title,artist,cover_url,audio_url,storage_path,duration,created_at,user_id,producer_id")'),
    );
    record("route uses isAdminUserId for admin catalog", route.includes("isAdminUserId")
        && route.includes("if (!isAdmin)")
        && route.includes("user_id.eq."));
    record("route resolves playable audio with player helper", route.includes("resolveSongPlayableUrl"));
    record("route keeps owned/producer filter for non-admin", route.includes("producer_id.eq."));
    record("assertOwnsSourceSong allows admin override", access.includes("isAdminUserId")
        && access.includes("adminOverride")
        && !access.includes("duration_seconds"));
    record("workspace surfaces source load errors separately from empty", workspace.includes("sourceSongsError")
        && workspace.includes("sourceSongsLoading")
        && workspace.includes("noOwnedSongs"));
    record("workspace uses compact source cards with create action", workspace.includes("ringtone-source-card")
        && workspace.includes("ringtone-use-song-btn")
        && workspace.includes("switchSourceKind"));
    record("upload source still uses file input", workspace.includes('type="file"')
        && workspace.includes("ringtone-file-row"));
    record("package exposes verify script", pkg.includes("verify:ringtone-source-songs-admin"));
}

async function mainLive() {
    const env = readEnv();
    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!databaseUrl || !supabaseUrl || !serviceKey) {
        record("live db probe skipped", true, "missing env");
        return;
    }

    const pgClient = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await pgClient.connect();
    try {
        const cols = await pgClient.query(`
          select column_name from information_schema.columns
          where table_schema='public' and table_name='songs'
        `);
        const names = new Set(cols.rows.map((row) => row.column_name));
        record("songs.duration_seconds absent", !names.has("duration_seconds"));
        record("songs.user_id present", names.has("user_id"));
        record("songs.audio_url/storage_path present", names.has("audio_url") && names.has("storage_path"));

        const instrumental = await pgClient.query(`
          select id, title, user_id,
            (coalesce(audio_url,'')<>'' or coalesce(storage_path,'')<>'') as playable
          from public.songs
          where lower(title)='instrumental'
          limit 1
        `);
        const song = instrumental.rows[0];
        record(
            "instrumental exists and is playable",
            Boolean(song?.playable),
            song ? `id=${song.id} user_id=${song.user_id}` : "missing",
        );
        record(
            "instrumental would be excluded by owner-only filter when user_id null",
            Boolean(song) && (song.user_id == null),
            String(song?.user_id),
        );

        const admin = createClient(supabaseUrl, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const broken = await admin
            .from("songs")
            .select("id,duration_seconds")
            .limit(1);
        record(
            "selecting duration_seconds fails against live schema",
            Boolean(broken.error),
            broken.error?.message || "unexpected success",
        );
        const fixed = await admin
            .from("songs")
            .select("id,title,artist,cover_url,audio_url,storage_path,duration,created_at,user_id,producer_id")
            .limit(5);
        record("canonical song select succeeds", !fixed.error && (fixed.data || []).length > 0, fixed.error?.message || `rows=${(fixed.data || []).length}`);
    } finally {
        await pgClient.end();
    }
}

async function main() {
    mainStatic();
    await mainLive();
    writeFileSync(
        path.join(evidenceDir, "ringtone-source-songs-admin-evidence.json"),
        JSON.stringify({ results }, null, 2),
    );
    const fails = results.filter((item) => !item.ok);
    console.log(`\nRINGTONE_SOURCE_SONGS_ADMIN_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
