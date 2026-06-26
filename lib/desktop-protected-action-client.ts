/** DESKTOP ONLY — same-origin protected /api action client (Like, Follow, Save, Playlist, Delete). */

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAccessTokenFromSession, SESSION_EXPIRED_MESSAGE } from "./desktop-auth-recovery-gate";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";

export { SESSION_EXPIRED_MESSAGE };

const API_AUTH_FAILED_MESSAGE = "API request could not authenticate. Please retry.";

const STRIPPED_REQUEST_HEADERS = new Set([
    "authorization",
    "apikey",
    "x-supabase-auth",
    "x-session",
    "x-user",
    "x-refresh-token",
]);

export type DesktopProtectedActionFetchInit = Omit<RequestInit, "credentials"> & {
    /** When true, missing access tokens throw instead of sending an unauthenticated request. */
    requireAuth?: boolean;
};

export type DesktopProtectedActionClientConfig = {
    supabase: SupabaseClient;
    readAccessToken: () => string;
};

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function getTokenTail(token: string) {
    return token ? token.slice(-8) : "";
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

function buildProtectedActionHeaders(init: RequestInit | undefined, accessToken: string) {
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

function buildProtectedActionRequest(path: string, fetchInit: RequestInit, accessToken: string) {
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
            headers: buildProtectedActionHeaders(fetchInit, accessToken),
            credentials: "omit" as RequestCredentials,
        },
    };
}

async function refreshSupabaseAccessToken(supabase: SupabaseClient) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
        return "";
    }
    return readAccessTokenFromSession(data.session);
}

async function resolveDesktopActionAccessToken(
    config: DesktopProtectedActionClientConfig,
    options: { forceRefresh?: boolean } = {},
) {
    const immediateToken = config.readAccessToken().trim();
    if (immediateToken && !options.forceRefresh) {
        return immediateToken;
    }

    const { data: { session } } = await config.supabase.auth.getSession();
    let accessToken = readAccessTokenFromSession(session);
    if (accessToken && !options.forceRefresh) {
        return accessToken;
    }

    if (options.forceRefresh && session?.refresh_token) {
        accessToken = await refreshSupabaseAccessToken(config.supabase);
        if (accessToken) {
            return accessToken;
        }
    }

    return readAccessTokenFromSession(session);
}

export function createDesktopProtectedActionClient(config: DesktopProtectedActionClientConfig) {
    return async function desktopProtectedActionFetch(
        path: string,
        init: DesktopProtectedActionFetchInit = {},
    ) {
        const { requireAuth = true, ...fetchInit } = init;
        const requestPath = assertDesktopRelativeApiPath(path);

        let accessToken = await resolveDesktopActionAccessToken(config);
        if (!accessToken) {
            if (requireAuth) {
                throw new Error(API_AUTH_FAILED_MESSAGE);
            }
            return fetch(requestPath, {
                ...fetchInit,
                credentials: "omit",
            });
        }

        const request = buildProtectedActionRequest(requestPath, fetchInit, accessToken);
        let response = await fetch(request.path, request.init);
        if (response.status !== 401) {
            return response;
        }

        const retryToken = await resolveDesktopActionAccessToken(config, { forceRefresh: true });
        if (!retryToken) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }

        console.info("[desktopProtectedActionFetch] Protected API retry token", {
            previousTokenTail: getTokenTail(accessToken),
            retryTokenTail: getTokenTail(retryToken),
            tokenChanged: getTokenTail(accessToken) !== getTokenTail(retryToken),
        });

        const retryRequest = buildProtectedActionRequest(requestPath, fetchInit, retryToken);
        response = await fetch(retryRequest.path, retryRequest.init);
        if (response.status === 401 && requireAuth) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }
        return response;
    };
}

export type DesktopProtectedActionFetch = ReturnType<typeof createDesktopProtectedActionClient>;
