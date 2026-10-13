/**
 * Apply profiles.account_type client-update lock when missing.
 * Usage: node scripts/apply-lock-account-type-migration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = join(root, "supabase/migrations/202609191001_lock_profile_account_type.sql");

function loadEnv() {
    const env = { ...process.env };
    const envPath = join(root, ".env.local");
    if (!existsSync(envPath)) return env;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

const env = loadEnv();
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
if (!databaseUrl) {
    console.error("DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL is required.");
    process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
    const existing = await client.query(`
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'profiles'
          and t.tgname = 'prevent_client_account_type_change'
        limit 1
    `);
    if (existing.rows.length > 0) {
        console.log("Migration already applied (prevent_client_account_type_change).");
        process.exit(0);
    }
    await client.query(readFileSync(migrationPath, "utf8"));
    const verify = await client.query(`
        select 1
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'profiles'
          and t.tgname = 'prevent_client_account_type_change'
        limit 1
    `);
    if (verify.rows.length === 0) {
        console.error("Migration ran but trigger was not created.");
        process.exit(1);
    }
    console.log("Migration applied: prevent_client_account_type_change.");
} finally {
    await client.end().catch(() => {});
}
