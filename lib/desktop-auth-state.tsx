"use client";

import type { AuthChangeEvent, Session, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
import { isDesktopVideoUploadLifecycleActive } from "./desktop-video-upload-lifecycle";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from "react";
import { runAuthStorageCleanupOnce } from "./auth-boot";
import { logoutAndClearAuth } from "./auth-session";
import { clearDesktopAuthRecoveryGate } from "./desktop-auth-recovery-gate";
import {
    clearDesktopApiCredentials,
    publishDesktopApiCredentials,
} from "./desktop-authenticated-session";
import { clearLibraryCache, readLibraryCache } from "./library-storage";
import { supabase as defaultSupabaseClient } from "./supabase";

type DesktopAuthContextValue = {
    status: "booting" | "authenticated" | "unauthenticated";
    authSession: Session | null;
    user: SupabaseUser | null;
    activeUser: SupabaseUser | null;
    accountUserId: string;
    authReady: boolean;
    isInitializing: boolean;
    isAuthenticated: boolean;
    shouldShowLoginScreen: boolean;
    authRevision: number;
    setAuthSession: Dispatch<SetStateAction<Session | null>>;
    setUser: Dispatch<SetStateAction<SupabaseUser | null>>;
    restoreSession: (session: Session) => void;
    completeSignIn: (session: Session) => void;
    confirmAuthenticatedFromApi: (userId: string) => void;
    syncSessionFromClient: () => Promise<Session | null>;
    signOut: () => Promise<void>;
};

const DesktopAuthContext = createContext<DesktopAuthContextValue | null>(null);

function hasAccessToken(session: Session | null | undefined) {
    return typeof session?.access_token === "string" && session.access_token.length > 0;
}

/** Protected loads and authenticated UI require a bearer access_token — user id alone is not enough. */
export function hasUsableAuthCredentials(session: Session | null | undefined, _user: SupabaseUser | null = null) {
    return hasAccessToken(session);
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

function resolveSessionUser(session: Session, existingUser: SupabaseUser | null = null): SupabaseUser | null {
    if (session.user?.id) {
        return session.user;
    }
    if (existingUser?.id) {
        return existingUser;
    }
    if (!hasAccessToken(session)) {
        return null;
    }
    const userId = readUserIdFromAccessToken(session.access_token);
    if (!userId) {
        return null;
    }
    return { id: userId } as SupabaseUser;
}

function clearStaleDesktopAuthCaches(expectedUserId = "") {
    runAuthStorageCleanupOnce();
    const cachedLibrary = readLibraryCache();
    if (!cachedLibrary) {
        return;
    }
    if (!expectedUserId || cachedLibrary.userId !== expectedUserId) {
        clearLibraryCache();
    }
}

type DesktopAuthProviderProps = {
    children: ReactNode;
    supabase?: SupabaseClient;
};

/** DESKTOP ONLY — frontend auth gate. Trust sign-in response immediately; never block Home on getSession(). */
export function DesktopAuthProvider({ children, supabase = defaultSupabaseClient }: DesktopAuthProviderProps) {
    const [status, setStatus] = useState<DesktopAuthContextValue["status"]>("booting");
    const [authReady, setAuthReady] = useState(false);
    const [authSession, setAuthSessionState] = useState<Session | null>(null);
    const [user, setUserState] = useState<SupabaseUser | null>(null);
    const [authRevision, setAuthRevision] = useState(0);
    const persistedUserRef = useRef<SupabaseUser | null>(null);

    const bumpRevision = useCallback(() => {
        setAuthRevision((value) => value + 1);
    }, []);

    const markAuthenticated = useCallback((session: Session, nextUser: SupabaseUser | null) => {
        if (!hasAccessToken(session)) {
            return;
        }
        const resolvedUser = nextUser ?? resolveSessionUser(session, persistedUserRef.current);
        clearDesktopAuthRecoveryGate();
        if (resolvedUser?.id) {
            clearStaleDesktopAuthCaches(resolvedUser.id);
            persistedUserRef.current = resolvedUser;
        }
        setAuthSessionState(session);
        if (resolvedUser) {
            setUserState(resolvedUser);
        }
        publishDesktopApiCredentials(session);
        setStatus("authenticated");
        setAuthReady(true);
        bumpRevision();
    }, [bumpRevision]);

    const clearAuthenticatedState = useCallback(() => {
        persistedUserRef.current = null;
        clearDesktopApiCredentials();
        setAuthSessionState(null);
        setUserState(null);
        setStatus("unauthenticated");
        clearLibraryCache();
        bumpRevision();
    }, [bumpRevision]);

    const completeSignIn = useCallback((session: Session) => {
        if (!hasUsableAuthCredentials(session)) {
            return;
        }
        markAuthenticated(session, resolveSessionUser(session));
    }, [markAuthenticated]);

    const restoreSession = useCallback((session: Session) => {
        completeSignIn(session);
    }, [completeSignIn]);

    const syncSessionFromClient = useCallback(async () => {
        if (isDesktopVideoUploadLifecycleActive()) {
            return authSession;
        }
        clearDesktopAuthRecoveryGate();
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session || !hasUsableAuthCredentials(session)) {
            return authSession;
        }
        markAuthenticated(session, resolveSessionUser(session, user));
        return session;
    }, [authSession, markAuthenticated, supabase, user]);

    const confirmAuthenticatedFromApi = useCallback((userId: string) => {
        const normalizedUserId = String(userId || "").trim();
        if (!normalizedUserId || !hasAccessToken(authSession)) {
            return;
        }
        clearDesktopAuthRecoveryGate();
        const sessionUserId = authSession?.user?.id
            || (authSession?.access_token ? readUserIdFromAccessToken(authSession.access_token) : "");
        if (user?.id === normalizedUserId || sessionUserId === normalizedUserId) {
            setStatus("authenticated");
            setAuthReady(true);
            bumpRevision();
        }
    }, [authSession, bumpRevision, user]);

    const setAuthSession = useCallback((value: SetStateAction<Session | null>) => {
        setAuthSessionState((previous) => {
            const next = typeof value === "function" ? value(previous) : value;
            const tokensUnchanged = Boolean(
                next
                && previous
                && next.access_token === previous.access_token
                && next.refresh_token === previous.refresh_token
                && next.expires_at === previous.expires_at,
            );
            if (next && hasUsableAuthCredentials(next) && !tokensUnchanged) {
                markAuthenticated(next, resolveSessionUser(next, persistedUserRef.current));
            }
            return next;
        });
    }, [markAuthenticated]);

    const setUser = useCallback((value: SetStateAction<SupabaseUser | null>) => {
        setUserState((previous) => {
            const next = typeof value === "function" ? value(previous) : value;
            if (next?.id) {
                persistedUserRef.current = next;
            }
            return next;
        });
    }, []);

    const signOut = useCallback(async () => {
        try {
            await logoutAndClearAuth(supabase);
        }
        catch (error) {
            console.error("Logout failed:", error);
        }
        finally {
            clearAuthenticatedState();
        }
    }, [clearAuthenticatedState, supabase]);

    useEffect(() => {
        let isMounted = true;
        const bootFinishedRef = { current: false };

        const finishBoot = (session: Session | null) => {
            if (!isMounted || bootFinishedRef.current) {
                return;
            }
            bootFinishedRef.current = true;
            setAuthReady(true);
            if (session && hasAccessToken(session)) {
                markAuthenticated(session, resolveSessionUser(session));
                return;
            }
            clearAuthenticatedState();
        };

        // Never block the existing login screen on getSession / INITIAL_SESSION.
        // iOS Safari can stall GoTrue recover/refresh; the UI must still reach signed-out.
        const AUTH_BOOT_TIMEOUT_MS = 2500;
        const bootTimer = window.setTimeout(() => {
            finishBoot(null);
        }, AUTH_BOOT_TIMEOUT_MS);

        let subscription: { unsubscribe: () => void } | null = null;
        try {
            const authClient = supabase;
            const { data } = authClient.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
                if (!isMounted) {
                    return;
                }
                if (event === "INITIAL_SESSION") {
                    if (session && hasAccessToken(session)) {
                        markAuthenticated(session, resolveSessionUser(session, persistedUserRef.current));
                        bootFinishedRef.current = true;
                        setAuthReady(true);
                    }
                    else if (!bootFinishedRef.current) {
                        finishBoot(session);
                    }
                    return;
                }
                if (event === "SIGNED_OUT") {
                    clearAuthenticatedState();
                    return;
                }
                if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && session) {
                    if (hasUsableAuthCredentials(session)) {
                        markAuthenticated(session, resolveSessionUser(session, persistedUserRef.current));
                    }
                }
            });
            subscription = data.subscription;
        }
        catch {
            finishBoot(null);
        }

        void (async () => {
            try {
                const result = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise<null>((resolve) => {
                        window.setTimeout(() => resolve(null), AUTH_BOOT_TIMEOUT_MS);
                    }),
                ]);
                if (!isMounted || bootFinishedRef.current) {
                    return;
                }
                const session = result && "data" in result ? result.data.session : null;
                finishBoot(session);
            }
            catch {
                finishBoot(null);
            }
        })();

        return () => {
            isMounted = false;
            window.clearTimeout(bootTimer);
            subscription?.unsubscribe();
        };
    }, [clearAuthenticatedState, markAuthenticated, supabase]);

    const activeUser = useMemo(() => {
        if (!authReady) {
            return null;
        }
        if (user?.id) {
            return user;
        }
        if (authSession?.user?.id) {
            return authSession.user;
        }
        if (authSession?.access_token) {
            const userId = readUserIdFromAccessToken(authSession.access_token);
            if (userId) {
                return { id: userId } as SupabaseUser;
            }
        }
        return null;
    }, [authReady, authSession, user]);

    const accountUserId = activeUser?.id
        || authSession?.user?.id
        || (authSession?.access_token ? readUserIdFromAccessToken(authSession.access_token) : "");

    const isAuthenticated = authReady
        && status === "authenticated"
        && hasAccessToken(authSession);

    const shouldShowLoginScreen = authReady && !isAuthenticated;
    const isInitializing = !authReady;

    const value = useMemo<DesktopAuthContextValue>(() => ({
        status,
        authSession,
        user,
        activeUser,
        accountUserId,
        authReady,
        isInitializing,
        isAuthenticated,
        shouldShowLoginScreen,
        authRevision,
        setAuthSession,
        setUser,
        restoreSession,
        completeSignIn,
        confirmAuthenticatedFromApi,
        syncSessionFromClient,
        signOut,
    }), [
        accountUserId,
        activeUser,
        authReady,
        authRevision,
        authSession,
        completeSignIn,
        confirmAuthenticatedFromApi,
        isAuthenticated,
        isInitializing,
        restoreSession,
        setAuthSession,
        setUser,
        shouldShowLoginScreen,
        signOut,
        status,
        syncSessionFromClient,
        user,
    ]);

    return (
        <DesktopAuthContext.Provider value={value}>
            {children}
        </DesktopAuthContext.Provider>
    );
}

