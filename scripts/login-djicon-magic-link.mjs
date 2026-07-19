/**
 * Generate a one-time magic-link session URL for djicon397 (service role).
 * Prints only the verification URL — does not print tokens separately.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMAIL = "djicon397@gmail.com";
const SITE = process.env.VERIFY_BASE_URL || "https://www.digitalmusicdatabase.com";

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
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
    options: { redirectTo: SITE },
});
if (link.error) {
    console.error(link.error.message);
    process.exit(1);
}
const hashed = link.data.properties?.hashed_token;
const verified = await anon.auth.verifyOtp({
    token_hash: hashed,
    type: "magiclink",
});
if (verified.error || !verified.data.session) {
    console.error(verified.error?.message || "no session");
    process.exit(1);
}
const session = verified.data.session;
const profile = await fetch(`${SITE}/api/user-profile?userId=${encodeURIComponent(session.user.id)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
});
const body = await profile.json().catch(() => ({}));
const founding = await fetch(`${SITE}/api/founding-members/me?userId=${encodeURIComponent(session.user.id)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
});
const foundingBody = await founding.json().catch(() => ({}));

console.log(JSON.stringify({
    site: SITE,
    email: session.user.email,
    userId: session.user.id,
    metadataRole: session.user.user_metadata?.role || null,
    profileStatus: profile.status,
    role: body.role,
    roles: body.roles,
    canUpload: body.canUpload,
    isListenerOnly: body.isListenerOnly,
    canArtistDashboard: body.canArtistDashboard,
    canMyRingtones: body.canMyRingtones,
    accessTrace: body.accessTrace || null,
    foundingDashboardView: foundingBody.access?.dashboardView ?? null,
    foundingSuggested: foundingBody.access?.suggestedCreatorDashboard ?? null,
    foundingApproval: foundingBody.access?.approvalStatus ?? null,
    okListener: body.role === "listener"
        && body.isListenerOnly === true
        && body.canUpload === false
        && body.canArtistDashboard === false
        && (foundingBody.access?.dashboardView == null),
}, null, 2));
