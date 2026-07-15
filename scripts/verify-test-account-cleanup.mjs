/**
 * Test Account Cleanup Center verification harness.
 * Usage: node scripts/verify-test-account-cleanup.mjs
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
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
        const sql = readFileSync(path.join(root, "supabase/migrations/202607150004_test_account_cleanup.sql"), "utf8");
        await client.query(sql);
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

function scanSecrets(payload) {
    const text = JSON.stringify(payload);
    const patterns = [
        /SUPABASE_SERVICE_ROLE_KEY/i,
        /DATABASE_URL/i,
        /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
        /password/i,
        /secret/i,
        /apikey/i,
    ];
    return patterns.filter((pattern) => pattern.test(text)).map((pattern) => String(pattern));
}

async function createDisposableUser(admin, prefix) {
    const email = `${prefix}-${Date.now()}@probe.local`;
    const password = `Probe_${Date.now()}_Tc1!`;
    const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: "Browser Probe" },
    });
    return {
        email,
        userId: created.data.user?.id || "",
        password,
    };
}

async function userExists(admin, userId) {
    const result = await admin.auth.admin.getUserById(userId);
    return Boolean(result.data.user?.id);
}

async function main() {
    const env = readEnv();
    const baseUrl = env.VERIFY_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    if (env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL) {
        try {
            const applied = await applyMigration(env);
            record("migration apply", applied, "test account cleanup migration");
        }
        catch (error) {
            record("migration apply", false, error instanceof Error ? error.message : String(error));
        }
    }
    else {
        record("migration apply", false, "DATABASE_URL missing — apply migration manually");
    }

    const owner = await ownerSession(env);
    record("owner session", Boolean(owner?.access_token), owner?.user.id || "");

    const ownerList = await fetch(`${baseUrl}/api/launch/test-account-cleanup?userId=${encodeURIComponent(owner.user.id)}`, {
        headers: { Authorization: `Bearer ${owner.access_token}` },
    });
    const ownerListJson = await ownerList.json().catch(() => ({}));
    record("owner visibility test", ownerList.ok && Array.isArray(ownerListJson.review?.accounts), String(ownerList.status));

    const watchlistMatch = (ownerListJson.review?.accounts || []).find((row) => row.email === "xegoxal867@dysonc.com");
    record("watchlist account review support", Boolean(watchlistMatch), watchlistMatch ? JSON.stringify({
        uploads: watchlistMatch.uploadsCount,
        playlists: watchlistMatch.playlistsCount,
        protected: watchlistMatch.protectedStatus,
    }) : "not currently present in auth user list");

    const secretMatches = scanSecrets(ownerListJson);
    record("secret exposure scan", secretMatches.length === 0, secretMatches.join(", ") || "clean");

    const loggedOut = await fetch(`${baseUrl}/api/launch/test-account-cleanup?userId=${encodeURIComponent(owner.user.id)}`);
    record("logged-out denial test", loggedOut.status === 401 || loggedOut.status === 403, String(loggedOut.status));

    const probe = await createDisposableUser(admin, "cleanup-probe");
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const probeLogin = await anon.auth.signInWithPassword({ email: probe.email, password: probe.password });
    const probeSession = probeLogin.data.session;
    if (probeSession?.access_token) {
        const denied = await fetch(`${baseUrl}/api/launch/test-account-cleanup?userId=${encodeURIComponent(probeSession.user.id)}`, {
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        record("non-owner denial test", denied.status === 403, String(denied.status));
    }
    else {
        record("non-owner denial test", false, "probe session missing");
    }

    const ownerDeleteAttempt = await fetch(`${baseUrl}/api/launch/test-account-cleanup`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${owner.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(authBody(owner.user.id, owner, {
            action: "delete",
            targetUserId: owner.user.id,
            confirmed: true,
            confirmText: "DELETE",
        })),
    });
    const ownerDeleteJson = await ownerDeleteAttempt.json().catch(() => ({}));
    record("protected-owner deletion denial test", ownerDeleteAttempt.status === 409 && ownerDeleteJson.result?.ok === false, String(ownerDeleteAttempt.status));

    const disposable = await createDisposableUser(admin, "cleanup-dryrun");
    const beforeDryRunExists = await userExists(admin, disposable.userId);
    const dryRun = await fetch(`${baseUrl}/api/launch/test-account-cleanup`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${owner.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(authBody(owner.user.id, owner, {
            action: "dry-run",
            targetUserId: disposable.userId,
        })),
    });
    const dryRunJson = await dryRun.json().catch(() => ({}));
    const afterDryRunExists = await userExists(admin, disposable.userId);
    record("dry-run no-mutation test", dryRun.ok && beforeDryRunExists && afterDryRunExists, JSON.stringify({
        safeToDelete: dryRunJson.result?.preview?.safeToDelete,
        stillExists: afterDryRunExists,
    }));

    const confirmed = await createDisposableUser(admin, "cleanup-confirmed");
    await fetch(`${baseUrl}/api/launch/test-account-cleanup`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${owner.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(authBody(owner.user.id, owner, {
            action: "set-label",
            targetUserId: confirmed.userId,
            label: "confirmed_test_account",
        })),
    });
    const confirmedPreview = await fetch(`${baseUrl}/api/launch/test-account-cleanup`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${owner.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(authBody(owner.user.id, owner, {
            action: "dry-run",
            targetUserId: confirmed.userId,
        })),
    });
    const confirmedPreviewJson = await confirmedPreview.json().catch(() => ({}));
    record(
        "confirmed-test-account dependency preview test",
        confirmedPreview.ok
            && confirmedPreviewJson.result?.preview?.authUser?.id === confirmed.userId
            && confirmedPreviewJson.result?.preview?.safeToDelete === true,
        JSON.stringify({
            playlists: confirmedPreviewJson.result?.preview?.playlists,
            uploads: confirmedPreviewJson.result?.preview?.songsOwned + confirmedPreviewJson.result?.preview?.videosOwned,
        }),
    );

    const blocked = await createDisposableUser(admin, "cleanup-blocked");
    await admin.from("songs").insert({
        title: "Cleanup Block Probe",
        artist: "Probe",
        audio_url: "https://example.com/probe.mp3",
        user_id: blocked.userId,
    });
    const blockedDelete = await fetch(`${baseUrl}/api/launch/test-account-cleanup`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${owner.access_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(authBody(owner.user.id, owner, {
            action: "delete",
            targetUserId: blocked.userId,
            confirmed: true,
            confirmText: "DELETE",
        })),
    });
    const blockedDeleteJson = await blockedDelete.json().catch(() => ({}));
    const blockedStillExists = await userExists(admin, blocked.userId);
    record(
        "user-with-real-data deletion block test",
        blockedDelete.status === 409
            && blockedDeleteJson.result?.ok === false
            && blockedStillExists
            && (blockedDeleteJson.result?.preview?.blockReasons || []).some((reason) => /upload/i.test(reason)),
        String(blockedDelete.status),
    );

    await admin.from("songs").delete().eq("user_id", blocked.userId);
    await admin.auth.admin.deleteUser(blocked.userId).catch(() => undefined);
    await admin.auth.admin.deleteUser(confirmed.userId).catch(() => undefined);
    await admin.auth.admin.deleteUser(disposable.userId).catch(() => undefined);
    if (probe.userId) await admin.auth.admin.deleteUser(probe.userId).catch(() => undefined);

    writeFileSync(path.join(evidenceDir, "test-account-cleanup-evidence.json"), JSON.stringify({
        results,
        dryRunPreview: dryRunJson.result?.preview || null,
        confirmedPreview: confirmedPreviewJson.result?.preview || null,
        blockedPreview: blockedDeleteJson.result?.preview || null,
    }, null, 2));

    const fails = results.filter((item) => !item.ok);
    console.log(`\nTEST_ACCOUNT_CLEANUP_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
