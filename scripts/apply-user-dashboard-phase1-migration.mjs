/**
 * Apply User Dashboard Phase 1 additive migration via DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
    const text = readFileSync(path.join(root, ".env.local"), "utf8");
    const env = {};
    for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i <= 0) continue;
        let v = line.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        env[line.slice(0, i).trim()] = v;
    }
    return env;
}

const env = loadEnv();
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
const migrationPath = path.join(root, "supabase/migrations/202607170002_user_dashboard_phase1.sql");
const sql = readFileSync(migrationPath, "utf8");

if (!databaseUrl) {
    console.log(JSON.stringify({
        ok: false,
        status: "manual_apply_required",
        migration: "supabase/migrations/202607170002_user_dashboard_phase1.sql",
    }));
    process.exit(1);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
    await client.query(sql);
    const check = await client.query(`
      select to_regclass('public.user_recently_played') is not null as recently_played,
             exists (
               select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'profiles' and column_name = 'username'
             ) as username_col,
             exists (
               select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'user_media_queue_state' and column_name = 'shuffle_on'
             ) as shuffle_col,
             exists (select 1 from storage.buckets where id = 'avatars') as avatars_bucket
    `);
    console.log(JSON.stringify({
        ok: true,
        status: "applied_via_database_url",
        checks: check.rows[0],
    }));
}
finally {
    await client.end();
}
