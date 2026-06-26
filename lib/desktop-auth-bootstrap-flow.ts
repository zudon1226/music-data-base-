/** DESKTOP ONLY — unified authenticated API client and remote bootstrap gate. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readRefreshTokenFromSession } from "./client-api-auth";
import {
    isCorruptedDesktopAccessToken,
    isDesktopAuthRecoveryActive,
    noteValidatedDesktopSession,
    readAccessTokenFromSession,
    SESSION_EXPIRED_MESSAGE,
} from "./desktop-auth-recovery-gate";
import {
    startUserMusicStateBootstrapInBackground,
    type UserMusicStateLoader,
} from "./desktop-user-music-state-bootstrap";
import { ACCESS_TOKEN_BODY_KEYS, REFRESH_TOKEN_BODY_KEYS } from "./request-auth";
import { isOversizedBearerToken, SUPABASE_REFRESH_TOKEN_HEADER } from "./session-token-limits";

export { SESSION_EXPIRED_MESSAGE };

export const DESKTOP_BOOTSTRAP_LOG_PREFIX = "[desktop-bootstrap]";
export const DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS = 494;

const API_AUTH_FAILED_MESSAGE = "API request could not authenticate. Please retry.";
const CREDENTIAL_RESOLVE_TIMEOUT_MS = 10_000;
const SESSION_REFRESH_TIMEOUT_MS = 8_000;
const API_CREDENTIALS_BOOTSTRAP_WAIT_MS = 8_000;
const DEFAULT_STEP_TIMEOUT_MS = 12_000;

export type DesktopAuthBootstrapConfig = {
    supabase: SupabaseClient;
    readAuthSession: () => Session | null;
};

export type DesktopAuthenticatedFetchInit = Omit<RequestInit, "credentials"> & {
    requireAuth?: boolean;
};

export type DesktopAuthTransport =
    | { kind: "bearer"; accessToken: string }
    | { kind: "refresh"; refreshToken: string };

export type DesktopAuthenticatedCredentials = {
    session: Session;
    userId: string;
    transport: DesktopAuthTransport;
};

export type DesktopBootstrapStep =
    | "localStorageHydration"
    | "profileBootstrap"
    | "songLibrary"
    | "videoLibrary"
    | "albums"
    | "librarySaves"
    | "playlists"
    | "producerData"
    | "artistFollows"
    | "songLikes";

export type DesktopRemoteBootstrapActions = {
    clearRemovedPlaceholderArtwork: () => void;
    reloadSongLibrary: () => Promise<unknown>;
    reloadVideoLibrary: () => Promise<unknown>;
    reloadAlbums: (userId: string) => Promise<unknown>;
    reloadLibrarySaves: (userId: string) => Promise<unknown>;
    reloadUserMusicState: UserMusicStateLoader;
    reloadPlaylists: (userId: string) => Promise<unknown>;
    reloadProducerData: () => Promise<unknown>;
    reloadArtistFollows: () => Promise<unknown>;
    reloadSongLikes: () => Promise<unknown>;
    reloadUserProfile?: (userId: string) => Promise<unknown>;
    showLibraryFailureToast: () => void;
};

export type DesktopRemoteBootstrapResult = {
    completedSteps: DesktopBootstrapStep[];
    failedSteps: DesktopBootstrapStep[];
    userMusicStateOutcome: string;
    deferred?: boolean;
};

export type DesktopShellGateInput = {
    authReady: boolean;
    isAuthenticated: boolean;
    accountUserId: string;
    localBootstrapReady: boolean;
};

export type DesktopShellGateDecision = {
    canRender: boolean;
    blockedBy: "authReady" | "localBootstrapReady" | null;
    detail: string;
};

/** @deprecated */
export type DesktopAuthenticatedRequestConfig = DesktopAuthBootstrapConfig;
/** @deprecated */
export type DesktopProtectedActionClientConfig = DesktopAuthBootstrapConfig;
/** @deprecated */
export type DesktopProtectedActionFetchInit = DesktopAuthenticatedFetchInit;
/** @deprecated */
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

function delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        promise
            .then((value) => {
                window.clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                window.clearTimeout(timer);
                reject(error);
            });
    });
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

