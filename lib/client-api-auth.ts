import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthSession } from "./auth-session";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken, MAX_SAFE_BEARER_TOKEN_LENGTH, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please log out and log back in, then retry.";

const API_AUTH_FAILED_MESSAGE = "API request could not authenticate. Please retry.";
const OVERSIZED_ACCESS_TOKEN_MESSAGE = `Session access_token exceeds maximum safe length (${MAX_SAFE_BEARER_TOKEN_LENGTH}). Log out and log in again.`;

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
const CLEAN_JWT_PATTERN = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type AuthFetchInit = RequestInit & {
    /** When true, missing session tokens throw. Use for uploads and writes only. */
    requireSession?: boolean;
};

const STRIPPED_REQUEST_HEADERS = new Set([
    "authorization",
    "apikey",
    "x-supabase-auth",
    "x-session",
    "x-user",
    "x-refresh-token",
    SUPABASE_REFRESH_TOKEN_HEADER.toLowerCase(),
]);

let sessionRefreshPromise: Promise<Session | null> | null = null;

function getTokenTail(token: string) {
    return token ? token.slice(-8) : "";
}

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function extractJwtAccessToken(value: unknown) {
    if (typeof value !== "string") {
        return "";
    }

    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return "";
    }

    if (CLEAN_JWT_PATTERN.test(trimmed)) {
        return trimmed;
    }

    const match = trimmed.match(JWT_PATTERN);
    return match?.[0] ?? "";
}

function assertUsableAccessToken(accessToken: string) {
    if (!accessToken) {
        return;
    }

    if (!CLEAN_JWT_PATTERN.test(accessToken)) {
        throw new Error(`Invalid session access_token from ${ACCESS_TOKEN_SOURCE}. Sign out and sign in again.`);
    }

    if (isOversizedBearerToken(accessToken)) {
        console.error("[authFetch] Oversized access_token rejected", {
            length: accessToken.length,
            first100: accessToken.slice(0, 100),
            last100: accessToken.slice(-100),
        });
        throw new Error(OVERSIZED_ACCESS_TOKEN_MESSAGE);
    }
}

export function readAccessTokenFromSession(session: Session | null | undefined) {
    return extractJwtAccessToken(session?.access_token);
}

export function readRefreshTokenFromSession(session: Session | null | undefined) {
    const refreshToken = session?.refresh_token;
    if (typeof refreshToken !== "string") {
        return "";
    }
    const trimmed = refreshToken.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return "";
    }
    return trimmed;
}

function isAccessTokenExpired(session: Session | null | undefined) {
    const expiresAt = session?.expires_at;
    if (!expiresAt) {
        return false;
    }
    return expiresAt * 1000 <= Date.now() + 15_000;
}

function resolveOutboundUrl(input: RequestInfo | URL) {
    if (typeof input === "string") {
        return input;
    }
    if (input instanceof URL) {
        return input.href;
    }
    return input.url;
}

function copyPreservedHeaders(target: Headers, source: HeadersInit | undefined) {
    if (!source) {
        return;
    }
    const incoming = new Headers(source);
    incoming.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (STRIPPED_REQUEST_HEADERS.has(lowerKey)) {
            return;
        }
        target.set(key, value);
    });
}

function buildAuthHeaders(init: RequestInit | undefined, accessToken: string) {
    assertUsableAccessToken(accessToken);

    const headers = new Headers();
    copyPreservedHeaders(headers, init?.headers);
    STRIPPED_REQUEST_HEADERS.forEach((headerName) => {
        headers.delete(headerName);
    });

    headers.set("Authorization", `Bearer ${accessToken}`);

    const anonKey = readBrowserSupabaseAnonKey();
    if (!anonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY for authenticated API requests.");
    }
    headers.set("apikey", anonKey);

    return headers;
}

function stripSessionTokensFromBody(body: BodyInit | null | undefined) {
    if (!body) {
        return body;
    }
    if (typeof body === "string") {
        try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            ACCESS_TOKEN_BODY_KEYS.forEach((key) => {
                delete parsed[key];
            });
            REFRESH_TOKEN_BODY_KEYS.forEach((key) => {
                delete parsed[key];
            });
            return JSON.stringify(parsed);
        }
        catch {
            return body;
        }
    }
    if (body instanceof FormData) {
        ACCESS_TOKEN_BODY_KEYS.forEach((key) => {
            body.delete(key);
        });
        REFRESH_TOKEN_BODY_KEYS.forEach((key) => {
            body.delete(key);
        });
    }
    return body;
}

