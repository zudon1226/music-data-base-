/**
 * Founding beta onboarding verification harness.
 * Usage: NEXT_PUBLIC_FOUNDING_BETA_LOCKED=1 node scripts/verify-founding-onboarding.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
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

async function applyMigration(env) {
    const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL || "";
    if (!databaseUrl) return false;
    const migrationFiles = [
        "202607150001_founding_onboarding.sql",
        "202607150002_harden_founding_members_rls.sql",
        "202607170005_founding_pending_approval_atomicity.sql",
    ];
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        for (const fileName of migrationFiles) {
            const sql = readFileSync(path.join(root, "supabase/migrations", fileName), "utf8");
            await client.query(sql);
        }
        return true;
    }
    finally {
        await client.end();
    }
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

function authBody(userId, session, extra = {}) {
    return {
        ...extra,
        userId,
        sessionUserId: userId,
        accessToken: session.access_token,
        sessionAccessToken: session.access_token,
        refreshToken: session.refresh_token,
        sessionRefreshToken: session.refresh_token,
    };
}

async function main() {
    const env = readEnv();
    process.env.NEXT_PUBLIC_FOUNDING_BETA_LOCKED = "1";
    const baseUrl = env.VERIFY_BASE_URL || env.LOCAL_SITE_URL || env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

    if (env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL) {
        try {
            const applied = await applyMigration(env);
            record("migration apply", applied, "founding onboarding migrations");
        }
        catch (error) {
            record("migration apply", false, error instanceof Error ? error.message : String(error));
        }
    }
    else {
        record("migration apply", false, "DATABASE_URL missing — apply migration manually");
    }

    const owner = await ownerSession(env);
    if (!owner?.access_token) {
        record("owner session", false, "unable to create owner session");
        writeFileSync(path.join(evidenceDir, "founding-onboarding-evidence.json"), JSON.stringify({ results }, null, 2));
        process.exit(1);
    }
    record("owner session", true, owner.user.id);

    const headers = {
        Authorization: `Bearer ${owner.access_token}`,
        "Content-Type": "application/json",
    };

    const createInvite = await fetch(`${baseUrl}/api/launch/founding-invites`, {
        method: "POST",
        headers,
        body: JSON.stringify(authBody(owner.user.id, owner, { intendedRole: "founding_artist" })),
    });
    const inviteJson = await createInvite.json().catch(() => ({}));
    record("owner invite creation", createInvite.ok && inviteJson.invite?.invite_code, JSON.stringify({
        status: createInvite.status,
        code: inviteJson.invite?.invite_code || "",
    }));

    const invalidInvite = await fetch(`${baseUrl}/api/founding-invites/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: "INVALID-CODE-XYZ" }),
    });
    const invalidJson = await invalidInvite.json().catch(() => ({}));
    record("invalid invite rejection", !invalidInvite.ok && !invalidJson.valid, invalidJson.error || String(invalidInvite.status));

    const inviteCode = inviteJson.invite?.invite_code || "";
    const validInvite = await fetch(`${baseUrl}/api/founding-invites/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
    });
    const validJson = await validInvite.json().catch(() => ({}));
    record("valid invite validation", validInvite.ok && validJson.valid, validJson.intendedRole || "");

    if (inviteCode) {
        const caseInvite = await fetch(`${baseUrl}/api/founding-invites/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviteCode: `  ${inviteCode.toLowerCase()}  ` }),
        });
        const caseJson = await caseInvite.json().catch(() => ({}));
        record("case-insensitive trimmed invite validation", caseInvite.ok && caseJson.valid === true, caseJson.intendedRole || caseJson.error || "");
    }
    else {
        record("case-insensitive trimmed invite validation", false, "missing invite code");
    }

    const expiredInvite = await fetch(`${baseUrl}/api/launch/founding-invites`, {
        method: "POST",
        headers,
        body: JSON.stringify(authBody(owner.user.id, owner, {
            intendedRole: "founding_artist",
            expiresAt: new Date(Date.now() - 60_000).toISOString(),
        })),
    });
    const expiredInviteJson = await expiredInvite.json().catch(() => ({}));
    const expiredCode = expiredInviteJson.invite?.invite_code || "";
    const expiredValidate = await fetch(`${baseUrl}/api/founding-invites/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: expiredCode }),
    });
    const expiredValidateJson = await expiredValidate.json().catch(() => ({}));
    record(
        "expired invite rejection",
        Boolean(expiredCode) && !expiredValidate.ok && /expired/i.test(String(expiredValidateJson.error || "")),
        expiredValidateJson.error || String(expiredValidate.status),
    );

    const revokeInvite = await fetch(`${baseUrl}/api/launch/founding-invites`, {
        method: "POST",
        headers,
        body: JSON.stringify(authBody(owner.user.id, owner, { intendedRole: "founding_artist" })),
    });
    const revokeInviteJson = await revokeInvite.json().catch(() => ({}));
    const revokeInviteId = revokeInviteJson.invite?.id || "";
    const revokeCode = revokeInviteJson.invite?.invite_code || "";
    let revokeOk = false;
    if (revokeInviteId) {
        const revoke = await fetch(`${baseUrl}/api/launch/founding-invites`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(authBody(owner.user.id, owner, {
                inviteId: revokeInviteId,
                action: "revoke",
            })),
        });
        revokeOk = revoke.ok;
    }
    const revokedValidate = await fetch(`${baseUrl}/api/founding-invites/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: revokeCode }),
    });
    const revokedValidateJson = await revokedValidate.json().catch(() => ({}));
    record(
        "revoked invite rejection",
        revokeOk && Boolean(revokeCode) && !revokedValidate.ok && /revoked/i.test(String(revokedValidateJson.error || "")),
        revokedValidateJson.error || String(revokedValidate.status),
    );

    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const probeEmail = `founding-probe-${Date.now()}@probe.local`;
    const probePassword = `Probe_${Date.now()}_Aa1!`;
    await admin.auth.admin.createUser({ email: probeEmail, password: probePassword, email_confirm: true });
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const probeLogin = await anon.auth.signInWithPassword({ email: probeEmail, password: probePassword });
    const probeSession = probeLogin.data.session;
    record("probe user session", Boolean(probeSession?.access_token));

    if (probeSession?.access_token) {
        const pendingAccess = await fetch(`${baseUrl}/api/founding-members/me?userId=${encodeURIComponent(probeSession.user.id)}`, {
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        const pendingJson = await pendingAccess.json().catch(() => ({}));
        record("pending-user access denial", pendingJson.access?.canAccessApp === false, JSON.stringify(pendingJson.access || {}));

        const protectedApi = await fetch(`${baseUrl}/api/user-music-state?userId=${encodeURIComponent(probeSession.user.id)}`, {
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        record("pending-user protected API denial", protectedApi.status === 403, String(protectedApi.status));

        const queryTokenApi = await fetch(`${baseUrl}/api/user-music-state?userId=${encodeURIComponent(probeSession.user.id)}&accessToken=${encodeURIComponent(probeSession.access_token)}`);
        record("pending-user query-token API denial", queryTokenApi.status === 403, String(queryTokenApi.status));

        const redeem = await fetch(`${baseUrl}/api/founding-invites/redeem`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${probeSession.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authBody(probeSession.user.id, probeSession, {
                inviteCode,
                displayName: "Founding Probe",
            })),
        });
        const redeemJson = await redeem.json().catch(() => ({}));
        record("single-use invite redeem", redeem.ok, redeemJson.approvalStatus || redeemJson.error || "");

        const pendingAdmin = await fetch(`${baseUrl}/api/launch/founding-members?userId=${encodeURIComponent(owner.user.id)}`, {
            headers: { Authorization: `Bearer ${owner.access_token}` },
        });
        const pendingAdminJson = await pendingAdmin.json().catch(() => ({}));
        const pendingList = Array.isArray(pendingAdminJson.pending)
            ? pendingAdminJson.pending
            : (pendingAdminJson.members || []).filter((row) => row.approval_status === "pending");
        const probeInPending = pendingList.some((row) => row.user_id === probeSession.user.id);
        record(
            "redeemed member appears in admin pending approvals",
            pendingAdmin.ok && probeInPending,
            JSON.stringify({ status: pendingAdmin.status, pendingCount: pendingList.length }),
        );

        const secondRedeem = await fetch(`${baseUrl}/api/founding-invites/redeem`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${probeSession.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(authBody(probeSession.user.id, probeSession, {
                inviteCode,
                displayName: "Founding Probe",
            })),
        });
        const secondRedeemJson = await secondRedeem.json().catch(() => ({}));
        record(
            "already-used invite redeem blocked",
            secondRedeem.status === 400 && /already been used|already linked/i.test(String(secondRedeemJson.error || "")),
            secondRedeemJson.error || String(secondRedeem.status),
        );

        const usedValidate = await fetch(`${baseUrl}/api/founding-invites/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviteCode }),
        });
        const usedValidateJson = await usedValidate.json().catch(() => ({}));
        record(
            "already-used invite validation rejected",
            !usedValidate.ok && /already been used/i.test(String(usedValidateJson.error || "")),
            usedValidateJson.error || String(usedValidate.status),
        );

        const pendingAfter = await fetch(`${baseUrl}/api/founding-members/me?userId=${encodeURIComponent(probeSession.user.id)}`, {
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        const pendingAfterJson = await pendingAfter.json().catch(() => ({}));
        record("pending after redeem", pendingAfterJson.access?.approvalStatus === "pending");

        const approve = await fetch(`${baseUrl}/api/launch/founding-members`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(authBody(owner.user.id, owner, {
                memberUserId: probeSession.user.id,
                action: "approve",
            })),
        });
        record("owner approval", approve.ok, String(approve.status));

        const approvedAccess = await fetch(`${baseUrl}/api/founding-members/me?userId=${encodeURIComponent(probeSession.user.id)}`, {
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        const approvedJson = await approvedAccess.json().catch(() => ({}));
        record("artist dashboard access", approvedJson.access?.canAccessApp === true && approvedJson.access?.dashboardView === "Artist Dashboard", JSON.stringify(approvedJson.access || {}));

        const roleChange = await fetch(`${baseUrl}/api/producers`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${probeSession.access_token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "save-account-role",
                userId: probeSession.user.id,
                accountType: "producer",
            }),
        });
        record("unauthorized role-change blocked", roleChange.status === 403, String(roleChange.status));

        const songId = crypto.randomUUID();
        const storagePath = `${probeSession.user.id}/founding-probe-${Date.now()}.mp3`;
        await admin.storage.from("songs").upload(storagePath, Buffer.from("ID3\x03\x00\x00\x00\x00\x00\x00SMOKE"), {
            contentType: "audio/mpeg",
            upsert: true,
        });
        await admin.from("songs").insert({
            id: songId,
            title: `FOUNDING-PROBE-${Date.now()}`,
            artist: "Probe",
            description: "Probe",
            category: "New Releases",
            type: "Beats",
            audio_url: admin.storage.from("songs").getPublicUrl(storagePath).data.publicUrl,
            storage_path: storagePath,
            cover_url: "/music-data-base-logo.png",
            avatar_url: "/music-data-base-logo.png",
            duration: 60,
            plays: 0,
            likes: 0,
            user_id: probeSession.user.id,
        });
        const deleteOwn = await fetch(`${baseUrl}/api/songs/${songId}?userId=${encodeURIComponent(probeSession.user.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        record("upload ownership delete", deleteOwn.ok, String(deleteOwn.status));

        const otherSongId = crypto.randomUUID();
        await admin.from("songs").insert({
            id: otherSongId,
            title: `FOUNDING-OTHER-${Date.now()}`,
            artist: "Other",
            description: "Other",
            category: "New Releases",
            type: "Beats",
            audio_url: "/music-data-base-logo.png",
            storage_path: `${owner.user.id}/other.mp3`,
            cover_url: "/music-data-base-logo.png",
            avatar_url: "/music-data-base-logo.png",
            duration: 60,
            plays: 0,
            likes: 0,
            user_id: owner.user.id,
        });
        const deleteOther = await fetch(`${baseUrl}/api/songs/${otherSongId}?userId=${encodeURIComponent(probeSession.user.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        record("non-owner delete blocked", deleteOther.status === 403, String(deleteOther.status));
        await admin.from("songs").delete().eq("id", otherSongId);

        const producerInvite = await fetch(`${baseUrl}/api/launch/founding-invites`, {
            method: "POST",
            headers,
            body: JSON.stringify(authBody(owner.user.id, owner, { intendedRole: "founding_producer" })),
        });
        const producerInviteJson = await producerInvite.json().catch(() => ({}));
        const producerInviteCode = producerInviteJson.invite?.invite_code || "";
        record("producer invite creation", producerInvite.ok && producerInviteJson.invite?.intended_role === "founding_producer", producerInviteCode);

        if (producerInviteCode) {
            const producerEmail = `founding-producer-${Date.now()}@probe.local`;
            const producerPassword = `Probe_${Date.now()}_Bb2!`;
            await admin.auth.admin.createUser({ email: producerEmail, password: producerPassword, email_confirm: true });
            const producerLogin = await anon.auth.signInWithPassword({ email: producerEmail, password: producerPassword });
            const producerSession = producerLogin.data.session;
            record("producer probe session", Boolean(producerSession?.access_token));

            if (producerSession?.access_token) {
                const producerRedeem = await fetch(`${baseUrl}/api/founding-invites/redeem`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${producerSession.access_token}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(authBody(producerSession.user.id, producerSession, {
                        inviteCode: producerInviteCode,
                        displayName: "Founding Producer Probe",
                    })),
                });
                record("producer invite redeem", producerRedeem.ok, String(producerRedeem.status));

                const producerApprove = await fetch(`${baseUrl}/api/launch/founding-members`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(authBody(owner.user.id, owner, {
                        memberUserId: producerSession.user.id,
                        action: "approve",
                    })),
                });
                record("producer owner approval", producerApprove.ok, String(producerApprove.status));

                const producerAccess = await fetch(`${baseUrl}/api/founding-members/me?userId=${encodeURIComponent(producerSession.user.id)}`, {
                    headers: { Authorization: `Bearer ${producerSession.access_token}` },
                });
                const producerAccessJson = await producerAccess.json().catch(() => ({}));
                record(
                    "producer dashboard access",
                    producerAccessJson.access?.canAccessApp === true && producerAccessJson.access?.dashboardView === "Producer Dashboard",
                    JSON.stringify(producerAccessJson.access || {}),
                );
            }
        }
    }

    writeFileSync(path.join(evidenceDir, "founding-onboarding-evidence.json"), JSON.stringify({ results }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nFOUNDING_ONBOARDING_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
