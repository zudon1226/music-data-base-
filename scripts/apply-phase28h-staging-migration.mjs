/**
 * Apply Phase 28H migration to staging only (never production).
 * Uses DATABASE_URL from .env.staging.local — does not log connection string.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const MIGRATION = "202611231200_song_qualified_play_durable.sql";

function parseEnv(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 1) continue;
        env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return env;
}

const env = parseEnv(join(root, ".env.staging.local"));
const url = env.DATABASE_URL || "";
const stagingUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!stagingUrl.includes(STAGING_REF) || stagingUrl.includes(PRODUCTION_REF)) {
    console.error("FAIL staging identity");
    process.exit(1);
}
if (!url || !url.includes(STAGING_REF)) {
    console.error("FAIL DATABASE_URL must target staging");
    process.exit(1);
}

const sql = readFileSync(join(root, "supabase", "migrations", MIGRATION), "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
    await client.connect();
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    const hash = createHash("sha256").update(sql).digest("hex").slice(0, 12);
    console.log(`apply-phase28h-staging-migration PASS migration=${MIGRATION} sha12=${hash}`);
} catch (error) {
    try {
        await client.query("rollback");
    } catch {
        /* ignore */
    }
    console.error(`apply-phase28h-staging-migration FAIL: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}`);
    process.exit(1);
} finally {
    await client.end().catch(() => {});
}