/**
 * Create a confirmed probe user via service role (for local verification only).
 * Prints email= and password= lines; never prints service role key.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function readEnvLocal() {
    const text = readFileSync(path.join(root, ".env.local"), "utf8");
    const map = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (!m) continue;
        map[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return map;
}

const env = readEnvLocal();
const email = `sweep-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("missing supabase admin env");
    process.exit(1);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Sweep Probe" },
});

if (created.error) {
    console.error("CREATE_FAILED", created.error.message);
    process.exit(1);
}

console.log(`email=${email}`);
console.log(`password=${password}`);
console.log(`userId=${created.data.user?.id || ""}`);
