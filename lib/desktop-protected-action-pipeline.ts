/** DESKTOP ONLY — single protected request pipeline. Fresh getSession() before every dispatch. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readRefreshTokenFromSession } from "./client-api-auth";
import {
    createBlockedProtectedResponse,
    guardDesktopProtectedAction,
    isDesktopProtectedActionsEnabled,
} from "./desktop-protected-action-gate";
import {
    getDesktopAuthenticatedSession,
    getDesktopAuthenticatedSessionSnapshot,
    isDesktopApiReady,
    isDesktopAuthenticatedSessionReady,
    publishDesktopApiCredentials,
    requireDesktopAuthenticatedAccessToken,
} from "./desktop-authenticated-session";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken } from "./session-token-limits";

export const DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE = "Log in to continue.";
export const DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS = 494;
export const DESKTOP_PROTECTED_API_SESSION_MESSAGE = "Session expired. Please log in again.";

/** Shared protected write/read endpoints — one pipeline for all. */
export const DESKTOP_PROTECTED_ENDPOINTS = [
    "/api/song-likes",
    "/api/library/save",
    "/api/playlists",
    "/api/artist-follow",
    "/api/video-upload",
] as const;

export const DESKTOP_PROTECTED_LIBRARY_API_PATHS = [
    "/api/song-likes",
    "/api/library-saves",
    "/api/library/save",
    "/api/artist-follows",
    "/api/artist-follow",
    "/api/playlists",
    "/api/video-upload",
] as const;

const DEBUG_PREFIX = "[desktop-protected-request]";
const TOKEN_EXPIRY_SKEW_MS = 30_000;

const PROTECTED_FETCH_DEFAULTS = {
    mode: "same-origin" as RequestMode,
    redirect: "error" as RequestRedirect,
    credentials: "same-origin" as RequestCredentials,
};

const STRIPPED_REQUEST_HEADERS = new Set([
    "authorization",
    "apikey",
    "x-supabase-auth",
    "x-session",
    "x-user",
    "x-refresh-token",
    "x-supabase-refresh-token",
]);

export type DesktopProtectedActionPipelineConfig = {
    supabase: SupabaseClient;
    /** Optional React sync only — never used for bearer resolution. */
    readAuthSession?: () => Session | null;
    writeAuthSession?: (session: Session) => void;
};

/** @deprecated alias */
export type DesktopProtectedApiPipelineConfig = DesktopProtectedActionPipelineConfig;

export type DesktopProtectedActionFetchInit = Omit<RequestInit, "credentials"> & {
    requireAuth?: boolean;
    injectAuthenticatedUserId?: boolean;
};

/** @deprecated aliases */
export type DesktopProtectedApiFetchInit = DesktopProtectedActionFetchInit;
export type DesktopAuthenticatedFetchInit = DesktopProtectedActionFetchInit;
export type DesktopProtectedActionClientConfig = DesktopProtectedActionPipelineConfig;
export type DesktopAuthBootstrapConfig = DesktopProtectedActionPipelineConfig;
export type DesktopAuthenticatedRequestConfig = DesktopProtectedActionPipelineConfig;

export type DesktopProtectedActionCredentials = {
    session: Session;
    userId: string;
    accessToken: string;
};

/** @deprecated alias */
export type DesktopProtectedApiCredentials = DesktopProtectedActionCredentials;

function debugProtectedRequest(step: string, details: Record<string, unknown>) {
    console.log(DEBUG_PREFIX, step, details);
}

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function readLiveAccessToken(session: Session | null | undefined) {
    const raw = typeof session?.access_token === "string" ? session.access_token.trim() : "";
    if (!raw || !raw.startsWith("eyJ") || raw.split(".").length !== 3) {
        return "";
    }
    if (isOversizedBearerToken(raw)) {
        return "";
    }
    return raw;
}