export function useDesktopAuthState() {
    const context = useContext(DesktopAuthContext);
    if (!context) {
        throw new Error("useDesktopAuthState must be used within DesktopAuthProvider.");
    }
    return context;
}

/** Trust signInWithPassword session immediately — persist to GoTrue client for protected POSTs. */
export async function completeDesktopSignIn(
    supabase: SupabaseClient,
    signInSession: Session | null | undefined,
    fallbackUser?: SupabaseUser | null,
): Promise<Session | null> {
    if (!signInSession) {
        return null;
    }
    const resolvedUser = resolveSessionUser(signInSession, fallbackUser ?? null);
    if (!hasUsableAuthCredentials(signInSession, resolvedUser)) {
        return null;
    }
    const normalizedSession = {
        ...signInSession,
        user: resolvedUser ?? signInSession.user,
    };
    if (normalizedSession.access_token && normalizedSession.refresh_token) {
        await supabase.auth.setSession({
            access_token: normalizedSession.access_token,
            refresh_token: normalizedSession.refresh_token,
        });
    }
    return normalizedSession;
}

/** Apply a successful sign-in response in one step for callers outside the provider tree. */
export function adoptDesktopSignInSession(
    signInSession: Session | null | undefined,
    fallbackUser?: SupabaseUser | null,
): Session | null {
    if (!signInSession) {
        return null;
    }
    const resolvedUser = resolveSessionUser(signInSession, fallbackUser ?? null);
    if (!hasUsableAuthCredentials(signInSession, resolvedUser)) {
        return null;
    }
    return {
        ...signInSession,
        user: resolvedUser ?? signInSession.user,
    };
}