function readBrowserSupabaseAnonKey() {
    return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/\s+/g, "");
}

function getTokenTail(token: string) {
    return token ? token.slice(-8) : "";
}

function sessionScore(session: Session | null | undefined) {
    if (!session) {
        return -1;
    }
    let score = 0;
    if (session.user?.id) {
        score += 4;
    }
    if (readSafeBearerToken(session)) {
        score += 8;
    }
    if (readRefreshTokenFromSession(session)) {
        score += 4;
    }
    if (!isAccessTokenExpired(session)) {
        score += 2;
    }
    score += (session.expires_at ?? 0) / 1_000_000_000;
    return score;
}

function pickBestDesktopSession(stored: Session | null, context: Session | null) {
    if (!stored) {
        return context;
    }
    if (!context) {
        return stored;
    }
    return sessionScore(context) >= sessionScore(stored) ? context : stored;
}

async function syncDesktopSupabaseSession(config: DesktopAuthBootstrapConfig) {
    const contextSession = config.readAuthSession();
    if (!contextSession) {
        return;
    }

    const { data: { session: storedSession } } = await config.supabase.auth.getSession();
    if (sessionScore(contextSession) <= sessionScore(storedSession)) {
        return;
    }

    const accessToken = readRawAccessToken(contextSession) || readSafeBearerToken(contextSession);
    const refreshToken = readRefreshTokenFromSession(contextSession);
    if (!accessToken && !refreshToken) {
        return;
    }

    try {
        await withTimeout(
            config.supabase.auth.setSession({
                access_token: accessToken || readRawAccessToken(storedSession) || "",
                refresh_token: refreshToken || readRefreshTokenFromSession(storedSession) || "",
            }),
            SESSION_REFRESH_TIMEOUT_MS,
            "supabase.auth.setSession",
        );
    }
    catch (error) {
        console.warn("[desktop-auth-bootstrap] failed to sync context session to Supabase client", error);
    }
}

async function readMergedDesktopSession(config: DesktopAuthBootstrapConfig) {
    await syncDesktopSupabaseSession(config);
    const contextSession = config.readAuthSession();
    const { data: { session: storedSession } } = await config.supabase.auth.getSession();
    return pickBestDesktopSession(storedSession, contextSession);
}

async function refreshSupabaseSession(supabase: SupabaseClient) {
    if (!sessionRefreshPromise) {
        sessionRefreshPromise = withTimeout(
            supabase.auth.refreshSession().then(({ data, error }) => {
                if (error) {
                    return null;
                }
                return data.session ?? null;
            }),
            SESSION_REFRESH_TIMEOUT_MS,
            "supabase.auth.refreshSession",
        ).finally(() => {
            sessionRefreshPromise = null;
        });
    }
    return sessionRefreshPromise;
}

