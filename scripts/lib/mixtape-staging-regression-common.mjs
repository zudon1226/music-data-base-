/**
 * Shared staging regression helpers (no secret values logged).
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMixtapeStagingE2eCredentialsFromFile } from "./load-mixtape-staging-e2e-credentials.mjs";

export const STAGING_REF = "jzlegcbotqfzevtczwhx";
export const PRODUCTION_REF = "aehuszoadgqtbkxsliyy";
export const PRESERVED_MIXTAPE_ID = "6666f776-dafa-4551-ba36-dd302962844a";
export const OWNER_EMAIL = "zudon1226@gmail.com";
export const MIXTAPE_COVER_MAX_BYTES = 20 * 1024 * 1024;
export const MIXTAPE_AUDIO_MAX_BYTES = 104857600;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function repoPath(...parts) {
    return join(repoRoot, ...parts);
}

export function parseEnvFile(path) {
    const env = {};
    if (!existsSync(path)) return env;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
    return env;
}

export function stagingRefFromUrl(url) {
    const match = String(url || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
    return match ? match[1].toLowerCase() : "";
}

export function assertStagingOnly(stagingEnv) {
    const ref = stagingRefFromUrl(stagingEnv.NEXT_PUBLIC_SUPABASE_URL);
    if (ref !== STAGING_REF || ref === PRODUCTION_REF) {
        throw new Error(`Staging ref guard failed (ref=${ref || "missing"})`);
    }
    return ref;
}

export function makeRunToken() {
    return randomBytes(4).toString("hex");
}

export function emailHash(email) {
    return createHash("sha256").update(email).digest("hex").slice(0, 12);
}

export function writeEvidence(evidenceDir, name, payload) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(join(evidenceDir, name), JSON.stringify(payload, null, 2));
}

export function makeCoverPngA() {
    return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
    );
}

export function makeCoverPngB() {
    return Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
    );
}

export function makeMinimalMp3Base64() {
    return Buffer.from(
        "//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA"
        + "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "base64",
    );
}

export async function creatorSession(staging) {
    loadMixtapeStagingE2eCredentialsFromFile();
    const email = String(process.env.MDB_MIXTAPE_E2E_EMAIL || "").trim();
    const password = String(process.env.MDB_MIXTAPE_E2E_PASSWORD || "").trim();
    if (!email || !password || !staging.NEXT_PUBLIC_SUPABASE_URL || !staging.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return null;
    }
    const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await anon.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) return null;
    return login.data.session;
}

export async function platformOwnerSession(staging) {
    if (!staging.SUPABASE_SERVICE_ROLE_KEY) return null;
    const anon = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
    if (link.error || !link.data?.properties?.hashed_token) return null;
    const verified = await anon.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "magiclink",
    });
    return verified.data.session || null;
}

export function authHeaders(session) {
    return {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
    };
}

export async function apiPost(baseUrl, path, body, session) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: session ? authHeaders(session) : { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
}

export async function apiPatch(baseUrl, path, body, session) {
    const response = await fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: authHeaders(session),
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
}

export async function apiGet(baseUrl, path, session) {
    const response = await fetch(`${baseUrl}${path}`, {
        cache: "no-store",
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const json = await response.json().catch(() => ({}));
    return { status: response.status, json };
}

export async function createDisposableMixtape(baseUrl, session, title) {
    const userId = session.user.id;
    const { status, json } = await apiPost(
        baseUrl,
        "/api/mixtapes",
        { userId, title, description: title, genre: "Regression", status: "draft" },
        session,
    );
    const id = String(json.mixtape?.id || "").trim();
    return { status, id, mixtape: json.mixtape };
}

export async function archiveMixtape(baseUrl, session, mixtapeId) {
    return apiPatch(
        baseUrl,
        `/api/mixtapes/${encodeURIComponent(mixtapeId)}`,
        { userId: session.user.id, status: "archived" },
        session,
    );
}

export async function findForeignMixtapeId(staging, creatorUserId) {
    if (!staging.SUPABASE_SERVICE_ROLE_KEY) return "";
    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await admin
        .from("mixtapes")
        .select("id,user_id")
        .neq("user_id", creatorUserId)
        .neq("id", PRESERVED_MIXTAPE_ID)
        .neq("status", "archived")
        .limit(1)
        .maybeSingle();
    return data?.id ? String(data.id) : "";
}

export async function storageObjectExists(staging, path) {
    if (!staging.SUPABASE_SERVICE_ROLE_KEY || !path) return false;
    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const folder = path.split("/").slice(0, -1).join("/");
    const name = path.split("/").pop();
    const { data, error } = await admin.storage.from("mixtapes").list(folder, { search: name, limit: 5 });
    if (error) return false;
    return (data || []).some((row) => row.name === name);
}

export async function putSignedStorageUpload(staging, signedUrl, token, body, contentType) {
    const uploadUrl = new URL(signedUrl);
    uploadUrl.searchParams.set("token", token);
    const response = await fetch(uploadUrl.toString(), {
        method: "PUT",
        headers: {
            apikey: staging.NEXT_PUBLIC_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
            "Content-Type": contentType,
            "x-upsert": "false",
        },
        body,
    });
    return { status: response.status, ok: response.ok };
}

export async function fetchOwnedMixtape(baseUrl, session, mixtapeId) {
    const userId = session.user.id;
    return apiGet(
        baseUrl,
        `/api/mixtapes/${encodeURIComponent(mixtapeId)}?userId=${encodeURIComponent(userId)}&scope=mine`,
        session,
    );
}

export async function fetchPublicMixtapeDetail(baseUrl, mixtapeId) {
    return apiGet(baseUrl, `/api/mixtapes/${encodeURIComponent(mixtapeId)}`);
}

/** Unauthenticated GET on draft/archived mixtapes returns 401 (no session) or 404 (not found). */
export function isMixtapeDetailHiddenFromPublic(httpStatus) {
    return httpStatus === 401 || httpStatus === 404;
}

export async function removeOwnedStoragePaths(staging, paths, ownerUserId, runPrefix) {
    if (!staging.SUPABASE_SERVICE_ROLE_KEY) return { removed: [], skipped: paths };
    const admin = createClient(staging.NEXT_PUBLIC_SUPABASE_URL, staging.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const safe = paths.filter((p) => {
        const parts = p.split("/");
        return parts[0] === ownerUserId && p.includes(runPrefix);
    });
    if (safe.length === 0) return { removed: [], skipped: paths };
    const { error } = await admin.storage.from("mixtapes").remove(safe);
    if (error) return { removed: [], skipped: paths, error: error.message };
    return { removed: safe, skipped: paths.filter((p) => !safe.includes(p)) };
}