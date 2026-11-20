/**
 * Staging HTTP checks: playback signed URLs require auth; discovery stays public.
 * No secrets logged.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

loadMixtapeStagingE2eCredentialsFromFile();
const BASE = (process.env.MDB_MIXTAPE_E2E_BASE_URL || "http://localhost:3003").replace(/\/$/, "");
const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PRESERVED_MIXTAPE_ID = "6666f776-dafa-4551-ba36-dd302962844a";
const evidenceDir = join(root, "tmp-mixtape-approved-e2e", "playback-auth");
mkdirSync(evidenceDir, { recursive: true });

const results = [];

function record(step, status, detail = "") {
    results.push({ step, status, detail });
    console.log(`${status.toUpperCase()} ${step}${detail ? ` — ${detail}` : ""}`);
}

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

function refFromUrl(url) {
    const m = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return m ? m[1].toLowerCase() : "";
}

async function postPlayback(body, headers = {}) {
    const res = await fetch(`${BASE}/api/mixtapes/playback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json, hasSignedUrl: Boolean(json.signedUrl) };
}

async function main() {
    const staging = parseEnvFile(join(root, ".env.staging.local"));
    const E2E_EMAIL = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
    const E2E_PASSWORD = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
    let TRACK_ID = process.env.MDB_ENGAGEMENT_TRACK_ID || "";

    const supabaseUrl = staging.NEXT_PUBLIC_SUPABASE_URL || "";
    const ref = refFromUrl(supabaseUrl);
    record("staging ref", ref === STAGING_REF ? "pass" : "fail", `ref=${ref || "missing"}`);
    record("production ref avoided", ref !== PRODUCTION_REF ? "pass" : "fail");

    const detailRes = await fetch(`${BASE}/api/mixtapes/${PRESERVED_MIXTAPE_ID}`);
    const detail = await detailRes.json().catch(() => ({}));
    if (!TRACK_ID && detail.tracks?.[0]?.id) TRACK_ID = detail.tracks[0].id;

    const guestSigned = await postPlayback({ trackId: TRACK_ID });
    record(
        "anonymous signed-url denied",
        guestSigned.status === 401 && !guestSigned.hasSignedUrl ? "pass" : "fail",
        `status=${guestSigned.status} signedUrl=${guestSigned.hasSignedUrl}`,
    );

    const guestSession = await postPlayback({ trackId: TRACK_ID, action: "begin-session" });
    record("anonymous begin-session denied", guestSession.status === 401 ? "pass" : "fail", `status=${guestSession.status}`);

    const publicList = await fetch(`${BASE}/api/mixtapes?scope=public&limit=3`);
    record("guest public catalog", publicList.ok ? "pass" : "fail", `status=${publicList.status}`);
    record("guest public detail", detailRes.ok ? "pass" : "fail", `status=${detailRes.status}`);

    if (!E2E_EMAIL || !E2E_PASSWORD || !staging.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        record("authenticated signed-url", "blocked", "staging creds missing");
        writeFileSync(join(evidenceDir, "report.json"), JSON.stringify({ results }, null, 2));
        process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
    }

    const supabase = createClient(supabaseUrl, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const signIn = await supabase.auth.signInWithPassword({ email: E2E_EMAIL, password: E2E_PASSWORD });
    if (signIn.error || !signIn.data.session) {
        record("authenticated signed-url", "blocked", "sign-in failed");
        writeFileSync(join(evidenceDir, "report.json"), JSON.stringify({ results }, null, 2));
        process.exit(1);
    }
    const userId = signIn.data.user.id;
    const accessToken = signIn.data.session.access_token;
    record("auth identity", "pass", `email_hash=${createHash("sha256").update(E2E_EMAIL).digest("hex").slice(0, 12)}`);

    const authedSigned = await postPlayback(
        { trackId: TRACK_ID, userId },
        { Authorization: `Bearer ${accessToken}` },
    );
    record(
        "authenticated signed-url allowed",
        authedSigned.status === 200 && authedSigned.hasSignedUrl ? "pass" : "fail",
        `status=${authedSigned.status}`,
    );

    const bogus = await postPlayback(
        { trackId: "00000000-0000-4000-8000-000000000099", userId },
        { Authorization: `Bearer ${accessToken}` },
    );
    record("unknown track denied", bogus.status === 404 || bogus.status === 400 ? "pass" : "fail", `status=${bogus.status}`);

    writeFileSync(join(evidenceDir, "report.json"), JSON.stringify({ results, trackId: TRACK_ID, generatedAt: new Date().toISOString() }, null, 2));
    const fail = results.some((r) => r.status === "fail");
    process.exit(fail ? 1 : 0);
}

main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
});