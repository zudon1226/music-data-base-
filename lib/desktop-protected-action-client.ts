/** DESKTOP ONLY — same-origin protected /api action client (Like, Follow, Save, Playlist, Delete). */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readRefreshTokenFromSession } from "./client-api-auth";
import {
    isCorruptedDesktopAccessToken,
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

/** Vercel/nginx rejects the request before Next.js when Authorization exceeds header limits. */
export const DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS = 494;

const STRIPPED_REQUEST_HEADERS = new Set([
    "authorization",
    "apikey",
    "x-supabase-auth",
    "x-session",
    "x-user",
    "x-refresh-token",
    SUPABASE_REFRESH_TOKEN_HEADER.toLowerCase(),
]);

export type DesktopProtectedActionFetchInit = Omit<RequestInit, "credentials"> & {
    /** When true, missing access tokens throw instead of sending an unauthenticated request. */
    requireAuth?: boolean;
};

export type DesktopProtectedActionClientConfig = {
    supabase: SupabaseClient;
    readAccessToken: () => string;
    readAuthSession?: () => Session | null;
};

type ProtectedActionAuthTransport =
    | { kind: "bearer"; accessToken: string }
    | { kind: "refresh"; refreshToken: string };

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function getTokenTail(token: string) {
    return token ? token.slice(-8) : "";
}

function readRawAccessToken(session: Session | null | undefined) {
    return typeof session?.access_token === "string" ? session.access_token.trim() : "";
}

function sessionRequiresRefreshHeaderAuth(session: Session | null | undefined) {
    const raw = readRawAccessToken(session);
    if (!raw) {
        return false;
    }
    return isOversizedBearerToken(raw) || isCorruptedDesktopAccessToken(raw);
}

function readSafeBearerToken(session: Session | null | undefined) {
    return readAccessTokenFromSession(session);
}

function readSafeBearerFromString(token: string) {
    const trimmed = token.trim();
    if (!trimmed) {
        return "";
    }
    return readAccessTokenFromSession({ access_token: trimmed } as Session);
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

function buildProtectedActionHeaders(init: RequestInit | undefined, transport: ProtectedActionAuthTransport) {
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

function buildProtectedActionRequest(path: string, fetchInit: RequestInit, transport: ProtectedActionAuthTransport) {
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
            headers: buildProtectedActionHeaders(fetchInit, transport),
            credentials: "omit" as RequestCredentials,
        },
    };
}

async function refreshSupabaseSession(supabase: SupabaseClient) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
        return null;
    }
    return data.session ?? null;
}

function resolveTransportFromSession(
    session: Session | null | undefined,
    options: { preferRefreshHeader?: boolean } = {},
): ProtectedActionAuthTransport | null {
    if (options.preferRefreshHeader || sessionRequiresRefreshHeaderAuth(session)) {
        const refreshToken = readRefreshTokenFromSession(session);
        if (refreshToken) {
            return { kind: "refresh", refreshToken };
        }
    }

    const accessToken = readSafeBearerToken(session);
    if (accessToken) {
        return { kind: "bearer", accessToken };
    }

    const refreshToken = readRefreshTokenFromSession(session);
    if (refreshToken) {
        return { kind: "refresh", refreshToken };
    }

    return null;
}

async function resolveProtectedActionAuthTransport(
    config: DesktopProtectedActionClientConfig,
    options: { forceRefresh?: boolean; preferRefreshHeader?: boolean } = {},
): Promise<ProtectedActionAuthTransport | null> {
    const readSession = config.readAuthSession ?? (() => null);

    if (!options.forceRefresh && !options.preferRefreshHeader) {
        const immediateToken = readSafeBearerFromString(config.readAccessToken());
        if (immediateToken) {
            return { kind: "bearer", accessToken: immediateToken };
        }

        const contextTransport = resolveTransportFromSession(readSession(), options);
        if (contextTransport) {
            return contextTransport;
        }
    }

    const { data: { session: storedSession } } = await config.supabase.auth.getSession();
    if (storedSession && !options.forceRefresh) {
        const storedTransport = resolveTransportFromSession(storedSession, options);
        if (storedTransport) {
            return storedTransport;
        }
    }

    const shouldRefresh = options.forceRefresh
        || options.preferRefreshHeader
        || sessionRequiresRefreshHeaderAuth(storedSession)
        || sessionRequiresRefreshHeaderAuth(readSession());

    if (shouldRefresh) {
        const refreshedSession = await refreshSupabaseSession(config.supabase);
        const refreshedTransport = resolveTransportFromSession(refreshedSession, options);
        if (refreshedTransport) {
            return refreshedTransport;
        }
    }

    return resolveTransportFromSession(storedSession || readSession(), {
        preferRefreshHeader: options.preferRefreshHeader || shouldRefresh,
    });
}

function shouldRetryProtectedActionResponse(status: number, preferRefreshHeader: boolean) {
    if (status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
        return true;
    }
    if (status === 401 && !preferRefreshHeader) {
        return true;
    }
    return false;
}

export function createDesktopProtectedActionClient(config: DesktopProtectedActionClientConfig) {
    return async function desktopProtectedActionFetch(
        path: string,
        init: DesktopProtectedActionFetchInit = {},
    ) {
        const { requireAuth = true, ...fetchInit } = init;
        const requestPath = assertDesktopRelativeApiPath(path);

        const transport = await resolveProtectedActionAuthTransport(config);
        if (!transport) {
            if (requireAuth) {
                throw new Error(API_AUTH_FAILED_MESSAGE);
            }
            return fetch(requestPath, {
                ...fetchInit,
                credentials: "omit",
            });
        }

        const request = buildProtectedActionRequest(requestPath, fetchInit, transport);
        let response = await fetch(request.path, request.init);

        if (response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
            console.warn("[desktopProtectedActionFetch] REQUEST_HEADER_TOO_LARGE (494) — retrying with refresh-token header auth", {
                path: requestPath,
                transport: transport.kind,
            });
        }

        const preferRefreshHeader = response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS
            || transport.kind === "bearer" && sessionRequiresRefreshHeaderAuth(config.readAuthSession?.() ?? null);

        if (!shouldRetryProtectedActionResponse(response.status, preferRefreshHeader)) {
            return response;
        }

        const retryTransport = await resolveProtectedActionAuthTransport(config, {
            forceRefresh: response.status !== DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS,
            preferRefreshHeader: true,
        });

        if (!retryTransport) {
            if (requireAuth) {
                throw new Error(SESSION_EXPIRED_MESSAGE);
            }
            return response;
        }

        console.info("[desktopProtectedActionFetch] Protected API retry auth transport", {
            path: requestPath,
            previousTransport: transport.kind,
            retryTransport: retryTransport.kind,
            previousTokenTail: transport.kind === "bearer" ? getTokenTail(transport.accessToken) : "",
            retryTokenTail: retryTransport.kind === "bearer" ? getTokenTail(retryTransport.accessToken) : getTokenTail(retryTransport.refreshToken),
        });

        const retryRequest = buildProtectedActionRequest(requestPath, fetchInit, retryTransport);
        response = await fetch(retryRequest.path, retryRequest.init);

        if ((response.status === 401 || response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) && requireAuth) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }

        return response;
    };
}

export type DesktopProtectedActionFetch = ReturnType<typeof createDesktopProtectedActionClient>;
