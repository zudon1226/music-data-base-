import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ACCESS_TOKEN_LENGTH = 8192;
const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

export type AccessTokenDiagnosis = {
    accessTokenLength: number;
    normalizedLength: number;
    authorizationLength: number;
    authorizationCount: number;
    bearerCount: number;
    jwtCount: number;
    looksLikeJson: boolean;
    extractionMethod: string;
    tokenFirst20: string;
    tokenLast20: string;
    rejected: boolean;
    rejectionReason: string;
};

function stripBearerPrefixes(value: string) {
    let token = value.trim();
    while (token.toLowerCase().startsWith("bearer ")) {
        token = token.slice(7).trim();
    }
    return token;
}

function countJwtMatches(value: string) {
    return value.match(new RegExp(JWT_PATTERN.source, "g"))?.length ?? 0;
}

function extractAccessTokenFromJson(value: string) {
    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        const direct = parsed.access_token ?? parsed.accessToken;
        if (typeof direct === "string" && direct.trim()) {
            return direct.trim();
        }
        const session = parsed.session ?? parsed.currentSession;
        if (session && typeof session === "object") {
            const sessionToken = (session as Record<string, unknown>).access_token
                ?? (session as Record<string, unknown>).accessToken;
            if (typeof sessionToken === "string" && sessionToken.trim()) {
                return sessionToken.trim();
            }
        }
    }
    catch {
        // ignore invalid JSON
    }
    return "";
}

function extractSingleJwt(value: string) {
    return value.match(JWT_PATTERN)?.[0] || "";
}

