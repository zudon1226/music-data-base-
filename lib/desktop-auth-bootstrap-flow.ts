/**
 * DESKTOP ONLY — clean single-run authentication bootstrap.
 *
 * One attempt per auth cycle (page load or post-login). No loops. No retries.
 * Flow: AUTH BOOTSTRAP START → getSession → SESSION FOUND → TOKEN READY → API READY → APP SHELL OPEN
 *
 * refreshSession() runs at most once per auth cycle, and only when a session already exists.
 * HTTP 429 stops bootstrapping immediately until the user signs in again.
 */

import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import { readStoredAuthSession } from "./auth-session";
import { readRefreshTokenFromSession } from "./client-api-auth";
import {
    clearDesktopApiCredentials,
    getDesktopAuthenticatedSession,
    getDesktopAuthenticatedUserId,
    isDesktopApiReady,
    isDesktopAuthenticatedSessionReady,
    publishDesktopApiCredentials,
} from "./desktop-authenticated-session";
import { readAccessTokenFromSession } from "./desktop-auth-recovery-gate";
import type { DesktopProtectedActionPipelineConfig } from "./desktop-protected-action-pipeline";
import {
    clearDesktopAuthRecoveryGate,
    noteValidatedDesktopSession,
    SESSION_EXPIRED_MESSAGE,
} from "./desktop-auth-recovery-gate";
import {
    startUserMusicStateBootstrapInBackground,
    type UserMusicStateLoader,
} from "./desktop-user-music-state-bootstrap";

export { SESSION_EXPIRED_MESSAGE };

export const DESKTOP_AUTH_RATE_LIMIT_MESSAGE = "Please wait a minute and try again.";
export const DESKTOP_BOOTSTRAP_LOG_PREFIX = "[desktop-bootstrap]";

export const DESKTOP_AUTH_BOOTSTRAP_MARKERS = {
    START: "AUTH BOOTSTRAP START",
    SESSION_FOUND: "SESSION FOUND",
    SHELL_OPEN: "APP SHELL OPEN",
} as const;

const DEFAULT_STEP_TIMEOUT_MS = 12_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const TOKEN_EXPIRY_SKEW_MS = 30_000;

export type DesktopAuthBootstrapConfig = DesktopProtectedActionPipelineConfig;

/** @deprecated aliases */
export type DesktopAuthenticatedRequestConfig = DesktopAuthBootstrapConfig;
export type DesktopProtectedActionClientConfig = DesktopAuthBootstrapConfig;
export type DesktopProtectedActionFetchInit = import("./desktop-protected-action-pipeline").DesktopProtectedApiFetchInit;
export type DesktopAuthRequestMode = "bearer-preferred" | "refresh-header-only";
export type DesktopAuthenticatedFetchInit = import("./desktop-protected-action-pipeline").DesktopProtectedApiFetchInit;

export type DesktopAuthBootstrapOutcome = {
    ready: boolean;
    rateLimited: boolean;
    message?: string;
    showLogin?: boolean;
};

export type DesktopAuthSessionBootstrapOptions = {
    userId: string;
    sessionHint?: Session | null;
    waitForSignedInEvent?: boolean;
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
    session?: Session | null;
    authSessionInitialized?: boolean;
};

export type DesktopShellGateDecision = {
    canRender: boolean;
    blockedBy: "authReady" | "localBootstrapReady" | "authSessionInitialized" | null;
    detail: string;
};

type BootstrapPhase = "idle" | "running" | "ready" | "failed" | "rate_limited";

type BootstrapRuntime = {
    phase: BootstrapPhase;
    userKey: string;
    promise: Promise<DesktopAuthBootstrapOutcome> | null;
    refreshSessionCalled: boolean;
    setSessionCalled: boolean;
    listenerAttached: boolean;
    rateLimitedUntil: number;
    shellOpenLoggedForUser: string;
    lastShellBlockDetail: string;
};

