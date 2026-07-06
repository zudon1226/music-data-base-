/**
 * DESKTOP ONLY — single linear authentication bootstrap.
 *
 * Flow (no auth-event waits, no circular gates):
 *   AUTH BOOTSTRAP START → getSession → SESSION FOUND → TOKEN READY → API READY → APP SHELL OPEN
 *
 * Protected requests and remote bootstrap must not run until API READY.
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

type BootstrapRuntime = {
    userKey: string;
    promise: Promise<DesktopAuthBootstrapOutcome> | null;
    settled: boolean;
    setSessionAttempted: boolean;
    refreshAttempted: boolean;
    rateLimitedUntil: number;
    listenerInstalled: boolean;
    shellOpenLoggedForUser: string;
};

const bootstrapRuntime: BootstrapRuntime = {
    userKey: "",
    promise: null,
    settled: false,
    setSessionAttempted: false,
    refreshAttempted: false,
    rateLimitedUntil: 0,
    listenerInstalled: false,
    shellOpenLoggedForUser: "",
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

async function readSupabaseClientSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} getSession failed`, error.message);
    }
    return session ?? null;
}

function ensureDesktopAuthStateListener(
    supabase: SupabaseClient,
    config: DesktopAuthBootstrapConfig,
) {
    if (bootstrapRuntime.listenerInstalled) {
        return;
    }
    bootstrapRuntime.listenerInstalled = true;
    supabase.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
        if (event === "SIGNED_OUT") {
            clearDesktopApiCredentials();
            return;
        }
        if (!session || !hasUsableBearer(session)) {
            return;
        }
        if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
            if (isDesktopApiReady()) {
                publishDesktopApiCredentials(session);
                syncReactAuthSession(config, session);
            }
        }
    });
}

async function restorePersistedSessionOnce(
    config: DesktopAuthBootstrapConfig,
    sessionHint: Session | null | undefined,
): Promise<Session | null> {
    if (Date.now() < bootstrapRuntime.rateLimitedUntil) {
        return null;
    }

    const storedSession = readStoredAuthSession();
    const mergedSession = pickBestSession(sessionHint, storedSession);
    if (!hasUsableBearer(mergedSession) || bootstrapRuntime.setSessionAttempted) {
        return mergedSession;
    }

    bootstrapRuntime.setSessionAttempted = true;
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
            bootstrapRuntime.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
            return null;
        }
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} setSession failed`, error.message);
        return mergedSession;
    }

    return data.session ?? mergedSession;
}

async function refreshExpiredSessionOnce(
    supabase: SupabaseClient,
    session: Session | null,
): Promise<Session | null> {
    if (!session || !isAccessTokenExpired(session) || bootstrapRuntime.refreshAttempted) {
        return session;
    }
    const refreshToken = readRefreshTokenFromSession(session);
    if (!refreshToken) {
        return session;
    }
    bootstrapRuntime.refreshAttempted = true;
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
        if (isRateLimitError(error)) {
            bootstrapRuntime.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
        }
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} refreshSession failed`, error.message);
        return session;
    }
    return data.session ?? session;
}

/**
 * Linear session resolution — getSession first, no onAuthStateChange wait.
 * The previous bootstrap blocked here for up to 15s waiting for auth events that had already fired.
 */
