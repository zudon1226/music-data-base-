/**
 * Apply launch RLS verification gap fix migration.
 * Usage: node scripts/apply-launch-rls-verification-gap-fix.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = join(root, "supabase/migrations/202609051004_fix_launch_rls_verification_gaps.sql");

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
const databaseUrl = env.DATABASE_URL || "";
if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
    await client.query(readFileSync(migrationPath, "utf8"));
    console.log("PASS migration applied: 202609051004_fix_launch_rls_verification_gaps.sql");
} catch (error) {
    console.error("FAIL", String(error.message || error).slice(0, 300));
    process.exit(1);
} finally {
    await client.end().catch(() => {});
}
