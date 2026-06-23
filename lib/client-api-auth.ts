import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthSession } from "./auth-session";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please log out and log back in, then retry.";
const API_AUTH_FAILED_MESSAGE = "API request could not authenticate. Please retry.";

export type AuthFetchInit = RequestInit & {
    /** When true, missing session tokens throw. Use for uploads and writes only. */
    requireSession?: boolean;
};

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);
let sessionRefreshPromise: Promise<Session | null> | null = null;

export function readAccessTokenFromSession(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token : "";
}

export function readRefreshTokenFromSession(session: Session | null | undefined) {
    return typeof session?.refresh_token === "string" ? session.refresh_token : "";
}

function isAccessTokenExpired(session: Session | null | undefined) {
    const expiresAt = session?.expires_at;
    if (!expiresAt) {
        return false;
    }
    return expiresAt * 1000 <= Date.now() + 15_000;
}

async function readSessionAccessToken(
    supabase: SupabaseClient,
    options: { allowRefresh?: boolean; forceRefresh?: boolean } = {},
) {
    let { session, error } = await getAuthSession(supabase);
    const shouldRefresh = Boolean(options.allowRefresh && session?.refresh_token)
        && (isAccessTokenExpired(session) || isOversizedBearerToken(readAccessTokenFromSession(session)));

    if (options.forceRefresh || shouldRefresh) {
        try {
            if (!sessionRefreshPromise) {
                sessionRefreshPromise = supabase.auth.refreshSession()
                    .then(({ data, error: refreshError }) => {
                    if (refreshError) {
                        error = refreshError;
                    }
                    return data.session ?? null;
                })
                    .finally(() => {
                    sessionRefreshPromise = null;
                });
            }
            const refreshedSession = await sessionRefreshPromise;
            if (refreshedSession) {
                session = refreshedSession;
            }
            else {
                const latest = await getAuthSession(supabase);
                session = latest.session;
                error = latest.error || error;
            }
        }
        catch {
            // Keep the existing session; failed refresh must not sign the user out.
        }
    }

    const accessToken = readAccessTokenFromSession(session);
    const refreshToken = readRefreshTokenFromSession(session);
    return {
        session,
        accessToken,
        refreshToken,
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
    headers.delete(SUPABASE_REFRESH_TOKEN_HEADER);

    const bearerIsUsable = Boolean(accessToken) && !isOversizedBearerToken(accessToken);
    if (bearerIsUsable) {
        headers.set("Authorization", `Bearer ${accessToken}`);
    }
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

function stripSessionTokensFromUrl(
    input: RequestInfo | URL,
) {
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
