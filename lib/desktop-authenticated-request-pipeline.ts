/** DESKTOP ONLY — shared authenticated request paths and /api request pipeline. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readRefreshTokenFromSession } from "./client-api-auth";
import {
    isCorruptedDesktopAccessToken,
    isDesktopAuthRecoveryActive,
    noteValidatedDesktopSession,
    readAccessTokenFromSession,
    SESSION_EXPIRED_MESSAGE,
} from "./desktop-auth-recovery-gate";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import {
    isOversizedBearerToken,
    SUPABASE_REFRESH_TOKEN_HEADER,
} from "./session-token-limits";

export { SESSION_EXPIRED_MESSAGE };

const API_AUTH_FAILED_MESSAGE = "API request could not authenticate. Please retry.";

/** Vercel/nginx rejects requests when Authorization exceeds header limits. */
export const DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS = 494;

export type DesktopAuthenticatedRequestConfig = {
    supabase: SupabaseClient;
    readAuthSession?: () => Session | null;
};

export type DesktopAuthenticatedFetchInit = Omit<RequestInit, "credentials"> & {
    /** When true, missing session credentials throw instead of sending an unauthenticated request. */
    requireAuth?: boolean;
};

/** @deprecated Use DesktopAuthenticatedRequestConfig */
export type DesktopProtectedActionClientConfig = DesktopAuthenticatedRequestConfig;

/** @deprecated Use DesktopAuthenticatedFetchInit */
export type DesktopProtectedActionFetchInit = DesktopAuthenticatedFetchInit;

export type DesktopAuthTransport =
    | { kind: "bearer"; accessToken: string }
    | { kind: "refresh"; refreshToken: string };

export type DesktopAuthenticatedCredentials = {
    session: Session;
    userId: string;
    transport: DesktopAuthTransport;
};

export type DesktopAuthRequestMode = "bearer-preferred" | "refresh-header-only";

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

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function getTokenTail(token: string) {
    return token ? token.slice(-8) : "";
}

function readRawAccessToken(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token.trim() : "";
}

function readSafeBearerToken(session: Session | null | undefined) {
    return readAccessTokenFromSession(session);
}

function isAccessTokenExpired(session: Session | null | undefined) {
    const expiresAt = session?.expires_at;
    if (!expiresAt) {
        return false;
    }
    return expiresAt * 1000 <= Date.now() + 15_000;
}

function sessionRequiresRefreshHeaderAuth(session: Session | null | undefined) {
    const raw = readRawAccessToken(session);
    if (!raw) {
        return false;
    }
    return isOversizedBearerToken(raw) || isCorruptedDesktopAccessToken(raw);
}

export function assertDesktopRelativeApiPath(path: string) {
    const normalized = path.trim();
    if (!normalized.startsWith("/api/")) {
        throw new Error("Desktop API calls must use relative /api/ paths.");
    }
    if (normalized.includes("://")) {
        throw new Error("Desktop API calls must stay same-origin. Use /api/... only.");
    }
    const lower = normalized.toLowerCase();
    if (lower.includes("vercel.com") || lower.includes("sso-api")) {
        throw new Error("Desktop API calls must not target Vercel SSO or external hosts.");
    }
    return normalized;
}

export function hasValidDesktopSupabaseSession(session: Session | null | undefined) {
    if (!session?.user?.id) {
        return false;
    }
    return Boolean(readSafeBearerToken(session) || readRefreshTokenFromSession(session));
}

async function refreshSupabaseSession(supabase: SupabaseClient) {
    if (!sessionRefreshPromise) {
        sessionRefreshPromise = supabase.auth.refreshSession()
            .then(({ data, error }) => {
                if (error) {
                    return null;
                }
                return data.session ?? null;
            })
            .finally(() => {
                sessionRefreshPromise = null;
            });
    }
    return sessionRefreshPromise;
}

async function readLiveSupabaseSession(
    supabase: SupabaseClient,
    readAuthSession?: () => Session | null,
) {
    const { data: { session: storedSession } } = await supabase.auth.getSession();
    const contextSession = readAuthSession?.() ?? null;
    return storedSession ?? contextSession;
}

/**
 * Resolve authenticated credentials for protected desktop /api requests.
 * 1. Confirms a live Supabase session with user id exists.
 * 2. Refreshes the session when bearer is missing, expired, or unsafe for headers.
 * 3. Prefers Authorization bearer; uses refresh-header auth only when bearer would 494.
 */
export async function resolveDesktopAuthenticatedCredentials(
    config: DesktopAuthenticatedRequestConfig,
    options: {
        forceRefresh?: boolean;
        authMode?: DesktopAuthRequestMode;
    } = {},
): Promise<DesktopAuthenticatedCredentials | null> {
    if (isDesktopAuthRecoveryActive()) {
        return null;
    }

    const authMode = options.authMode ?? "bearer-preferred";
    let session = await readLiveSupabaseSession(config.supabase, config.readAuthSession);

    if (!session?.user?.id) {
        return null;
    }

    const refreshTokenAvailable = Boolean(readRefreshTokenFromSession(session));
    const needsClientRefresh = Boolean(options.forceRefresh
        || !readSafeBearerToken(session)
        || isAccessTokenExpired(session)
        || (authMode === "bearer-preferred" && sessionRequiresRefreshHeaderAuth(session)));

    if (needsClientRefresh && refreshTokenAvailable) {
        const refreshedSession = await refreshSupabaseSession(config.supabase);
        if (refreshedSession?.user?.id) {
            session = refreshedSession;
            noteValidatedDesktopSession(refreshedSession);
        }
    }

    if (authMode === "refresh-header-only" || sessionRequiresRefreshHeaderAuth(session)) {
        const refreshToken = readRefreshTokenFromSession(session);
        if (refreshToken) {
            return {
                session,
                userId: session.user.id,
                transport: { kind: "refresh", refreshToken },
            };
        }
    }

    const accessToken = readSafeBearerToken(session);
    if (accessToken) {
        noteValidatedDesktopSession(session);
        return {
            session,
            userId: session.user.id,
            transport: { kind: "bearer", accessToken },
        };
    }

    const refreshToken = readRefreshTokenFromSession(session);
    if (refreshToken) {
        return {
            session,
            userId: session.user.id,
            transport: { kind: "refresh", refreshToken },
        };
    }

    return null;
}

