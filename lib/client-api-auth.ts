import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);
const JWT_LENGTH_ANOMALY_THRESHOLD = 4096;

function readPersistedAccessTokenLength() {
    if (typeof window === "undefined") {
        return null;
    }
    for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (!key || !key.includes("-auth-token")) {
            continue;
        }
        const raw = window.localStorage.getItem(key) || "";
        try {
            const parsed = JSON.parse(raw) as {
                access_token?: unknown;
                currentSession?: { access_token?: unknown };
            };
            const token = parsed.access_token ?? parsed.currentSession?.access_token;
            return {
                storageKey: key,
                storageValueLength: raw.length,
                persistedAccessTokenLength: typeof token === "string" ? token.length : null,
                persistedAccessTokenPrefix: typeof token === "string" ? token.slice(0, 50) : null,
            };
        }
        catch {
            return {
                storageKey: key,
                storageValueLength: raw.length,
                persistedAccessTokenLength: null,
                persistedAccessTokenPrefix: raw.slice(0, 50),
            };
        }
    }
    return null;
}

export function logTokenLifecycleCheckpoint(
    checkpoint: string,
    session: Session | null | undefined,
) {
    console.log("TOKEN_LIFECYCLE_CHECKPOINT", checkpoint);
    console.log("RAW_SESSION", session);
    console.log("RAW_ACCESS_TOKEN_LENGTH", session?.access_token?.length ?? null);

    const persisted = readPersistedAccessTokenLength();
    if (persisted) {
        console.log("PERSISTED_AUTH_STORAGE", {
            checkpoint,
            ...persisted,
        });
    }

    const accessTokenLength = session?.access_token?.length ?? 0;
    if (accessTokenLength > JWT_LENGTH_ANOMALY_THRESHOLD) {
        const token = session?.access_token || "";
        console.error("TOKEN_LENGTH_ANOMALY", {
            checkpoint,
            accessTokenLength,
            tokenPrefix: token.slice(0, 50),
            tokenAt1500: token.slice(1490, 1510),
            tokenAt4000: token.slice(3990, 4010),
            tokenSuffix: token.slice(-50),
            persistedAccessTokenLength: persisted?.persistedAccessTokenLength ?? null,
            lengthsMatch: persisted?.persistedAccessTokenLength === accessTokenLength,
        });
    }
}

export function logAccessTokenDiagnostics(accessToken: unknown, sourcePath = ACCESS_TOKEN_SOURCE) {
    const tokenString = accessToken == null ? "" : String(accessToken);
    console.log("AUTH_SOURCE", "supabase-session");
    console.log("TOKEN_SOURCE_PATH", sourcePath);
    console.log("TOKEN_TYPE", typeof accessToken);
    console.log("TOKEN_PREFIX", tokenString.slice(0, 50));
    console.log("TOKEN_LENGTH", tokenString.length);
}

export function readAccessTokenFromSession(
    session: Session | null | undefined,
    sourcePath = ACCESS_TOKEN_SOURCE,
) {
    const raw = session?.access_token;
    logAccessTokenDiagnostics(raw, sourcePath);

    if (typeof raw !== "string" || !raw) {
        console.error("ACCESS_TOKEN_REJECTED", {
            sourcePath,
            reason: "missing-or-not-string",
            sessionExists: Boolean(session),
            sessionKeys: session ? Object.keys(session) : [],
        });
        return "";
    }

    if (!raw.startsWith("eyJ")) {
        console.error("ACCESS_TOKEN_REJECTED", {
            sourcePath,
            reason: "not-jwt-prefix",
            tokenType: typeof raw,
            tokenPrefix: raw.slice(0, 50),
            tokenLength: raw.length,
            looksLikeJson: raw.startsWith("{") || raw.startsWith("["),
            sessionTokenTypeField: session?.token_type || null,
            refreshTokenLength: typeof session?.refresh_token === "string" ? session.refresh_token.length : null,
        });
        return "";
    }

    if (raw.length > JWT_LENGTH_ANOMALY_THRESHOLD) {
        console.error("ACCESS_TOKEN_REJECTED", {
            sourcePath,
            reason: "jwt-length-anomaly",
            tokenLength: raw.length,
            tokenPrefix: raw.slice(0, 50),
            tokenAt1500: raw.slice(1490, 1510),
            persistedAccessTokenLength: readPersistedAccessTokenLength()?.persistedAccessTokenLength ?? null,
        });
        return "";
    }

    return raw;
}

async function readSessionAccessToken(supabase: SupabaseClient) {
    logTokenLifecycleCheckpoint("authFetch:before-getSession", null);
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();
    logTokenLifecycleCheckpoint("authFetch:after-getSession", session);

    const accessToken = readAccessTokenFromSession(session);
    return {
        session,
        accessToken,
        userId: session?.user?.id || "",
        error,
    };
}

function copyAllowedHeaders(target: Headers, source: HeadersInit | undefined) {
    if (!source) {
        return;
    }
    const incoming = new Headers(source);
    incoming.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (ALLOWED_REQUEST_HEADERS.has(lowerKey)) {
            target.set(key, value);
        }
    });
}

function buildAuthHeaders(init: RequestInit | undefined, accessToken: string) {
    const headers = new Headers();
    copyAllowedHeaders(headers, init?.headers);
    headers.delete("authorization");
    headers.delete("Authorization");
    headers.delete("apikey");
    headers.delete("x-supabase-auth");
    headers.delete("x-session");
    headers.delete("x-user");
    headers.delete("x-refresh-token");
    headers.set("Authorization", `Bearer ${accessToken}`);
    return headers;
}

export async function authFetch(
    supabase: SupabaseClient,
    input: RequestInfo | URL,
    init: RequestInit = {},
) {
    const { accessToken, error } = await readSessionAccessToken(supabase);
    if (!accessToken) {
        throw new Error(
            error?.message
                || `Invalid session access_token from ${ACCESS_TOKEN_SOURCE}. Expected JWT string starting with "eyJ". Request stopped.`,
        );
    }

    const headers = buildAuthHeaders(init, accessToken);
    return fetch(input, {
        method: init.method,
        body: init.body,
        cache: init.cache,
        signal: init.signal,
        referrer: init.referrer,
        mode: init.mode,
        redirect: init.redirect,
        headers,
        credentials: "omit",
    });
}
