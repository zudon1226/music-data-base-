import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
    clearDesktopAuthRecoveryGate,
    sessionHasAcceptableAccessToken,
} from "./desktop-auth-recovery-gate";

/** DESKTOP ONLY — post-login session confirmation and app auth state commits. */
export async function confirmDesktopAuthSession(supabase: SupabaseClient) {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.access_token || !sessionHasAcceptableAccessToken(session)) {
        return null;
    }
    return session;
}

export function commitDesktopAuthSession(session: Session | null | undefined): session is Session {
    if (!session?.access_token || !sessionHasAcceptableAccessToken(session)) {
        return false;
    }
    clearDesktopAuthRecoveryGate(session);
    return true;
}

export function shouldShowDesktopLoginScreen(options: {
    authLoading: boolean;
    authSession: Session | null;
}) {
    if (options.authLoading) {
        return false;
    }
    if (!options.authSession?.access_token) {
        return true;
    }
    return !sessionHasAcceptableAccessToken(options.authSession);
}

export async function resolveDesktopSessionAfterSignIn(
    supabase: SupabaseClient,
    fallbackSession: Session | null | undefined,
) {
    const confirmedSession = await confirmDesktopAuthSession(supabase);
    if (confirmedSession) {
        return confirmedSession;
    }
    if (fallbackSession?.access_token && sessionHasAcceptableAccessToken(fallbackSession)) {
        return fallbackSession;
    }
    return null;
}
