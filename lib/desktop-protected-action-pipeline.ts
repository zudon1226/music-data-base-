/** DESKTOP ONLY — live-session protected action pipeline (Like, Follow, Save, Playlist). */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readStoredAuthSession } from "./auth-session";
import {
    clearDesktopAuthRecoveryGate,
    noteValidatedDesktopSession,
} from "./desktop-auth-recovery-gate";
import { isDesktopVideoUploadLifecycleActive } from "./desktop-video-upload-lifecycle";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken } from "./session-token-limits";

export const DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE = "Log in to continue.";
export const DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS = 494;
export const DESKTOP_PROTECTED_API_SESSION_MESSAGE = "Session expired. Please log in again.";

export const DESKTOP_PROTECTED_LIBRARY_API_PATHS = [
    "/api/song-likes",
    "/api/library-saves",
    "/api/library/save",
    "/api/artist-follows",
    "/api/artist-follow",
    "/api/playlists",
] as const;

const DEBUG_PREFIX = "[desktop-protected-action]";
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
    /** Upload lifecycle only — never used for bearer resolution on protected writes. */
    readAuthSession?: () => Session | null;
    writeAuthSession?: (session: Session) => void;
};

/** @deprecated alias */
export type DesktopProtectedApiPipelineConfig = DesktopProtectedActionPipelineConfig;

export type DesktopProtectedActionFetchInit = Omit<RequestInit, "credentials"> & {
    requireAuth?: boolean;
    /** Merge JWT user id into JSON body as userId and user_id before dispatch. */
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

function debugProtectedAction(step: string, details: Record<string, unknown>) {
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

function normalizeSessionUser(session: Session, userId: string) {
    if (session.user?.id) {
        return session;
    }
    return {
        ...session,
        user: { id: userId } as Session["user"],
    };
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
        session: normalizeSessionUser(session, userId),
        userId,
        accessToken,
    };
}

function publishFreshDesktopSession(config: DesktopProtectedActionPipelineConfig, session: Session) {
    clearDesktopAuthRecoveryGate(session);
    noteValidatedDesktopSession(session);
    config.writeAuthSession?.(session);
}

async function readCurrentSupabaseSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.warn(`${DEBUG_PREFIX} getSession failed`, error.message);
    }
    return session ?? null;
}

async function hydrateSupabaseClientFromStorage(
    config: DesktopProtectedActionPipelineConfig,
): Promise<Session | null> {
    const stored = readStoredAuthSession();
    const refreshToken = typeof stored?.refresh_token === "string" ? stored.refresh_token.trim() : "";
    if (!refreshToken) {
        return null;
    }

    debugProtectedAction("hydrate-from-storage", {
        hasStoredSession: Boolean(stored),
        hasRefreshToken: true,
    });

    const accessToken = typeof stored?.access_token === "string" ? stored.access_token.trim() : "";
    const { data, error } = await config.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    });

    if (error) {
        console.warn(`${DEBUG_PREFIX} setSession from storage failed`, error.message);
        const refreshed = await config.supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (refreshed.error) {
            console.warn(`${DEBUG_PREFIX} refreshSession(refresh_token) failed`, refreshed.error.message);
            return null;
        }
        const session = refreshed.data.session ?? null;
        if (session) {
            publishFreshDesktopSession(config, session);
        }
        return session;
    }

    const session = data.session ?? null;
    if (session) {
        publishFreshDesktopSession(config, session);
    }
    return session;
}

async function readLiveSupabaseSession(config: DesktopProtectedActionPipelineConfig) {
    let session = await readCurrentSupabaseSession(config.supabase);
    if (session?.refresh_token || readLiveAccessToken(session)) {
        return session;
    }
    return hydrateSupabaseClientFromStorage(config);
}

async function refreshCurrentSupabaseSession(
    config: DesktopProtectedActionPipelineConfig,
): Promise<Session | null> {
    const stored = readStoredAuthSession();
    const refreshToken = typeof stored?.refresh_token === "string" ? stored.refresh_token.trim() : "";
    const { data, error } = refreshToken
        ? await config.supabase.auth.refreshSession({ refresh_token: refreshToken })
        : await config.supabase.auth.refreshSession();
    if (error) {
        console.warn(`${DEBUG_PREFIX} refreshSession failed`, error.message);
        return null;
    }
    const session = data.session ?? null;
    if (session) {
        publishFreshDesktopSession(config, session);
    }
    return session;
}

/**
 * Resolve live credentials for one protected action.
 * Always getSession() first; refresh once when bearer is missing or expired.
 */
export async function resolveLiveDesktopProtectedActionCredentials(
    config: DesktopProtectedActionPipelineConfig,
    options: { debugLabel?: string } = {},
): Promise<DesktopProtectedActionCredentials | null> {
    const label = options.debugLabel || "resolve";

    if (isDesktopVideoUploadLifecycleActive()) {
        const uploadCredentials = credentialsFromSession(config.readAuthSession?.() ?? null);
        debugProtectedAction("upload-lifecycle-session", {
            label,
            sessionExists: Boolean(uploadCredentials?.session),
            accessTokenPresent: Boolean(uploadCredentials?.accessToken),
        });
        return uploadCredentials;
    }

    let session = await readLiveSupabaseSession(config);
    debugProtectedAction("getSession", {
        label,
        sessionExists: Boolean(session),
        accessTokenPresent: Boolean(readLiveAccessToken(session)),
    });

    let credentials = credentialsFromSession(session);
    const needsRefresh = !credentials || isAccessTokenExpired(session);

    if (credentials && !needsRefresh) {
        publishFreshDesktopSession(config, credentials.session);
        debugProtectedAction("session-ready", {
            label,
            sessionExists: true,
            accessTokenPresent: true,
            userId: credentials.userId,
        });
        return credentials;
    }

    debugProtectedAction("refreshSession", {
        label,
        reason: credentials ? "expired-bearer" : "missing-bearer",
    });

    session = await refreshCurrentSupabaseSession(config);
    credentials = credentialsFromSession(session);

    debugProtectedAction("after-refresh", {
        label,
        sessionExists: Boolean(session),
        accessTokenPresent: Boolean(credentials?.accessToken),
        userId: credentials?.userId || "",
    });

    return credentials;
}

