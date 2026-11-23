/**
 * Read-only Production preflight for 202611221200_video_creator_account_type.sql
 * Env: DATABASE_URL or MDB_PRODUCTION_DATABASE_URL (must contain aehuszoadgqtbkxsliyy)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const MIGRATION = "202611221200_video_creator_account_type.sql";

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
    console.error("FAIL: Production DATABASE_URL required (ref aehuszoadgqtbkxsliyy only)");
    process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const evidence = { migration: MIGRATION, checkedAt: new Date().toISOString(), checks: [] };
function record(id, ok, detail) {
    evidence.checks.push({ id, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${detail}`);
}

try {
    await client.connect();
    const proj = await client.query("select current_database() db, current_user as usr");
    record("connected", true, `db=${proj.rows[0]?.db} user=${proj.rows[0]?.usr}`);

    const types = await client.query(`
      select account_type, count(*)::int c
      from public.profiles
      where account_type is not null
      group by account_type
      order by c desc
    `);
    record("profile-account-types", true, JSON.stringify(types.rows));

    const badCreator = await client.query(`
      select count(*)::int c from public.profiles
      where lower(account_type) in ('creator','founding_creator')
    `);
    record("existing-video-creator-rows", true, `count=${badCreator.rows[0]?.c ?? 0}`);

    const roles = await client.query(`
      select role, count(*)::int c from public.user_roles
      where status = 'active'
      group by role order by c desc limit 20
    `);
    record("active-user-roles", true, JSON.stringify(roles.rows));

    const fnMusic = await client.query(`
      select proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'can_upload_music_content'
    `);
    const fnVideo = await client.query(`
      select proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname = 'can_upload_video_content'
    `);
    record(
        "pre-migration-split-functions",
        true,
        fnMusic.rows.length && fnVideo.rows.length ? "already-applied" : "pending-apply",
    );

    const policies = await client.query(`
      select tablename, policyname from pg_policies
      where schemaname = 'public' and tablename in ('songs','videos')
      order by tablename, policyname
    `);
    record("songs-videos-policies", true, JSON.stringify(policies.rows));

    const artistSample = await client.query(`
      select user_id, account_type from public.profiles
      where lower(account_type) in ('artist','founding_artist','producer','founding_producer')
      limit 3
    `);
    for (const row of artistSample.rows) {
        const uid = row.user_id;
        if (!uid) continue;
        if (fnMusic.rows.length) {
            const m = await client.query("select public.can_upload_music_content($1::uuid) as ok", [uid]);
            record(`artist-music-upload-${String(uid).slice(0, 8)}`, m.rows[0]?.ok === true, `type=${row.account_type}`);
        }
        if (fnVideo.rows.length) {
            const v = await client.query("select public.can_upload_video_content($1::uuid) as ok", [uid]);
            record(`artist-video-upload-${String(uid).slice(0, 8)}`, v.rows[0]?.ok === true, `type=${row.account_type}`);
        }
    }

    const constraints = await client.query(`
      select conname from pg_constraint
      where conname = 'profiles_account_type_check'
    `);
    record("profiles_account_type_check", true, `present=${constraints.rows.length > 0}`);

    mkdirSync(join(root, "tmp"), { recursive: true });
    writeFileSync(join(root, "tmp", "production-video-creator-preflight.json"), JSON.stringify(evidence, null, 2));
    console.log("\nPreflight complete. Evidence: tmp/production-video-creator-preflight.json");
} catch (error) {
    console.error("FAIL", error instanceof Error ? error.message.slice(0, 300) : error);
    process.exit(1);
} finally {
    await client.end().catch(() => {});
}