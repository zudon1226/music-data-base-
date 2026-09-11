/**
 * Apply creator RLS alignment migration when not yet present.
 * Usage: node scripts/apply-creator-rls-alignment-migration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = join(root, "supabase/migrations/202609091001_align_creator_rls_with_account_roles.sql");

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

const env = loadEnv();
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
if (!databaseUrl) {
    console.error("DATABASE_URL / SUPABASE_DB_URL / POSTGRES_URL is required.");
    process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
    const fn = await client.query(`
        select pg_get_functiondef(p.oid) as def
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'can_upload_creator_content'
        limit 1
    `);
    const songsPolicy = await client.query(`
        select qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = 'songs'
          and policyname = 'owners_insert'
        limit 1
    `);
    const alreadyApplied = fn.rows.length > 0
        && String(songsPolicy.rows[0]?.with_check || "").includes("can_upload_creator_content");
    if (alreadyApplied) {
        console.log("Migration already applied (can_upload_creator_content + songs owners_insert).");
        process.exit(0);
    }

    const sql = readFileSync(migrationPath, "utf8");
    await client.query(sql);

    const verifyFn = await client.query(`
        select proname from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'can_upload_creator_content'
    `);
    const verifyPolicy = await client.query(`
        select with_check from pg_policies
        where schemaname = 'public' and tablename = 'videos' and policyname = 'owners_insert'
    `);
    if (verifyFn.rows.length === 0 || !String(verifyPolicy.rows[0]?.with_check || "").includes("can_upload_creator_content")) {
        console.error("Migration ran but verification failed.");
        process.exit(1);
    }
    console.log("Migration applied successfully: can_upload_creator_content + songs/videos owners_insert.");
} finally {
    await client.end().catch(() => {});
}
