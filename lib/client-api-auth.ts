import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getAuthSession, readStoredAuthSession, SUPABASE_AUTH_STORAGE_KEY } from "./auth-session";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export const ACCESS_TOKEN_SOURCE = "supabase.auth.getSession().session.access_token";
export const SESSION_EXPIRED_MESSAGE = "Session expired. Please log out and log back in, then retry.";
const API_AUTH_FAILED_MESSAGE = "API request could not authenticate. Please retry.";

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
let refreshStartCount = 0;
let refreshFinishCount = 0;

function getTokenTail(token: string) {
    return token ? token.slice(-8) : "";
}

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
    return url.includes("/api/user-music-state")
        || url.includes("/api/library-saves")
        || url.includes("/api/playlists");
}

function parseStoredSessionRaw(raw: string | null): Session | null {
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as { currentSession?: Session } | Session;
        if ("currentSession" in parsed) {
            return parsed.currentSession ?? null;
        }
        return parsed as Session;
    }
    catch {
        return null;
    }
}

function logSessionFallbackSources(
    phase: string,
    getSessionResult: Awaited<ReturnType<SupabaseClient["auth"]["getSession"]>>,
) {
    const getSessionData = getSessionResult.data.session;
    console.log(
        "[SESSION SOURCE] getSession()",
        phase,
        Boolean(getSessionData),
        Boolean(getSessionData?.access_token),
        getSessionData?.user?.id || "",
    );

    const storedSession = readStoredAuthSession();
    console.log(
        "[SESSION SOURCE] readStoredAuthSession()",
        phase,
        Boolean(storedSession),
        Boolean(readAccessTokenFromSession(storedSession)),
        storedSession?.user?.id || "",
    );

    if (typeof window !== "undefined") {
        const localRaw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
        const localSession = parseStoredSessionRaw(localRaw);
        console.log(
            "[SESSION SOURCE] localStorage",
            phase,
            Boolean(localRaw),
            Boolean(readAccessTokenFromSession(localSession)),
            localSession?.user?.id || "",
        );

        const sessionRaw = window.sessionStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
        const browserSession = parseStoredSessionRaw(sessionRaw);
        console.log(
            "[SESSION SOURCE] sessionStorage",
            phase,
            Boolean(sessionRaw),
            Boolean(readAccessTokenFromSession(browserSession)),
            browserSession?.user?.id || "",
        );
    }
}

async function readCurrentSupabaseSession(
    supabase: SupabaseClient,
    options: { debugUrl?: string; phase?: string } = {},
) {
    const phase = options.phase || "readCurrentSupabaseSession";
    const shouldLog = Boolean(options.debugUrl && isProtectedDesktopApiUrl(options.debugUrl));
    const getSessionResult = await supabase.auth.getSession();

    if (shouldLog) {
        console.log(
            "[SESSION CHECK]",
            !!getSessionResult?.data?.session,
            !!getSessionResult?.data?.session?.access_token,
            getSessionResult?.data?.session?.user?.id,
        );
        logSessionFallbackSources(phase, getSessionResult);
    }

    if (getSessionResult.data.session) {
        if (shouldLog) {
            console.log(
                "[SESSION SOURCE] resolved getSession()",
                phase,
                true,
                Boolean(getSessionResult.data.session.access_token),
                getSessionResult.data.session.user?.id || "",
            );
        }
        return getSessionResult.data.session;
    }

    const storedSession = readStoredAuthSession();
    if (shouldLog) {
        if (storedSession) {
            console.log(
                "[SESSION SOURCE] resolved readStoredAuthSession()",
                phase,
                true,
                Boolean(readAccessTokenFromSession(storedSession)),
                storedSession.user?.id || "",
            );
        }
        else {
            console.log("[SESSION SOURCE] resolved none", phase, false, false, "");
        }
    }
    return storedSession;
}

