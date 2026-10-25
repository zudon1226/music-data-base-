import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadDotEnvLocal() {
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

export function readLocalSupabaseStatusEnv() {
    const raw = execSync("npx supabase status -o env", {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
    });
    const parsed = {};
    for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!match) continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        parsed[match[1]] = value;
    }
    return parsed;
}

export function resolveIsolatedRuntimeEnv(inputEnv = {}) {
    const env = { ...loadDotEnvLocal(), ...inputEnv };
    const enabled = String(env.MDB_ISOLATED_SUPABASE_E2E || "").trim().toLowerCase();
    if (!(enabled === "1" || enabled === "true" || enabled === "yes")) {
        throw new Error("MDB_ISOLATED_SUPABASE_E2E=1 is required.");
    }
    const status = readLocalSupabaseStatusEnv();
    const configuredApiUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
    const statusApiUrl = String(status.API_URL || "").replace(/\/+$/, "");
    // Isolated runs must not inherit a production URL from .env.local when local stack is available.
    const apiUrl = statusApiUrl || configuredApiUrl || "http://127.0.0.1:54321";
    const dbUrl = String(env.ISOLATED_DATABASE_URL || status.DB_URL || "postgresql://postgres:postgres@127.0.0.1:54322/postgres");
    if (apiUrl.includes(PRODUCTION_REF)) {
        throw new Error(`Blocked production Supabase ref ${PRODUCTION_REF}.`);
    }
    let apiHost = "";
    try {
        apiHost = new URL(apiUrl).hostname;
    } catch {
        throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL.");
    }
    if (apiHost !== "127.0.0.1" && apiHost !== "localhost") {
        throw new Error("Supabase API must be localhost for isolated validation.");
    }
    const dbParsed = new URL(dbUrl.replace(/^postgres:/, "postgresql:"));
    if (dbParsed.hostname !== "127.0.0.1" && dbParsed.hostname !== "localhost") {
        throw new Error("ISOLATED_DATABASE_URL must be localhost.");
    }
    if ((dbParsed.port || "5432") !== "54322") {
        throw new Error("ISOLATED_DATABASE_URL must use port 54322.");
    }
    const anonKey = String(status.ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");
    const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || status.SERVICE_ROLE_KEY || "");
    if (!anonKey || !serviceRoleKey) {
        throw new Error("Local Supabase anon/service keys unavailable from supabase status.");
    }
    return { apiUrl, dbUrl, anonKey, serviceRoleKey, apiHost };
}
