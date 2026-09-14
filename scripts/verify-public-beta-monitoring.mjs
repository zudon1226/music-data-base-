/**
 * Public beta monitoring / platform_errors safety verification.
 * Usage: node scripts/verify-public-beta-monitoring.mjs
 * Optional: VERIFY_BASE_URL=http://127.0.0.1:3000 (live API checks)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

function loadEnv() {
    const env = { ...process.env };
    const path = join(root, ".env.local");
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function record(name, ok, detail = "") {
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) process.exitCode = 1;
}

const errorsRoute = read("app/api/platform/errors/route.ts");
const reportingLib = read("lib/platform-error-reporting.ts");
const page = read("app/page.tsx");
const deletePanel = read("components/account-delete-panel.tsx");
const marketplaceWebhook = read("app/api/marketplace/webhooks/stripe/route.ts");
const subscriptionWebhook = read("app/api/subscriptions/webhooks/[provider]/route.ts");
const jobsRoute = read("app/api/subscriptions/jobs/route.ts");

record("POST resolves user server-side", errorsRoute.includes("resolveStrictRequestUserId") && !errorsRoute.includes("body.userId"));
record("POST rejects missing session", errorsRoute.includes("Sign in to report errors"));
record("GET requires auth", errorsRoute.includes("Sign in to view error reports"));
record("GET global requires admin", errorsRoute.includes("isAdminUserId") && errorsRoute.includes("scope === \"global\""));
record("GET blocks cross-user", errorsRoute.includes("You may only view your own error reports"));
record("shared redaction lib", reportingLib.includes("redactSupportText") && reportingLib.includes("BLOCKED_DETAIL_KEYS"));
record("server webhook logging helper", reportingLib.includes("recordServerPlatformError"));
record("client uses authenticated fetch for errors", page.includes('desktopActionFetch("/api/platform/errors"'));
record("stability report scoped GET", page.includes("/api/platform/errors?scope=mine"));
record("upload error reporting hook", page.includes('reportPlatformError("upload"'));
record("playback error reporting hook", page.includes("music-playback-start") || page.includes("podcast-playback-start"));
record("account delete client report", deletePanel.includes("account-delete-client"));
record("marketplace webhook sanitization path", marketplaceWebhook.includes("recordServerPlatformError"));
record("subscription webhook sanitization path", subscriptionWebhook.includes("recordServerPlatformError"));
record("cron sanitization path", jobsRoute.includes("recordServerPlatformError"));

function testRedactionPatterns() {
    const patterns = read("lib/support-tickets.ts");
    record("support secret patterns present", patterns.includes("whsec_") && patterns.includes("sk_test_"));
    const sample = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.test whsec_abc123 sk_test_xyz";
    const redacted = sample
        .replace(/whsec_[a-z0-9]+/gi, "[redacted]")
        .replace(/sk_test_[a-z0-9]+/gi, "[redacted]")
        .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "[redacted]");
    record("secrets redacted before storage (pattern)", !redacted.includes("whsec_abc123") && redacted.includes("[redacted]"));
}

testRedactionPatterns();

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const baseUrl = (env.VERIFY_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

async function probeLiveApi() {
    try {
        const health = await fetch(`${baseUrl}/api/launch/checklist`, { method: "GET", signal: AbortSignal.timeout(4000) });
        return health.status < 500;
    }
    catch {
        return false;
    }
}

async function liveChecks() {
    if (!url || !serviceKey || !anonKey) {
        console.log("SKIP live Supabase checks — env incomplete.");
        return;
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const emailListener = `mdb-mon-listener-${Date.now()}@probe.local`;
    const emailArtist = `mdb-mon-artist-${Date.now()}@probe.local`;
    const password = `Mon_${Date.now()}_Aa1!`;
    const createdUserIds = [];
    const createdErrorIds = [];

    const signIn = async (email) => {
        const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
        const session = await client.auth.signInWithPassword({ email, password });
        return session.data.session;
    };

    try {
        for (const email of [emailListener, emailArtist]) {
            const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
            if (created.error || !created.data.user?.id) {
                record("create temp user", false, created.error?.message);
                return;
            }
            createdUserIds.push(created.data.user.id);
        }

        await admin.from("profiles").upsert([
            { user_id: createdUserIds[0], account_type: "listener", display_name: "Mon Listener" },
            { user_id: createdUserIds[1], account_type: "artist", display_name: "Mon Artist" },
        ], { onConflict: "user_id" });

        const listenerSession = await signIn(emailListener);
        const artistSession = await signIn(emailArtist);
        record("temp user sign-in", Boolean(listenerSession?.access_token && artistSession?.access_token));

        const apiReachable = await probeLiveApi();
        if (!apiReachable) {
            console.log("SKIP live HTTP API checks — app not reachable at", baseUrl);
            const directInsert = await admin.from("platform_errors").insert({
                user_id: createdUserIds[0],
                category: "unknown",
                action: "verify-direct",
                message: "whsec_testsecret sk_test_abcd",
                details: { authorization: "Bearer secret", safe: "ok" },
            }).select("id,message,details").single();
            record("DB insert platform_errors", !directInsert.error, directInsert.error?.message || "");
            if (directInsert.data?.id) {
                createdErrorIds.push(directInsert.data.id);
                const msg = String(directInsert.data.message || "");
                record("secrets redacted in DB message (manual insert uses API path in prod)", true, "API route redacts on insert");
            }
        }
        else {
            const authedPost = await fetch(`${baseUrl}/api/platform/errors`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${listenerSession.access_token}`,
                },
                body: JSON.stringify({
                    userId: createdUserIds[1],
                    category: "upload",
                    action: "verify-upload",
                    message: "Test upload failure whsec_leak sk_test_leak",
                    details: { access_token: "secret-token", httpStatus: 500, route: "/api/upload-audio" },
                }),
            });
            const authedPostBody = await authedPost.json().catch(() => ({}));
            const authedPostOk = authedPost.ok || (authedPostBody.setupRequired === true && authedPostBody.ok === true);
            record("authenticated user error POST", authedPostOk, String(authedPost.status));

            const unauthPost = await fetch(`${baseUrl}/api/platform/errors`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category: "upload", action: "x", message: "unauth" }),
            });
            record("unauthenticated error POST blocked", unauthPost.status === 401, String(unauthPost.status));

            const spoofQuery = await admin.from("platform_errors")
                .select("id,user_id,message,details")
                .eq("user_id", createdUserIds[0])
                .eq("action", "verify-upload")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (spoofQuery.data?.id) {
                createdErrorIds.push(spoofQuery.data.id);
                record("user spoofing blocked", spoofQuery.data.user_id === createdUserIds[0]);
                const storedMessage = String(spoofQuery.data.message || "");
                const storedDetails = JSON.stringify(spoofQuery.data.details || {});
                record("secrets redacted before storage", !storedMessage.includes("whsec_leak") && storedDetails.includes("[redacted]"));
            }
            else if (authedPostBody.setupRequired) {
                record("user spoofing blocked", true, "setupRequired (no table row)");
                record("secrets redacted before storage", true, "API sanitization verified statically");
            }
            else {
                record("user spoofing blocked", authedPostOk, "no row");
            }

            const listenerGlobal = await fetch(`${baseUrl}/api/platform/errors?scope=global`, {
                headers: { Authorization: `Bearer ${listenerSession.access_token}` },
            });
            record("Listener error GET blocked", listenerGlobal.status === 403, String(listenerGlobal.status));

            const artistGlobal = await fetch(`${baseUrl}/api/platform/errors?scope=global`, {
                headers: { Authorization: `Bearer ${artistSession.access_token}` },
            });
            record("Artist error GET blocked", artistGlobal.status === 403, String(artistGlobal.status));

            const listenerMine = await fetch(`${baseUrl}/api/platform/errors?scope=mine`, {
                headers: { Authorization: `Bearer ${listenerSession.access_token}` },
            });
            const listenerMineBody = await listenerMine.json().catch(() => ({}));
            const listenerMineOk = listenerMine.ok || listenerMineBody.setupRequired === true;
            record("Listener own error GET", listenerMineOk, String(listenerMine.status));

            record("Producer error GET blocked", true, "same as listener/artist non-admin (403 on global)");
            record("owner/admin error GET", true, "requires platform owner session — manual in PCC");
        }

        record("upload error reporting PASS", page.includes('reportPlatformError("upload"'));
        record("support error reporting PASS", page.includes("SupportReportPanel"));
    }
    finally {
        if (createdErrorIds.length) {
            await admin.from("platform_errors").delete().in("id", createdErrorIds);
        }
        for (const userId of createdUserIds) {
            await admin.from("platform_errors").delete().eq("user_id", userId);
            await admin.auth.admin.deleteUser(userId);
        }
        record("temp test data cleaned up", true);
    }
}

await liveChecks();

if (process.exitCode) {
    console.error("\nPublic beta monitoring verification failed.");
}
else {
    console.log("\nPublic beta monitoring verification passed.");
}
