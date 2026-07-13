/**
 * Post-repair verification (no password printed).
 * Optional password grant check if OWNER_LOGIN_PASSWORD is set in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const OWNER_ID = "33564e29-6f65-4efd-8a27-6b58bc45a455";
const OWNER_EMAIL = "zudon1226@gmail.com";

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

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

function approxJwtBytes(accessToken) {
  return Buffer.byteLength(String(accessToken || ""), "utf8");
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const password = env.OWNER_LOGIN_PASSWORD || env.ZUDON_LOGIN_PASSWORD || "";

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: userResult, error: userError } = await admin.auth.admin.getUserById(OWNER_ID);
if (userError || !userResult?.user) {
  console.error("admin getUserById failed:", userError?.message || "missing user");
  process.exit(1);
}

const meta = userResult.user.user_metadata || {};
const { data: profile } = await admin
  .from("profiles")
  .select("account_type,is_admin")
  .or(`id.eq.${OWNER_ID},user_id.eq.${OWNER_ID}`)
  .maybeSingle();
const { data: roles } = await admin
  .from("user_roles")
  .select("role,status")
  .eq("user_id", OWNER_ID);

const report = {
  userId: OWNER_ID,
  email: userResult.user.email,
  metadataKeys: Object.keys(meta),
  metadataBytes: byteSize(meta),
  musicDataPresent: Object.prototype.hasOwnProperty.call(meta, "musicData"),
  profile,
  roles,
  passwordGrant: null,
  getUserStatus: null,
  accessTokenBytes: null,
};

if (!password) {
  report.passwordGrant = "skipped (set OWNER_LOGIN_PASSWORD in .env.local to auto-verify login)";
  console.log(JSON.stringify(report, null, 2));
  process.exit(meta.musicData || byteSize(meta) > 1000 ? 1 : 0);
}

const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: {
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ email: OWNER_EMAIL, password }),
});
report.passwordGrant = tokenRes.status;

const tokenJson = await tokenRes.json().catch(() => ({}));
const accessToken = tokenJson.access_token || "";
report.accessTokenBytes = accessToken ? approxJwtBytes(accessToken) : null;

if (!tokenRes.ok || !accessToken) {
  console.log(JSON.stringify({ ...report, loginError: tokenJson.error_description || tokenJson.msg || "login failed" }, null, 2));
  process.exit(1);
}

const userRes = await fetch(`${url}/auth/v1/user`, {
  headers: {
    apikey: anon,
    Authorization: `Bearer ${accessToken}`,
  },
});
report.getUserStatus = userRes.status;

console.log(JSON.stringify(report, null, 2));
process.exit(userRes.status === 200 && report.metadataBytes < 1000 && !report.musicDataPresent ? 0 : 1);
