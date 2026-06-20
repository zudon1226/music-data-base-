import type { Session, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-aehuszoadgqtbkxsliyy-auth-token";
export const MAX_ACCESS_TOKEN_LENGTH = 5000;

export type AccessTokenValidation = {
    valid: boolean;
    reason: string;
    tokenLength: number | null;
};

export function validateAccessToken(token: unknown): AccessTokenValidation {
    if (typeof token !== "string" || !token) {
        return { valid: false, reason: "not-string-or-empty", tokenLength: null };
    }
    if (!token.startsWith("eyJ")) {
        return { valid: false, reason: "not-jwt-prefix", tokenLength: token.length };
    }
    if (token.length > MAX_ACCESS_TOKEN_LENGTH) {
        return { valid: false, reason: "exceeds-max-length", tokenLength: token.length };
    }
    return { valid: true, reason: "", tokenLength: token.length };
}

function readPersistedAccessToken() {
    if (typeof window === "undefined") {
        return null;
    }
    const raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw) as {
            access_token?: unknown;
            currentSession?: { access_token?: unknown };
            session?: { access_token?: unknown };
        };
        const token = parsed.access_token
            ?? parsed.currentSession?.access_token
            ?? parsed.session?.access_token;
        return typeof token === "string" ? token : null;
    }
    catch {
        return null;
    }
}

export function clearSupabaseAuthStorage() {
    if (typeof window === "undefined") {
        return;
    }
    for (const storage of [window.localStorage, window.sessionStorage]) {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
            const key = storage.key(index);
            if (key?.startsWith("sb-")) {
                storage.removeItem(key);
            }
        }
    }
}

export async function invalidateCorruptedAuthSession(
    supabase: SupabaseClient,
    reason: string,
) {
    console.error("AUTH_SESSION_INVALID", {
        reason,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
    });
    if (typeof window !== "undefined") {
        window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
    }
    await supabase.auth.signOut();
}

function validatePersistedAuthBeforeGetSession() {
    const token = readPersistedAccessToken();
    if (token === null) {
        return { shouldInvalidate: false, validation: null as AccessTokenValidation | null };
    }
    const validation = validateAccessToken(token);
    return { shouldInvalidate: !validation.valid, validation };
}

export async function runStartupAuthRepair(supabase: SupabaseClient) {
    const { shouldInvalidate, validation } = validatePersistedAuthBeforeGetSession();
    if (!shouldInvalidate || !validation) {
        return false;
    }
    await invalidateCorruptedAuthSession(supabase, `startup-repair:${validation.reason}`);
    return true;
}

export async function getValidatedSession(supabase: SupabaseClient) {
    const persisted = validatePersistedAuthBeforeGetSession();
    if (persisted.shouldInvalidate && persisted.validation) {
        await invalidateCorruptedAuthSession(supabase, persisted.validation.reason);
        return {
            session: null as Session | null,
            error: null as Error | null,
            authInvalidated: true,
        };
    }

    const { data: { session }, error } = await supabase.auth.getSession();

    if (session?.access_token) {
        const validation = validateAccessToken(session.access_token);
        if (!validation.valid) {
            await invalidateCorruptedAuthSession(supabase, validation.reason);
            return {
                session: null as Session | null,
                error: null as Error | null,
                authInvalidated: true,
            };
        }
    }

    return {
        session,
        error: error ?? null,
        authInvalidated: false,
    };
}

export async function logoutAndClearAuth(supabase: SupabaseClient) {
    clearSupabaseAuthStorage();
    await supabase.auth.signOut();
}