function buildTransport(
    session: Session,
    mode: "bearer-preferred" | "refresh-header-only",
): DesktopAuthTransport | null {
    if (mode === "refresh-header-only" || sessionRequiresRefreshHeaderAuth(session)) {
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

/**
 * Resolve credentials for protected desktop /api requests.
 * Merges React session state with supabase.auth.getSession(), refreshes when needed.
 */
export async function resolveDesktopAuthenticatedCredentials(
    config: DesktopAuthBootstrapConfig,
    options: {
        forceRefresh?: boolean;
        authMode?: "bearer-preferred" | "refresh-header-only";
    } = {},
): Promise<DesktopAuthenticatedCredentials | null> {
    if (isDesktopAuthRecoveryActive()) {
        return null;
    }

    const authMode = options.authMode ?? "bearer-preferred";
    let session = await readMergedDesktopSession(config);
    if (!session) {
        return null;
    }

    let userId = String(session.user?.id || "").trim();
    if (!userId) {
        const bearer = readSafeBearerToken(session);
        userId = bearer ? readUserIdFromJwt(bearer) : "";
    }
    if (!userId) {
        return null;
    }
    if (!session.user?.id) {
        session = {
            ...session,
            user: { id: userId } as Session["user"],
        };
    }

    const refreshTokenAvailable = Boolean(readRefreshTokenFromSession(session));
    const needsClientRefresh = Boolean(options.forceRefresh
        || !readSafeBearerToken(session)
        || isAccessTokenExpired(session)
        || (authMode === "bearer-preferred" && sessionRequiresRefreshHeaderAuth(session)));

    if (needsClientRefresh && refreshTokenAvailable) {
        try {
            const refreshedSession = await refreshSupabaseSession(config.supabase);
            if (refreshedSession) {
                const mergedSession = pickBestDesktopSession(refreshedSession, config.readAuthSession());
                if (mergedSession) {
                    session = mergedSession;
                    noteValidatedDesktopSession(session);
                }
            }
        }
        catch (error) {
            console.warn("[desktop-auth-bootstrap] session refresh failed", error);
        }
    }

    if (!session) {
        return null;
    }

    const transport = buildTransport(session, authMode);
    if (!transport) {
        return null;
    }

    noteValidatedDesktopSession(session);
    return {
        session,
        userId: session.user?.id || readUserIdFromJwt(readSafeBearerToken(session)),
        transport,
    };
}

function readUserIdFromJwt(accessToken: string) {
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

export async function waitForDesktopApiCredentials(
    config: DesktopAuthBootstrapConfig,
    timeoutMs = API_CREDENTIALS_BOOTSTRAP_WAIT_MS,
) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const credentials = await withTimeout(
                resolveDesktopAuthenticatedCredentials(config),
                CREDENTIAL_RESOLVE_TIMEOUT_MS,
                "resolveDesktopAuthenticatedCredentials",
            );
            if (credentials) {
                return credentials;
            }
        }
        catch {
            // Retry until bootstrap wait window expires.
        }
        await delay(120);
    }
    return null;
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

async function sendAuthenticatedRequest(
    config: DesktopAuthBootstrapConfig,
    path: string,
    fetchInit: RequestInit,
    transport: DesktopAuthTransport,
) {
    const request = buildAuthenticatedApiRequest(path, fetchInit, transport);
    return fetch(request.path, request.init);
}

export function createDesktopAuthenticatedFetch(config: DesktopAuthBootstrapConfig) {
    return async function desktopAuthenticatedFetch(
        path: string,
        init: DesktopAuthenticatedFetchInit = {},
    ) {
        const { requireAuth = true, ...fetchInit } = init;
        const requestPath = assertDesktopRelativeApiPath(path);

        let credentials: DesktopAuthenticatedCredentials | null;
        try {
            credentials = await withTimeout(
                resolveDesktopAuthenticatedCredentials(config),
                CREDENTIAL_RESOLVE_TIMEOUT_MS,
                "resolveDesktopAuthenticatedCredentials",
            );
        }
        catch (error) {
            if (requireAuth) {
                throw error instanceof Error ? error : new Error(API_AUTH_FAILED_MESSAGE);
            }
            return fetch(requestPath, { ...fetchInit, credentials: "omit" });
        }

        if (!credentials) {
            if (requireAuth) {
                throw new Error(API_AUTH_FAILED_MESSAGE);
            }
            return fetch(requestPath, { ...fetchInit, credentials: "omit" });
        }

        let response = await sendAuthenticatedRequest(config, requestPath, fetchInit, credentials.transport);

        if (response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) {
            const refreshOnlyCredentials = await resolveDesktopAuthenticatedCredentials(config, {
                authMode: "refresh-header-only",
            });
            if (refreshOnlyCredentials) {
                response = await sendAuthenticatedRequest(config, requestPath, fetchInit, refreshOnlyCredentials.transport);
            }
        }

        if (response.status === 401) {
            const retryModes: Array<"bearer-preferred" | "refresh-header-only"> = [
                "bearer-preferred",
                "refresh-header-only",
            ];
            for (const authMode of retryModes) {
                const refreshedCredentials = await resolveDesktopAuthenticatedCredentials(config, {
                    forceRefresh: authMode === "bearer-preferred",
                    authMode,
                });
                if (!refreshedCredentials) {
                    continue;
                }
                console.info("[desktop-auth-bootstrap] Protected API 401 retry", {
                    path: requestPath,
                    previousTransport: credentials.transport.kind,
                    retryTransport: refreshedCredentials.transport.kind,
                    authMode,
                    previousTokenTail: credentials.transport.kind === "bearer"
                        ? getTokenTail(credentials.transport.accessToken)
                        : getTokenTail(credentials.transport.refreshToken),
                    retryTokenTail: refreshedCredentials.transport.kind === "bearer"
                        ? getTokenTail(refreshedCredentials.transport.accessToken)
                        : getTokenTail(refreshedCredentials.transport.refreshToken),
                });
                response = await sendAuthenticatedRequest(config, requestPath, fetchInit, refreshedCredentials.transport);
                credentials = refreshedCredentials;
                if (response.status !== 401) {
                    break;
                }
            }
        }

        if ((response.status === 401 || response.status === DESKTOP_PROTECTED_ACTION_HEADER_TOO_LARGE_STATUS) && requireAuth) {
            throw new Error(SESSION_EXPIRED_MESSAGE);
        }

        return response;
    };
}

export function createDesktopAuthBootstrapRuntime(config: DesktopAuthBootstrapConfig) {
    const fetch = createDesktopAuthenticatedFetch(config);
    return {
        fetch,
        waitForApiCredentials: (timeoutMs?: number) => waitForDesktopApiCredentials(config, timeoutMs),
        resolveCredentials: (options?: Parameters<typeof resolveDesktopAuthenticatedCredentials>[1]) =>
            resolveDesktopAuthenticatedCredentials(config, options),
    };
}

/** @deprecated Use createDesktopAuthenticatedFetch */
export function createDesktopProtectedActionClient(config: DesktopAuthBootstrapConfig) {
    return createDesktopAuthenticatedFetch(config);
}

export type DesktopAuthenticatedFetch = ReturnType<typeof createDesktopAuthenticatedFetch>;
/** @deprecated */
export type DesktopProtectedActionFetch = DesktopAuthenticatedFetch;

function formatStepLabel(step: DesktopBootstrapStep) {
    return `${DESKTOP_BOOTSTRAP_LOG_PREFIX} ${step}`;
}

export async function traceBootstrapStep<T>(
    step: DesktopBootstrapStep,
    promise: Promise<T>,
    timeoutMs = DEFAULT_STEP_TIMEOUT_MS,
): Promise<{ ok: true; value: T } | { ok: false; step: DesktopBootstrapStep; error: unknown }> {
    const label = formatStepLabel(step);
    console.info(`${label} started`);
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
            if (settled) {
                return;
            }
            const message = `${label} STALLED after ${timeoutMs}ms — promise never resolved`;
            console.error(message);
            reject(new Error(message));
        }, timeoutMs);
    });

    try {
        const value = await Promise.race([promise, timeoutPromise]);
        settled = true;
        console.info(`${label} completed`);
        return { ok: true, value };
    }
    catch (error) {
        settled = true;
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("STALLED after")) {
            console.warn(`${label} failed`, error);
        }
        return { ok: false, step, error };
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}

