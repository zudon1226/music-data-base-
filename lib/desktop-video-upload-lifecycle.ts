/** DESKTOP ONLY — upload lock + frozen Supabase auth during active video upload. */

import type { Session, SupabaseClient } from "@supabase/supabase-js";

let activeDesktopVideoUploadCount = 0;

type FrozenSupabaseAuth = {
    getSession: () => ReturnType<SupabaseClient["auth"]["getSession"]>;
    refreshSession: () => ReturnType<SupabaseClient["auth"]["refreshSession"]>;
    setSession: (...args: Parameters<SupabaseClient["auth"]["setSession"]>) => ReturnType<SupabaseClient["auth"]["setSession"]>;
    exchangeCodeForSession?: (...args: Parameters<NonNullable<SupabaseClient["auth"]["exchangeCodeForSession"]>>) => ReturnType<NonNullable<SupabaseClient["auth"]["exchangeCodeForSession"]>>;
};

let frozenAuthRestore: (() => void) | null = null;
let frozenUploadSession: Session | null = null;

export function isDesktopVideoUploadLifecycleActive() {
    return activeDesktopVideoUploadCount > 0;
}

export function readFrozenDesktopVideoUploadSession() {
    return frozenUploadSession;
}

/**
 * Block refresh/setSession/getSession churn on the shared browser client during upload.
 * Returns the pinned session snapshot used for the freeze.
 */
export function freezeSupabaseAuthForDesktopVideoUpload(
    supabase: SupabaseClient,
    session: Session,
) {
    if (frozenAuthRestore) {
        return;
    }

    frozenUploadSession = session;
    const auth = supabase.auth as SupabaseClient["auth"] & {
        exchangeCodeForSession?: SupabaseClient["auth"]["exchangeCodeForSession"];
    };

    const original: FrozenSupabaseAuth = {
        getSession: auth.getSession.bind(auth),
        refreshSession: auth.refreshSession.bind(auth),
        setSession: auth.setSession.bind(auth),
        exchangeCodeForSession: auth.exchangeCodeForSession?.bind(auth),
    };

    const frozenResponse = async () => ({
        data: { session: frozenUploadSession },
        error: null,
    });

    auth.getSession = frozenResponse as typeof auth.getSession;
    auth.refreshSession = frozenResponse as typeof auth.refreshSession;
    auth.setSession = (async () => ({
        data: { session: frozenUploadSession, user: frozenUploadSession?.user ?? null },
        error: null,
    })) as typeof auth.setSession;

    if (auth.exchangeCodeForSession) {
        auth.exchangeCodeForSession = (async () => ({
            data: { session: frozenUploadSession, user: frozenUploadSession?.user ?? null },
            error: null,
        })) as typeof auth.exchangeCodeForSession;
    }

    frozenAuthRestore = () => {
        auth.getSession = original.getSession;
        auth.refreshSession = original.refreshSession;
        auth.setSession = original.setSession;
        if (original.exchangeCodeForSession) {
            auth.exchangeCodeForSession = original.exchangeCodeForSession;
        }
        frozenAuthRestore = null;
        frozenUploadSession = null;
    };
}

export function unfreezeSupabaseAuthAfterDesktopVideoUpload() {
    frozenAuthRestore?.();
}

export function enterDesktopVideoUploadLifecycle(
    supabase: SupabaseClient,
    session: Session,
) {
    if (activeDesktopVideoUploadCount === 0) {
        freezeSupabaseAuthForDesktopVideoUpload(supabase, session);
    }
    activeDesktopVideoUploadCount += 1;
}

export function exitDesktopVideoUploadLifecycle() {
    activeDesktopVideoUploadCount = Math.max(0, activeDesktopVideoUploadCount - 1);
    if (activeDesktopVideoUploadCount === 0) {
        unfreezeSupabaseAuthAfterDesktopVideoUpload();
    }
}