const bootstrapRuntime: BootstrapRuntime = {
    phase: "idle",
    userKey: "",
    promise: null,
    refreshSessionCalled: false,
    setSessionCalled: false,
    listenerAttached: false,
    rateLimitedUntil: 0,
    shellOpenLoggedForUser: "",
    lastShellBlockDetail: "",
};

function logBootstrapMarker(marker: string, details: Record<string, unknown> = {}) {
    if (Object.keys(details).length > 0) {
        console.info(marker, details);
    }
    else {
        console.info(marker);
    }
}

function formatStepLabel(step: DesktopBootstrapStep) {
    return `${DESKTOP_BOOTSTRAP_LOG_PREFIX} ${step}`;
}

function normalizeBootstrapOptions(
    options: DesktopAuthSessionBootstrapOptions | string,
): DesktopAuthSessionBootstrapOptions {
    if (typeof options === "string") {
        return { userId: options, sessionHint: null, waitForSignedInEvent: false };
    }
    return options;
}

function isRateLimitError(error: { message?: string; status?: number } | null | undefined) {
    const message = String(error?.message || "").toLowerCase();
    return error?.status === 429
        || message.includes("429")
        || message.includes("too many requests")
        || message.includes("rate limit");
}

function hasUsableBearer(session: Session | null | undefined) {
    if (!session) {
        return false;
    }
    const rawAccess = typeof session.access_token === "string" ? session.access_token.trim() : "";
    const rawRefresh = typeof session.refresh_token === "string" ? session.refresh_token.trim() : "";
    const userId = String(session.user?.id || "").trim();
    return Boolean(
        rawAccess
        && rawRefresh
        && userId
        && readAccessTokenFromSession(session)
        && readRefreshTokenFromSession(session),
    );
}

function isAccessTokenExpired(session: Session | null | undefined) {
    if (!session || !readAccessTokenFromSession(session)) {
        return true;
    }
    if (typeof session.expires_at === "number") {
        return session.expires_at * 1000 <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
    }
    const accessToken = readAccessTokenFromSession(session);
    if (!accessToken) {
        return true;
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

function scoreSession(session: Session | null | undefined) {
    if (!session) {
        return -1;
    }
    let score = 0;
    if (readAccessTokenFromSession(session)) {
        score += 10;
    }
    if (readRefreshTokenFromSession(session)) {
        score += 6;
    }
    if (session.user?.id) {
        score += 4;
    }
    if (!isAccessTokenExpired(session)) {
        score += 6;
    }
    return score;
}

function pickBestSession(...candidates: Array<Session | null | undefined>) {
    return candidates.reduce<Session | null>((best, candidate) => {
        if (!candidate) {
            return best;
        }
        if (!best || scoreSession(candidate) > scoreSession(best)) {
            return candidate;
        }
        return best;
    }, null);
}

function syncReactAuthSession(config: DesktopAuthBootstrapConfig, session: Session) {
    clearDesktopAuthRecoveryGate(session);
    noteValidatedDesktopSession(session);
    config.writeAuthSession?.(session);
}

function markRateLimited() {
    bootstrapRuntime.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
    bootstrapRuntime.phase = "rate_limited";
}

async function readSupabaseClientSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        if (isRateLimitError(error)) {
            markRateLimited();
        }
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} getSession failed`, error.message);
    }
    return session ?? null;
}

/**
 * Single SIGNED_OUT listener for credential cleanup.
 * DesktopAuthProvider owns UI auth state; this never re-registers.
 */
function ensureDesktopAuthStateListener(supabase: SupabaseClient) {
    if (bootstrapRuntime.listenerAttached) {
        return;
    }
    bootstrapRuntime.listenerAttached = true;
    supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
        if (event === "SIGNED_OUT") {
            clearDesktopApiCredentials();
        }
    });
}

async function restorePersistedSessionOnce(
    config: DesktopAuthBootstrapConfig,
    sessionHint: Session | null | undefined,
): Promise<{ session: Session | null; rateLimited: boolean }> {
    if (Date.now() < bootstrapRuntime.rateLimitedUntil) {
        return { session: null, rateLimited: true };
    }

    const storedSession = readStoredAuthSession();
    const mergedSession = pickBestSession(sessionHint, storedSession);
    if (!hasUsableBearer(mergedSession) || bootstrapRuntime.setSessionCalled) {
        return { session: mergedSession, rateLimited: false };
    }

    bootstrapRuntime.setSessionCalled = true;
    const accessToken = readAccessTokenFromSession(mergedSession);
    const refreshToken = readRefreshTokenFromSession(mergedSession);
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} restore-setSession-once`, {
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
    });

    const { data, error } = await config.supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
    });

    if (error) {
        if (isRateLimitError(error)) {
            markRateLimited();
            console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} setSession rate-limited — stopping`);
            return { session: null, rateLimited: true };
        }
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} setSession failed`, error.message);
        return { session: mergedSession, rateLimited: false };
    }

    return { session: data.session ?? mergedSession, rateLimited: false };
}

