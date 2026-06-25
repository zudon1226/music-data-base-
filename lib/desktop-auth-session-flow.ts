import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";
import {
    clearDesktopAuthRecoveryGate,
    sessionHasAcceptableAccessToken,
} from "./desktop-auth-recovery-gate";

/** DESKTOP ONLY — post-login session persistence and auth initialization. */

const SESSION_READ_RETRY_DELAYS_MS = [0, 50, 150, 350, 750];

function sessionHasAccessToken(session: Session | null | undefined): session is Session {
    return typeof session?.access_token === "string" && session.access_token.length > 0;
}

function sessionIsPersistable(session: Session | null | undefined): session is Session {
    return sessionHasAccessToken(session)
        && Boolean(session.user?.id)
        && sessionHasAcceptableAccessToken(session);
}

export async function readDesktopAuthSession(supabase: SupabaseClient): Promise<Session | null> {
    for (const delayMs of SESSION_READ_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        }
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!error && sessionIsPersistable(session)) {
            return session;
        }
    }
    return null;
}

export function commitDesktopAuthSession(session: Session | null | undefined): session is Session {
    if (!sessionIsPersistable(session)) {
        return false;
    }
    clearDesktopAuthRecoveryGate();
    return true;
}

export async function initializeDesktopAuthPersistence(supabase: SupabaseClient): Promise<Session | null> {
    clearDesktopAuthRecoveryGate();
    const session = await readDesktopAuthSession(supabase);
    if (!session || !commitDesktopAuthSession(session)) {
        return null;
    }
    return session;
}

async function waitForDesktopAuthEvent(
    supabase: SupabaseClient,
    timeoutMs = 4000,
): Promise<Session | null> {
    if (typeof window === "undefined") {
        return null;
    }

    return new Promise((resolve) => {
        let settled = false;
        const finish = (session: Session | null) => {
            if (settled) {
                return;
            }
            settled = true;
            subscription.unsubscribe();
            window.clearTimeout(timer);
            resolve(session);
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
            if (
                (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
                && sessionIsPersistable(session)
            ) {
                finish(session);
            }
        });

        void readDesktopAuthSession(supabase).then((session) => {
            if (sessionIsPersistable(session)) {
                finish(session);
            }
        });

        const timer = window.setTimeout(() => finish(null), timeoutMs);
    });
}

export async function completeDesktopPostLoginPersistence(
    supabase: SupabaseClient,
    signInSession: Session | null | undefined,
): Promise<Session | null> {
    clearDesktopAuthRecoveryGate();

    let session = await readDesktopAuthSession(supabase);
    if (!session && sessionIsPersistable(signInSession)) {
        session = signInSession;
    }
    if (!session) {
        session = await waitForDesktopAuthEvent(supabase);
    }
    if (!session && sessionIsPersistable(signInSession)) {
        session = signInSession;
    }
    if (!commitDesktopAuthSession(session)) {
        return null;
    }
    return session;
}

export function shouldShowDesktopLoginScreen(options: {
    authInitialized: boolean;
    authSession: Session | null;
}) {
    if (!options.authInitialized) {
        return false;
    }
    if (!sessionHasAccessToken(options.authSession)) {
        return true;
    }
    return !sessionHasAcceptableAccessToken(options.authSession);
}

export function applyDesktopAuthSessionToState(session: Session | null | undefined): session is Session {
    return commitDesktopAuthSession(session);
}
