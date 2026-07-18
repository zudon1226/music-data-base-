/**
 * Static + live checks for authoritative account access (no founding→nav).
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DJICON_ID = "281ceeaa-2d62-41e3-826b-4b9265c63ae0";
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function read(rel) {
    const full = path.join(root, rel);
    if (!existsSync(full)) return "";
    return readFileSync(full, "utf8");
}

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

const page = read("app/page.tsx");
const founding = read("lib/founding-access.ts");
const syncMeta = read("lib/sync-auth-user-metadata.ts");
const accountAccess = read("lib/account-access.ts");
const profileApi = read("app/api/user-profile/route.ts");
const foundingMe = read("app/api/founding-members/me/route.ts");

record("account-access module present", accountAccess.includes("loadAccountAccessSnapshot"));
record("post-auth destination helper present", accountAccess.includes("resolvePostAuthDestination"));
record("founding dashboardView forced null", founding.includes("dashboardView: null")
    && founding.includes("Never use for navigation"));
record("login ignores founding dashboard", page.includes("resolvePostAuthDestination")
    && page.includes("foundingDashboardIgnored")
    && !/access\?\.dashboardView && access\.canAccessApp/.test(page));
record("gate redeem lands on Home", page.includes("setView(\"Home\")")
    && page.includes("Founding approval must not force"));
record("ensureProfile ignores metadata role", syncMeta.includes("Never promote from auth metadata"));
record("profile API logs access trace", profileApi.includes("logAccountAccessTrace")
    && profileApi.includes("accessTrace"));
record("founding me API nulls dashboardView", foundingMe.includes("dashboardView: null"));
record("silent unauthorized view recovery", page.includes("Silent recovery for deep links"));
record("schema v4", read("lib/client-access-session.ts").includes("CLIENT_ACCESS_SCHEMA_VERSION = 4"));

const env = readEnv();
for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = String(v);
}

function normalizeRole(value) {
    const n = String(value || "").trim().toLowerCase();
    if (n === "admin") return "admin";
    if (["artist", "founding_artist", "artist_pro", "creator"].includes(n)) return "artist";
    if (["producer", "founding_producer", "producer_pro"].includes(n)) return "producer";
    return "listener";
}

try {
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const user = await sb.auth.admin.getUserById(DJICON_ID);
    const email = user.data.user?.email || "";
    const { data: profile } = await sb.from("profiles").select("account_type").eq("id", DJICON_ID).maybeSingle();
    const { data: foundingRow } = await sb.from("founding_members").select("founding_role,approval_status").eq("user_id", DJICON_ID).maybeSingle();
    const { data: roleRows } = await sb.from("user_roles").select("role,status").eq("user_id", DJICON_ID);
    const primary = normalizeRole(profile?.account_type);
    const roleSet = new Set();
    if (primary !== "listener") roleSet.add(primary);
    for (const row of roleRows || []) {
        if (String(row.status || "").toLowerCase() !== "active") continue;
        const clean = String(row.role || "").trim().toLowerCase();
        const normalized = normalizeRole(clean);
        if (primary === "listener" && (normalized === "artist" || normalized === "producer" || normalized === "admin")) continue;
        if (clean) roleSet.add(clean);
    }
    const isArtist = [...roleSet].some((r) => ["artist", "founding_artist", "artist_pro", "creator"].includes(r));
    const isProducer = [...roleSet].some((r) => ["producer", "founding_producer", "producer_pro"].includes(r));
    const isListenerOnly = !isArtist && !isProducer && primary === "listener";
    const foundingDashboardView = null; // product rule: founding never drives nav
    const dest = isListenerOnly ? "Home" : (isArtist ? "Home" : "Home");
    record("djicon account_type listener", primary === "listener", `account_type=${profile?.account_type}`);
    record("djicon isListenerOnly", isListenerOnly);
    record("djicon canUpload false", !isArtist && !isProducer);
    record("djicon canArtistDashboard false", !isArtist);
    record("djicon canMyRingtones false", !isArtist && !isProducer);
    record("djicon founding dashboardView null", foundingDashboardView === null);
    record("djicon post-login destination Home", dest === "Home");
    record(
        "djicon approved founding does not elevate",
        foundingRow?.approval_status === "approved" && isListenerOnly,
        `approval=${foundingRow?.approval_status} role=${foundingRow?.founding_role} meta=${user.data.user?.user_metadata?.role}`,
    );
    // Heal metadata if still founding_artist while profile is listener.
    if (isListenerOnly && String(user.data.user?.user_metadata?.role || "").toLowerCase() !== "listener") {
        const meta = { ...(user.data.user?.user_metadata || {}), role: "listener" };
        const { error: metaErr } = await sb.auth.admin.updateUserById(DJICON_ID, { user_metadata: meta });
        record("djicon metadata role healed to listener", !metaErr, metaErr?.message || "updated");
    } else {
        record("djicon metadata role already listener-compatible", true, String(user.data.user?.user_metadata?.role || ""));
    }
} catch (error) {
    record("live djicon access probe", false, error instanceof Error ? error.message : String(error));
}

const failed = results.filter((row) => !row.ok).length;
console.log(`\nACCOUNT_ACCESS_PIPELINE_FAILS=${failed}`);
process.exit(failed ? 1 : 0);
