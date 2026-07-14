import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const text = readFileSync(".env.local", "utf8");
const map = {};
for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    map[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(map.NEXT_PUBLIC_SUPABASE_URL, map.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const email = `hangprobe-${Date.now()}@probe.local`;
const password = `Probe_${Date.now()}_Aa1!`;
const r = await supabase.auth.signUp({ email, password });
console.log(r.error ? `ERR:${r.error.message}` : `OK:${Boolean(r.data.user?.id)}`);