async function readSessionAccessToken(
    supabase: SupabaseClient,
    options: { allowRefresh?: boolean; forceRefresh?: boolean; debugUrl?: string } = {},
) {
    const phase = options.forceRefresh ? "readSessionAccessToken:401-retry" : "readSessionAccessToken:initial";
    let session = await readCurrentSupabaseSession(supabase, { debugUrl: options.debugUrl, phase });
    let error: Error | null = null;
    const shouldRefresh = Boolean(options.allowRefresh && session?.refresh_token)
        && (isAccessTokenExpired(session) || isOversizedBearerToken(readAccessTokenFromSession(session)));

    if (options.forceRefresh || shouldRefresh) {
        try {
            if (!sessionRefreshPromise) {
                refreshStartCount += 1;
                console.info("[authFetch] Supabase refresh start", {
                    refreshStartCount,
                    refreshFinishCount,
                    reason: options.forceRefresh ? "401-retry" : "expired-or-oversized-token",
                });
                sessionRefreshPromise = supabase.auth.refreshSession()
                    .then(async ({ data, error: refreshError }) => {
                    if (refreshError) {
                        error = refreshError;
                    }
                    return data.session ?? (await readCurrentSupabaseSession(supabase, {
                        debugUrl: options.debugUrl,
                        phase: `${phase}:after-refresh`,
                    }));
                })
                    .finally(() => {
                    refreshFinishCount += 1;
                    console.info("[authFetch] Supabase refresh finish", {
                        refreshStartCount,
                        refreshFinishCount,
                    });
                    sessionRefreshPromise = null;
                });
            }
            else {
                console.info("[authFetch] Supabase refresh queued behind active refresh", {
                    refreshStartCount,
                    refreshFinishCount,
                    reason: options.forceRefresh ? "401-retry" : "expired-or-oversized-token",
                });
            }
            const refreshedSession = await sessionRefreshPromise;
            if (refreshedSession) {
                session = refreshedSession;
            }
            else {
                session = await readCurrentSupabaseSession(supabase, {
                    debugUrl: options.debugUrl,
                    phase: `${phase}:refresh-fallback`,
                });
            }
        }
        catch {
            // Keep the existing session; failed refresh must not sign the user out.
        }
    }

    if (!readAccessTokenFromSession(session)) {
        session = await readCurrentSupabaseSession(supabase, {
            debugUrl: options.debugUrl,
            phase: `${phase}:missing-access-token`,
        });
    }

    const accessToken = readAccessTokenFromSession(session);
    const refreshToken = readRefreshTokenFromSession(session);
    if (options.debugUrl && isProtectedDesktopApiUrl(options.debugUrl)) {
        console.log(
            "[SESSION RESULT]",
            phase,
            Boolean(session),
            Boolean(accessToken),
            session?.user?.id || "",
            isOversizedBearerToken(accessToken) ? "oversized-token" : "",
        );
    }
    return {
        session,
        accessToken,
        refreshToken,
        userId: session?.user?.id || "",
        error,
    };
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
    const headers = new Headers();
    copyPreservedHeaders(headers, init?.headers);
    STRIPPED_REQUEST_HEADERS.forEach((headerName) => {
        headers.delete(headerName);
    });

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

function logAuthOutbound(input: RequestInfo | URL, headers: HeadersInit | Headers | undefined) {
    const url = resolveOutboundUrl(input);
    if (!isProtectedDesktopApiUrl(url)) {
        return;
    }
    const headerBag = headers instanceof Headers ? headers : new Headers(headers);
    console.log(
        "[AUTH OUTBOUND]",
        url,
        headerBag.get("Authorization"),
        headerBag.get("apikey"),
    );
}

export async function authFetch(
    supabase: SupabaseClient,
    input: RequestInfo | URL,
    init: AuthFetchInit = {},
) {
    const { requireSession = false, ...fetchInit } = init;
    const debugUrl = resolveOutboundUrl(input);
    const sessionDebugUrl = isProtectedDesktopApiUrl(debugUrl) ? debugUrl : undefined;
    const { session, accessToken } = await readSessionAccessToken(supabase, {
        allowRefresh: true,
        debugUrl: sessionDebugUrl,
    });

    if (!accessToken) {
        if (requireSession) {
            throw new Error(session ? API_AUTH_FAILED_MESSAGE : SESSION_EXPIRED_MESSAGE);
        }
        logAuthOutbound(input, fetchInit.headers);
        return fetch(input, {
            ...fetchInit,
            credentials: "omit",
        });
    }

    const request = buildAuthenticatedRequest(input, fetchInit, accessToken);
    logAuthOutbound(request.input, request.init.headers);
    const response = await fetch(request.input, request.init);
    if (response.status !== 401) {
        return response;
    }

    const refreshed = await readSessionAccessToken(supabase, {
        allowRefresh: true,
        forceRefresh: true,
        debugUrl: sessionDebugUrl,
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
    logAuthOutbound(retryRequest.input, retryRequest.init.headers);
    const retryResponse = await fetch(retryRequest.input, retryRequest.init);
    if (retryResponse.status === 401) {
        const { session: currentSession } = await getAuthSession(supabase);
        if (!currentSession) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }
    }
    return retryResponse;
}
