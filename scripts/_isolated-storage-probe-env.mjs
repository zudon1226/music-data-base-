import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalSupabaseStatusEnv } from "./_isolated-supabase-local-env.mjs";

const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";

export function loadEnv() {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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

export function resolveIsolatedSupabaseConfig(env) {
    const enabled = String(env.MDB_ISOLATED_SUPABASE_E2E || "").trim().toLowerCase();
    if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
        throw new Error("MDB_ISOLATED_SUPABASE_E2E=1 is required.");
    }
    const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "http://127.0.0.1:54321").trim();
    if (url.includes(PRODUCTION_REF)) {
        throw new Error("Refusing production Supabase URL.");
    }
    let urlHost = "";
    try {
        urlHost = new URL(url).hostname;
    } catch {
        throw new Error("Invalid Supabase URL.");
    }
    if (urlHost !== "127.0.0.1" && urlHost !== "localhost") {
        throw new Error("Supabase URL must be localhost for isolated probes.");
    }
    const status = readLocalSupabaseStatusEnv();
    const anonKey = String(status.ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "")
        .replace(/\r/g, "")
        .trim();
    const serviceRoleKey = String(status.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "")
        .replace(/\r/g, "")
        .trim();
    if (!anonKey || !serviceRoleKey) {
        throw new Error("Local Supabase keys unavailable (set env or run supabase start).");
    }
    const dbUrl = String(env.ISOLATED_DATABASE_URL || status.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    return {
        url,
        urlHost,
        anonKey,
        serviceRoleKey,
        dbUrl,
    };
}

export function assertBlocksProductionRef(env) {
    const url = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "");
    if (url.includes(PRODUCTION_REF)) {
        throw new Error(`Blocked production project ref ${PRODUCTION_REF}.`);
    }
}
