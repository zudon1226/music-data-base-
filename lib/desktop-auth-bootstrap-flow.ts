/** DESKTOP ONLY — auth session bootstrap, shell readiness, and background remote loaders. */
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { readStoredAuthSession } from "./auth-session";
import { readRefreshTokenFromSession } from "./client-api-auth";
import {
    readDesktopActionBearerToken,
} from "./desktop-action-runtime";
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
export const DESKTOP_AUTH_SHELL_WATCHDOG_MS = 10_000;
const AUTH_SESSION_BOOT_PREFIX = "[desktop-auth-bootstrap]";
const DEFAULT_STEP_TIMEOUT_MS = 12_000;
const SIGNED_IN_WAIT_MS = 3_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const TOKEN_EXPIRY_SKEW_MS = 30_000;
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
export type DesktopAuthBootstrapOutcome = {
    ready: boolean;
    rateLimited: boolean;
    message?: string;
};
export type DesktopAuthSessionBootstrapOptions = {
    userId: string;
    sessionHint?: Session | null;
    /** Fresh login — short SIGNED_IN wait; never blocks shell when hint already has bearer. */
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
    authBootstrapSettled?: boolean;
    watchdogForced?: boolean;
    /** @deprecated — derived from session + bootstrap state */
    authSessionInitialized?: boolean;
};
export type DesktopShellGateDecision = {
    canRender: boolean;
    blockedBy: "authReady" | "localBootstrapReady" | "authSessionInitialized" | null;
    detail: string;
};
type AuthBootstrapRuntime = {
    userKey: string;
    promise: Promise<DesktopAuthBootstrapOutcome> | null;
    settled: boolean;
    ready: boolean;
    running: boolean;
    signInPending: boolean;
    setSessionAttempted: boolean;
    refreshAttempted: boolean;
    rateLimitedUntil: number;
    stalledTask: string | null;
    watchdogForcedShell: boolean;
};
const authBootstrapRuntime: AuthBootstrapRuntime = {
    userKey: "",
    promise: null,
    settled: false,
    ready: false,
    running: false,
    signInPending: false,
    setSessionAttempted: false,
    refreshAttempted: false,
    rateLimitedUntil: 0,
    stalledTask: null,
    watchdogForcedShell: false,
};
function formatStepLabel(step: DesktopBootstrapStep) {
    return `${DESKTOP_BOOTSTRAP_LOG_PREFIX} ${step}`;
}
function logAuthBootstrap(step: string, details: Record<string, unknown> = {}) {
    console.info(AUTH_SESSION_BOOT_PREFIX, step, details);
}
function isRateLimitError(error: { message?: string; status?: number } | null | undefined) {
    const message = String(error?.message || "").toLowerCase();
    return error?.status === 429
        || message.includes("429")
        || message.includes("rate limit");
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
function hasBearer(session: Session | null | undefined) {
    return Boolean(readDesktopActionBearerToken(session));
}
function hasUsableBootstrapSession(session: Session | null | undefined) {
    if (!session) {
        return false;
    }
    if (hasBearer(session)) {
        return true;
    }
    return Boolean(readRefreshTokenFromSession(session) && session.user?.id);
}
function hasPersistableSessionMaterial(session: Session | null | undefined) {
    if (!session) {
        return false;
    }
    return Boolean(readDesktopActionBearerToken(session) && readRefreshTokenFromSession(session));
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
function normalizeBootstrapOptions(
    options: DesktopAuthSessionBootstrapOptions | string,
): DesktopAuthSessionBootstrapOptions {
    if (typeof options === "string") {
        return {
            userId: options,
            sessionHint: null,
            waitForSignedInEvent: false,
        };
    }
    return options;
}
function markAuthBootstrapSettled(ready: boolean) {
    authBootstrapRuntime.settled = true;
    authBootstrapRuntime.ready = ready;
    authBootstrapRuntime.stalledTask = null;
}
/** Call immediately before signInWithPassword / signUp so bootstrap uses the fresh-login path. */
export function markDesktopAuthSignInPending() {
    authBootstrapRuntime.signInPending = true;
}
export function resetDesktopAuthSessionBootstrap() {
    if (authBootstrapRuntime.running) {
        return;
    }
    authBootstrapRuntime.userKey = "";
    authBootstrapRuntime.promise = null;
    authBootstrapRuntime.settled = false;
    authBootstrapRuntime.ready = false;
    authBootstrapRuntime.signInPending = false;
    authBootstrapRuntime.setSessionAttempted = false;
    authBootstrapRuntime.refreshAttempted = false;
    authBootstrapRuntime.stalledTask = null;
    authBootstrapRuntime.watchdogForcedShell = false;
}
export function isDesktopAuthSessionBootstrapComplete() {
    return authBootstrapRuntime.settled && authBootstrapRuntime.ready;
}
export function isDesktopAuthSessionBootstrapSettled() {
    return authBootstrapRuntime.settled;
}
export function isDesktopAuthBootstrapRateLimited() {
    return Date.now() < authBootstrapRuntime.rateLimitedUntil;
}
export function isDesktopAuthShellWatchdogForced() {
    return authBootstrapRuntime.watchdogForcedShell;
}
/** True when authenticated users may render Home — session present or bootstrap settled. */
export function isDesktopAuthenticatedShellReady(input: {
    session?: Session | null;
    watchdogForced?: boolean;
} = {}) {
    if (authBootstrapRuntime.watchdogForcedShell || input.watchdogForced) {
        return true;
    }
    if (hasUsableBootstrapSession(input.session ?? null)) {
        return true;
    }
    return authBootstrapRuntime.settled && authBootstrapRuntime.ready;
}
/** Force shell open after watchdog — logs stalled task once. */
export function forceDesktopAuthBootstrapShellReady(stalledTask: string) {
    authBootstrapRuntime.watchdogForcedShell = true;
    authBootstrapRuntime.stalledTask = stalledTask;
    authBootstrapRuntime.settled = true;
    authBootstrapRuntime.ready = true;
    console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} shell watchdog forced READY`, { stalledTask });
}
export function createDesktopAuthBootstrapWatchdog(
    shouldForce: () => boolean,
    onForce: (stalledTask: string) => void,
    timeoutMs = DESKTOP_AUTH_SHELL_WATCHDOG_MS,
) {
    const timer = window.setTimeout(() => {
        if (!shouldForce()) {
            return;
        }
        const stalledTask = authBootstrapRuntime.stalledTask
            || (authBootstrapRuntime.running ? "authSessionBootstrap" : "authShellGate");
        onForce(stalledTask);
        forceDesktopAuthBootstrapShellReady(stalledTask);
    }, timeoutMs);
    return () => window.clearTimeout(timer);
}
async function waitForSupabaseSignedInOnce(
    supabase: SupabaseClient,
    timeoutMs = SIGNED_IN_WAIT_MS,
): Promise<Session | null> {
    const existing = await readSupabaseClientSession(supabase);
    if (existing && hasBearer(existing)) {
        logAuthBootstrap("signed-in-already-present", { userId: existing.user?.id || "" });
        return existing;
    }
    logAuthBootstrap("waiting-for-signed-in", { timeoutMs });
    return new Promise((resolve) => {
        let settled = false;
        const finish = (session: Session | null) => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timer);
            subscription.unsubscribe();
            resolve(session);
        };
        const timer = window.setTimeout(() => finish(null), timeoutMs);
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event !== "SIGNED_IN" || !session || !hasBearer(session)) {
                return;
            }
            logAuthBootstrap("signed-in-received", { userId: session.user?.id || "" });
            finish(session);
        });
    });
}
async function resolveFreshSignInSession(
    config: DesktopAuthBootstrapConfig,
    sessionHint: Session | null | undefined,
): Promise<{ session: Session | null; rateLimited: boolean }> {
    if (sessionHint && hasUsableBootstrapSession(sessionHint)) {
        publishBootstrappedSession(config, sessionHint);
        logAuthBootstrap("session-ready", { source: "fresh-sign-in-hint", userId: sessionHint.user?.id || "" });
        return { session: sessionHint, rateLimited: false };
    }
    const signedInSession = await waitForSupabaseSignedInOnce(config.supabase);
    if (signedInSession) {
        publishBootstrappedSession(config, signedInSession);
        logAuthBootstrap("session-ready", { source: "fresh-sign-in", userId: signedInSession.user?.id || "" });
        return { session: signedInSession, rateLimited: false };
    }
    const clientSession = await readSupabaseClientSession(config.supabase);
    if (clientSession && hasUsableBootstrapSession(clientSession)) {
        publishBootstrappedSession(config, clientSession);
        logAuthBootstrap("session-ready", { source: "fresh-getSession", userId: clientSession.user?.id || "" });
        return { session: clientSession, rateLimited: false };
    }
    if (sessionHint && hasUsableBootstrapSession(sessionHint)) {
        publishBootstrappedSession(config, sessionHint);
        logAuthBootstrap("session-ready", {
            source: "fresh-sign-in-hint-after-wait",
            userId: sessionHint.user?.id || "",
        });
        return { session: sessionHint, rateLimited: false };
    }
    logAuthBootstrap("session-missing", {
        reason: "fresh-sign-in-no-usable-session",
        hasSessionHint: Boolean(sessionHint),
    });
    return { session: null, rateLimited: false };
}
async function restoreStoredDesktopSession(
    config: DesktopAuthBootstrapConfig,
    sessionHint: Session | null | undefined,
): Promise<{ session: Session | null; rateLimited: boolean }> {
    if (Date.now() < authBootstrapRuntime.rateLimitedUntil) {
        logAuthBootstrap("rate-limited", {
            retryAfterMs: authBootstrapRuntime.rateLimitedUntil - Date.now(),
        });
        return { session: null, rateLimited: true };
    }
    if (sessionHint && hasUsableBootstrapSession(sessionHint)) {
        publishBootstrappedSession(config, sessionHint);
        logAuthBootstrap("session-ready", { source: "restore-react-hint", userId: sessionHint.user?.id || "" });
        return { session: sessionHint, rateLimited: false };
    }
    let clientSession = await readSupabaseClientSession(config.supabase);
    if (clientSession && hasUsableBootstrapSession(clientSession) && !isAccessTokenExpired(clientSession)) {
        publishBootstrappedSession(config, clientSession);
        logAuthBootstrap("session-ready", { source: "restore-getSession", userId: clientSession.user?.id || "" });
        return { session: clientSession, rateLimited: false };
    }
    const storedSession = readStoredAuthSession();
    const mergedSession = sessionHint && storedSession
        ? (hasUsableBootstrapSession(sessionHint) ? sessionHint : storedSession)
        : (sessionHint || storedSession);
    if (!hasPersistableSessionMaterial(mergedSession)) {
        logAuthBootstrap("session-missing", {
            reason: "restore-no-session-material",
            hasReactSession: Boolean(sessionHint),
            hasStoredSession: Boolean(storedSession),
        });
        return { session: null, rateLimited: false };
    }
    if (!authBootstrapRuntime.setSessionAttempted) {
        authBootstrapRuntime.setSessionAttempted = true;
        const accessToken = readDesktopActionBearerToken(mergedSession);
        const refreshToken = readRefreshTokenFromSession(mergedSession);
        logAuthBootstrap("restore-setSession-once", {
            hasAccessToken: Boolean(accessToken),
            hasRefreshToken: Boolean(refreshToken),
        });
        const { data, error } = await config.supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
        if (error) {
            if (isRateLimitError(error)) {
                authBootstrapRuntime.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                return { session: null, rateLimited: true };
            }
            console.warn(`${AUTH_SESSION_BOOT_PREFIX} setSession failed`, error.message);
        }
        else if (data.session) {
            clientSession = data.session;
        }
    }
    clientSession = await readSupabaseClientSession(config.supabase);
    if (clientSession && hasUsableBootstrapSession(clientSession)) {
        publishBootstrappedSession(config, clientSession);
        logAuthBootstrap("session-ready", { source: "restore-after-setSession", userId: clientSession.user?.id || "" });
        return { session: clientSession, rateLimited: false };
    }
    const refreshToken = readRefreshTokenFromSession(clientSession) || readRefreshTokenFromSession(mergedSession);
    if (refreshToken && isAccessTokenExpired(clientSession) && !authBootstrapRuntime.refreshAttempted) {
        authBootstrapRuntime.refreshAttempted = true;
        logAuthBootstrap("restore-refreshSession-once", { hasRefreshToken: true });
        const { data, error } = await config.supabase.auth.refreshSession({ refresh_token: refreshToken });
        if (error) {
            if (isRateLimitError(error)) {
                authBootstrapRuntime.rateLimitedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
                return { session: null, rateLimited: true };
            }
            console.warn(`${AUTH_SESSION_BOOT_PREFIX} refreshSession failed`, error.message);
        }
        else if (data.session) {
            publishBootstrappedSession(config, data.session);
            logAuthBootstrap("session-ready", { source: "restore-after-refresh", userId: data.session.user?.id || "" });
            return { session: data.session, rateLimited: false };
        }
    }
    if (mergedSession && hasUsableBootstrapSession(mergedSession)) {
        publishBootstrappedSession(config, mergedSession);
        logAuthBootstrap("session-ready", { source: "restore-trust-hint", userId: mergedSession.user?.id || "" });
        return { session: mergedSession, rateLimited: false };
    }
    logAuthBootstrap("session-missing", { reason: "restore-single-pass-exhausted" });
    return { session: null, rateLimited: false };
}
export async function ensureDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
    options: Omit<DesktopAuthSessionBootstrapOptions, "userId"> = {},
): Promise<{ session: Session | null; rateLimited: boolean }> {
    const sessionHint = options.sessionHint ?? config.readAuthSession?.() ?? null;
    if (options.waitForSignedInEvent || authBootstrapRuntime.signInPending) {
        return resolveFreshSignInSession(config, sessionHint);
    }
    return restoreStoredDesktopSession(config, sessionHint);
}
/** @deprecated — single pass only. */
export async function waitForDesktopAuthenticatedSession(
    config: DesktopAuthBootstrapConfig,
    _timeoutMs?: number,
    options: Omit<DesktopAuthSessionBootstrapOptions, "userId"> = {},
): Promise<Session | null> {
    const result = await ensureDesktopAuthenticatedSession(config, options);
    return result.session;
}
/** Locked bootstrap — resolves exactly once per user; never waits on remote catalog loaders. */
export function startDesktopAuthSessionBootstrap(
    config: DesktopAuthBootstrapConfig,
    options: DesktopAuthSessionBootstrapOptions | string,
): Promise<DesktopAuthBootstrapOutcome> {
    const normalized = normalizeBootstrapOptions(options);
    const userKey = String(normalized.userId || "").trim() || "authenticated";
    const sessionHint = normalized.sessionHint ?? config.readAuthSession?.() ?? null;
    if (authBootstrapRuntime.settled && authBootstrapRuntime.userKey === userKey) {
        return Promise.resolve({
            ready: authBootstrapRuntime.ready || hasUsableBootstrapSession(sessionHint),
            rateLimited: false,
        });
    }
    if (authBootstrapRuntime.promise && authBootstrapRuntime.userKey === userKey) {
        return authBootstrapRuntime.promise;
    }
    authBootstrapRuntime.userKey = userKey;
    authBootstrapRuntime.settled = false;
    authBootstrapRuntime.ready = false;
    authBootstrapRuntime.setSessionAttempted = false;
    authBootstrapRuntime.refreshAttempted = false;
    const waitForSignedInEvent = normalized.waitForSignedInEvent || authBootstrapRuntime.signInPending;
    authBootstrapRuntime.signInPending = false;
    if (sessionHint && hasUsableBootstrapSession(sessionHint)) {
        publishBootstrappedSession(config, sessionHint);
        markAuthBootstrapSettled(true);
        console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization complete (immediate session hint)`);
        return Promise.resolve({ ready: true, rateLimited: false });
    }
    authBootstrapRuntime.running = true;
    authBootstrapRuntime.stalledTask = "authSessionBootstrap";
    authBootstrapRuntime.promise = (async () => {
        console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization started for ${userKey}`, {
            freshSignIn: waitForSignedInEvent,
        });
        try {
            const { session, rateLimited } = await ensureDesktopAuthenticatedSession(config, {
                sessionHint,
                waitForSignedInEvent,
            });
            if (rateLimited) {
                console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization rate-limited`);
                markAuthBootstrapSettled(false);
                return {
                    ready: false,
                    rateLimited: true,
                    message: DESKTOP_AUTH_RATE_LIMIT_MESSAGE,
                };
            }
            const ready = Boolean(session) || hasUsableBootstrapSession(sessionHint);
            markAuthBootstrapSettled(ready);
            if (ready) {
                console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization complete`);
                return { ready: true, rateLimited: false };
            }
            console.warn(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization incomplete after single pass`);
            return { ready: false, rateLimited: false };
        }
        catch (error) {
            markAuthBootstrapSettled(hasUsableBootstrapSession(sessionHint));
            console.error(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} auth initialization failed`, error);
            return {
                ready: hasUsableBootstrapSession(sessionHint),
                rateLimited: false,
            };
        }
        finally {
            authBootstrapRuntime.running = false;
            if (authBootstrapRuntime.stalledTask === "authSessionBootstrap") {
                authBootstrapRuntime.stalledTask = null;
            }
        }
    })();
    return authBootstrapRuntime.promise;
}
/** @deprecated — single pass only. */
export async function waitForDesktopApiCredentials(
    config: DesktopAuthBootstrapConfig,
    _timeoutMs?: number,
    options: Omit<DesktopAuthSessionBootstrapOptions, "userId"> = {},
) {
    const { session, rateLimited } = await ensureDesktopAuthenticatedSession(config, options);
    if (rateLimited || !session) {
        return null;
    }
    const accessToken = readDesktopActionBearerToken(session);
    const userId = String(session.user?.id || "").trim();
    if (!accessToken || !userId) {
        return null;
    }
    return { session, userId, accessToken };
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
    const authenticatedShellReady = !input.isAuthenticated
        || input.authSessionInitialized === true
        || isDesktopAuthenticatedShellReady({
            session: input.session,
            watchdogForced: input.watchdogForced,
        });
    if (!authenticatedShellReady) {
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
/** Background remote bootstrap — never gates shell readiness or auth session bootstrap. */
export async function runDesktopRemoteBootstrap(
    userId: string,
    actions: DesktopRemoteBootstrapActions,
    auth?: DesktopAuthBootstrapConfig,
): Promise<DesktopRemoteBootstrapResult> {
    console.info(`${DESKTOP_BOOTSTRAP_LOG_PREFIX} queue started for user ${userId || "(missing user id)"}`);
    if (auth) {
        const session = await readSupabaseClientSession(auth.supabase);
        if (!session || !hasBearer(session)) {
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