function readUserIdFromAccessToken(accessToken: string) {
    try {
        const payload = accessToken.split(".")[1];
        if (!payload) {
            return "";
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const json = JSON.parse(atob(padded)) as { sub?: string };
        return String(json.sub || "").trim();
    }
    catch {
        return "";
    }
}

function isAccessTokenExpired(session: Session | null | undefined) {
    if (!session) {
        return true;
    }
    const accessToken = readLiveAccessToken(session);
    if (!accessToken) {
        return true;
    }
    if (typeof session.expires_at === "number") {
        return session.expires_at * 1000 <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
    }
    try {
        const payload = accessToken.split(".")[1];
        if (!payload) {
            return true;
        }
        const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const json = JSON.parse(atob(padded)) as { exp?: number };
        if (typeof json.exp === "number") {
            return json.exp * 1000 <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
        }
    }
    catch {
        return true;
    }
    return false;
}

function credentialsFromSession(session: Session | null | undefined): DesktopProtectedActionCredentials | null {
    if (!session) {
        return null;
    }
    const accessToken = readLiveAccessToken(session);
    if (!accessToken) {
        return null;
    }
    const userId = readUserIdFromAccessToken(accessToken) || String(session.user?.id || "").trim();
    if (!userId) {
        return null;
    }
    return {
        session: session.user?.id ? session : { ...session, user: { id: userId } as Session["user"] },
        userId,
        accessToken,
    };
}

function publishLiveSession(config: DesktopProtectedActionPipelineConfig | undefined, session: Session) {
    config?.writeAuthSession?.(session);
}

/**
 * Acquire credentials from the globally published authenticated session.
 * Protected requests are blocked until auth bootstrap publishes one bearer.
 */
export async function acquireFreshDesktopProtectedCredentials(
    supabase: SupabaseClient,
    options: { debugLabel?: string; writeAuthSession?: (session: Session) => void } = {},
): Promise<DesktopProtectedActionCredentials> {
    const label = options.debugLabel || "acquire";

    if (!isDesktopApiReady() || !isDesktopAuthenticatedSessionReady()) {
        debugProtectedRequest("abort-no-session", { label, reason: "auth-bootstrap-not-ready" });
        throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
    }

    let session = getDesktopAuthenticatedSession();
    let credentials = credentialsFromSession(session);

    debugProtectedRequest("global-session", {
        label,
        sessionExists: Boolean(session),
        accessTokenPresent: Boolean(credentials?.accessToken),
    });

    if (!credentials || isAccessTokenExpired(session)) {
        const refreshToken = readRefreshTokenFromSession(session);
        if (!refreshToken) {
            debugProtectedRequest("abort-no-session", { label, reason: "missing-refresh-token" });
            throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
        }

        debugProtectedRequest("refreshSession-once", { label });
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession({
            refresh_token: refreshToken,
        });

        if (refreshError || !refreshed.session) {
            debugProtectedRequest("abort-no-session", {
                label,
                reason: "refresh-failed",
                error: refreshError?.message || "no-session-after-refresh",
            });
            throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
        }

        session = refreshed.session;
        credentials = credentialsFromSession(session);
        if (session && credentials) {
            publishDesktopApiCredentials(session);
            publishLiveSession({ supabase, writeAuthSession: options.writeAuthSession }, session);
        }
    }

    if (!credentials) {
        debugProtectedRequest("abort-no-session", { label, reason: "missing-bearer-after-refresh" });
        throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
    }

    const accessToken = requireDesktopAuthenticatedAccessToken(label);
    if (!accessToken || accessToken !== credentials.accessToken) {
        const snapshot = getDesktopAuthenticatedSessionSnapshot();
        if (snapshot) {
            credentials = {
                session: snapshot.session,
                userId: snapshot.userId,
                accessToken: snapshot.accessToken,
            };
        }
    }

    debugProtectedRequest("session-ready", {
        label,
        sessionExists: true,
        accessTokenPresent: true,
        userId: credentials.userId,
    });

    return credentials;
}

/** @deprecated alias — always fresh getSession; returns null when no live session. */
export async function resolveLiveDesktopProtectedActionCredentials(
    config: DesktopProtectedActionPipelineConfig,
    options: { debugLabel?: string } = {},
): Promise<DesktopProtectedActionCredentials | null> {
    try {
        return await acquireFreshDesktopProtectedCredentials(config.supabase, {
            debugLabel: options.debugLabel,
            writeAuthSession: config.writeAuthSession,
        });
    }
    catch {
        return null;
    }
}

/** @deprecated alias */
export const resolveDesktopProtectedApiCredentials = resolveLiveDesktopProtectedActionCredentials;

/** @deprecated alias */
export async function resolveLiveProtectedApiSession(
    config: DesktopProtectedActionPipelineConfig,
): Promise<Session | null> {
    try {
        const credentials = await acquireFreshDesktopProtectedCredentials(config.supabase, {
            writeAuthSession: config.writeAuthSession,
        });
        return credentials.session;
    }
    catch {
        return null;
    }
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

function copyPreservedHeaders(target: Headers, source: HeadersInit | undefined) {
    if (!source) {
        return;
    }
    const incoming = new Headers(source);
    incoming.forEach((value, key) => {
        if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
            target.set(key, value);
        }
    });
}

export function buildFreshProtectedApiHeaders(init: RequestInit | undefined, accessToken: string) {
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

function injectAuthenticatedUserIdIntoJsonBody(body: BodyInit | null | undefined, userId: string): BodyInit | null {
    if (!body || typeof body !== "string") {
        return body ?? null;
    }
    try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        parsed.userId = userId;
        parsed.user_id = userId;
        return JSON.stringify(parsed);
    }
    catch {
        return body;
    }
}

/**
 * Shared protected request helper — fresh session + bearer headers on every call.
 */
export async function executeDesktopProtectedRequest(
    supabase: SupabaseClient,
    path: string,
    init: RequestInit & { injectAuthenticatedUserId?: boolean; writeAuthSession?: (session: Session) => void } = {},
): Promise<Response> {
    const requestPath = stripSessionTokensFromRelativePath(path);

    if (!guardDesktopProtectedAction(requestPath)) {
        debugProtectedRequest("blocked", { path: requestPath, reason: "global-session-not-ready" });
        return createBlockedProtectedResponse();
    }

    const credentials = await acquireFreshDesktopProtectedCredentials(supabase, {
        debugLabel: requestPath,
        writeAuthSession: init.writeAuthSession,
    });

    let body: BodyInit | null = init.body ?? null;
    if (init.injectAuthenticatedUserId) {
        body = injectAuthenticatedUserIdIntoJsonBody(body, credentials.userId);
    }

    const headers = buildFreshProtectedApiHeaders(init, credentials.accessToken);
    debugProtectedRequest("request-dispatched", {
        path: requestPath,
        method: init.method || "GET",
        sessionExists: true,
        accessTokenPresent: true,
        authorizationAdded: headers.has("Authorization"),
        apikeyAdded: headers.has("apikey"),
    });

    try {
        return await fetch(requestPath, {
            method: init.method,
            body: stripSessionTokensFromBody(body),
            cache: init.cache,
            signal: init.signal,
            referrer: init.referrer,
            ...PROTECTED_FETCH_DEFAULTS,
            headers,
        });
    }
    catch (error) {
        if (error instanceof TypeError && error.message.toLowerCase().includes("redirect")) {
            throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
        }
        throw error;
    }
}

export function hasValidDesktopSupabaseSession(session: Session | null | undefined) {
    return Boolean(session && readLiveAccessToken(session) && !isAccessTokenExpired(session));
}

/** @deprecated — single acquire, no polling. */
export async function waitForDesktopApiCredentials(
    config: DesktopProtectedActionPipelineConfig,
    _timeoutMs?: number,
) {
    try {
        return await acquireFreshDesktopProtectedCredentials(config.supabase, {
            writeAuthSession: config.writeAuthSession,
        });
    }
    catch {
        return null;
    }
}

export function createDesktopProtectedActionFetch(config: DesktopProtectedActionPipelineConfig) {
    return async function desktopProtectedActionFetch(
        path: string,
        init: DesktopProtectedActionFetchInit = {},
    ) {
        const {
            requireAuth = true,
            injectAuthenticatedUserId = false,
            ...fetchInit
        } = init;
        const requestPath = stripSessionTokensFromRelativePath(path);

        if (!requireAuth) {
            return fetch(requestPath, {
                ...fetchInit,
                ...PROTECTED_FETCH_DEFAULTS,
            });
        }

        if (!isDesktopProtectedActionsEnabled()) {
            debugProtectedRequest("blocked", { path: requestPath, reason: "global-session-not-ready" });
            return createBlockedProtectedResponse();
        }

        let response = await executeDesktopProtectedRequest(config.supabase, requestPath, {
            ...fetchInit,
            injectAuthenticatedUserId,
            writeAuthSession: config.writeAuthSession,
        });

        if (response.status === 401 || response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
            if (!isDesktopProtectedActionsEnabled()) {
                return createBlockedProtectedResponse();
            }
            debugProtectedRequest("401-retry", { path: requestPath, status: response.status });
            response = await executeDesktopProtectedRequest(config.supabase, requestPath, {
                ...fetchInit,
                injectAuthenticatedUserId,
                writeAuthSession: config.writeAuthSession,
            });

            if (response.status === 401 || response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
                const errorBody = (await response.clone().json().catch(() => ({}))) as { error?: string };
                console.warn(`${DEBUG_PREFIX} request rejected after retry`, {
                    path: requestPath,
                    method: fetchInit.method || "GET",
                    status: response.status,
                    error: errorBody.error || response.statusText,
                });
                throw new Error(errorBody.error || DESKTOP_PROTECTED_API_SESSION_MESSAGE);
            }
        }

        return response;
    };
}

/** @deprecated aliases */
export const createDesktopProtectedApiFetch = createDesktopProtectedActionFetch;
export const createDesktopAuthenticatedFetch = createDesktopProtectedActionFetch;
export const createDesktopProtectedActionClient = createDesktopProtectedActionFetch;

export type DesktopProtectedActionFetch = ReturnType<typeof createDesktopProtectedActionFetch>;
export type DesktopProtectedApiFetch = DesktopProtectedActionFetch;
export type DesktopAuthenticatedFetch = DesktopProtectedActionFetch;

/** @deprecated */
export type DesktopResolveCredentialsOptions = {
    forceRefresh?: boolean;
    authMode?: string;
};

/** @deprecated alias */
export async function resolveDesktopAuthenticatedCredentials(
    config: DesktopProtectedActionPipelineConfig,
    _options?: DesktopResolveCredentialsOptions,
) {
    try {
        const credentials = await acquireFreshDesktopProtectedCredentials(config.supabase, {
            writeAuthSession: config.writeAuthSession,
        });
        return {
            session: credentials.session,
            userId: credentials.userId,
            transport: { kind: "bearer" as const, accessToken: credentials.accessToken },
        };
    }
    catch {
        return null;
    }
}

/** @deprecated */
export type DesktopAuthTransport = { kind: "bearer"; accessToken: string };

/** @deprecated */
export type DesktopAuthenticatedCredentials = {
    session: Session;
    userId: string;
    transport: DesktopAuthTransport;
};

export function createDesktopProtectedActionPipeline(config: DesktopProtectedActionPipelineConfig) {
    const fetch = createDesktopProtectedActionFetch(config);
    return {
        fetch,
        waitForApiCredentials: () => waitForDesktopApiCredentials(config),
        resolveCredentials: (options?: DesktopResolveCredentialsOptions) =>
            resolveDesktopAuthenticatedCredentials(config, options),
        resolveProtectedCredentials: () => acquireFreshDesktopProtectedCredentials(config.supabase, {
            writeAuthSession: config.writeAuthSession,
        }).catch(() => null),
        resolveLiveUserId: async () => {
            try {
                const credentials = await acquireFreshDesktopProtectedCredentials(config.supabase, {
                    writeAuthSession: config.writeAuthSession,
                });
                return credentials.userId;
            }
            catch {
                return "";
            }
        },
        executeProtectedRequest: (path: string, init?: RequestInit & { injectAuthenticatedUserId?: boolean }) =>
            executeDesktopProtectedRequest(config.supabase, path, {
                ...init,
                writeAuthSession: config.writeAuthSession,
            }),
    };
}

/** @deprecated alias */
export const createDesktopProtectedApiRuntime = createDesktopProtectedActionPipeline;
export const createDesktopAuthBootstrapRuntime = createDesktopProtectedActionPipeline;

/** @deprecated — storage hydration removed; uses live getSession only. */
export async function hydrateSupabaseClientFromStorage(
    config: DesktopProtectedActionPipelineConfig,
): Promise<Session | null> {
    try {
        const credentials = await acquireFreshDesktopProtectedCredentials(config.supabase, {
            writeAuthSession: config.writeAuthSession,
        });
        return credentials.session;
    }
    catch {
        return null;
    }
}