/**
 * At most one refreshSession() per auth cycle, and only when a session already exists.
 */
async function refreshExpiredSessionOnce(
    supabase: SupabaseClient,
    session: Session | null,
): Promise<{ session: Session | null; rateLimited: boolean }> {
    if (!session) {
        return { session: null, rateLimited: false };
    }
    if (!isAccessTokenExpired(session) || bootstrapRuntime.refreshSessionCalled) {
        return { session, rateLimited: false };
    }

    const refreshToken = readRefreshTokenFromSession(session);
    if (!refreshToken) {
        return { session, rateLimited: false };
    }

    bootstrapRuntime.refreshSessionCalled = true;
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} refreshSession-once`);
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error) {
        if (isRateLimitError(error)) {
            markRateLimited();
            console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} refreshSession failed — 429 rate limit, stopping`, error.message);
            return { session: null, rateLimited: true };
        }
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} refreshSession failed`, error.message);
        return { session, rateLimited: false };
    }

    return { session: data.session ?? session, rateLimited: false };
}

/**
 * Linear session resolution — getSession first, optional one setSession, optional one refreshSession.
 * No auth-event waits. No retries.
 */
async function resolveBootstrapSession(
    config: DesktopAuthBootstrapConfig,
    options: { sessionHint?: Session | null },
): Promise<{ session: Session | null; rateLimited: boolean }> {
    ensureDesktopAuthStateListener(config.supabase);

    if (Date.now() < bootstrapRuntime.rateLimitedUntil) {
        return { session: null, rateLimited: true };
    }

    let session = pickBestSession(
        await readSupabaseClientSession(config.supabase),
        options.sessionHint ?? config.readAuthSession?.() ?? null,
    );

    if (isDesktopAuthBootstrapRateLimited()) {
        return { session: null, rateLimited: true };
    }

    if (!session || !hasUsableBearer(session)) {
        const restored = await restorePersistedSessionOnce(config, options.sessionHint);
        if (restored.rateLimited) {
            return { session: null, rateLimited: true };
        }
        session = restored.session;
        if (!hasUsableBearer(session)) {
            session = await readSupabaseClientSession(config.supabase);
        }
    }

    if (isDesktopAuthBootstrapRateLimited()) {
        return { session: null, rateLimited: true };
    }

    if (!session || !hasUsableBearer(session)) {
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} dual-auth-no-bearer`, {
            hasSessionHint: Boolean(options.sessionHint),
            hasStoredSession: Boolean(readStoredAuthSession()),
        });
        return { session: null, rateLimited: false };
    }

    if (isAccessTokenExpired(session)) {
        const refreshed = await refreshExpiredSessionOnce(config.supabase, session);
        if (refreshed.rateLimited) {
            return { session: null, rateLimited: true };
        }
        session = refreshed.session;
    }

    if (!session || !hasUsableBearer(session) || isAccessTokenExpired(session)) {
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} dual-auth-no-bearer`, {
            hasSession: Boolean(session),
            expired: session ? isAccessTokenExpired(session) : true,
        });
        return { session: null, rateLimited: false };
    }

    return { session, rateLimited: false };
}

/** @deprecated — retained for static checks; bootstrap uses resolveBootstrapSession instead. */
export async function waitForDualAuthConfirmation(
    supabase: SupabaseClient,
    options: { freshSignIn?: boolean; sessionHint?: Session | null } = {},
) {
    const result = await resolveBootstrapSession(
        { supabase } as DesktopAuthBootstrapConfig,
        { sessionHint: options.sessionHint },
    );
    return {
        session: result.session,
        authStateObserved: Boolean(result.session),
        getSessionObserved: true,
    };
}

/** @deprecated — retained for static checks; bootstrap uses resolveBootstrapSession. */
export async function initializeDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
    options: { freshSignIn?: boolean; sessionHint?: Session | null } = {},
): Promise<{ session: Session | null; rateLimited: boolean }> {
    if (Date.now() < bootstrapRuntime.rateLimitedUntil || bootstrapRuntime.phase === "rate_limited") {
        return { session: null, rateLimited: true };
    }
    return resolveBootstrapSession(config, options);
}

async function executeSingleAuthBootstrap(
    config: DesktopAuthBootstrapConfig,
    options: DesktopAuthSessionBootstrapOptions,
): Promise<DesktopAuthBootstrapOutcome> {
    logBootstrapMarker(DESKTOP_AUTH_BOOTSTRAP_MARKERS.START, { userId: options.userId });

    if (Date.now() < bootstrapRuntime.rateLimitedUntil) {
        bootstrapRuntime.phase = "rate_limited";
        return {
            ready: false,
            rateLimited: true,
            showLogin: true,
            message: DESKTOP_AUTH_RATE_LIMIT_MESSAGE,
        };
    }

    const resolved = await resolveBootstrapSession(config, {
        sessionHint: options.sessionHint ?? config.readAuthSession?.() ?? null,
    });

    if (resolved.rateLimited || bootstrapRuntime.phase === "rate_limited") {
        bootstrapRuntime.phase = "rate_limited";
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} bootstrap stopped — rate limited`);
        return {
            ready: false,
            rateLimited: true,
            showLogin: true,
            message: DESKTOP_AUTH_RATE_LIMIT_MESSAGE,
        };
    }

    const session = resolved.session;
    if (!session) {
        bootstrapRuntime.phase = "failed";
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} bootstrap stopped — no session with access + refresh tokens`);
        return { ready: false, rateLimited: false, showLogin: true };
    }

    logBootstrapMarker(DESKTOP_AUTH_BOOTSTRAP_MARKERS.SESSION_FOUND, {
        userId: session.user?.id || "",
    });

    if (!publishDesktopApiCredentials(session)) {
        bootstrapRuntime.phase = "failed";
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} bootstrap stopped — publishDesktopApiCredentials returned false`);
        return { ready: false, rateLimited: false, showLogin: true };
    }

    syncReactAuthSession(config, session);
    bootstrapRuntime.phase = "ready";
    return { ready: true, rateLimited: false, showLogin: false };
}

