/** DESKTOP ONLY — authenticated session bootstrap + remote catalog loaders. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readStoredAuthSession } from "./auth-session";
import {
    mergeDesktopAuthSessionSources,
    readDesktopActionBearerToken,
} from "./desktop-action-runtime";
import {
    clearDesktopAuthRecoveryGate,
    noteValidatedDesktopSession,
    SESSION_EXPIRED_MESSAGE,
} from "./desktop-auth-recovery-gate";
import { readRefreshTokenFromSession } from "./client-api-auth";
import type { DesktopProtectedActionPipelineConfig } from "./desktop-protected-action-pipeline";
import {
    startUserMusicStateBootstrapInBackground,
    type UserMusicStateLoader,
} from "./desktop-user-music-state-bootstrap";

export { SESSION_EXPIRED_MESSAGE };

export type DesktopAuthBootstrapConfig = DesktopProtectedActionPipelineConfig;

/** @deprecated alias */
export type DesktopAuthenticatedRequestConfig = DesktopAuthBootstrapConfig;
/** @deprecated */
export type DesktopProtectedActionClientConfig = DesktopAuthBootstrapConfig;
/** @deprecated */
export type DesktopProtectedActionFetchInit = import("./desktop-protected-action-pipeline").DesktopProtectedApiFetchInit;
/** @deprecated */
export type DesktopAuthRequestMode = "bearer-preferred" | "refresh-header-only";
/** @deprecated */
export type DesktopAuthenticatedFetchInit = import("./desktop-protected-action-pipeline").DesktopProtectedApiFetchInit;

export const DESKTOP_BOOTSTRAP_LOG_PREFIX = "[desktop-bootstrap]";
const AUTH_SESSION_BOOT_PREFIX = "[desktop-auth-bootstrap]";
const DEFAULT_STEP_TIMEOUT_MS = 12_000;
const AUTH_SESSION_WAIT_MS = 15_000;
const TOKEN_EXPIRY_SKEW_MS = 30_000;

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
    /** When authenticated, shell stays blocked until Supabase session bootstrap completes. */
    authSessionInitialized?: boolean;
};

export type DesktopShellGateDecision = {
    canRender: boolean;
    blockedBy: "authReady" | "localBootstrapReady" | "authSessionInitialized" | null;
    detail: string;
};

type AuthBootstrapState = {
    userKey: string;
    promise: Promise<boolean> | null;
    complete: boolean;
};

const authBootstrapState: AuthBootstrapState = {
    userKey: "",
    promise: null,
    complete: false,
};

function formatStepLabel(step: DesktopBootstrapStep) {
    return `${DESKTOP_BOOTSTRAP_LOG_PREFIX} ${step}`;
}

function logAuthBootstrap(step: string, details: Record<string, unknown> = {}) {
    console.info(AUTH_SESSION_BOOT_PREFIX, step, details);
}

function isAccessTokenExpired(session: Session | null | undefined) {
    if (!session) {
        return true;
    }
    const accessToken = readDesktopActionBearerToken(session);
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

function publishBootstrappedSession(config: DesktopAuthBootstrapConfig, session: Session) {
    clearDesktopAuthRecoveryGate(session);
    noteValidatedDesktopSession(session);
    config.writeAuthSession?.(session);
}

async function readSupabaseClientSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.warn(`${AUTH_SESSION_BOOT_PREFIX} getSession failed`, error.message);
    }
    return session ?? null;
}

async function seedSupabaseClientFromSession(
    config: DesktopAuthBootstrapConfig,
    sourceSession: Session,
): Promise<Session | null> {
    const refreshToken = readRefreshTokenFromSession(sourceSession);
    const accessToken = readDesktopActionBearerToken(sourceSession);

    if (!refreshToken && !accessToken) {
        return null;
    }

    logAuthBootstrap("setSession", {
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
    });

    const { data, error } = await config.supabase.auth.setSession({
        access_token: accessToken || "",
        refresh_token: refreshToken || "",
    });

    if (error) {
        console.warn(`${AUTH_SESSION_BOOT_PREFIX} setSession failed`, error.message);
        if (!refreshToken) {
            return null;
        }
        const refreshed = await config.supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (refreshed.error) {
            console.warn(`${AUTH_SESSION_BOOT_PREFIX} refreshSession failed`, refreshed.error.message);
            return null;
        }
        return refreshed.data.session ?? null;
    }

    return data.session ?? null;
}

async function refreshSessionWithStoredToken(
    config: DesktopAuthBootstrapConfig,
    refreshToken: string,
): Promise<Session | null> {
    const normalizedRefreshToken = refreshToken.trim();
    if (!normalizedRefreshToken) {
        return null;
    }

    logAuthBootstrap("refreshSession", { hasRefreshToken: true });
    const { data, error } = await config.supabase.auth.refreshSession({
        refresh_token: normalizedRefreshToken,
    });
    if (error) {
        console.warn(`${AUTH_SESSION_BOOT_PREFIX} refreshSession failed`, error.message);
        return null;
    }
    return data.session ?? null;
}

