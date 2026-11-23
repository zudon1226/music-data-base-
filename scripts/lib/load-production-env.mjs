/**
 * Load Production Supabase/Vercel env without logging secrets.
 * Sources: MDB_* env, .env.production.local, ../music-data-base-/.env.local
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
export const STAGING_REF = "jzlegcbotqfzevtczwhx";

export function parseEnvFile(path) {
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

export function loadProductionEnv() {
    const fromFiles = {
        ...parseEnvFile(join(root, ".env.production.local")),
        ...parseEnvFile(join(root, "..", "music-data-base-", ".env.local")),
    };
    const env = {
        NEXT_PUBLIC_SUPABASE_URL:
            process.env.MDB_PRODUCTION_SUPABASE_URL
            || process.env.NEXT_PUBLIC_SUPABASE_URL
            || fromFiles.NEXT_PUBLIC_SUPABASE_URL
            || "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.MDB_PRODUCTION_SUPABASE_ANON_KEY
            || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
            || fromFiles.NEXT_PUBLIC_SUPABASE_ANON_KEY
            || "",
        SUPABASE_SERVICE_ROLE_KEY:
            process.env.MDB_PRODUCTION_SERVICE_ROLE_KEY
            || process.env.SUPABASE_SERVICE_ROLE_KEY
            || fromFiles.SUPABASE_SERVICE_ROLE_KEY
            || "",
        DATABASE_URL:
            process.env.MDB_PRODUCTION_DATABASE_URL
            || process.env.DATABASE_URL
            || fromFiles.DATABASE_URL
            || "",
    };
    const ref = env.NEXT_PUBLIC_SUPABASE_URL;
    if (!ref.includes(PRODUCTION_REF) || ref.includes(STAGING_REF)) {
        throw new Error("Production Supabase URL identity failed");
    }
    if (env.DATABASE_URL && (!env.DATABASE_URL.includes(PRODUCTION_REF) || env.DATABASE_URL.includes(STAGING_REF))) {
        throw new Error("Production DATABASE_URL identity failed");
    }
    return env;
}

export function productionBaseUrl() {
    return String(process.env.MDB_PRODUCTION_BASE_URL || "https://www.digitalmusicdatabase.com").replace(/\/$/, "");
}