/**
 * Exactly one authentication bootstrap per auth cycle.
 * Settled outcomes (ready / failed / rate_limited) are returned as-is — never re-executed.
 */
export function runDesktopAuthBootstrap(
    config: DesktopAuthBootstrapConfig,
    options: DesktopAuthSessionBootstrapOptions | string,
): Promise<DesktopAuthBootstrapOutcome> {
    const normalized = normalizeBootstrapOptions(options);
    const userKey = String(normalized.userId || "").trim() || "authenticated";

    if (bootstrapRuntime.phase === "ready" && isDesktopApiReady()) {
        bootstrapRuntime.userKey = userKey;
        return Promise.resolve({ ready: true, rateLimited: false, showLogin: false });
    }

    if (bootstrapRuntime.phase === "running" && bootstrapRuntime.promise) {
        return bootstrapRuntime.promise;
    }

    if (bootstrapRuntime.phase === "rate_limited") {
        return Promise.resolve({
            ready: false,
            rateLimited: true,
            showLogin: true,
            message: DESKTOP_AUTH_RATE_LIMIT_MESSAGE,
        });
    }

    if (bootstrapRuntime.phase === "failed") {
        return Promise.resolve({ ready: false, rateLimited: false, showLogin: true });
    }

    bootstrapRuntime.userKey = userKey;
    bootstrapRuntime.phase = "running";
    bootstrapRuntime.promise = executeSingleAuthBootstrap(config, normalized).finally(() => {
        if (bootstrapRuntime.phase === "running") {
            bootstrapRuntime.phase = "failed";
        }
    });
    return bootstrapRuntime.promise;
}