/**
 * Restore the GoTrue client session from React state and/or persisted storage,
 * then verify getSession() returns a usable bearer.
 */
export async function ensureDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
): Promise<Session | null> {
    const reactSession = config.readAuthSession?.() ?? null;
    const storedSession = readStoredAuthSession();
    const mergedSession = mergeDesktopAuthSessionSources(reactSession, storedSession);

    let clientSession = await readSupabaseClientSession(config.supabase);
    let bearer = readDesktopActionBearerToken(clientSession);

    if (!bearer && mergedSession) {
        clientSession = await seedSupabaseClientFromSession(config, mergedSession);
        bearer = readDesktopActionBearerToken(clientSession);
    }

    if ((!bearer || isAccessTokenExpired(clientSession)) && mergedSession) {
        const refreshToken = readRefreshTokenFromSession(clientSession)
            || readRefreshTokenFromSession(mergedSession);
        if (refreshToken) {
            const refreshedSession = await refreshSessionWithStoredToken(config, refreshToken);
            if (refreshedSession) {
                clientSession = refreshedSession;
                bearer = readDesktopActionBearerToken(clientSession);
            }
        }
    }

    if (!bearer) {
        clientSession = await readSupabaseClientSession(config.supabase);
        bearer = readDesktopActionBearerToken(clientSession);
    }

    if (!clientSession || !bearer) {
        logAuthBootstrap("session-missing", {
            hasReactSession: Boolean(reactSession),
            hasStoredSession: Boolean(storedSession),
            hasMergedSession: Boolean(mergedSession),
        });
        return null;
    }

    publishBootstrappedSession(config, clientSession);
    logAuthBootstrap("session-ready", {
        sessionExists: true,
        accessTokenPresent: true,
        userId: clientSession.user?.id || "",
    });
    return clientSession;
}

export async function waitForDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
    timeoutMs = AUTH_SESSION_WAIT_MS,
): Promise<Session | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const session = await ensureDesktopAuthenticatedSession(config);
        if (session) {
            return session;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return null;
}

export function resetDesktopAuthSessionBootstrap() {
    authBootstrapState.userKey = "";
    authBootstrapState.promise = null;
    authBootstrapState.complete = false;
}

export function isDesktopAuthSessionBootstrapComplete() {
    return authBootstrapState.complete;
}

/** Begin authenticated session bootstrap once per signed-in user. */
export function startDesktopAuthSessionBootstrap(
    config: DesktopAuthBootstrapConfig,
    userId = "",
): Promise<boolean> {
    const userKey = String(userId || "").trim() || "authenticated";
    if (authBootstrapState.promise && authBootstrapState.userKey === userKey) {
        return authBootstrapState.promise;
    }

    authBootstrapState.userKey = userKey;
    authBootstrapState.complete = false;
    authBootstrapState.promise = (async () => {
        console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization started for ${userKey}`);
        const session = await waitForDesktopAuthenticatedSession(config);
        authBootstrapState.complete = Boolean(session);
        if (session) {
            console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization complete`);
        }
        else {
            console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization failed — no authenticated Supabase session`);
        }
        return authBootstrapState.complete;
    })();

    return authBootstrapState.promise;
}

/** @deprecated — bootstrap owns credential readiness; re-exported for compatibility. */
export async function waitForDesktopApiCredentials(
    config: DesktopAuthBootstrapConfig,
    timeoutMs = AUTH_SESSION_WAIT_MS,
) {
    const session = await waitForDesktopAuthenticatedSession(config, timeoutMs);
    if (!session) {
        return null;
    }
    const accessToken = readDesktopActionBearerToken(session);
    const userId = String(session.user?.id || "").trim();
    if (!accessToken || !userId) {
        return null;
    }
    return {
        session,
        userId,
        accessToken,
    };
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
    if (input.isAuthenticated && input.authSessionInitialized === false) {
        return {
            canRender: false,
            blockedBy: "authSessionInitialized",
            detail: `${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell blocked: authenticated Supabase session bootstrap still running`,
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

/** Remote bootstrap — waits for authenticated session, then runs independent user-state loaders. */
export async function runDesktopRemoteBootstrap(
    userId: string,
    actions: DesktopRemoteBootstrapActions,
    auth?: DesktopAuthBootstrapConfig,
): Promise<DesktopRemoteBootstrapResult> {
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue started for user ${userId || "(missing user id)"}`);

    if (auth) {
        const session = await waitForDesktopAuthenticatedSession(auth);
        if (!session) {
            console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} API credentials not ready — remote bootstrap deferred`);
            return {
                completedSteps: [],
                failedSteps: [],
                userMusicStateOutcome: "deferred-no-api-credentials",
                deferred: true,
            };
        }
        console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} API credentials ready (bearer)`);
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
