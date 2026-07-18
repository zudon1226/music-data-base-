/**
 * Heal djicon397 production access inputs:
 * - keep profiles.account_type = listener
 * - repair auth metadata.role founding_artist → listener
 * - print authoritative access snapshot
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
    if (!process.env[k]) process.env[k] = String(v);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const before = await sb.auth.admin.getUserById(DJICON_ID);
const beforeMeta = before.data.user?.user_metadata || {};
const { data: profile } = await sb
    .from("profiles")
    .select("account_type,display_name,avatar_url,is_admin")
    .eq("id", DJICON_ID)
    .maybeSingle();

console.log("BEFORE", {
    email: before.data.user?.email,
    metadataRole: beforeMeta.role,
    account_type: profile?.account_type,
});

if (String(profile?.account_type || "").toLowerCase() !== "listener") {
    await sb.from("profiles").update({
        account_type: "listener",
        updated_at: new Date().toISOString(),
    }).eq("id", DJICON_ID);
}

const nextMeta = {
    ...beforeMeta,
    displayName: String(beforeMeta.displayName || profile?.display_name || "djicon397"),
    role: "listener",
    avatarUrl: String(beforeMeta.avatarUrl || profile?.avatar_url || ""),
};
const { error: metaError } = await sb.auth.admin.updateUserById(DJICON_ID, {
    user_metadata: nextMeta,
});
if (metaError) {
    console.error("metadata repair failed", metaError.message);
    process.exit(1);
}

const after = await sb.auth.admin.getUserById(DJICON_ID);
const { loadAccountAccessSnapshot } = await import("../lib/account-access.ts");
const { getFoundingAccessForUser } = await import("../lib/founding-access.ts");
const founding = await getFoundingAccessForUser(sb, DJICON_ID, after.data.user?.email || "");
const access = await loadAccountAccessSnapshot({
    userId: DJICON_ID,
    email: after.data.user?.email || "",
    profileAccountType: "listener",
    authMetadataRole: String(after.data.user?.user_metadata?.role || ""),
    foundingRole: founding.foundingRole,
    foundingApprovalStatus: founding.approvalStatus,
});

console.log("AFTER", {
    metadataRole: after.data.user?.user_metadata?.role,
    foundingDashboardView: founding.dashboardView,
    suggestedCreatorDashboard: founding.suggestedCreatorDashboard,
    access: {
        primaryRole: access.capabilities.primaryRole,
        isListenerOnly: access.capabilities.isListenerOnly,
        canUpload: access.nav.canUpload,
        canArtistDashboard: access.nav.canArtistDashboard,
        canMyRingtones: access.nav.canMyRingtones,
        divergenceNotes: access.trace.divergenceNotes,
    },
    postLoginDestination: "Home",
});
