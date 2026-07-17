/**
 * Apply founding pending-approval atomicity migration via DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
    const text = readFileSync(path.join(root, ".env.local"), "utf8");
    const env = {};
    for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i <= 0) continue;
        let v = line.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        env[line.slice(0, i).trim()] = v;
    }
    return env;
}

const env = loadEnv();
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
const migrationPath = path.join(root, "supabase/migrations/202607170005_founding_pending_approval_atomicity.sql");
const sql = readFileSync(migrationPath, "utf8");

if (!databaseUrl) {
    console.log(JSON.stringify({
        ok: false,
        status: "manual_apply_required",
        migration: "supabase/migrations/202607170005_founding_pending_approval_atomicity.sql",
    }));
    process.exit(1);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
    await client.query(sql);
    const check = await client.query(`
      select
        to_regprocedure('public.redeem_founding_invite_atomic(uuid,text,text)') is not null as redeem_rpc,
        to_regprocedure('public.repair_orphaned_founding_redemptions()') is not null as repair_rpc
    `);
    console.log(JSON.stringify({
        ok: true,
        status: "applied_via_database_url",
        checks: check.rows[0],
    }));
}
finally {
    await client.end();
}
