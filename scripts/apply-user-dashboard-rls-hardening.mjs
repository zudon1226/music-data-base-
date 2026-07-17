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
const sql = readFileSync(path.join(root, "supabase/migrations/202607170004_user_dashboard_rls_grant_hardening.sql"), "utf8");
if (!databaseUrl) {
    console.log(JSON.stringify({ ok: false, status: "manual_apply_required" }));
    process.exit(1);
}
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
    await client.query(sql);
    console.log(JSON.stringify({ ok: true, status: "applied_via_database_url" }));
}
finally {
    await client.end();
}
