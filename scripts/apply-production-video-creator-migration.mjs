/**
 * Apply video-only creator migration to Production only.
 * Env: DATABASE_URL or MDB_PRODUCTION_DATABASE_URL (must contain aehuszoadgqtbkxsliyy)
 * Requires: MDB_CONFIRM_PRODUCTION_MIGRATION=1
 */
import { createHash } from "node:crypto";
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

if (process.env.MDB_CONFIRM_PRODUCTION_MIGRATION !== "1") {
    console.error("Set MDB_CONFIRM_PRODUCTION_MIGRATION=1 to apply on Production");
    process.exit(1);
}

const url = resolveDatabaseUrl();
const lower = url.toLowerCase();
if (!url || !lower.includes(PRODUCTION_REF) || lower.includes(STAGING_REF)) {
    console.error("FAIL: Production DATABASE_URL required");
    process.exit(1);
}

const sqlPath = join(root, "supabase", "migrations", MIGRATION);
if (!existsSync(sqlPath)) {
    console.error(`FAIL missing ${MIGRATION}`);
    process.exit(1);
}
const sql = readFileSync(sqlPath, "utf8");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
    await client.connect();
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    const hash = createHash("sha256").update(sql).digest("hex").slice(0, 12);
    const evidence = {
        migration: MIGRATION,
        appliedAt: new Date().toISOString(),
        sha12: hash,
        projectRef: PRODUCTION_REF,
    };
    mkdirSync(join(root, "tmp"), { recursive: true });
    writeFileSync(join(root, "tmp", "production-video-creator-migration-applied.json"), JSON.stringify(evidence, null, 2));
    console.log(`APPLY PASS migration=${MIGRATION} sha12=${hash}`);
} catch (error) {
    try {
        await client.query("rollback");
    } catch {
        /* ignore */
    }
    console.error(`APPLY FAIL: ${error instanceof Error ? error.message.slice(0, 400) : "unknown"}`);
    process.exit(1);
} finally {
    await client.end().catch(() => {});
}