export function diagnoseDesktopShellGate(input: DesktopShellGateInput): DesktopShellGateDecision {
    if (!input.authReady) {
        return {
            canRender: false,
            blockedBy: "authReady",
            detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: authReady=false (auth initialization still running)`,
        };
    }
    if (!input.localBootstrapReady) {
        return {
            canRender: false,
            blockedBy: "localBootstrapReady",
            detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: localBootstrapReady=false (localStorage hydration has not unblocked the shell)`,
        };
    }
    return {
        canRender: true,
        blockedBy: null,
        detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell unblocked`,
    };
}

export function canRenderDesktopApplicationShell(input: DesktopShellGateInput) {
    const decision = diagnoseDesktopShellGate(input);
    if (!decision.canRender) {
        console.info(decision.detail);
    }
    return decision.canRender;
}

export function startDesktopLocalBootstrap(markReady: () => void, hydrate: () => void) {
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} localStorageHydration shell unblocked`);
    markReady();
    queueMicrotask(() => {
        console.info(`${formatStepLabel("localStorageHydration")} started`);
        try {
            hydrate();
            console.info(`${formatStepLabel("localStorageHydration")} completed`);
        }
        catch (error) {
            console.error(`${formatStepLabel("localStorageHydration")} failed`, error);
        }
    });
}

