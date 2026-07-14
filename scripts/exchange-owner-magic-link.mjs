import { readFileSync, writeFileSync } from "node:fs";
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
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        env[line.slice(0, i).trim()] = v;
    }
    return env;
}

const env = loadEnv();
const link = readFileSync(path.join(root, "tmp-owner-magic-link.txt"), "utf8").trim();
const u = new URL(link);
const tokenHash = u.searchParams.get("token_hash") || u.searchParams.get("token") || "";
const type = (u.searchParams.get("type") || "magiclink");

const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: type === "signup" ? "signup" : "magiclink",
});

if (error || !data.session) {
    console.log(JSON.stringify({
        ok: false,
        error: error?.message || "no session",
        params: Object.fromEntries(u.searchParams.entries()),
    }));
    process.exit(1);
}

writeFileSync(path.join(root, "tmp-owner-session.json"), JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    userId: data.user.id,
    email: data.user.email,
}, null, 2));

console.log(JSON.stringify({ ok: true, userId: data.user.id, email: data.user.email }));
