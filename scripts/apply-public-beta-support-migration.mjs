/**
 * Apply public beta support migration.
 * Usage: node scripts/apply-public-beta-support-migration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = join(root, "supabase/migrations/202609131400_public_beta_support_tickets.sql");

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
    const existing = await client.query(`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'support_tickets'
          and column_name = 'ticket_number'
    `);
    if (existing.rows.length > 0) {
        console.log("Migration already applied (ticket_number present).");
        process.exit(0);
    }
    const sql = readFileSync(migrationPath, "utf8");
    await client.query(sql);
    const bucket = await client.query(`
        select id from storage.buckets where id = 'support-attachments'
    `);
    if (bucket.rows.length !== 1) {
        console.error("Migration verification failed: support-attachments bucket missing.");
        process.exit(1);
    }
    console.log("Public beta support migration applied successfully.");
}
finally {
    await client.end();
}