/** @deprecated alias */
export const resolveDesktopProtectedApiCredentials = resolveLiveDesktopProtectedActionCredentials;

/** @deprecated alias */
export async function resolveLiveProtectedApiSession(
    config: DesktopProtectedActionPipelineConfig,
): Promise<Session | null> {
    const credentials = await resolveLiveDesktopProtectedActionCredentials(config);
    return credentials?.session ?? null;
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

function buildFreshProtectedApiHeaders(init: RequestInit | undefined, accessToken: string) {
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

async function sendProtectedApiRequest(
    requestPath: string,
    fetchInit: RequestInit,
    accessToken: string,
) {
    const headers = buildFreshProtectedApiHeaders(fetchInit, accessToken);
    debugProtectedAction("request-dispatched", {
        path: requestPath,
        method: fetchInit.method || "GET",
        sessionExists: true,
        accessTokenPresent: true,
        authorizationAdded: headers.has("Authorization"),
        apikeyAdded: headers.has("apikey"),
    });
    try {
        return await fetch(requestPath, {
            method: fetchInit.method,
            body: stripSessionTokensFromBody(fetchInit.body ?? null),
            cache: fetchInit.cache,
            signal: fetchInit.signal,
            referrer: fetchInit.referrer,
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

export async function waitForDesktopApiCredentials(
    config: DesktopProtectedActionPipelineConfig,
    timeoutMs = 8_000,
) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const credentials = await resolveLiveDesktopProtectedActionCredentials(config);
        if (credentials) {
            return credentials;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return null;
}

export function hasValidDesktopSupabaseSession(session: Session | null | undefined) {
    return Boolean(session && readLiveAccessToken(session) && !isAccessTokenExpired(session));
}

function injectAuthenticatedUserIdIntoJsonBody(body: BodyInit | null | undefined, userId: string) {
    if (!body || typeof body !== "string") {
        return body;
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

function prepareProtectedRequestInit(
    fetchInit: RequestInit,
    credentials: DesktopProtectedActionCredentials,
    injectAuthenticatedUserId: boolean,
) {
    if (!injectAuthenticatedUserId) {
        return fetchInit;
    }
    return {
        ...fetchInit,
        body: injectAuthenticatedUserIdIntoJsonBody(fetchInit.body ?? null, credentials.userId),
    };
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

        let credentials = await resolveLiveDesktopProtectedActionCredentials(config, { debugLabel: requestPath });
        if (!credentials) {
            debugProtectedAction("blocked", {
                path: requestPath,
                sessionExists: false,
                accessTokenPresent: false,
                reason: "no-credentials-after-refresh",
            });
            throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
        }

        let requestInit = prepareProtectedRequestInit(fetchInit, credentials, injectAuthenticatedUserId);
        let response = await sendProtectedApiRequest(requestPath, requestInit, credentials.accessToken);

        if (response.status === 401 || response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
            debugProtectedAction("401-retry", { path: requestPath, status: response.status });
            const refreshedSession = await refreshCurrentSupabaseSession(config);
            if (!refreshedSession) {
                throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
            }

            const retryCredentials = credentialsFromSession(refreshedSession);
            if (!retryCredentials) {
                throw new Error(DESKTOP_PROTECTED_API_LOGIN_REQUIRED_MESSAGE);
            }

            requestInit = prepareProtectedRequestInit(fetchInit, retryCredentials, injectAuthenticatedUserId);
            response = await sendProtectedApiRequest(requestPath, requestInit, retryCredentials.accessToken);

            if (response.status === 401 || response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
                const errorBody = (await response.clone().json().catch(() => ({}))) as { error?: string };
                console.warn(`${DEBUG_PREFIX} request rejected after refresh retry`, {
                    path: requestPath,
                    method: fetchInit.method || "GET",
                    bearerTail: retryCredentials.accessToken.slice(-8),
                    userId: retryCredentials.userId,
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

/** @deprecated alias */
export async function resolveDesktopAuthenticatedCredentials(
    config: DesktopProtectedActionPipelineConfig,
) {
    const credentials = await resolveLiveDesktopProtectedActionCredentials(config);
    if (!credentials) {
        return null;
    }
    return {
        session: credentials.session,
        userId: credentials.userId,
        transport: { kind: "bearer" as const, accessToken: credentials.accessToken },
    };
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
        waitForApiCredentials: (timeoutMs?: number) => waitForDesktopApiCredentials(config, timeoutMs),
        resolveCredentials: (_options?: {
            forceRefresh?: boolean;
            authMode?: "bearer-preferred" | "refresh-header-only";
        }) => resolveDesktopAuthenticatedCredentials(config),
        resolveProtectedCredentials: () => resolveLiveDesktopProtectedActionCredentials(config),
        resolveLiveUserId: async () => {
            const credentials = await resolveLiveDesktopProtectedActionCredentials(config);
            return credentials?.userId ?? "";
        },
    };
}

/** @deprecated alias */
export const createDesktopProtectedApiRuntime = createDesktopProtectedActionPipeline;
export const createDesktopAuthBootstrapRuntime = createDesktopProtectedActionPipeline;