type BootstrapStepTask = {
    step: DesktopBootstrapStep;
    run: () => Promise<unknown>;
};

async function runIndependentBootstrapStep(
    step: DesktopBootstrapStep,
    task: () => Promise<unknown>,
    completedSteps: DesktopBootstrapStep[],
    failedSteps: DesktopBootstrapStep[],
) {
    const result = await traceBootstrapStep(step, task());
    if (result.ok) {
        completedSteps.push(step);
        return;
    }
    failedSteps.push(step);
    if (step === "playlists") {
        console.error(`${formatStepLabel("playlists")} failed — bootstrap continues`, result.error);
    }
}

function readCatalogValue<T>(
    results: Array<{ step: DesktopBootstrapStep; ok: boolean; value?: T }>,
    step: DesktopBootstrapStep,
) {
    const entry = results.find((item) => item.step === step);
    return entry?.ok ? entry.value : undefined;
}

/**
 * Remote bootstrap — waits for API credentials, then runs independent user-state loaders.
 */
export async function runDesktopRemoteBootstrap(
    userId: string,
    actions: DesktopRemoteBootstrapActions,
    auth?: DesktopAuthBootstrapConfig,
): Promise<DesktopRemoteBootstrapResult> {
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue started for user ${userId || "(missing user id)"}`);

    if (auth) {
        const credentials = await waitForDesktopApiCredentials(auth);
        if (!credentials) {
            console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} API credentials not ready — remote bootstrap deferred`);
            return {
                completedSteps: [],
                failedSteps: [],
                userMusicStateOutcome: "deferred-no-api-credentials",
                deferred: true,
            };
        }
        console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} API credentials ready (${credentials.transport.kind})`);
    }

    const completedSteps: DesktopBootstrapStep[] = [];
    const failedSteps: DesktopBootstrapStep[] = [];

    actions.clearRemovedPlaceholderArtwork();

    const catalogTasks: BootstrapStepTask[] = [
        { step: "songLibrary", run: actions.reloadSongLibrary },
        { step: "videoLibrary", run: actions.reloadVideoLibrary },
        { step: "albums", run: () => actions.reloadAlbums(userId) },
    ];

    const catalogResults = await Promise.all(catalogTasks.map(async ({ step, run }) => {
        const result = await traceBootstrapStep(step, run());
        if (result.ok) {
            completedSteps.push(step);
            return { step, ok: true as const, value: result.value };
        }
        failedSteps.push(step);
        return { step, ok: false as const, value: undefined };
    }));

    const userMusicStateHandle = startUserMusicStateBootstrapInBackground(actions.reloadUserMusicState, {
        loadedSongs: readCatalogValue(catalogResults, "songLibrary"),
        loadedVideos: readCatalogValue(catalogResults, "videoLibrary"),
        loadedAlbums: readCatalogValue(catalogResults, "albums"),
    });

    const userStateTasks: BootstrapStepTask[] = [
        { step: "librarySaves", run: () => actions.reloadLibrarySaves(userId) },
        { step: "playlists", run: () => actions.reloadPlaylists(userId) },
        { step: "artistFollows", run: actions.reloadArtistFollows },
        { step: "songLikes", run: actions.reloadSongLikes },
    ];

    if (actions.reloadUserProfile && userId) {
        userStateTasks.unshift({
            step: "profileBootstrap",
            run: () => actions.reloadUserProfile!(userId),
        });
    }

    await Promise.all(userStateTasks.map(({ step, run }) =>
        runIndependentBootstrapStep(step, run, completedSteps, failedSteps),
    ));

    void traceBootstrapStep("producerData", actions.reloadProducerData()).catch((error) => {
        console.warn(`${formatStepLabel("producerData")} background failed`, error);
    });

    if (failedSteps.length > 0) {
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue finished with failures: ${failedSteps.join(", ")}`);
    }
    else {
        console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue completed`);
    }

    return {
        completedSteps,
        failedSteps,
        userMusicStateOutcome: userMusicStateHandle.outcome,
    };
}
