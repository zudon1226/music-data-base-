/**
 * Simulate /api/user-profile role payload for djicon397 via loadResolvedAccountCapabilities.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DJICON_ID = "281ceeaa-2d62-41e3-826b-4b9265c63ae0";

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    } catch { /* ignore */ }
    return env;
}

const env = readEnv();
for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v;
}

const { loadResolvedAccountCapabilities } = await import("../lib/resolved-account-role.ts");
const caps = await loadResolvedAccountCapabilities(DJICON_ID, "djicon397@gmail.com");
console.log(JSON.stringify({ caps }, null, 2));
