/**
 * Apply staging-only hotfix SQL (requires .env.staging.local).
 * Usage: node scripts/apply-mixtape-staging-hotfix.mjs <migration-file>
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_ENV_FILE = ".env.staging.local";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) {
    console.error("migration file required");
    process.exit(1);
}

function assertStagingDatabaseTarget(connectionString) {
    if (!connectionString) throw new Error(`${STAGING_ENV_FILE}: DATABASE_URL missing — abort`);
    const lower = String(connectionString).toLowerCase();
    if (lower.includes(PRODUCTION_REF)) throw new Error("DATABASE_URL points at production — abort");
    if (!lower.includes(STAGING_REF)) throw new Error(`DATABASE_URL must target staging ref ${STAGING_REF}`);
}

function parseEnv(path) {
    const env = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function parsePg(raw) {
    const match = String(raw).match(/^(postgres(?:ql)?:\/\/)(.+)$/i);
    if (!match) return null;
    const body = match[2];
    const at = body.lastIndexOf("@");
    const userinfo = body.slice(0, at);
    const hostpart = body.slice(at + 1).split("?")[0];
    const colon = userinfo.indexOf(":");
    let password = colon >= 0 ? userinfo.slice(colon + 1) : "";
    try {
        password = decodeURIComponent(password);
    } catch {
        // keep
    }
    return {
        password,
        database: hostpart.split("/")[1] || "postgres",
    };
}

const stagingEnvPath = join(root, STAGING_ENV_FILE);
if (!existsSync(stagingEnvPath)) {
    console.error(`${STAGING_ENV_FILE} required for staging hotfix`);
    process.exit(1);
}
const env = parseEnv(stagingEnvPath);
assertStagingDatabaseTarget(env.DATABASE_URL || "");
const parsed = parsePg(env.DATABASE_URL || "");
if (!parsed?.password) {
    console.error("DATABASE_URL password missing or unparseable");
    process.exit(1);
}
const client = new pg.Client({
    host: env.PGPOOLER_HOST || "aws-0-us-east-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${STAGING_REF}`,
    password: parsed?.password,
    database: parsed?.database || "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
});
await client.connect();
try {
    const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
    await client.query(sql);
    console.log("PASS applied " + file);
} finally {
    await client.end();
}