/** @deprecated alias */
export const startDesktopAuthSessionBootstrap = runDesktopAuthBootstrap;

/**
 * Called after interactive sign-in so bootstrap may run once for the new session.
 * Does not clear the auth-state listener.
 */
export function markDesktopAuthSignInPending() {
    bootstrapRuntime.phase = "idle";
    bootstrapRuntime.userKey = "";
    bootstrapRuntime.promise = null;
    bootstrapRuntime.refreshSessionCalled = false;
    bootstrapRuntime.setSessionCalled = false;
    bootstrapRuntime.rateLimitedUntil = 0;
    bootstrapRuntime.lastShellBlockDetail = "";
}

/** Full reset for logout. Listener stays attached to avoid duplicate registrations. */
export function resetDesktopAuthSessionBootstrap() {
    bootstrapRuntime.phase = "idle";
    bootstrapRuntime.userKey = "";
    bootstrapRuntime.promise = null;
    bootstrapRuntime.refreshSessionCalled = false;
    bootstrapRuntime.setSessionCalled = false;
    bootstrapRuntime.rateLimitedUntil = 0;
    bootstrapRuntime.shellOpenLoggedForUser = "";
    bootstrapRuntime.lastShellBlockDetail = "";
    clearDesktopApiCredentials();
}

export function isDesktopAuthSessionBootstrapComplete() {
    return bootstrapRuntime.phase === "ready" && isDesktopApiReady();
}

export function isDesktopAuthSessionBootstrapSettled() {
    return bootstrapRuntime.phase === "ready"
        || bootstrapRuntime.phase === "failed"
        || bootstrapRuntime.phase === "rate_limited";
}

export function isDesktopAuthBootstrapRateLimited() {
    return bootstrapRuntime.phase === "rate_limited"
        || Date.now() < bootstrapRuntime.rateLimitedUntil;
}

export function isDesktopAuthenticatedShellReady() {
    return isDesktopApiReady();
}

export async function ensureDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
    options: Omit<DesktopAuthSessionBootstrapOptions, "userId"> = {},
): Promise<{ session: Session | null; rateLimited: boolean }> {
    const outcome = await runDesktopAuthBootstrap(config, {
        userId: String(config.readAuthSession?.()?.user?.id || "").trim() || "authenticated",
        sessionHint: options.sessionHint ?? config.readAuthSession?.() ?? null,
        waitForSignedInEvent: options.waitForSignedInEvent,
    });
    if (outcome.rateLimited) {
        return { session: null, rateLimited: true };
    }
    if (!outcome.ready || !isDesktopApiReady()) {
        return { session: null, rateLimited: false };
    }
    return { session: getDesktopAuthenticatedSession(), rateLimited: false };
}

/** @deprecated */
export async function waitForDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
    _timeoutMs?: number,
    options: Omit<DesktopAuthSessionBootstrapOptions, "userId"> = {},
): Promise<Session | null> {
    const result = await ensureDesktopAuthenticatedSession(config, options);
    return result.session;
}

