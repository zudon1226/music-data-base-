"use client";

import type { AuthChangeEvent, Session, SupabaseClient, User as SupabaseUser } from "@supabase/supabase-js";
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

function hasSessionUser(session: Session | null | undefined) {
    return Boolean(session?.user?.id);
}

/** Requirement 4: user OR access_token is enough to treat the session as usable. */
export function hasUsableAuthCredentials(session: Session | null | undefined, user: SupabaseUser | null = null) {
    return hasAccessToken(session) || hasSessionUser(session) || Boolean(user?.id);
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
        setStatus("authenticated");
        setAuthReady(true);
        bumpRevision();
    }, [bumpRevision]);

    const clearAuthenticatedState = useCallback(() => {
        persistedUserRef.current = null;
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
        if (!normalizedUserId) {
            return;
        }
        clearDesktopAuthRecoveryGate();
        if (user?.id === normalizedUserId || authSession?.user?.id === normalizedUserId) {
            setStatus("authenticated");
            setAuthReady(true);
            bumpRevision();
            return;
        }
        if (hasUsableAuthCredentials(authSession, user)) {
            setStatus("authenticated");
            setAuthReady(true);
            bumpRevision();
        }
    }, [authSession, bumpRevision, user]);

    const setAuthSession = useCallback((value: SetStateAction<Session | null>) => {
        setAuthSessionState((previous) => {
            const next = typeof value === "function" ? value(previous) : value;
            if (next && hasUsableAuthCredentials(next)) {
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
                setStatus("authenticated");
                setAuthReady(true);
                bumpRevision();
            }
            return next;
        });
    }, [bumpRevision]);

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
            if (session && hasUsableAuthCredentials(session)) {
                markAuthenticated(session, resolveSessionUser(session));
                return;
            }
            setStatus("unauthenticated");
        };

        const bootTimer = window.setTimeout(() => {
            finishBoot(null);
        }, 300);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            if (!isMounted) {
                return;
            }
            if (event === "INITIAL_SESSION") {
                window.clearTimeout(bootTimer);
                finishBoot(session);
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

        return () => {
            isMounted = false;
            window.clearTimeout(bootTimer);
            subscription.unsubscribe();
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

    const isAuthenticated = authReady && (
        status === "authenticated"
        || hasUsableAuthCredentials(authSession, user)
    );

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

/** Trust signInWithPassword session immediately — no second getSession() gate. */
export async function completeDesktopSignIn(
    _supabase: SupabaseClient,
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
    return {
        ...signInSession,
        user: resolvedUser ?? signInSession.user,
    };
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
