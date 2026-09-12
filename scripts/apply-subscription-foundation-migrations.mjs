/**
 * Apply subscription foundation migrations only (Group 3 scope).
 * Usage: node scripts/apply-subscription-foundation-migrations.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
    "202609051002_subscription_stripe_go_live.sql",
    "202609061001_artist_producer_annual_plans.sql",
];

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
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
if (!databaseUrl) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
}

const client = new pg.Client({
    connectionString: resolveDirectDatabaseUrl(databaseUrl, supabaseUrl),
    ssl: env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});
await client.connect();

try {
    for (const file of migrations) {
        const sql = readFileSync(join(root, "supabase/migrations", file), "utf8");
        try {
            await client.query(sql);
            console.log(`PASS applied ${file}`);
        } catch (error) {
            const message = String(error?.message || error);
            if (/already exists|duplicate/i.test(message)) {
                console.log(`PASS ${file} (already applied)`);
            } else {
                console.error(`FAIL ${file}: ${message.slice(0, 200)}`);
                process.exitCode = 1;
            }
        }
    }

    const comment = await client.query(`
        select col_description('public.subscription_plans'::regclass, (
            select ordinal_position from information_schema.columns
            where table_schema='public' and table_name='subscription_plans' and column_name='stripe_price_id'
        )::int) as comment
    `);
    const commentOk = String(comment.rows[0]?.comment || "").includes("Stripe Price ID");
    console.log(commentOk ? "PASS subscription_plans.stripe_price_id documented" : "WARN stripe_price_id column comment missing");
} finally {
    await client.end().catch(() => {});
}

if (process.exitCode) process.exit(process.exitCode);
console.log("\nSubscription foundation migrations complete.");
