/**
 * Apply storage moderation read gate on isolated local Postgres only.
 * Usage:
 *   MDB_ISOLATED_SUPABASE_E2E=1 node scripts/apply-isolated-storage-moderation-read-gate.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationFiles = [
    "202610211200_storage_moderation_catalog_read_gate.sql",
    "202610211300_storage_admin_moderated_select.sql",
];
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

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

function resolveIsolatedDatabaseUrl(env) {
    const enabled = String(env.MDB_ISOLATED_SUPABASE_E2E || "").trim().toLowerCase();
    if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
        console.error("BLOCKED: MDB_ISOLATED_SUPABASE_E2E=1 is required.");
        process.exit(1);
    }
    const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "");
    if (supabaseUrl.includes(PRODUCTION_REF)) {
        console.error(`BLOCKED: Supabase URL references production ref ${PRODUCTION_REF}.`);
        process.exit(1);
    }
    const isolated = String(
        env.ISOLATED_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ).trim();
    let parsed;
    try {
        parsed = new URL(isolated);
    } catch {
        console.error("ISOLATED_DATABASE_URL is invalid.");
        process.exit(1);
    }
    if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        console.error("ISOLATED_DATABASE_URL must point to localhost.");
        process.exit(1);
    }
    if ((parsed.port || "5432") !== "54322") {
        console.error("ISOLATED_DATABASE_URL must use port 54322.");
        process.exit(1);
    }
    return isolated;
}

const env = loadEnv();
const databaseUrl = resolveIsolatedDatabaseUrl(env);
const client = new pg.Client({ connectionString: databaseUrl });
try {
    await client.connect();
    for (const migrationFile of migrationFiles) {
        const sql = readFileSync(join(root, "supabase/migrations", migrationFile), "utf8");
        await client.query(sql);
        console.log(`Applied ${migrationFile} on isolated database.`);
    }
}
catch (error) {
    console.error("Migration apply failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
}
finally {
    await client.end().catch(() => {});
}
