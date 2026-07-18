/**
 * Live inspect of djicon397 role resolution inputs (service role).
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
    } catch {
        /* ignore */
    }
    return env;
}

function normalize(value) {
    const n = String(value || "").trim().toLowerCase();
    if (n === "admin") return "admin";
    if (["artist", "founding_artist", "artist_pro", "creator"].includes(n)) return "artist";
    if (["producer", "founding_producer", "producer_pro"].includes(n)) return "producer";
    return "listener";
}

const env = readEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const user = await sb.auth.admin.getUserById(DJICON_ID);
const { data: profile } = await sb
    .from("profiles")
    .select("id,user_id,account_type,is_admin,display_name,username")
    .or(`id.eq.${DJICON_ID},user_id.eq.${DJICON_ID}`)
    .maybeSingle();
const { data: roles } = await sb.from("user_roles").select("role,status,created_at").eq("user_id", DJICON_ID);
const { data: founding } = await sb.from("founding_members").select("*").eq("user_id", DJICON_ID).maybeSingle();
const { data: artists } = await sb.from("artist_profiles").select("id,user_id").eq("user_id", DJICON_ID);
const { data: producers } = await sb.from("producer_profiles").select("id,user_id").eq("user_id", DJICON_ID);
const { count: songs } = await sb.from("songs").select("id", { count: "exact", head: true }).eq("user_id", DJICON_ID);

const primary = normalize(profile?.account_type);
const activeRoles = (roles || []).filter((r) => String(r.status || "").toLowerCase() === "active");
const roleSet = new Set();
if (primary !== "listener") roleSet.add(primary);
for (const row of activeRoles) {
    const clean = String(row.role || "").trim().toLowerCase();
    const normalized = normalize(clean);
    if (primary === "listener" && (normalized === "artist" || normalized === "producer" || normalized === "admin")) {
        continue;
    }
    if (clean) roleSet.add(clean);
}
const isArtist = [...roleSet].some((r) => ["artist", "founding_artist", "artist_pro", "creator"].includes(r));
const isProducer = [...roleSet].some((r) => ["producer", "founding_producer", "producer_pro"].includes(r));

const out = {
    email: user.data.user?.email || null,
    userId: DJICON_ID,
    authMetadata: user.data.user?.user_metadata || null,
    profile,
    roles,
    founding: founding
        ? {
            approval_status: founding.approval_status,
            founding_role: founding.founding_role,
            canAccessApp: founding.approval_status === "approved",
            canUploadFromFounding: founding.approval_status === "approved",
        }
        : null,
    artistProfiles: artists?.length || 0,
    producerProfiles: producers?.length || 0,
    ownedSongs: songs || 0,
    resolvedSimulation: {
        primaryFromAccountType: primary,
        roleSetAfterListenerFilter: [...roleSet],
        canUpload: isArtist || isProducer || profile?.is_admin === true,
        canArtistDashboard: isArtist || profile?.is_admin === true,
        canProducerDashboard: isProducer || profile?.is_admin === true,
        isListenerOnly: !isArtist && !isProducer && profile?.is_admin !== true,
    },
};

console.log(JSON.stringify(out, null, 2));
