/**
 * Phase 29F Preview — ringtone studio play URL, draft save, submit guards, beta locks.
 * Env: PHASE29F_PREVIEW_BASE_URL, .env.staging.local, optional staging-artist-credentials.env
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./lib/load-mixtape-staging-e2e-credentials.mjs";
import { vercelPreviewRequest } from "./lib/vercel-preview-http.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STAGING_REF = "jzlegcbotqfzevtczwhx";
const PREVIEW_BASE = String(process.env.PHASE29F_PREVIEW_BASE_URL || process.env.PREVIEW_BASE_URL || "").replace(/\/$/, "");

const results = [];
function record(id, status, detail = "") {
    results.push({ id, status, detail });
    console.log(`${status} [${id}]${detail ? ` — ${detail}` : ""}`);
}

function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
}

async function signIn(supabaseUrl, anonKey, email, password) {
    const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session?.access_token) return { ok: false, error: error?.message || "sign-in failed" };
    return { ok: true, accessToken: data.session.access_token, userId: data.user?.id || "" };
}

function authHeaders(session) {
    return { Authorization: `Bearer ${session.accessToken}` };
}

loadMixtapeStagingE2eCredentialsFromFile();
const stagingEnv = parseEnvFile(join(root, ".env.staging.local"));
const supabaseUrl = stagingEnv.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = stagingEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey = stagingEnv.SUPABASE_SERVICE_ROLE_KEY || "";
const artistEmail = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
const artistPassword = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();

if (!PREVIEW_BASE) {
    record("preflight", "FAIL", "PHASE29F_PREVIEW_BASE_URL required");
    process.exit(1);
}
if (!supabaseUrl.includes(STAGING_REF) || !serviceKey || !anonKey) {
    record("staging-env", "FAIL", "staging .env.staging.local missing");
    process.exit(1);
}

const market = vercelPreviewRequest(PREVIEW_BASE, "/api/ringtones/marketplace?limit=1");
if (!market.ok || market.status !== 200) {
    record("marketplace-http", "FAIL", `status=${market.status}`);
} else {
    const body = market.body || {};
    if (body.publicBetaPaidPurchaseLocked === true && body.paidCheckoutAvailable === false) {
        record("beta-payment-locks", "PASS", "ringtone checkout locked");
    } else {
        record("beta-payment-locks", "FAIL", "marketplace lock flags changed");
    }
}

if (!artistEmail || !artistPassword) {
    record("artist-session", "BLOCKED", "staging artist credentials missing");
    console.log("\nSummary:", results.map((r) => `${r.status} ${r.id}`).join("; "));
    process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}

const login = await signIn(supabaseUrl, anonKey, artistEmail, artistPassword);
if (!login.ok) {
    record("artist-session", "FAIL", "sign-in failed");
    process.exit(1);
}
record("artist-session", "PASS", `user_prefix=${login.userId.slice(0, 8)}…`);

const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const { data: sourceSong } = await admin
    .from("songs")
    .select("id,duration,ringtone_sale_enabled,storage_path")
    .eq("user_id", login.userId)
    .eq("ringtone_enabled", true)
    .eq("ringtone_creation_enabled", true)
    .not("duration", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

if (!sourceSong?.id) {
    record("source-song", "BLOCKED", "no ringtone-eligible owned song");
    process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
}
record("source-song", "PASS", `id_prefix=${sourceSong.id.slice(0, 8)}… sale=${sourceSong.ringtone_sale_enabled === true}`);

const playUrl = vercelPreviewRequest(PREVIEW_BASE, "/api/ringtones/source-songs/play-url", {
    method: "POST",
    headers: authHeaders(login),
    body: { userId: login.userId, songId: sourceSong.id },
});
const playBody = playUrl.body || {};
if (typeof playBody.signedUrl === "string" && playBody.signedUrl.startsWith("http")) {
    record("studio-play-url", "PASS", "signedUrl returned");
    const head = await fetch(playBody.signedUrl, { method: "HEAD" }).catch(() => null);
    if (head?.ok) record("signed-audio-head", "PASS", `status=${head.status}`);
    else record("signed-audio-head", "FAIL", `status=${head?.status || "no response"}`);
} else {
    record("studio-play-url", "FAIL", `status=${playUrl.status} code=${playBody.code || ""}`);
}

const durationSec = Number(sourceSong.duration) || 180;
const draftPayload = {
    userId: login.userId,
    sourceKind: "owned_song",
    sourceSongId: sourceSong.id,
    ownershipConfirmed: true,
    clipStartSeconds: 0,
    durationSeconds: 30,
    sourceDurationSeconds: durationSec,
    title: `Phase29F pricing probe ${Date.now()}`,
    priceCents: 99,
    currency: "USD",
    iphoneAvailable: true,
    androidAvailable: true,
};

const draft = vercelPreviewRequest(PREVIEW_BASE, "/api/ringtones", {
    method: "POST",
    headers: authHeaders(login),
    body: draftPayload,
});
const draftBody = draft.body || {};
const draftRingtone = draftBody.ringtone;
if (draftRingtone?.id && (draft.status === 201 || draftBody.ringtone?.id)) {
    const savedCents = Number(draftRingtone.price_cents);
    if (sourceSong.ringtone_sale_enabled === true) {
        record("save-draft-price", savedCents === 99 ? "PASS" : "FAIL", `price_cents=${savedCents}`);
    } else if (savedCents === 0) {
        record("save-draft-price", "PASS", "unauthorized resale clamped to 0");
    } else {
        record("save-draft-price", "FAIL", `expected 0 got ${savedCents}`);
    }
    record("save-draft", "PASS", `ringtone_prefix=${String(draftRingtone.id).slice(0, 8)}…`);
} else {
    record("save-draft", "FAIL", `status=${draft.status}`);
}

const submitAttempt = vercelPreviewRequest(PREVIEW_BASE, "/api/ringtones", {
    method: "POST",
    headers: authHeaders(login),
    body: { ...draftPayload, title: `Phase29F submit probe ${Date.now()}`, submitForReview: true },
});
const submitBody = submitAttempt.body || {};
if (sourceSong.ringtone_sale_enabled !== true) {
    if (submitBody.code === "RINGTONE_SALE_NOT_AUTHORIZED") {
        record("unauthorized-paid-submit", "PASS", "403 RINGTONE_SALE_NOT_AUTHORIZED");
    } else {
        record("unauthorized-paid-submit", "FAIL", `status=${submitAttempt.status} code=${submitBody.code || ""}`);
    }
} else {
    record("unauthorized-paid-submit", "PASS", "skipped (sale enabled on source)");
}

if (draftRingtone?.id && sourceSong.ringtone_sale_enabled !== true) {
    const processRes = vercelPreviewRequest(PREVIEW_BASE, `/api/ringtones/${draftRingtone.id}/process`, {
        method: "POST",
        headers: authHeaders(login),
        body: { userId: login.userId, priceCents: 99 },
    });
    const processBody = processRes.body || {};
    if (processBody.code === "RINGTONE_SALE_NOT_AUTHORIZED" || /not authorized for ringtone sale/i.test(String(processBody.error || ""))) {
        record("process-paid-without-sale", "PASS", "blocked at process");
    } else if (processRes.status === 403 || processBody.error) {
        record("process-paid-without-sale", "PASS", `code=${processBody.code || "error"}`);
    } else {
        record("process-paid-without-sale", "FAIL", `status=${processRes.status}`);
    }

    await admin.from("ringtone_products").delete().eq("id", draftRingtone.id);
    record("cleanup-draft", "PASS", "test ringtone removed");
}

if (sourceSong.ringtone_sale_enabled === true && draftRingtone?.id) {
    const processOk = vercelPreviewRequest(PREVIEW_BASE, `/api/ringtones/${draftRingtone.id}/process`, {
        method: "POST",
        headers: authHeaders(login),
        body: { userId: login.userId },
    });
    record(
        "authorized-submit-process",
        processOk.status === 200 || processOk.status === 202 ? "PASS" : "FAIL",
        `status=${processOk.status}`,
    );
    await admin.from("ringtone_products").delete().eq("id", draftRingtone.id);
}

const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks ok (${results.filter((r) => r.status === "BLOCKED").length} blocked)`);
process.exit(failed ? 1 : 0);