export function diagnoseAccessToken(raw: unknown, authorizationCount = 1): AccessTokenDiagnosis {
    const original = typeof raw === "string" ? raw : "";
    const stripped = stripBearerPrefixes(original.replace(/^["']|["']$/g, ""));
    const jwtCount = countJwtMatches(stripped);
    const bearerCount = (original.toLowerCase().match(/\bbearer\b/g) || []).length;
    const looksLikeJson = stripped.startsWith("{") || stripped.startsWith("[");

    let extracted = "";
    let extractionMethod = "none";

    if (!stripped) {
        extractionMethod = "empty";
    }
    else if (looksLikeJson) {
        const fromJson = extractAccessTokenFromJson(stripped);
        if (fromJson) {
            extracted = stripBearerPrefixes(fromJson);
            extractionMethod = "json.access_token";
        }
        else {
            extractionMethod = "json-without-access_token";
        }
    }
    else if (jwtCount > 1) {
        extracted = extractSingleJwt(stripped);
        extractionMethod = "first-jwt";
    }
    else if (jwtCount === 1) {
        extracted = extractSingleJwt(stripped) || stripped;
        extractionMethod = extracted === stripped ? "single-jwt" : "first-jwt";
    }
    else if (stripped.length > MAX_ACCESS_TOKEN_LENGTH) {
        extracted = extractSingleJwt(stripped);
        extractionMethod = extracted ? "first-jwt-oversized" : "rejected-oversized";
    }
    else {
        extracted = stripped;
        extractionMethod = "as-is";
    }

    if (extracted) {
        const inner = stripBearerPrefixes(extracted);
        const innerJwtCount = countJwtMatches(inner);
        if (innerJwtCount > 1 || (inner.length > MAX_ACCESS_TOKEN_LENGTH && innerJwtCount >= 1)) {
            const single = extractSingleJwt(inner);
            if (single) {
                extracted = single;
                extractionMethod = `${extractionMethod}+nested-jwt`;
            }
        }
        else if (inner !== extracted) {
            extracted = inner;
            extractionMethod = `${extractionMethod}+strip-bearer`;
        }
    }

    const normalized = extracted
        && !extracted.startsWith("{")
        && !extracted.startsWith("[")
        && extracted.length <= MAX_ACCESS_TOKEN_LENGTH
        && (countJwtMatches(extracted) === 1 || extractSingleJwt(extracted) === extracted)
        ? (extractSingleJwt(extracted) || extracted)
        : "";

    const rejectionReason = !stripped
        ? "empty"
        : looksLikeJson && !normalized
            ? "json-without-access_token"
            : stripped.length > MAX_ACCESS_TOKEN_LENGTH && !normalized
                ? "exceeds-max-length"
                : jwtCount === 0 && !normalized
                    ? "not-a-jwt"
                    : "";

    const tokenForPreview = normalized || extracted || stripped;

    return {
        accessTokenLength: original.length,
        normalizedLength: normalized.length,
        authorizationLength: normalized ? normalized.length + 7 : 0,
        authorizationCount,
        bearerCount,
        jwtCount,
        looksLikeJson,
        extractionMethod,
        tokenFirst20: tokenForPreview.slice(0, 20),
        tokenLast20: tokenForPreview.slice(-20),
        rejected: Boolean(stripped && !normalized),
        rejectionReason,
    };
}

function logAccessTokenDiagnosis(label: string, diagnosis: AccessTokenDiagnosis) {
    const payload = {
        accessTokenLength: diagnosis.accessTokenLength,
        authorizationLength: diagnosis.authorizationLength,
        authorizationCount: diagnosis.authorizationCount,
        tokenFirst20: diagnosis.tokenFirst20,
        tokenLast20: diagnosis.tokenLast20,
        bearerCount: diagnosis.bearerCount,
        jwtCount: diagnosis.jwtCount,
        looksLikeJson: diagnosis.looksLikeJson,
        extractionMethod: diagnosis.extractionMethod,
        normalizedLength: diagnosis.normalizedLength,
    };
    if (diagnosis.rejected) {
        console.error(label, payload, { rejectionReason: diagnosis.rejectionReason });
        return;
    }
    if (diagnosis.extractionMethod !== "single-jwt" && diagnosis.extractionMethod !== "as-is" && diagnosis.extractionMethod !== "none") {
        console.warn(label, payload);
        return;
    }
    console.log(label, payload);
}

export function normalizeAccessToken(raw: unknown) {
    return normalizeAccessTokenResolved(raw).token;
}

function normalizeAccessTokenResolved(raw: unknown) {
    const diagnosis = diagnoseAccessToken(raw);
    if (diagnosis.rejected) {
        logAccessTokenDiagnosis("API AUTH: access token exceeds max length or is malformed.", diagnosis);
        return { token: "", diagnosis };
    }
    if (
        diagnosis.extractionMethod !== "single-jwt"
        && diagnosis.extractionMethod !== "as-is"
        && diagnosis.extractionMethod !== "none"
    ) {
        logAccessTokenDiagnosis("API AUTH: extracted single access token from malformed value.", diagnosis);
    }

    const stripped = stripBearerPrefixes(String(raw).replace(/^["']|["']$/g, ""));
    let token = "";
    if (stripped.startsWith("{") || stripped.startsWith("[")) {
        token = stripBearerPrefixes(extractAccessTokenFromJson(stripped));
    }
    else if (countJwtMatches(stripped) > 1 || stripped.length > MAX_ACCESS_TOKEN_LENGTH) {
        token = extractSingleJwt(stripped);
    }
    else {
        token = stripBearerPrefixes(stripped);
    }
    token = extractSingleJwt(token) || token;
    if (!token || token.startsWith("{") || token.startsWith("[") || token.length > MAX_ACCESS_TOKEN_LENGTH) {
        return { token: "", diagnosis: { ...diagnosis, rejected: true, rejectionReason: "normalize-failed" } };
    }
    return { token, diagnosis };
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

function logRequestHeaderSizes(
    label: string,
    url: string,
    headers: Headers,
    diagnosis: AccessTokenDiagnosis,
    extra: Record<string, unknown> = {},
) {
    const { headersSize, authorizationLength, authorizationCount } = measureHeaders(headers);
    const cookieLength = measureCookieLength();
    console.log(label, {
        url,
        headersSize,
        accessTokenLength: diagnosis.accessTokenLength,
        authorizationLength,
        authorizationCount,
        tokenFirst20: diagnosis.tokenFirst20,
        tokenLast20: diagnosis.tokenLast20,
        normalizedLength: diagnosis.normalizedLength,
        bearerCount: diagnosis.bearerCount,
        jwtCount: diagnosis.jwtCount,
        looksLikeJson: diagnosis.looksLikeJson,
        extractionMethod: diagnosis.extractionMethod,
        cookieLength,
        credentials: "omit",
        ...extra,
    });
    if (authorizationCount > 1) {
        console.error("API AUTH: multiple Authorization headers detected before fetch.");
    }
    if (authorizationLength > MAX_ACCESS_TOKEN_LENGTH + 7) {
        console.error("API AUTH: Authorization header too large.", { authorizationLength, authorizationCount });
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
    const { token: normalizedToken, diagnosis } = normalizeAccessTokenResolved(accessToken);
    if (normalizedToken) {
        headers.set("Authorization", `Bearer ${normalizedToken}`);
    }
    return { headers, accessToken: normalizedToken, diagnosis };
}

async function resolveAccessToken(supabase: SupabaseClient, accessTokenOverride: string) {
    if (accessTokenOverride) {
        const { token, diagnosis } = normalizeAccessTokenResolved(accessTokenOverride);
        return {
            accessToken: token,
            diagnosis,
            userId: "",
            error: null as Error | null,
        };
    }
    const session = await getAuthenticatedSession(supabase);
    return {
        accessToken: session.accessToken,
        diagnosis: diagnoseAccessToken(session.accessToken),
        userId: session.userId,
        error: session.error,
    };
}

export async function getAuthenticatedSession(supabase: SupabaseClient) {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (session?.access_token) {
        const { token, diagnosis } = normalizeAccessTokenResolved(session.access_token);
        if (!token && diagnosis.rejected) {
            return {
                accessToken: "",
                userId: session.user?.id || "",
                error: new Error("Session access token is invalid or too large. Log in again."),
            };
        }
        return {
            accessToken: token,
            userId: session.user?.id || "",
            error: null as Error | null,
        };
    }
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshed = refreshData.session;
    if (refreshed?.access_token) {
        const { token, diagnosis } = normalizeAccessTokenResolved(refreshed.access_token);
        if (!token && diagnosis.rejected) {
            return {
                accessToken: "",
                userId: refreshed.user?.id || "",
                error: new Error("Refreshed access token is invalid or too large. Log in again."),
            };
        }
        return {
            accessToken: token,
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
    const { headers, accessToken: normalizedToken, diagnosis } = buildAuthHeaders(init, accessToken);
    const url = typeof input === "string" ? input : input.toString();
    logRequestHeaderSizes("API AUTH FETCH", url, headers, diagnosis, {
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
    const { accessToken, userId, error, diagnosis } = await resolveAccessToken(supabase, accessTokenOverride);
    const { headers, accessToken: normalizedToken, diagnosis: headerDiagnosis } = buildAuthHeaders(init, accessToken);
    const url = typeof input === "string" ? input : input.toString();
    const rawDiagnosis = accessTokenOverride ? diagnoseAccessToken(accessTokenOverride) : headerDiagnosis;
    logRequestHeaderSizes("API AUTH FETCH", url, headers, {
        ...headerDiagnosis,
        accessTokenLength: rawDiagnosis.accessTokenLength,
        bearerCount: rawDiagnosis.bearerCount,
        jwtCount: rawDiagnosis.jwtCount,
        looksLikeJson: rawDiagnosis.looksLikeJson,
        extractionMethod: rawDiagnosis.extractionMethod,
        tokenFirst20: rawDiagnosis.tokenFirst20,
        tokenLast20: rawDiagnosis.tokenLast20,
    }, {
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
