import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { clearSupabaseAuthStorage, getAuthSession } from "./auth-session";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken, MAX_SAFE_BEARER_TOKEN_LENGTH, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please log out and log back in, then retry.";

const API_AUTH_FAILED_MESSAGE = "API request could not authenticate. Please retry.";
const CORRUPTED_ACCESS_TOKEN_MESSAGE = "Stored session access_token is corrupted. Please log out and log in again.";

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

const PROTECTED_DESKTOP_API_PREFIXES = [
    "/api/user-profile",
    "/api/library-saves",
    "/api/playlists",
    "/api/user-music-state",
];

let sessionRefreshPromise: Promise<Session | null> | null = null;
let corruptedAuthCleanupDoneThisPageLoad = false;
let desktopAuthRecoveryRequired = false;

export function isDesktopAuthRecoveryRequired() {
    return desktopAuthRecoveryRequired;
}

export function resetDesktopAuthRecoveryState() {
    desktopAuthRecoveryRequired = false;
}

function getTokenTail(token: string) {
    return token ? token.slice(-8) : "";
}

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
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

function isProtectedDesktopApiUrl(url: string) {
    return PROTECTED_DESKTOP_API_PREFIXES.some((prefix) => url.includes(prefix));
}

function readRawAccessToken(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token : "";
}

function hasExactlyThreeJwtSegments(token: string) {
    const parts = token.split(".");
    return parts.length === 3 && parts.every((part) => part.length > 0);
}

function isAcceptableAccessToken(token: string) {
    if (!token || token.length >= MAX_SAFE_BEARER_TOKEN_LENGTH) {
        return false;
    }
    if (!token.startsWith("eyJ")) {
        return false;
    }
    return hasExactlyThreeJwtSegments(token);
}

function isCorruptedStoredAccessToken(token: string) {
    if (!token) {
        return false;
    }
    return isOversizedBearerToken(token) || !isAcceptableAccessToken(token);
}

export function readAccessTokenFromSession(session: Session | null | undefined) {
    const raw = readRawAccessToken(session);
    return isAcceptableAccessToken(raw) ? raw : "";
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

function resetAuthTokenCache() {
    sessionRefreshPromise = null;
}

function emptySessionAccessTokenResult() {
    return {
        session: null,
        accessToken: "",
        refreshToken: "",
        userId: "",
        error: null,
    };
}

async function runCorruptedAuthCleanupOnce(supabase: SupabaseClient) {
    desktopAuthRecoveryRequired = true;
    if (corruptedAuthCleanupDoneThisPageLoad) {
        return;
    }
    corruptedAuthCleanupDoneThisPageLoad = true;

    clearSupabaseAuthStorage();
    resetAuthTokenCache();
    await supabase.auth.signOut();
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

function assertUsableAccessToken(accessToken: string) {
    if (!isAcceptableAccessToken(accessToken)) {
        throw new Error(CORRUPTED_ACCESS_TOKEN_MESSAGE);
    }
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
    if (desktopAuthRecoveryRequired) {
        return null;
    }
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
    if (desktopAuthRecoveryRequired) {
        return emptySessionAccessTokenResult();
    }

    let { session, error } = await readSupabaseSession(supabase);
    const rawAccessToken = readRawAccessToken(session);

    if (isCorruptedStoredAccessToken(rawAccessToken)) {
        await runCorruptedAuthCleanupOnce(supabase);
        return emptySessionAccessTokenResult();
    }

    let accessToken = readAccessTokenFromSession(session);
    const refreshToken = readRefreshTokenFromSession(session);

    const needsRefresh = Boolean(options.allowRefresh && refreshToken && !desktopAuthRecoveryRequired)
        && (options.forceRefresh || !accessToken || isAccessTokenExpired(session));

    if (needsRefresh) {
        try {
            const refreshedSession = await refreshSupabaseSession(supabase);
            if (refreshedSession) {
                const refreshedRaw = readRawAccessToken(refreshedSession);
                if (isCorruptedStoredAccessToken(refreshedRaw)) {
                    await runCorruptedAuthCleanupOnce(supabase);
                    return emptySessionAccessTokenResult();
                }
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
        desktopAuthRecoveryRequired = false;
    }

    return {
        session,
        accessToken,
        refreshToken: readRefreshTokenFromSession(session),
        userId: session?.user?.id || "",
        error,
    };
}

function blockProtectedApiWithoutSession(url: string, accessToken: string) {
    if (isProtectedDesktopApiUrl(url) && !accessToken) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }
}

export async function authFetch(
    supabase: SupabaseClient,
    input: RequestInfo | URL,
    init: AuthFetchInit = {},
) {
    const { requireSession = false, ...fetchInit } = init;
    const requestUrl = resolveOutboundUrl(input);

    if (desktopAuthRecoveryRequired) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    const { session, accessToken } = await readSessionAccessToken(supabase, {
        allowRefresh: true,
    });

    if (desktopAuthRecoveryRequired) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    blockProtectedApiWithoutSession(requestUrl, accessToken);

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
    if (response.status !== 401 || desktopAuthRecoveryRequired) {
        return response;
    }

    const refreshed = await readSessionAccessToken(supabase, {
        allowRefresh: true,
        forceRefresh: true,
    });

    if (desktopAuthRecoveryRequired || !refreshed.accessToken) {
        throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    console.info("[authFetch] Protected API retry token", {
        previousTokenTail: getTokenTail(accessToken),
        retryTokenTail: getTokenTail(refreshed.accessToken),
        tokenChanged: getTokenTail(accessToken) !== getTokenTail(refreshed.accessToken),
    });

    blockProtectedApiWithoutSession(requestUrl, refreshed.accessToken);

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
