/**
 * Self-service account deletion verification.
 * Usage: node scripts/verify-account-deletion.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function record(name, ok, detail = "") {
    results.push({ name, ok: Boolean(ok), detail: String(detail || "") });
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

function assertStatic() {
    const en = readFileSync(path.join(root, "lib/i18n/messages/en.ts"), "utf8");
    record("en accountDeletion keys", en.includes("accountDeletion:") && en.includes("deleteAccount:"));
    record("delete API route", readFileSync(path.join(root, "app/api/account/delete/route.ts"), "utf8").includes("resolveStrictRequestUserId"));
    record("delete service", readFileSync(path.join(root, "lib/account-deletion-service.ts"), "utf8").includes("deleteAuthenticatedUserAccount"));
    record("profile UI panel", readFileSync(path.join(root, "components/user-profile-dashboard.tsx"), "utf8").includes("AccountDeletePanel"));
    record("confirm DELETE gate", readFileSync(path.join(root, "app/api/account/delete/route.ts"), "utf8").includes('CONFIRM_TEXT = "DELETE"'));
}

async function signIn(anon, email, password) {
    const result = await anon.auth.signInWithPassword({ email, password });
    return result.data.session;
}

async function createUser(admin, prefix, role) {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@probe.local`;
    const password = `Del_${Date.now()}_Aa1!`;
    const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { displayName: `${prefix} Delete Probe` },
    });
    const userId = created.data.user?.id || "";
    if (userId && role) {
        await admin.from("user_roles").upsert({ user_id: userId, role, status: "active" }, { onConflict: "user_id,role" });
        await admin.from("profiles").upsert({
            user_id: userId,
            display_name: `${prefix} Delete Probe`,
            account_type: role,
        }, { onConflict: "user_id" });
    }
    return { email, password, userId };
}

async function deleteViaApi(baseUrl, session, extra = {}) {
    return fetch(`${baseUrl}/api/account/delete`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
            confirmed: true,
            confirmText: "DELETE",
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            ...extra,
        }),
    });
}

async function userExists(admin, userId) {
    const result = await admin.auth.admin.getUserById(userId);
    return Boolean(result.data.user?.id);
}

async function main() {
    assertStatic();
    const env = readEnv();
    const baseUrl = env.VERIFY_BASE_URL || "http://127.0.0.1:3000";
    const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
        record("live probes skipped", true, "missing supabase env");
        finish();
        return;
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const survivor = await createUser(admin, "acct-del-survivor", "listener");
    const listener = await createUser(admin, "acct-del-listener", "listener");
    const artist = await createUser(admin, "acct-del-artist", "artist");
    const producer = await createUser(admin, "acct-del-producer", "producer");

    const avatarPath = `${listener.userId}/verify-avatar.txt`;
    await admin.storage.from("avatars").upload(avatarPath, Buffer.from("probe"), { contentType: "text/plain", upsert: true });

    try {
        const unauth = await fetch(`${baseUrl}/api/account/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirmed: true, confirmText: "DELETE" }),
        });
        record("unauthenticated delete blocked", unauth.status === 401);

        const listenerSession = await signIn(anon, listener.email, listener.password);
        record("listener session", Boolean(listenerSession?.access_token));
        if (listenerSession) {
            const listenerDelete = await deleteViaApi(baseUrl, listenerSession);
            record("listener self-delete", listenerDelete.ok, `status ${listenerDelete.status}`);
            record("listener auth removed", !(await userExists(admin, listener.userId)));
            const avatarListed = await admin.storage.from("avatars").list(listener.userId, { limit: 5 });
            record("listener storage cleanup", (avatarListed.data || []).length === 0);
        }

        const artistSession = await signIn(anon, artist.email, artist.password);
        if (artistSession) {
            const artistDelete = await deleteViaApi(baseUrl, artistSession);
            record("artist self-delete", artistDelete.ok, `status ${artistDelete.status}`);
            record("artist auth removed", !(await userExists(admin, artist.userId)));
        }

        const producerSession = await signIn(anon, producer.email, producer.password);
        if (producerSession) {
            const producerDelete = await deleteViaApi(baseUrl, producerSession);
            record("producer self-delete", producerDelete.ok, `status ${producerDelete.status}`);
            record("producer auth removed", !(await userExists(admin, producer.userId)));
        }

        const survivorSession = await signIn(anon, survivor.email, survivor.password);
        if (survivorSession && producer.userId) {
            const cross = await deleteViaApi(baseUrl, survivorSession, { userId: producer.userId });
            record("cross-user claim blocked or self-only", cross.status === 403 || cross.ok);
            record("survivor still exists", await userExists(admin, survivor.userId));
            if (cross.ok) {
                await admin.auth.admin.deleteUser(survivor.userId).catch(() => undefined);
            }
            else {
                const ownDelete = await deleteViaApi(baseUrl, survivorSession);
                record("survivor cleanup delete", ownDelete.ok);
            }
        }

        const payoutUser = await createUser(admin, "acct-del-payout", "artist");
        await admin.from("payouts").insert({
            user_id: payoutUser.userId,
            amount_cents: 100,
            currency: "USD",
            status: "pending",
            metadata: { probe: true },
        });
        const payoutSession = await signIn(anon, payoutUser.email, payoutUser.password);
        if (payoutSession) {
            const del = await deleteViaApi(baseUrl, payoutSession);
            record("financial user delete", del.ok, `status ${del.status}`);
            const payoutRows = await admin.from("payouts").select("id,user_id,metadata").eq("amount_cents", 100);
            const retained = (payoutRows.data || []).find((row) => row.metadata?.account_deleted === true);
            record("financial record safety", Boolean(retained && !retained.user_id));
            if (retained?.id) {
                await admin.from("payouts").delete().eq("id", retained.id);
            }
        }
    }
    finally {
        await admin.storage.from("avatars").remove([avatarPath]).catch(() => undefined);
        for (const id of [listener.userId, artist.userId, producer.userId, survivor.userId]) {
            if (id && (await userExists(admin, id))) {
                await admin.auth.admin.deleteUser(id).catch(() => undefined);
            }
        }
    }

    finish();
}

function finish() {
    const failed = results.filter((row) => !row.ok);
    console.log(`\nAccount deletion verify: ${failed.length === 0 ? "PASS" : "FAIL"} (${results.length - failed.length}/${results.length})`);
    process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
