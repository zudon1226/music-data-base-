import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthSession } from "./auth-session";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";

export type AuthFetchInit = RequestInit & {
    /** When true, missing session tokens throw. Use for uploads and writes only. */
    requireSession?: boolean;
};

const ALLOWED_REQUEST_HEADERS = new Set(["content-type", "accept", "cache-control"]);
const REFRESH_TOKEN_BODY_FIELD = REFRESH_TOKEN_BODY_KEYS[0];
const ACCESS_TOKEN_BODY_FIELD = ACCESS_TOKEN_BODY_KEYS[0];

export function readAccessTokenFromSession(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token : "";
}

function readRefreshTokenFromSession(session: Session | null | undefined) {
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
    options: { allowRefresh?: boolean } = {},
) {
    let { session, error } = await getAuthSession(supabase);
    const shouldRefresh = Boolean(options.allowRefresh && session?.refresh_token)
        && (isAccessTokenExpired(session) || isOversizedBearerToken(readAccessTokenFromSession(session)));

    if (shouldRefresh) {
        try {
            const { data } = await supabase.auth.refreshSession();
            if (data.session) {
                session = data.session;
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

function buildAuthHeaders(init: RequestInit | undefined, accessToken: string, refreshToken: string) {
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
    if (refreshToken) {
        headers.set(SUPABASE_REFRESH_TOKEN_HEADER, refreshToken);
    }
    return headers;
}

function attachSessionTokensToBody(
    body: BodyInit | null | undefined,
    accessToken: string,
    refreshToken: string,
) {
    if (!body) {
        return body;
    }
    if (typeof body === "string") {
        try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            if (accessToken && !String(parsed[ACCESS_TOKEN_BODY_FIELD] || "").trim()) {
                parsed[ACCESS_TOKEN_BODY_FIELD] = accessToken;
            }
            if (refreshToken && !String(parsed[REFRESH_TOKEN_BODY_FIELD] || "").trim()) {
                parsed[REFRESH_TOKEN_BODY_FIELD] = refreshToken;
            }
            return JSON.stringify(parsed);
        }
        catch {
            return body;
        }
    }
    if (body instanceof FormData) {
        const hasAccessField = ACCESS_TOKEN_BODY_KEYS.some((key) => {
            const value = body.get(key);
            return typeof value === "string" && value.trim().length > 0;
        });
        const hasRefreshField = REFRESH_TOKEN_BODY_KEYS.some((key) => {
            const value = body.get(key);
            return typeof value === "string" && value.trim().length > 0;
        });
        if (accessToken && !hasAccessField) {
            body.append(ACCESS_TOKEN_BODY_FIELD, accessToken);
        }
        if (refreshToken && !hasRefreshField) {
            body.append(REFRESH_TOKEN_BODY_FIELD, refreshToken);
        }
    }
    return body;
}

function appendSessionTokensToUrl(
    input: RequestInfo | URL,
    accessToken: string,
    refreshToken: string,
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
    if (refreshToken && !url.searchParams.has(REFRESH_TOKEN_BODY_FIELD)) {
        url.searchParams.set(REFRESH_TOKEN_BODY_FIELD, refreshToken);
    }
    if (accessToken && !isOversizedBearerToken(accessToken) && !url.searchParams.has(ACCESS_TOKEN_BODY_FIELD)) {
        url.searchParams.set(ACCESS_TOKEN_BODY_FIELD, accessToken);
    }
    return url.toString();
}

export async function authFetch(
    supabase: SupabaseClient,
    input: RequestInfo | URL,
    init: AuthFetchInit = {},
) {
    const { requireSession = false, ...fetchInit } = init;
    const { accessToken, refreshToken, error } = await readSessionAccessToken(supabase, {
        allowRefresh: requireSession,
    });

    if (!accessToken && !refreshToken) {
        if (requireSession) {
            throw new Error(
                error?.message
                    || `Missing session access_token from ${ACCESS_TOKEN_SOURCE}. Sign in again.`,
            );
        }
        return fetch(input, {
            ...fetchInit,
            credentials: "omit",
        });
    }

    const headers = buildAuthHeaders(fetchInit, accessToken, refreshToken);
    const body = attachSessionTokensToBody(fetchInit.body ?? null, accessToken, refreshToken);
    const requestUrl = appendSessionTokensToUrl(input, accessToken, refreshToken);
    return fetch(requestUrl, {
        method: fetchInit.method,
        body,
        cache: fetchInit.cache,
        signal: fetchInit.signal,
        referrer: fetchInit.referrer,
        mode: fetchInit.mode,
        redirect: fetchInit.redirect,
        headers,
        credentials: "omit",
    });
}
