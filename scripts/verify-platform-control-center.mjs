/**
 * Platform Control Center verification harness.
 * Usage: node scripts/verify-platform-control-center.mjs
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

async function main() {
    const env = readEnv();
    const baseUrl = env.VERIFY_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

    const owner = await ownerSession(env);
    record("owner session", Boolean(owner?.access_token), owner?.user.id || "");

    const ownerRes = await fetch(`${baseUrl}/api/launch/platform-control-center?userId=${encodeURIComponent(owner.user.id)}`, {
        headers: { Authorization: `Bearer ${owner.access_token}` },
    });
    const ownerJson = await ownerRes.json().catch(() => ({}));
    record("owner visibility test", ownerRes.ok && ownerJson.snapshot?.overview, String(ownerRes.status));
    record(
        "dashboard data query test",
        Boolean(ownerJson.snapshot?.health?.length) && Boolean(ownerJson.snapshot?.activity),
        JSON.stringify({
            health: ownerJson.snapshot?.health?.length || 0,
            signups: ownerJson.snapshot?.activity?.latestSignups?.length || 0,
        }),
    );

    const secretMatches = scanSecrets(ownerJson);
    record("secret exposure scan", secretMatches.length === 0, secretMatches.join(", ") || "clean");

    const loggedOut = await fetch(`${baseUrl}/api/launch/platform-control-center?userId=${encodeURIComponent(owner.user.id)}`);
    record("logged-out denial test", loggedOut.status === 401 || loggedOut.status === 403, String(loggedOut.status));

    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const probeEmail = `control-center-probe-${Date.now()}@probe.local`;
    const probePassword = `Probe_${Date.now()}_Cc1!`;
    await admin.auth.admin.createUser({ email: probeEmail, password: probePassword, email_confirm: true });
    const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const probeLogin = await anon.auth.signInWithPassword({ email: probeEmail, password: probePassword });
    const probeSession = probeLogin.data.session;
    if (probeSession?.access_token) {
        const denied = await fetch(`${baseUrl}/api/launch/platform-control-center?userId=${encodeURIComponent(probeSession.user.id)}`, {
            headers: { Authorization: `Bearer ${probeSession.access_token}` },
        });
        record("non-owner denial test", denied.status === 403, String(denied.status));
        await admin.auth.admin.deleteUser(probeSession.user.id).catch(() => undefined);
    }
    else {
        record("non-owner denial test", false, "probe session missing");
    }

    writeFileSync(path.join(evidenceDir, "platform-control-center-evidence.json"), JSON.stringify({ results, ownerResponseKeys: Object.keys(ownerJson) }, null, 2));
    const fails = results.filter((item) => !item.ok);
    console.log(`\nPLATFORM_CONTROL_CENTER_FAILS=${fails.length}`);
    process.exit(fails.length ? 1 : 0);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
