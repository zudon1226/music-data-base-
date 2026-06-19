import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ACCESS_TOKEN_LENGTH = 8192;
const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);

function normalizeAccessToken(raw: unknown) {
    if (typeof raw !== "string") {
        return "";
    }
    let token = raw.trim().replace(/^["']|["']$/g, "");
    if (!token) {
        return "";
    }
    if (token.toLowerCase().startsWith("bearer ")) {
        token = token.slice(7).trim();
    }
    if (token.startsWith("{") || token.startsWith("[")) {
        console.error("API AUTH: refused non-JWT value in Authorization (looks like JSON object/array).");
        return "";
    }
    if (token.length > MAX_ACCESS_TOKEN_LENGTH) {
        console.error("API AUTH: access token exceeds max length.", { length: token.length });
        return "";
    }
    return token;
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

function measureCookieLength() {
    if (typeof document === "undefined") {
        return 0;
    }
    return document.cookie.length;
}

function measureHeaders(headers: Headers) {
    let headersSize = 0;
    let authorizationLength = 0;
    let authorizationCount = 0;
    headers.forEach((value, key) => {
        headersSize += key.length + value.length + 4;
        if (key.toLowerCase() === "authorization") {
            authorizationLength += value.length;
            authorizationCount += 1;
        }
    });
    return { headersSize, authorizationLength, authorizationCount };
}

function logRequestHeaderSizes(label: string, url: string, headers: Headers, extra: Record<string, unknown> = {}) {
    const { headersSize, authorizationLength, authorizationCount } = measureHeaders(headers);
    const cookieLength = measureCookieLength();
    console.log(label, {
        url,
        headersSize,
        authorizationLength,
        authorizationCount,
        cookieLength,
        credentials: "omit",
        ...extra,
    });
    if (authorizationCount > 1) {
        console.error("API AUTH: multiple Authorization headers detected before fetch.");
    }
    if (authorizationLength > MAX_ACCESS_TOKEN_LENGTH) {
        console.error("API AUTH: Authorization header too large.", { authorizationLength });
    }
    if (cookieLength > 4096) {
        console.warn("API AUTH: document.cookie is large; API calls use credentials omit so cookies are not sent.", { cookieLength });
    }
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
    const normalizedToken = normalizeAccessToken(accessToken);
    if (normalizedToken) {
        headers.set("Authorization", `Bearer ${normalizedToken}`);
    }
    return { headers, accessToken: normalizedToken };
}

async function resolveAccessToken(supabase: SupabaseClient, accessTokenOverride: string) {
    if (accessTokenOverride) {
        return {
            accessToken: normalizeAccessToken(accessTokenOverride),
            userId: "",
            error: null as Error | null,
        };
    }
    return getAuthenticatedSession(supabase);
}

export async function getAuthenticatedSession(supabase: SupabaseClient) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (session?.access_token) {
        return {
            accessToken: normalizeAccessToken(session.access_token),
            userId: session.user?.id || "",
            error: null as Error | null,
        };
    }
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshed = refreshData.session;
    if (refreshed?.access_token) {
        return {
            accessToken: normalizeAccessToken(refreshed.access_token),
            userId: refreshed.user?.id || "",
            error: null as Error | null,
        };
    }
    return {
        accessToken: "",
        userId: "",
        error: (refreshError || sessionError || new Error("No active session.")) as Error | null,
    };
}

export async function authFetchWithAccessToken(
    accessToken: string,
    input: RequestInfo | URL,
    init: RequestInit = {},
) {
    const { headers, accessToken: normalizedToken } = buildAuthHeaders(init, accessToken);
    const url = typeof input === "string" ? input : input.toString();
    logRequestHeaderSizes("API AUTH FETCH", url, headers, {
        hasAuthorization: Boolean(normalizedToken),
        usedOverrideToken: true,
    });
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

export async function authFetch(
    supabase: SupabaseClient,
    input: RequestInfo | URL,
    init: RequestInit = {},
    accessTokenOverride = "",
) {
    const { accessToken, userId, error } = await resolveAccessToken(supabase, accessTokenOverride);
    const { headers, accessToken: normalizedToken } = buildAuthHeaders(init, accessToken);
    const url = typeof input === "string" ? input : input.toString();
    logRequestHeaderSizes("API AUTH FETCH", url, headers, {
        hasAuthorization: Boolean(normalizedToken),
        userId,
        usedOverrideToken: Boolean(accessTokenOverride),
        sessionError: error?.message || null,
    });
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