function copyPreservedHeaders(target: Headers, source: HeadersInit | undefined) {
    if (!source) {
        return;
    }
    const incoming = new Headers(source);
    incoming.forEach((value, key) => {
        if (STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
            return;
        }
        target.set(key, value);
    });
}

function buildAuthenticatedRequestHeaders(init: RequestInit | undefined, transport: DesktopAuthTransport) {
    const headers = new Headers();
    copyPreservedHeaders(headers, init?.headers);
    STRIPPED_REQUEST_HEADERS.forEach((headerName) => {
        headers.delete(headerName);
    });

    if (transport.kind === "bearer") {
        headers.set("Authorization", `Bearer ${transport.accessToken}`);
    }
    else {
        headers.set(SUPABASE_REFRESH_TOKEN_HEADER, transport.refreshToken);
    }

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

function stripSessionTokensFromRelativePath(path: string) {
    const normalized = assertDesktopRelativeApiPath(path);
    if (typeof window === "undefined") {
        return normalized;
    }
    const url = new URL(normalized, window.location.origin);
    ACCESS_TOKEN_BODY_KEYS.forEach((key) => {
        url.searchParams.delete(key);
    });
    REFRESH_TOKEN_BODY_KEYS.forEach((key) => {
        url.searchParams.delete(key);
    });
    return `${url.pathname}${url.search}`;
}

function buildAuthenticatedApiRequest(path: string, fetchInit: RequestInit, transport: DesktopAuthTransport) {
    const requestPath = stripSessionTokensFromRelativePath(path);
    return {
        path: requestPath,
        init: {
            method: fetchInit.method,
            body: stripSessionTokensFromBody(fetchInit.body ?? null),
            cache: fetchInit.cache,
            signal: fetchInit.signal,
            referrer: fetchInit.referrer,
            mode: fetchInit.mode,
            redirect: fetchInit.redirect,
            headers: buildAuthenticatedRequestHeaders(fetchInit, transport),
            credentials: "omit" as RequestCredentials,
        },
    };
}

export function createDesktopAuthenticatedFetch(config: DesktopAuthenticatedRequestConfig) {
    return async function desktopAuthenticatedFetch(
        path: string,
        init: DesktopAuthenticatedFetchInit = {},
    ) {
        const { requireAuth = true, ...fetchInit } = init;
        const requestPath = assertDesktopRelativeApiPath(path);

        const credentials = await resolveDesktopAuthenticatedCredentials(config, {
            authMode: "bearer-preferred",
        });

        if (!credentials) {
            if (requireAuth) {
                throw new Error(API_AUTH_FAILED_MESSAGE);
            }
            return fetch(requestPath, {
                ...fetchInit,
                credentials: "omit",
            });
        }

        const request = buildAuthenticatedApiRequest(requestPath, fetchInit, credentials.transport);
        let response = await fetch(request.path, request.init);

        if (response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
            console.warn("[desktopAuthenticatedFetch] REQUEST_HEADER_TOO_LARGE (494) — retrying with refresh-token header auth", {
                path: requestPath,
                transport: credentials.transport.kind,
            });

            const refreshOnlyCredentials = await resolveDesktopAuthenticatedCredentials(config, {
                authMode: "refresh-header-only",
            });

            if (refreshOnlyCredentials) {
                const retryRequest = buildAuthenticatedApiRequest(requestPath, fetchInit, refreshOnlyCredentials.transport);
                response = await fetch(retryRequest.path, retryRequest.init);
            }
        }

        if (response.status === 401) {
            const refreshedCredentials = await resolveDesktopAuthenticatedCredentials(config, {
                forceRefresh: true,
                authMode: "bearer-preferred",
            });

            if (refreshedCredentials) {
                console.info("[desktopAuthenticatedFetch] Protected API 401 retry", {
                    path: requestPath,
                    previousTransport: credentials.transport.kind,
                    retryTransport: refreshedCredentials.transport.kind,
                    previousTokenTail: credentials.transport.kind === "bearer"
                        ? getTokenTail(credentials.transport.accessToken)
                        : getTokenTail(credentials.transport.refreshToken),
                    retryTokenTail: refreshedCredentials.transport.kind === "bearer"
                        ? getTokenTail(refreshedCredentials.transport.accessToken)
                        : getTokenTail(refreshedCredentials.transport.refreshToken),
                });

                const retryRequest = buildAuthenticatedApiRequest(requestPath, fetchInit, refreshedCredentials.transport);
                response = await fetch(retryRequest.path, retryRequest.init);
            }
        }

        if ((response.status === 401 || response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) && requireAuth) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }

        return response;
    };
}

/** @deprecated Use createDesktopAuthenticatedFetch */
export function createDesktopProtectedActionClient(config: DesktopAuthenticatedRequestConfig) {
    return createDesktopAuthenticatedFetch(config);
}

export type DesktopAuthenticatedFetch = ReturnType<typeof createDesktopAuthenticatedFetch>;

/** @deprecated Use DesktopAuthenticatedFetch */
export type DesktopProtectedActionFetch = DesktopAuthenticatedFetch;
