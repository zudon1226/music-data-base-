/**
 * Best-effort session invalidation for the owner after metadata repair.
 * Prefer ban_duration pulse when /admin/users/:id/logout is unavailable.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const OWNER_ID = "33564e29-6f65-4efd-8a27-6b58bc45a455";

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
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

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const logoutRes = await fetch(`${url}/auth/v1/admin/users/${OWNER_ID}/logout`, {
  method: "POST",
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  },
});

let method = "logout-endpoint";
let ok = logoutRes.ok || logoutRes.status === 204;

if (!ok) {
  method = "ban-duration-pulse";
  const ban = await sb.auth.admin.updateUserById(OWNER_ID, { ban_duration: "1s" });
  if (ban.error) {
    console.log(JSON.stringify({ ok: false, method, error: ban.error.message }, null, 2));
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1500));
  const unban = await sb.auth.admin.updateUserById(OWNER_ID, { ban_duration: "none" });
  if (unban.error) {
    console.log(JSON.stringify({ ok: false, method, error: unban.error.message }, null, 2));
    process.exit(1);
  }
  ok = true;
}

console.log(JSON.stringify({ ok, method, logoutStatus: logoutRes.status }, null, 2));
