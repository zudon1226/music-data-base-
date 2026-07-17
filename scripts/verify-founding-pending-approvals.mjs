/**
 * Live verification: pending founding members appear in admin Pending Approvals.
 * Restores djicon397 to pending (without approving) and asserts admin list visibility.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = path.join(root, "tmp");
mkdirSync(evidenceDir, { recursive: true });
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function readEnv() {
    const env = { ...process.env };
    try {
        for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (!match) continue;
            env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
        }
    }
    catch { /* ignore */ }
    return env;
}

async function ownerSession(env) {
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: "zudon1226@gmail.com" });
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    return verified.data.session;
}

const DJICON_ID = "281ceeaa-2d62-41e3-826b-4b9265c63ae0";

async function main() {
    const env = readEnv();
    const baseUrl = env.VERIFY_BASE_URL || env.LOCAL_SITE_URL || "https://music-data-base.vercel.app";
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const before = await admin
        .from("founding_members")
        .select("*")
        .eq("user_id", DJICON_ID)
        .maybeSingle();
    record("djicon founding member row exists", Boolean(before.data), before.data?.approval_status || before.error?.message || "missing");

    const restore = await admin
        .from("founding_members")
        .update({
            approval_status: "pending",
            approved_at: null,
            approved_by: null,
            rejected_at: null,
            rejected_by: null,
            updated_at: new Date().toISOString(),
        })
        .eq("user_id", DJICON_ID)
        .select("*")
        .single();
    record(
        "djicon restored to pending (not approved)",
        restore.data?.approval_status === "pending" && !restore.data?.approved_at,
        restore.data?.approval_status || restore.error?.message || "",
    );

    const inviteId = before.data?.invite_id || restore.data?.invite_id || "";
    const invite = await admin
        .from("founding_invites")
        .select("id,status,redeemed_by,invite_code")
        .eq("id", inviteId)
        .maybeSingle();
    record(
        "djicon invite remains used (single-use preserved)",
        invite.data?.status === "used" && invite.data?.redeemed_by === DJICON_ID,
        `${invite.data?.invite_code || ""}:${invite.data?.status || ""}`,
    );

    const owner = await ownerSession(env);
    record("owner session", Boolean(owner?.access_token), owner?.user?.id || "");

    if (!owner?.access_token) {
        writeFileSync(path.join(evidenceDir, "founding-pending-approvals-evidence.json"), JSON.stringify({ results }, null, 2));
        process.exit(1);
    }

    const membersRes = await fetch(`${baseUrl}/api/launch/founding-members?userId=${encodeURIComponent(owner.user.id)}`, {
        headers: { Authorization: `Bearer ${owner.access_token}` },
    });
    const membersJson = await membersRes.json().catch(() => ({}));
    const pending = Array.isArray(membersJson.pending)
        ? membersJson.pending
        : (membersJson.members || []).filter((row) => row.approval_status === "pending");
    const djiconPending = pending.find((row) => row.user_id === DJICON_ID);
    record(
        "djicon appears in admin pending approvals",
        membersRes.ok && Boolean(djiconPending),
        JSON.stringify({
            status: membersRes.status,
            pendingCount: pending.length,
            email: djiconPending?.email || "",
            role: djiconPending?.founding_role || "",
            display_name: djiconPending?.display_name || "",
        }),
    );

    const memberRow = await admin
        .from("founding_members")
        .select("approval_status,founding_role")
        .eq("user_id", DJICON_ID)
        .maybeSingle();
    record(
        "djicon user-facing status remains pending",
        memberRow.data?.approval_status === "pending",
        memberRow.data?.approval_status || "",
    );

    const probeEmail = `pending-visibility-${Date.now()}@probe.local`;
    const probePassword = `Probe_${Date.now()}_Cc3!`;
    await admin.auth.admin.createUser({ email: probeEmail, password: probePassword, email_confirm: true });
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const probeLogin = await anon.auth.signInWithPassword({ email: probeEmail, password: probePassword });
    const probeSession = probeLogin.data.session;
    if (probeSession?.access_token) {
        const denied = await fetch(`${baseUrl}/api/launch/founding-members?userId=${encodeURIComponent(probeSession.user.id)}`, {
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        record("non-admin pending list denied", denied.status === 403, String(denied.status));

        const own = await anon.from("founding_members").select("user_id").limit(20);
        const leaked = (own.data || []).some((row) => row.user_id !== probeSession.user.id);
        record(
            "ordinary user cannot read other founding members via RLS",
            !leaked && !own.error,
            own.error?.message || `rows=${(own.data || []).length}`,
        );
    }
    else {
        record("non-admin pending list denied", false, "probe session missing");
        record("ordinary user cannot read other founding members via RLS", false, "probe session missing");
    }

    writeFileSync(path.join(evidenceDir, "founding-pending-approvals-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nFOUNDING_PENDING_APPROVALS_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
