/**
 * Apply legal acceptances migration (202609101002).
 * Usage: node scripts/apply-legal-acceptances-migration.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationFile = "202609101002_legal_acceptances.sql";

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

function resolveDirectDatabaseUrl(connectionString, projectSupabaseUrl) {
    try {
        const url = new URL(connectionString);
        const projectRef = projectSupabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1];
        if (!projectRef || !url.hostname.includes("pooler.supabase.com")) return connectionString;
        url.username = "postgres";
        url.hostname = `db.${projectRef}.supabase.co`;
        url.port = "5432";
        return url.toString();
    } catch {
        return connectionString;
    }
}

const env = loadEnv();
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!databaseUrl) {
    console.error("Missing DATABASE_URL (or SUPABASE_DB_URL / POSTGRES_URL).");
    process.exit(1);
}

const sql = readFileSync(join(root, "supabase/migrations", migrationFile), "utf8");
const client = new pg.Client({ connectionString: resolveDirectDatabaseUrl(databaseUrl, projectUrl) });

try {
    await client.connect();
    await client.query(sql);
    console.log(`Applied ${migrationFile}`);
} catch (error) {
    console.error("Migration failed:", error.message || error);
    process.exit(1);
} finally {
    await client.end();
}