async function resolveBootstrapSession(
    config: DesktopAuthBootstrapConfig,
    options: { sessionHint?: Session | null },
): Promise<Session | null> {
    ensureDesktopAuthStateListener(config.supabase, config);

    let session = pickBestSession(
        await readSupabaseClientSession(config.supabase),
        options.sessionHint ?? config.readAuthSession?.() ?? null,
    );

    if (!session || !hasUsableBearer(session)) {
        session = await restorePersistedSessionOnce(config, options.sessionHint);
        if (!hasUsableBearer(session)) {
            session = await readSupabaseClientSession(config.supabase);
        }
    }

    session = await refreshExpiredSessionOnce(config.supabase, session);
    if (session && hasUsableBearer(session) && isAccessTokenExpired(session)) {
        session = await readSupabaseClientSession(config.supabase);
    }

    if (!session || !hasUsableBearer(session)) {
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} dual-auth-no-bearer`, {
            hasSessionHint: Boolean(options.sessionHint),
            hasStoredSession: Boolean(readStoredAuthSession()),
        });
        return null;
    }

    return session;
}

/** @deprecated — retained for static checks; bootstrap uses resolveBootstrapSession instead. */
export async function waitForDualAuthConfirmation(
    supabase: SupabaseClient,
    options: { freshSignIn?: boolean; sessionHint?: Session | null } = {},
) {
    const session = await resolveBootstrapSession(
        { supabase } as DesktopAuthBootstrapConfig,
        { sessionHint: options.sessionHint },
    );
    return {
        session,
        authStateObserved: Boolean(session),
        getSessionObserved: true,
    };
}

/** @deprecated — retained for static checks; bootstrap uses resolveBootstrapSession. */
export async function initializeDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
    options: { freshSignIn?: boolean; sessionHint?: Session | null } = {},
): Promise<{ session: Session | null; rateLimited: boolean }> {
    if (Date.now() < bootstrapRuntime.rateLimitedUntil) {
        return { session: null, rateLimited: true };
    }
    const session = await resolveBootstrapSession(config, options);
    if (!session) {
        return { session: null, rateLimited: false };
    }
    return { session, rateLimited: false };
}

async function executeSingleAuthBootstrap(
    config: DesktopAuthBootstrapConfig,
    options: DesktopAuthSessionBootstrapOptions,
): Promise<DesktopAuthBootstrapOutcome> {
    logBootstrapMarker(DESKTOP_AUTH_BOOTSTRAP_MARKERS.START, { userId: options.userId });

    if (Date.now() < bootstrapRuntime.rateLimitedUntil) {
        bootstrapRuntime.settled = true;
        return { ready: false, rateLimited: true, message: DESKTOP_AUTH_RATE_LIMIT_MESSAGE };
    }

    const session = await resolveBootstrapSession(config, {
        sessionHint: options.sessionHint ?? config.readAuthSession?.() ?? null,
    });

    if (!session) {
        bootstrapRuntime.settled = true;
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} bootstrap stopped — no session with access + refresh tokens`);
        return { ready: false, rateLimited: false };
    }

    logBootstrapMarker(DESKTOP_AUTH_BOOTSTRAP_MARKERS.SESSION_FOUND, {
        userId: session.user?.id || "",
    });

    if (!publishDesktopApiCredentials(session)) {
        bootstrapRuntime.settled = true;
        console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} bootstrap stopped — publishDesktopApiCredentials returned false`);
        return { ready: false, rateLimited: false };
    }

    syncReactAuthSession(config, session);
    bootstrapRuntime.settled = true;
    return { ready: true, rateLimited: false };
}

/** Exactly one authentication bootstrap per signed-in user. */
export function runDesktopAuthBootstrap(
    config: DesktopAuthBootstrapConfig,
    options: DesktopAuthSessionBootstrapOptions | string,
): Promise<DesktopAuthBootstrapOutcome> {
    const normalized = normalizeBootstrapOptions(options);
    const userKey = String(normalized.userId || "").trim() || "authenticated";
    const publishedUserId = getDesktopAuthenticatedUserId();

    if (isDesktopApiReady() && publishedUserId && publishedUserId === userKey) {
        bootstrapRuntime.userKey = userKey;
        bootstrapRuntime.settled = true;
        return Promise.resolve({ ready: true, rateLimited: false });
    }

    if (bootstrapRuntime.promise && bootstrapRuntime.userKey === userKey && !bootstrapRuntime.settled) {
        return bootstrapRuntime.promise;
    }

    bootstrapRuntime.userKey = userKey;
    bootstrapRuntime.settled = false;
    bootstrapRuntime.setSessionAttempted = false;
    bootstrapRuntime.refreshAttempted = false;

    bootstrapRuntime.promise = executeSingleAuthBootstrap(config, normalized);
    return bootstrapRuntime.promise;
}

/** @deprecated alias */
export const startDesktopAuthSessionBootstrap = runDesktopAuthBootstrap;

/** @deprecated — sign-in is handled by resolveBootstrapSession(sessionHint); no separate flag path. */
export function markDesktopAuthSignInPending() {
    // no-op — kept for login handler compatibility
}

export function resetDesktopAuthSessionBootstrap() {
    bootstrapRuntime.userKey = "";
    bootstrapRuntime.promise = null;
    bootstrapRuntime.settled = false;
    bootstrapRuntime.setSessionAttempted = false;
    bootstrapRuntime.refreshAttempted = false;
    bootstrapRuntime.listenerInstalled = false;
    bootstrapRuntime.shellOpenLoggedForUser = "";
    clearDesktopApiCredentials();
}

export function isDesktopAuthSessionBootstrapComplete() {
    return bootstrapRuntime.settled && isDesktopApiReady();
}

export function isDesktopAuthSessionBootstrapSettled() {
    return bootstrapRuntime.settled;
}

export function isDesktopAuthBootstrapRateLimited() {
    return Date.now() < bootstrapRuntime.rateLimitedUntil;
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
        session: null,
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
        if (requiresLoggedInApiCredentials(input) && isDesktopApiReady()) {
            const userId = getDesktopAuthenticatedUserId();
            if (userId && bootstrapRuntime.shellOpenLoggedForUser !== userId) {
                logBootstrapMarker(DESKTOP_AUTH_BOOTSTRAP_MARKERS.SHELL_OPEN, { userId });
                bootstrapRuntime.shellOpenLoggedForUser = userId;
            }
        }
    }
    else if (decision.detail) {
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