function stripSessionTokensFromUrl(input: RequestInfo | URL) {
    if (typeof window === "undefined") {
        return input;
    }
    const base = typeof input === "string"
        ? input
        : input instanceof URL
            ? input.href
            : input.url;
    const url = new URL(base, window.location.origin);
    ACCESS_TOKEN_BODY_KEYS.forEach((key) => {
        url.searchParams.delete(key);
    });
    REFRESH_TOKEN_BODY_KEYS.forEach((key) => {
        url.searchParams.delete(key);
    });
    return url.toString();
}

function buildAuthenticatedRequest(
    input: RequestInfo | URL,
    fetchInit: RequestInit,
    accessToken: string,
) {
    const headers = buildAuthHeaders(fetchInit, accessToken);
    const body = stripSessionTokensFromBody(fetchInit.body ?? null);
    const requestUrl = stripSessionTokensFromUrl(input);
    return {
        input: requestUrl,
        init: {
            method: fetchInit.method,
            body,
            cache: fetchInit.cache,
            signal: fetchInit.signal,
            referrer: fetchInit.referrer,
            mode: fetchInit.mode,
            redirect: fetchInit.redirect,
            headers,
            credentials: "omit" as RequestCredentials,
        },
    };
}

async function readSupabaseSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error: error ?? null };
}

async function refreshSupabaseSession(supabase: SupabaseClient) {
    if (!sessionRefreshPromise) {
        sessionRefreshPromise = supabase.auth.refreshSession()
            .then(({ data }) => data.session ?? null)
            .finally(() => {
                sessionRefreshPromise = null;
            });
    }
    return sessionRefreshPromise;
}

async function readSessionAccessToken(
    supabase: SupabaseClient,
    options: { allowRefresh?: boolean; forceRefresh?: boolean } = {},
) {
    let { session, error } = await readSupabaseSession(supabase);
    let accessToken = readAccessTokenFromSession(session);
    const refreshToken = readRefreshTokenFromSession(session);

    const needsRefresh = Boolean(options.allowRefresh && refreshToken)
        && (options.forceRefresh || !accessToken || isAccessTokenExpired(session) || isOversizedBearerToken(accessToken));

    if (needsRefresh) {
        try {
            const refreshedSession = await refreshSupabaseSession(supabase);
            if (refreshedSession) {
                session = refreshedSession;
                accessToken = readAccessTokenFromSession(refreshedSession);
            }
            else {
                ({ session, error } = await readSupabaseSession(supabase));
                accessToken = readAccessTokenFromSession(session);
            }
        }
        catch {
            // Keep existing session when refresh fails.
        }
    }

    if (accessToken) {
        assertUsableAccessToken(accessToken);
    }

    return {
        session,
        accessToken,
        refreshToken: readRefreshTokenFromSession(session),
        userId: session?.user?.id || "",
        error,
    };
}

export async function authFetch(
    supabase: SupabaseClient,
    input: RequestInfo | URL,
    init: AuthFetchInit = {},
) {
    const { requireSession = false, ...fetchInit } = init;
    const { session, accessToken } = await readSessionAccessToken(supabase, {
        allowRefresh: true,
    });

    if (!accessToken) {
        if (requireSession) {
            throw new Error(session ? API_AUTH_FAILED_MESSAGE : SESSION_EXPIRED_MESSAGE);
        }
        return fetch(input, {
            ...fetchInit,
            credentials: "omit",
        });
    }

    const request = buildAuthenticatedRequest(input, fetchInit, accessToken);
    const response = await fetch(request.input, request.init);
    if (response.status !== 401) {
        return response;
    }

    const refreshed = await readSessionAccessToken(supabase, {
        allowRefresh: true,
        forceRefresh: true,
    });
    if (!refreshed.accessToken) {
        throw new Error(refreshed.session ? API_AUTH_FAILED_MESSAGE : SESSION_EXPIRED_MESSAGE);
    }

    console.info("[authFetch] Protected API retry token", {
        previousTokenTail: getTokenTail(accessToken),
        retryTokenTail: getTokenTail(refreshed.accessToken),
        tokenChanged: getTokenTail(accessToken) !== getTokenTail(refreshed.accessToken),
    });

    const retryRequest = buildAuthenticatedRequest(input, fetchInit, refreshed.accessToken);
    const retryResponse = await fetch(retryRequest.input, retryRequest.init);
    if (retryResponse.status === 401) {
        const { session: currentSession } = await getAuthSession(supabase);
        if (!currentSession) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }
    }
    return retryResponse;
}
