/**
 * Ensure user_media_queue tables exist using service-role Postgres (DATABASE_URL) or
 * report the SQL path for manual apply in the Supabase SQL editor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

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
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
const migrationPath = path.join(root, "supabase/migrations/202607140001_create_user_media_queue.sql");
const sql = readFileSync(migrationPath, "utf8");

async function tablesExist() {
    if (!url || !serviceKey) return false;
    const admin = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.from("user_media_queue_items").select("id").limit(1);
    if (!error) return true;
    const message = String(error.message || "").toLowerCase();
    if (message.includes("does not exist") || error.code === "42P01" || message.includes("schema cache")) {
        return false;
    }
    // Other errors may still mean table exists (e.g. RLS); treat as present.
    return !message.includes("could not find");
}

if (await tablesExist()) {
    console.log(JSON.stringify({ ok: true, status: "already_exists" }));
    process.exit(0);
}

if (databaseUrl) {
    const { default: pg } = await import("pg").catch(() => ({ default: null }));
    if (!pg) {
        console.log(JSON.stringify({
            ok: false,
            status: "need_pg_or_manual",
            migration: "supabase/migrations/202607140001_create_user_media_queue.sql",
        }));
        process.exit(1);
    }
    const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
        await client.query(sql);
        console.log(JSON.stringify({ ok: true, status: "applied_via_database_url" }));
        process.exit(0);
    }
    finally {
        await client.end();
    }
}

console.log(JSON.stringify({
    ok: false,
    status: "manual_apply_required",
    migration: "supabase/migrations/202607140001_create_user_media_queue.sql",
    hint: "Paste migration SQL into Supabase SQL Editor, or set DATABASE_URL in .env.local",
}));
process.exit(1);
