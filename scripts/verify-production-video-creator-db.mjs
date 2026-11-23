/**
 * Post-migration Production DB checks for video creator split gates.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_REF = "jzlegcbotqfzevtczwhx";

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 1) continue;
        env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^"|"$/g, "");
    }
    return env;
}

function resolveDatabaseUrl() {
    const direct = String(process.env.MDB_PRODUCTION_DATABASE_URL || process.env.DATABASE_URL || "").trim();
    if (direct) return direct;
    const localProd = parseEnvFile(join(root, ".env.production.local"));
    if (localProd.DATABASE_URL) return localProd.DATABASE_URL;
    const sibling = parseEnvFile(join(root, "..", "music-data-base-", ".env.local"));
    if (sibling.DATABASE_URL) return sibling.DATABASE_URL;
    return "";
}

const url = resolveDatabaseUrl();
const lower = url.toLowerCase();
if (!url || !lower.includes(PRODUCTION_REF) || lower.includes(STAGING_REF)) {
    console.error("FAIL: Production DATABASE_URL required");
    process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const results = [];
function record(id, ok, detail = "") {
    results.push({ id, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`);
}

try {
    await client.connect();

    const fns = await client.query(`
      select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and proname in ('can_upload_music_content','can_upload_video_content','can_upload_creator_content')
    `);
    const names = new Set(fns.rows.map((r) => r.proname));
    record("functions-present", names.has("can_upload_music_content") && names.has("can_upload_video_content"), [...names].join(","));

    const creatorWrap = await client.query(`
      select public.can_upload_creator_content('00000000-0000-0000-0000-000000000099'::uuid) as legacy_music_only
    `);

    const policies = await client.query(`
      select policyname, cmd, qual, with_check from pg_policies
      where schemaname='public' and tablename='songs' and policyname='owners_insert'
    `);
    record("songs-owners-insert", policies.rows.length === 1, policies.rows[0]?.with_check?.includes("can_upload_music_content") ? "music gate" : "missing gate");

    const vpol = await client.query(`
      select with_check from pg_policies where schemaname='public' and tablename='videos' and policyname='owners_insert'
    `);
    record("videos-owners-insert", vpol.rows.length === 1, vpol.rows[0]?.with_check?.includes("can_upload_video_content") ? "video gate" : "missing gate");

    const storage = await client.query(`
      select policyname from pg_policies where schemaname='storage' and policyname in
      ('app_songs_insert_music_creator','app_videos_insert_video_creator','app_producer_beats_insert_music')
    `);
    record("storage-restrictive-policies", storage.rows.length >= 3, `count=${storage.rows.length}`);

    const artist = await client.query(`
      select user_id, account_type from public.profiles
      where lower(account_type) in ('artist','founding_artist','producer','founding_producer')
      order by created_at asc nulls last limit 1
    `);
  if (artist.rows[0]?.user_id) {
        const uid = artist.rows[0].user_id;
        const m = await client.query("select public.can_upload_music_content($1::uuid) ok", [uid]);
        const v = await client.query("select public.can_upload_video_content($1::uuid) ok", [uid]);
        record("sample-artist-music", m.rows[0]?.ok === true, artist.rows[0].account_type);
        record("sample-artist-video", v.rows[0]?.ok === true, artist.rows[0].account_type);
    } else {
        record("sample-artist-music", false, "no artist profile found");
    }

    const listener = await client.query(`
      select user_id from public.profiles where lower(account_type) in ('listener','premium_listener') limit 1
    `);
    if (listener.rows[0]?.user_id) {
        const uid = listener.rows[0].user_id;
        const m = await client.query("select public.can_upload_music_content($1::uuid) ok", [uid]);
        const v = await client.query("select public.can_upload_video_content($1::uuid) ok", [uid]);
        record("sample-listener-music-denied", m.rows[0]?.ok === false, "");
        record("sample-listener-video-denied", v.rows[0]?.ok === false, "");
    }

    // Synthetic creator UUID — functions only (no row inserted)
    const fakeCreator = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const cm = await client.query("select public.can_upload_music_content($1::uuid) ok", [fakeCreator]);
    const cv = await client.query("select public.can_upload_video_content($1::uuid) ok", [fakeCreator]);
    record("synthetic-creator-music-denied", cm.rows[0]?.ok === false, "no profile => false");
    record("synthetic-creator-video-denied", cv.rows[0]?.ok === false, "no profile => false");

    const check = await client.query(`
      select pg_get_constraintdef(oid) def from pg_constraint where conname='profiles_account_type_check'
    `);
    record("creator-in-check", (check.rows[0]?.def || "").includes("creator"), "constraint updated");

    mkdirSync(join(root, "tmp"), { recursive: true });
    writeFileSync(join(root, "tmp", "production-video-creator-post-verify.json"), JSON.stringify({ results, checkedAt: new Date().toISOString() }, null, 2));
    const fails = results.filter((r) => !r.ok).length;
    console.log(`\nPRODUCTION_VIDEO_CREATOR_DB_FAILS=${fails}`);
    process.exit(fails ? 1 : 0);
} catch (error) {
    console.error(error);
    process.exit(1);
} finally {
    await client.end().catch(() => {});
}