import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_ENV_FILE = ".env.staging.local";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function assertStagingDatabaseTarget(connectionString) {
    if (!connectionString) throw new Error(`${STAGING_ENV_FILE}: DATABASE_URL missing`);
    const lower = String(connectionString).toLowerCase();
    if (lower.includes(PRODUCTION_REF)) throw new Error("DATABASE_URL points at production — abort");
    if (!lower.includes(STAGING_REF)) throw new Error(`DATABASE_URL must target staging ref ${STAGING_REF}`);
}

function parseEnv(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
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
        user: colon >= 0 ? userinfo.slice(0, colon) : userinfo,
        password,
        database: hostpart.split("/")[1] || "postgres",
    };
}

const stagingEnvPath = join(root, STAGING_ENV_FILE);
if (!existsSync(stagingEnvPath)) {
    console.log("result=missing_staging_env");
    process.exit(1);
}
const env = parseEnv(stagingEnvPath);
try {
    assertStagingDatabaseTarget(env.DATABASE_URL || "");
} catch (error) {
    console.log("result=ref_guard_failed", error instanceof Error ? error.message : String(error));
    process.exit(1);
}
const parsed = parsePg(env.DATABASE_URL || "");
if (!parsed) {
    console.log("result=missing_database_url");
    process.exit(1);
}

const poolerHosts = [
    "aws-0-us-east-1.pooler.supabase.com",
    "aws-0-us-east-2.pooler.supabase.com",
    "aws-0-us-west-1.pooler.supabase.com",
    "aws-0-eu-west-1.pooler.supabase.com",
    "aws-0-eu-central-1.pooler.supabase.com",
    "aws-0-ap-southeast-1.pooler.supabase.com",
];

const attempts = [
    { label: "direct_5432", host: `db.${STAGING_REF}.supabase.co`, port: 5432, user: "postgres" },
    ...poolerHosts.flatMap((host) => [
        { label: `pooler_session_${host}`, host, port: 5432, user: `postgres.${STAGING_REF}` },
        { label: `pooler_tx_${host}`, host, port: 6543, user: `postgres.${STAGING_REF}` },
    ]),
];

let firstOk = null;
for (const attempt of attempts) {
    const client = new pg.Client({
        host: attempt.host,
        port: attempt.port,
        user: attempt.user,
        password: parsed.password,
        database: parsed.database,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 12_000,
    });
    try {
        await client.connect();
        await client.query("select 1");
        console.log("result=ok", "mode=" + attempt.label);
        firstOk = attempt;
        await client.end();
        break;
    } catch (error) {
        console.log("result=fail", "mode=" + attempt.label, "code=" + (error.code || "unknown"));
        await client.end().catch(() => {});
    }
}

if (!firstOk) process.exit(1);