/** @deprecated */
export async function waitForDesktopApiCredentials(
    _config: DesktopAuthBootstrapConfig,
    _timeoutMs?: number,
) {
    if (!isDesktopApiReady()) {
        return null;
    }
    return {
        session: getDesktopAuthenticatedSession(),
        userId: getDesktopAuthenticatedUserId(),
        accessToken: "",
    };
}

function requiresLoggedInApiCredentials(input: DesktopShellGateInput) {
    return input.isAuthenticated || Boolean(String(input.accountUserId || "").trim());
}

export function diagnoseDesktopShellGate(input: DesktopShellGateInput): DesktopShellGateDecision {
    if (!input.authReady) {
        return {
            canRender: false,
            blockedBy: "authReady",
            detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: authReady=false`,
        };
    }

    if (requiresLoggedInApiCredentials(input)) {
        if (!isDesktopApiReady()) {
            return {
                canRender: false,
                blockedBy: "authSessionInitialized",
                detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: waiting for API READY`,
            };
        }
        if (input.authSessionInitialized === false) {
            return {
                canRender: false,
                blockedBy: "authSessionInitialized",
                detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: auth bootstrap not finalized`,
            };
        }
    }

    if (!input.localBootstrapReady) {
        return {
            canRender: false,
            blockedBy: "localBootstrapReady",
            detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: localStorage hydration incomplete`,
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
    if (decision.canRender) {
        bootstrapRuntime.lastShellBlockDetail = "";
        if (requiresLoggedInApiCredentials(input) && isDesktopApiReady()) {
            const userId = getDesktopAuthenticatedUserId();
            if (userId && bootstrapRuntime.shellOpenLoggedForUser !== userId) {
                logBootstrapMarker(DESKTOP_AUTH_BOOTSTRAP_MARKERS.SHELL_OPEN, { userId });
                bootstrapRuntime.shellOpenLoggedForUser = userId;
            }
        }
    }
    else if (decision.detail && decision.detail !== bootstrapRuntime.lastShellBlockDetail) {
        bootstrapRuntime.lastShellBlockDetail = decision.detail;
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
            reject(new Error(`${label} STALLED after ${timeoutMs}ms`));
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
        console.warn(`${label} failed`, error);
        return { ok: false, step, error };
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
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
}

function readCatalogValue<T>(
    results: Array<{ step: DesktopBootstrapStep; ok: boolean; value?: T }>,
    step: DesktopBootstrapStep,
) {
    const entry = results.find((item) => item.step === step);
    return entry?.ok ? entry.value : undefined;
}

/** Remote catalog bootstrap — runs only after API READY. */
export async function runDesktopRemoteBootstrap(
    userId: string,
    actions: DesktopRemoteBootstrapActions,
    _auth?: DesktopAuthBootstrapConfig,
): Promise<DesktopRemoteBootstrapResult> {
    if (!isDesktopApiReady()) {
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} API credentials not ready — remote bootstrap deferred`);
        return {
            completedSteps: [],
            failedSteps: [],
            userMusicStateOutcome: "deferred-no-api-credentials",
            deferred: true,
        };
    }

    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue started for user ${userId || "(missing user id)"}`);
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} API credentials ready (global bearer)`);

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

    return {
        completedSteps,
        failedSteps,
        userMusicStateOutcome: userMusicStateHandle.outcome,
    };
}

/** @deprecated */
export function createDesktopAuthBootstrapWatchdog(
    _shouldForce: () => boolean,
    _onForce: (stalledTask: string) => void,
    _timeoutMs?: number,
) {
    return () => undefined;
}

/** @deprecated */
export function forceDesktopAuthBootstrapShellReady(_stalledTask: string) {
    // no-op
}

/** @deprecated */
export const DESKTOP_AUTH_SHELL_WATCHDOG_MS = 10_000;

/** @deprecated */
export function isDesktopAuthShellWatchdogForced() {
    return false;
}

export { isDesktopApiReady, isDesktopAuthenticatedSessionReady, publishDesktopApiCredentials };
